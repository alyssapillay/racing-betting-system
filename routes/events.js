const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb, runTransaction } = require('../database/db');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();

// ── SPORTS ──────────────────────────────────────────────────────
router.get('/sports', authenticate, (req, res) => {
  res.json(getDb().prepare('SELECT * FROM sports WHERE is_active=1 ORDER BY name').all());
});

// ── EVENTS ──────────────────────────────────────────────────────
router.get('/', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { sport_id, status } = req.query;
    let q = `
      SELECT e.*, sp.name as sport_name, sp.icon as sport_icon,
        COALESCE(co.name,'') as country_name, COALESCE(co.flag,'🏆') as flag,
        COALESCE(cu.name,'') as course_name,
        COUNT(s.id) as selection_count,
        COALESCE(ws.name,'') as winner_name
      FROM events e
      JOIN sports sp ON e.sport_id=sp.id
      LEFT JOIN countries co ON e.country_id=co.id
      LEFT JOIN courses cu ON e.course_id=cu.id
      LEFT JOIN selections s ON s.event_id=e.id
      LEFT JOIN selections ws ON e.result_selection_id=ws.id
    `;
    const cond=[], params=[];
    if (sport_id) { cond.push('e.sport_id=?'); params.push(sport_id); }
    if (status)   { cond.push('e.status=?');   params.push(status); }
    if (cond.length) q += ' WHERE '+cond.join(' AND ');
    q += ' GROUP BY e.id ORDER BY e.event_date ASC, e.event_time ASC';
    res.json(db.prepare(q).all(...params));
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.get('/:id', authenticate, (req, res) => {
  try {
    const db = getDb();
    const event = db.prepare(`
      SELECT e.*, sp.name as sport_name, sp.icon as sport_icon,
        COALESCE(co.name,'') as country_name, COALESCE(co.flag,'🏆') as flag,
        COALESCE(cu.name,'') as course_name
      FROM events e JOIN sports sp ON e.sport_id=sp.id
      LEFT JOIN countries co ON e.country_id=co.id
      LEFT JOIN courses cu ON e.course_id=cu.id
      WHERE e.id=?
    `).get(req.params.id);
    if (!event) return res.status(404).json({error:'Event not found'});

    // Coalesce win_odds with legacy 'odds' column for backwards compatibility
    const sels = db.prepare('SELECT *, COALESCE(win_odds,odds,2.00) as win_odds, COALESCE(opening_win_odds,odds,2.00) as opening_win_odds FROM selections WHERE event_id=? ORDER BY barrier_number ASC, name ASC').all(req.params.id);
    for (const s of sels) {
      // price history — last 5, newest first
      s.price_history = db.prepare(`
        SELECT old_price, new_price, price_type, changed_at
        FROM selection_price_history
        WHERE selection_id=? AND price_type='win'
        ORDER BY changed_at DESC LIMIT 5
      `).all(s.id).reverse(); // reverse so oldest first

      s.total_staked   = db.prepare("SELECT COALESCE(SUM(stake),0) as v FROM bets WHERE selection_id=? AND status='pending'").get(s.id).v;
      s.total_liability= db.prepare("SELECT COALESCE(SUM(potential_return),0) as v FROM bets WHERE selection_id=? AND status='pending'").get(s.id).v;
      s.bet_count      = db.prepare("SELECT COUNT(*) as c FROM bets WHERE selection_id=? AND status='pending'").get(s.id).c;
      s.house_exposure = s.total_liability - s.total_staked;
    }
    event.selections = sels;
    res.json(event);
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.post('/', authenticate, (req, res) => {
  try {
    const { sport_id, country_id, course_id, event_name, event_date, event_time, venue, closes_at } = req.body;
    if (!sport_id||!event_name||!event_date||!event_time) return res.status(400).json({error:'Sport, name, date and time required'});
    const db=getDb(), id=uuidv4();
    db.prepare('INSERT INTO events (id,sport_id,country_id,course_id,event_name,event_date,event_time,venue,closes_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id,sport_id,country_id||null,course_id||null,event_name.trim(),event_date,event_time,venue||null,closes_at||null,req.user.id);
    res.status(201).json(db.prepare(`
      SELECT e.*, sp.name as sport_name, sp.icon as sport_icon, COALESCE(co.flag,'🏆') as flag
      FROM events e JOIN sports sp ON e.sport_id=sp.id LEFT JOIN countries co ON e.country_id=co.id WHERE e.id=?
    `).get(id));
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.put('/:id', authenticate, (req, res) => {
  try {
    const { event_name, event_date, event_time, venue, closes_at, status, country_id, course_id } = req.body;
    const db=getDb();
    if (req.user.role!=='super_admin' && (event_date||event_time))
      return res.status(403).json({error:'Only Super Admin can change event date/time'});
    db.prepare(`UPDATE events SET event_name=COALESCE(?,event_name), event_date=COALESCE(?,event_date),
      event_time=COALESCE(?,event_time), venue=COALESCE(?,venue), closes_at=COALESCE(?,closes_at),
      status=COALESCE(?,status), country_id=COALESCE(?,country_id), course_id=COALESCE(?,course_id),
      updated_at=datetime('now') WHERE id=?`).run(event_name,event_date,event_time,venue,closes_at,status,country_id,course_id,req.params.id);
    res.json(db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id));
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.delete('/:id', authenticate, requireSuperAdmin, (req, res) => {
  try { getDb().prepare('DELETE FROM events WHERE id=?').run(req.params.id); res.json({message:'Deleted'}); }
  catch(err) { res.status(500).json({error:err.message}); }
});

// ── SETTLE EVENT ─────────────────────────────────────────────────
router.post('/:id/result', authenticate, (req, res) => {
  try {
    const { winner_selection_id } = req.body;
    if (!winner_selection_id) return res.status(400).json({error:'Winner required'});
    const db=getDb();
    const event=db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id);
    if (!event) return res.status(404).json({error:'Event not found'});
    if (event.status==='settled') return res.status(400).json({error:'Already settled'});
    const winner=db.prepare('SELECT *, COALESCE(win_odds,odds,2.00) as win_odds FROM selections WHERE id=? AND event_id=?').get(winner_selection_id,req.params.id);
    if (!winner||winner.status==='scratched') return res.status(400).json({error:'Invalid winner'});

    const summary = runTransaction(()=>{
      db.prepare("UPDATE events SET status='settled',result_selection_id=?,updated_at=datetime('now') WHERE id=?").run(winner_selection_id,req.params.id);
      db.prepare('UPDATE selections SET is_winner=1 WHERE id=?').run(winner_selection_id);
      const totalDed=db.prepare("SELECT COALESCE(SUM(scratch_deduction),0) as t FROM selections WHERE event_id=? AND status='scratched'").get(req.params.id).t;
      const bets=db.prepare("SELECT b.*, w.balance FROM bets b JOIN wallets w ON b.wallet_id=w.id WHERE b.event_id=? AND b.status='pending'").all(req.params.id);
      let winners=0,losers=0,total_paid=0;
      for (const bet of bets) {
        const won = bet.selection_id===winner_selection_id;
        const df  = Math.max(0,1-(totalDed/100));
        const ar  = won ? parseFloat((bet.stake+(bet.potential_return-bet.stake)*df).toFixed(2)) : 0;
        db.prepare("UPDATE bets SET status=?,actual_return=?,deduction_applied=?,settled_at=datetime('now') WHERE id=?").run(won?'won':'lost',ar,totalDed,bet.id);
        if (won) {
          const nb=bet.balance+ar;
          db.prepare("UPDATE wallets SET balance=?,updated_at=datetime('now') WHERE id=?").run(nb,bet.wallet_id);
          db.prepare("INSERT INTO transactions (id,wallet_id,operator_id,type,amount,balance_before,balance_after,description,reference_id) VALUES (?,?,?,'winnings',?,?,?,?,?)").run(uuidv4(),bet.wallet_id,bet.operator_id,ar,bet.balance,nb,`Won: ${event.event_name}`,bet.id);
          winners++; total_paid+=ar;
        } else losers++;
      }
      // settle multi legs
      const legs=db.prepare("SELECT bl.* FROM betslip_legs bl JOIN betslips bs ON bl.betslip_id=bs.id WHERE bl.event_id=? AND bs.status='pending' AND bs.slip_type='multi'").all(req.params.id);
      for (const leg of legs) {
        const won=leg.selection_id===winner_selection_id;
        db.prepare('UPDATE betslip_legs SET result=? WHERE id=?').run(won?'won':'lost',leg.id);
        const slip=db.prepare('SELECT * FROM betslips WHERE id=?').get(leg.betslip_id);
        const allLegs=db.prepare('SELECT * FROM betslip_legs WHERE betslip_id=?').all(leg.betslip_id);
        if (allLegs.every(l=>l.result!=='pending')) {
          const allWon=allLegs.every(l=>l.result==='won');
          const df=Math.max(0,1-(totalDed/100));
          const ar=allWon?parseFloat((slip.total_stake+(slip.potential_return-slip.total_stake)*df).toFixed(2)):0;
          db.prepare("UPDATE betslips SET status=?,actual_return=?,settled_at=datetime('now'),updated_at=datetime('now') WHERE id=?").run(allWon?'won':'lost',ar,slip.id);
          const mb=db.prepare('SELECT * FROM bets WHERE betslip_id=? LIMIT 1').get(slip.id);
          if (mb&&allWon) {
            const w=db.prepare('SELECT * FROM wallets WHERE id=?').get(slip.wallet_id);
            const nb=w.balance+ar;
            db.prepare("UPDATE wallets SET balance=?,updated_at=datetime('now') WHERE id=?").run(nb,w.id);
            db.prepare("INSERT INTO transactions (id,wallet_id,operator_id,type,amount,balance_before,balance_after,description) VALUES (?,?,?,'winnings',?,?,?,?)").run(uuidv4(),w.id,slip.operator_id,ar,w.balance,nb,'Multi Winnings');
          }
        }
      }
      return {winners,losers,total_paid};
    });
    res.json({message:'Settled',winner:winner.name,...summary});
  } catch(err) { console.error('Settle error:',err.message); res.status(500).json({error:err.message}); }
});

// ── SELECTIONS ───────────────────────────────────────────────────
router.get('/:id/selections', authenticate, (req, res) => {
  try {
    const db=getDb();
    const sels=db.prepare('SELECT *, COALESCE(win_odds,odds,2.00) as win_odds, COALESCE(opening_win_odds,odds,2.00) as opening_win_odds FROM selections WHERE event_id=? ORDER BY barrier_number ASC, name ASC').all(req.params.id);
    for (const s of sels) {
      s.price_history=db.prepare('SELECT old_price,new_price,price_type,changed_at FROM selection_price_history WHERE selection_id=? AND price_type=? ORDER BY changed_at DESC LIMIT 5').all(s.id,'win').reverse();
      s.total_staked=db.prepare("SELECT COALESCE(SUM(stake),0) as v FROM bets WHERE selection_id=? AND status='pending'").get(s.id).v;
      s.total_liability=db.prepare("SELECT COALESCE(SUM(potential_return),0) as v FROM bets WHERE selection_id=? AND status='pending'").get(s.id).v;
      s.bet_count=db.prepare("SELECT COUNT(*) as c FROM bets WHERE selection_id=? AND status='pending'").get(s.id).c;
    }
    res.json(sels);
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.post('/:id/selections', authenticate, (req, res) => {
  try {
    const { name, sub_info, barrier_number, jockey, trainer, weight, age, form, colour, win_odds, place_odds } = req.body;
    if (!name||!win_odds) return res.status(400).json({error:'Name and win odds required'});
    const db=getDb(), id=uuidv4();
    db.prepare('INSERT INTO selections (id,event_id,name,sub_info,barrier_number,jockey,trainer,weight,age,form,colour,win_odds,place_odds,opening_win_odds) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id,req.params.id,name.trim(),sub_info||null,barrier_number||null,jockey||null,trainer||null,weight||null,age||null,form||null,colour||null,parseFloat(win_odds),place_odds?parseFloat(place_odds):null,parseFloat(win_odds));
    res.status(201).json(db.prepare('SELECT * FROM selections WHERE id=?').get(id));
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.put('/selection/:id', authenticate, (req, res) => {
  try {
    const { name, sub_info, barrier_number, jockey, trainer, weight, age, form, colour, win_odds, place_odds } = req.body;
    const db=getDb();
    const sel=db.prepare('SELECT * FROM selections WHERE id=?').get(req.params.id);
    if (!sel) return res.status(404).json({error:'Selection not found'});

    // Track price change if win_odds changed
    if (win_odds && parseFloat(win_odds)!==sel.win_odds) {
      db.prepare('INSERT INTO selection_price_history (id,selection_id,price_type,old_price,new_price) VALUES (?,?,?,?,?)').run(uuidv4(),req.params.id,'win',sel.win_odds,parseFloat(win_odds));
      // Keep only last 5
      const hist=db.prepare('SELECT id FROM selection_price_history WHERE selection_id=? AND price_type=? ORDER BY changed_at DESC').all(req.params.id,'win');
      if (hist.length>5) {
        for (const old of hist.slice(5)) db.prepare('DELETE FROM selection_price_history WHERE id=?').run(old.id);
      }
    }
    if (place_odds && parseFloat(place_odds)!==sel.place_odds) {
      db.prepare('INSERT INTO selection_price_history (id,selection_id,price_type,old_price,new_price) VALUES (?,?,?,?,?)').run(uuidv4(),req.params.id,'place',sel.place_odds||0,parseFloat(place_odds));
    }

    db.prepare('UPDATE selections SET name=COALESCE(?,name),sub_info=COALESCE(?,sub_info),barrier_number=COALESCE(?,barrier_number),jockey=COALESCE(?,jockey),trainer=COALESCE(?,trainer),weight=COALESCE(?,weight),age=COALESCE(?,age),form=COALESCE(?,form),colour=COALESCE(?,colour),win_odds=COALESCE(?,win_odds),place_odds=COALESCE(?,place_odds),updated_at=datetime("now") WHERE id=?')
      .run(name,sub_info,barrier_number,jockey,trainer,weight,age,form,colour,win_odds?parseFloat(win_odds):null,place_odds?parseFloat(place_odds):null,req.params.id);
    const updated=db.prepare('SELECT * FROM selections WHERE id=?').get(req.params.id);
    updated.price_history=db.prepare('SELECT old_price,new_price,price_type,changed_at FROM selection_price_history WHERE selection_id=? AND price_type=? ORDER BY changed_at DESC LIMIT 5').all(req.params.id,'win').reverse();
    res.json(updated);
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.delete('/selection/:id', authenticate, (req, res) => {
  try { getDb().prepare('DELETE FROM selections WHERE id=?').run(req.params.id); res.json({message:'Deleted'}); }
  catch(err) { res.status(500).json({error:err.message}); }
});

router.post('/selection/:id/scratch', authenticate, (req, res) => {
  try {
    const {deduction_percent=0}=req.body;
    const db=getDb();
    const sel=db.prepare('SELECT * FROM selections WHERE id=?').get(req.params.id);
    if (!sel) return res.status(404).json({error:'Not found'});
    if (sel.status==='scratched') return res.status(400).json({error:'Already scratched'});
    db.prepare("UPDATE selections SET status='scratched',scratch_deduction=?,scratched_at=datetime('now') WHERE id=?").run(parseFloat(deduction_percent),req.params.id);
    const bets=db.prepare("SELECT b.*,w.balance FROM bets b JOIN wallets w ON b.wallet_id=w.id WHERE b.selection_id=? AND b.status='pending'").all(req.params.id);
    for (const bet of bets) {
      const nb=bet.balance+bet.stake;
      db.prepare("UPDATE bets SET status='refunded',settled_at=datetime('now') WHERE id=?").run(bet.id);
      db.prepare("UPDATE wallets SET balance=?,updated_at=datetime('now') WHERE id=?").run(nb,bet.wallet_id);
      db.prepare("INSERT INTO transactions (id,wallet_id,operator_id,type,amount,balance_before,balance_after,description,reference_id) VALUES (?,?,?,'refund',?,?,?,?,?)").run(uuidv4(),bet.wallet_id,bet.operator_id,bet.stake,bet.balance,nb,`Refund: ${sel.name} scratched`,bet.id);
    }
    res.json({message:`${sel.name} scratched. ${bets.length} bet(s) refunded.`,refunded:bets.length});
  } catch(err) { res.status(500).json({error:err.message}); }
});

// ── EVENT P&L ────────────────────────────────────────────────────
router.get('/:id/results', authenticate, (req, res) => {
  try {
    const db=getDb();
    const event=db.prepare('SELECT e.*,sp.name as sport_name FROM events e JOIN sports sp ON e.sport_id=sp.id WHERE e.id=?').get(req.params.id);
    if (!event) return res.status(404).json({error:'Not found'});
    const bets=db.prepare(`
      SELECT b.*,w.name as wallet_name,s.name as selection_name
      FROM bets b JOIN wallets w ON b.wallet_id=w.id JOIN selections s ON b.selection_id=s.id
      WHERE b.event_id=? ORDER BY b.status,b.created_at DESC
    `).all(req.params.id);
    const summary={
      total_bets:bets.length,
      total_staked:bets.reduce((s,b)=>s+b.stake,0),
      total_paid:bets.filter(b=>b.status==='won').reduce((s,b)=>s+b.actual_return,0),
      winners:bets.filter(b=>b.status==='won').length,
      losers:bets.filter(b=>b.status==='lost').length,
    };
    summary.house_profit=summary.total_staked-summary.total_paid;
    res.json({event,summary,bets});
  } catch(err) { res.status(500).json({error:err.message}); }
});

module.exports = router;

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb, runTransaction } = require('../database/db');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();

// ── SPORTS ──────────────────────────────────────────────────
router.get('/sports', authenticate, (req, res) => {
  try {
    const db = getDb();
    const sports = db.prepare('SELECT * FROM sports WHERE is_active=1 ORDER BY name').all();
    for (const s of sports) {
      s.event_count = db.prepare("SELECT COUNT(*) as c FROM events WHERE sport_id=? AND status='open'").get(s.id).c;
    }
    res.json(sports);
  } catch(err) { res.status(500).json({error:err.message}); }
});

// ── GET COURSES WITH NAMED EVENTS ──────────────────────────────
router.get('/horse-courses', authenticate, (req, res) => {
  try {
    const db = getDb();
    const courses = db.prepare(`
      SELECT
        COALESCE(cu.id,'unknown')   as course_id,
        COALESCE(cu.name,'Unknown') as course_name,
        COALESCE(co.name,'')        as country_name,
        COALESCE(co.flag,'🏇')      as flag,
        co.id                       as country_id,
        COUNT(DISTINCT e.meeting_key) as event_count,
        COUNT(e.id)                 as race_count,
        SUM(CASE WHEN e.status='open' THEN 1 ELSE 0 END) as open_races
      FROM events e
      LEFT JOIN courses cu ON e.course_id = cu.id
      LEFT JOIN countries co ON cu.country_id = co.id
      WHERE e.sport_id = 'sport_hr'
      GROUP BY cu.id
      ORDER BY co.name, cu.name
    `).all();
    res.json(courses);
  } catch(err) { res.status(500).json({error: err.message}); }
});

// ── GET NAMED EVENTS FOR A COURSE ───────────────────────────────
router.get('/named-events', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { course_id } = req.query;
    const cond = course_id ? 'WHERE e.course_id=?' : "WHERE e.sport_id='sport_hr'";
    const params = course_id ? [course_id] : [];
    const events = db.prepare(`
      SELECT
        e.meeting_key,
        COALESCE(e.meeting_name, e.event_name, 'Race Meeting') as meeting_name,
        e.event_date,
        COALESCE(cu.name,'Unknown') as course_name,
        COALESCE(co.flag,'🏇')      as flag,
        COALESCE(co.name,'')        as country_name,
        e.course_id,
        e.country_id,
        COUNT(e.id)                 as race_count,
        MIN(e.event_time)           as first_race,
        MAX(e.event_time)           as last_race,
        SUM(CASE WHEN e.status='open' THEN 1 ELSE 0 END) as open_races,
        SUM(CASE WHEN e.status='settled' THEN 1 ELSE 0 END) as settled_races
      FROM events e
      LEFT JOIN courses cu ON e.course_id = cu.id
      LEFT JOIN countries co ON cu.country_id = co.id
      ${cond}
      GROUP BY e.meeting_key
      ORDER BY e.event_date ASC, meeting_name ASC
    `).all(...params);
    res.json(events);
  } catch(err) { res.status(500).json({error: err.message}); }
});

// ── GET EVENTS ──────────────────────────────────────────────
router.get('/', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { sport_id, status, meeting_key } = req.query;
    let q = `SELECT e.*,
        COALESCE(e.race_number,1) as race_number,
        sp.name as sport_name, sp.icon as sport_icon,
        COALESCE(co.name,'') as country_name, COALESCE(co.flag,'🏆') as flag,
        COALESCE(cu.name,'') as course_name,
        COUNT(s.id) as selection_count,
        COALESCE(ws.name,'') as winner_name,
        COALESCE(SUM(b.stake),0) as total_staked,
        COALESCE(SUM(CASE WHEN b.status='pending' THEN b.potential_return ELSE 0 END),0) as total_liability
      FROM events e
      JOIN sports sp ON e.sport_id=sp.id
      LEFT JOIN countries co ON e.country_id=co.id
      LEFT JOIN courses cu ON e.course_id=cu.id
      LEFT JOIN selections s ON s.event_id=e.id
      LEFT JOIN selections ws ON e.result_selection_id=ws.id
      LEFT JOIN bets b ON b.event_id=e.id`;
    const cond=[], params=[];
    if (sport_id)    { cond.push('e.sport_id=?');     params.push(sport_id); }
    if (status)      { cond.push('e.status=?');        params.push(status); }
    if (meeting_key) { cond.push('e.meeting_key=?');   params.push(meeting_key); }
    if (cond.length) q += ' WHERE '+cond.join(' AND ');
    q += ' GROUP BY e.id ORDER BY e.event_date ASC, COALESCE(e.race_number,1) ASC, e.event_time ASC';
    res.json(db.prepare(q).all(...params));
  } catch(err) { res.status(500).json({error:err.message}); }
});

// ── GET MEETINGS (grouped by course+date for horse racing) ──
router.get('/meetings', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { sport_id } = req.query;
    const meetings = db.prepare(`
      SELECT
        e.sport_id, sp.name as sport_name, sp.icon as sport_icon,
        e.meeting_key,
        e.event_date,
        COALESCE(cu.name, 'Unknown') as course_name,
        COALESCE(co.name,'') as country_name,
        COALESCE(co.flag,'🏆') as flag,
        co.id as country_id,
        cu.id as course_id,
        COUNT(DISTINCT e.id) as race_count,
        MIN(e.event_time) as first_race,
        MAX(e.event_time) as last_race,
        SUM(CASE WHEN e.status='open' THEN 1 ELSE 0 END) as open_races,
        SUM(CASE WHEN e.status='settled' THEN 1 ELSE 0 END) as settled_races,
        COALESCE(SUM(b.stake),0) as total_staked,
        COALESCE(SUM(CASE WHEN b.status='pending' THEN b.potential_return ELSE 0 END),0) as total_liability
      FROM events e
      JOIN sports sp ON e.sport_id=sp.id
      LEFT JOIN countries co ON e.country_id=co.id
      LEFT JOIN courses cu ON e.course_id=cu.id
      LEFT JOIN bets b ON b.event_id=e.id
      ${sport_id ? "WHERE e.sport_id=?" : ""}
      GROUP BY e.meeting_key, e.event_date, e.course_id
      ORDER BY e.event_date ASC, cu.name ASC
    `).all(...(sport_id ? [sport_id] : []));
    res.json(meetings);
  } catch(err) { res.status(500).json({error:err.message}); }
});

// ── GET SINGLE EVENT ────────────────────────────────────────
router.get('/:id', authenticate, (req, res) => {
  try {
    const db = getDb();
    const event = db.prepare(`
      SELECT e.*, COALESCE(e.race_number,1) as race_number,
        sp.name as sport_name, sp.icon as sport_icon,
        COALESCE(co.name,'') as country_name, COALESCE(co.flag,'🏆') as flag,
        COALESCE(cu.name,'') as course_name
      FROM events e JOIN sports sp ON e.sport_id=sp.id
      LEFT JOIN countries co ON e.country_id=co.id
      LEFT JOIN courses cu ON e.course_id=cu.id
      WHERE e.id=?
    `).get(req.params.id);
    if (!event) return res.status(404).json({error:'Not found'});
    const sels = db.prepare('SELECT *, COALESCE(win_odds,odds,2.00) as win_odds, COALESCE(place_odds,0) as place_odds, COALESCE(opening_win_odds,odds,win_odds,2.00) as opening_win_odds FROM selections WHERE event_id=? ORDER BY barrier_number ASC, name ASC').all(req.params.id);
    for (const s of sels) {
      s.price_history = db.prepare('SELECT old_price,new_price,changed_at FROM selection_price_history WHERE selection_id=? AND price_type=? ORDER BY changed_at DESC LIMIT 5').all(s.id,'win').reverse();
      s.total_staked   = db.prepare("SELECT COALESCE(SUM(stake),0) as v FROM bets WHERE selection_id=? AND status='pending'").get(s.id).v;
      s.total_liability= db.prepare("SELECT COALESCE(SUM(potential_return),0) as v FROM bets WHERE selection_id=? AND status='pending'").get(s.id).v;
    }
    event.selections = sels;
    res.json(event);
  } catch(err) { res.status(500).json({error:err.message}); }
});

// ── CREATE EVENT (single or full meeting) ───────────────────
router.post('/', authenticate, (req, res) => {
  try {
    const { sport_id, country_id, course_id, event_name, event_date, event_time,
            num_races, closes_at, race_number } = req.body;
    if (!sport_id||!event_date||!event_time) return res.status(400).json({error:'Sport, date and time required'});
    const db=getDb();

    // Create full meeting with N races
    if (sport_id==='sport_hr' && num_races && parseInt(num_races)>1) {
      const n = Math.min(Math.max(parseInt(num_races),1),20);
      const meetingKey = `${course_id||'x'}__${event_date}`;
      const [sh,sm] = event_time.split(':').map(Number);
      const created=[];
      for (let r=1; r<=n; r++) {
        const id=uuidv4();
        const totalMins = sh*60+sm+(r-1)*30;
        const h=Math.floor(totalMins/60)%24, m=totalMins%60;
        const raceTime=`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        const closeMins=totalMins-10;
        const cH=Math.floor(closeMins/60)%24, cM=closeMins%60;
        const raceCloses=`${event_date}T${String(cH).padStart(2,'0')}:${String(cM).padStart(2,'0')}:00.000Z`;
        db.prepare('INSERT INTO events (id,sport_id,country_id,course_id,meeting_key,race_number,event_name,event_date,event_time,closes_at,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id,sport_id,country_id||null,course_id||null,meetingKey,r,`Race ${r}`,event_date,raceTime,raceCloses,'open',req.user.id);
        created.push(id);
      }
      return res.status(201).json({message:`Created ${n} races`,count:n,meeting_key:meetingKey});
    }

    // Single event
    const id=uuidv4();
    const name = event_name || (sport_id==='sport_hr' ? `Race ${race_number||1}` : 'New Event');
    const meetingKey = sport_id==='sport_hr' ? `${course_id||'x'}__${event_date}` : null;
    db.prepare('INSERT INTO events (id,sport_id,country_id,course_id,meeting_key,race_number,event_name,event_date,event_time,closes_at,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id,sport_id,country_id||null,course_id||null,meetingKey,race_number||1,name,event_date,event_time,closes_at||null,'open',req.user.id);
    res.status(201).json(db.prepare('SELECT * FROM events WHERE id=?').get(id));
  } catch(err) { res.status(500).json({error:err.message}); }
});

// ── ADD RACE TO EXISTING MEETING ────────────────────────────
router.post('/meeting/add-race', authenticate, (req, res) => {
  try {
    const { meeting_key, sport_id, country_id, course_id, event_date } = req.body;
    if (!meeting_key||!event_date) return res.status(400).json({error:'meeting_key and date required'});
    const db=getDb();
    // Find highest race number in this meeting
    const existing = db.prepare('SELECT MAX(COALESCE(race_number,1)) as maxR, MIN(event_time) as firstTime FROM events WHERE meeting_key=?').get(meeting_key);
    const nextNum  = (existing?.maxR||0)+1;
    // Add 30 mins to last race time
    const lastTimes = db.prepare('SELECT event_time FROM events WHERE meeting_key=? ORDER BY race_number DESC, event_time DESC LIMIT 1').get(meeting_key);
    const [lh,lm]  = (lastTimes?.event_time||'12:00').split(':').map(Number);
    const newMins  = lh*60+lm+30;
    const nH=Math.floor(newMins/60)%24, nM=newMins%60;
    const raceTime = `${String(nH).padStart(2,'0')}:${String(nM).padStart(2,'0')}`;
    const cMins    = newMins-10;
    const cH=Math.floor(cMins/60)%24, cM=cMins%60;
    const raceCloses=`${event_date}T${String(cH).padStart(2,'0')}:${String(cM).padStart(2,'0')}:00.000Z`;
    const id=uuidv4();
    db.prepare('INSERT INTO events (id,sport_id,country_id,course_id,meeting_key,race_number,event_name,event_date,event_time,closes_at,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id,sport_id||'sport_hr',country_id||null,course_id||null,meeting_key,nextNum,`Race ${nextNum}`,event_date,raceTime,raceCloses,'open',req.user.id);
    res.status(201).json({id, race_number:nextNum, event_time:raceTime, message:`Race ${nextNum} added`});
  } catch(err) { res.status(500).json({error:err.message}); }
});

// ── UPDATE EVENT ────────────────────────────────────────────
router.put('/:id', authenticate, (req, res) => {
  try {
    const db=getDb(), ev=db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id);
    if (!ev) return res.status(404).json({error:'Not found'});
    const isSA = req.user.role==='super_admin';
    const { event_name, event_date, event_time, closes_at, status, race_number, distance, prize_money, country_id, course_id } = req.body;
    if (!isSA && (event_date||event_time||closes_at||status)) return res.status(403).json({error:'Only Super Admin can change dates/times/status'});
    db.prepare(`UPDATE events SET
      event_name=COALESCE(?,event_name),
      event_date=COALESCE(?,event_date),
      event_time=COALESCE(?,event_time),
      closes_at=COALESCE(?,closes_at),
      status=COALESCE(?,status),
      race_number=COALESCE(?,race_number),
      distance=COALESCE(?,distance),
      prize_money=COALESCE(?,prize_money),
      country_id=COALESCE(?,country_id),
      course_id=COALESCE(?,course_id),
      updated_at=datetime('now')
    WHERE id=?`).run(event_name,event_date,event_time,closes_at,status,race_number?parseInt(race_number):null,distance,prize_money,country_id,course_id,req.params.id);
    res.json(db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id));
  } catch(err) { res.status(500).json({error:err.message}); }
});

// ── DELETE EVENT ────────────────────────────────────────────
router.delete('/:id', authenticate, requireSuperAdmin, (req, res) => {
  try { getDb().prepare('DELETE FROM events WHERE id=?').run(req.params.id); res.json({message:'Deleted'}); }
  catch(err) { res.status(500).json({error:err.message}); }
});

// ── SETTLE EVENT ────────────────────────────────────────────
router.post('/:id/result', authenticate, (req, res) => {
  try {
    const { winner_selection_id } = req.body;
    if (!winner_selection_id) return res.status(400).json({error:'Winner required'});
    const db=getDb();
    const event=db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id);
    if (!event) return res.status(404).json({error:'Not found'});
    if (event.status==='settled') return res.status(400).json({error:'Already settled'});
    const winner=db.prepare('SELECT * FROM selections WHERE id=? AND event_id=?').get(winner_selection_id,req.params.id);
    if (!winner||winner.status==='scratched') return res.status(400).json({error:'Invalid winner'});
    const summary=runTransaction(()=>{
      db.prepare("UPDATE events SET status='settled',result_selection_id=?,updated_at=datetime('now') WHERE id=?").run(winner_selection_id,req.params.id);
      db.prepare('UPDATE selections SET is_winner=1 WHERE id=?').run(winner_selection_id);
      const totalDed=db.prepare("SELECT COALESCE(SUM(scratch_deduction),0) as t FROM selections WHERE event_id=? AND status='scratched'").get(req.params.id).t;
      const bets=db.prepare("SELECT b.*,w.cash_balance,w.credit_used FROM bets b JOIN wallets w ON b.wallet_id=w.id WHERE b.event_id=? AND b.status='pending'").all(req.params.id);
      let winners=0,losers=0,total_paid=0;
      for (const bet of bets) {
        const won=bet.selection_id===winner_selection_id;
        const df=Math.max(0,1-(totalDed/100));
        const ar=won?parseFloat((bet.stake+(bet.potential_return-bet.stake)*df).toFixed(2)):0;
        db.prepare("UPDATE bets SET status=?,actual_return=?,deduction_applied=?,settled_at=datetime('now') WHERE id=?").run(won?'won':'lost',ar,totalDed,bet.id);
        if (won) {
          if (bet.payment_type==='cash') {
            const nb=parseFloat((bet.cash_balance+ar).toFixed(2));
            db.prepare("UPDATE wallets SET cash_balance=?,updated_at=datetime('now') WHERE id=?").run(nb,bet.wallet_id);
            db.prepare("INSERT INTO transactions (id,wallet_id,operator_id,type,payment_type,amount,balance_before,balance_after,description,reference_id) VALUES (?,?,?,'winnings','cash',?,?,?,?,?)").run(uuidv4(),bet.wallet_id,bet.operator_id,ar,bet.cash_balance,nb,`Won: ${event.event_name}`,bet.id);
          } else {
            const newUsed=Math.max(0,parseFloat((bet.credit_used-ar).toFixed(2)));
            db.prepare("UPDATE wallets SET credit_used=?,updated_at=datetime('now') WHERE id=?").run(newUsed,bet.wallet_id);
          }
          winners++; total_paid+=ar;
        } else losers++;
      }
      return {winners,losers,total_paid};
    });
    res.json({message:'Settled',winner:winner.name,...summary});
  } catch(err) { console.error('Settle:', err.message); res.status(500).json({error:err.message}); }
});

// ── SELECTIONS ──────────────────────────────────────────────
router.get('/:id/selections', authenticate, (req, res) => {
  try {
    const db=getDb();
    const sels=db.prepare('SELECT *, COALESCE(win_odds,odds,2.00) as win_odds, COALESCE(place_odds,0) as place_odds, COALESCE(opening_win_odds,odds,win_odds,2.00) as opening_win_odds FROM selections WHERE event_id=? ORDER BY barrier_number ASC, name ASC').all(req.params.id);
    for (const s of sels) {
      s.price_history=db.prepare('SELECT old_price,new_price,changed_at FROM selection_price_history WHERE selection_id=? AND price_type=? ORDER BY changed_at DESC LIMIT 5').all(s.id,'win').reverse();
      s.total_staked  =db.prepare("SELECT COALESCE(SUM(stake),0) as v FROM bets WHERE selection_id=? AND status='pending'").get(s.id).v;
      s.total_liability=db.prepare("SELECT COALESCE(SUM(potential_return),0) as v FROM bets WHERE selection_id=? AND status='pending'").get(s.id).v;
    }
    res.json(sels);
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.post('/:id/selections', authenticate, (req, res) => {
  try {
    const { name, sub_info, barrier_number, jockey, trainer, weight, age, form, colour, win_odds, place_odds } = req.body;
    if (!name||!win_odds) return res.status(400).json({error:'Name and win odds required'});
    const db=getDb(), id=uuidv4();
    db.prepare('INSERT INTO selections (id,event_id,name,sub_info,barrier_number,jockey,trainer,weight,age,form,colour,win_odds,place_odds,opening_win_odds) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,req.params.id,name.trim(),sub_info||null,barrier_number||null,jockey||null,trainer||null,weight||null,age||null,form||null,colour||null,parseFloat(win_odds),place_odds?parseFloat(place_odds):null,parseFloat(win_odds));
    res.status(201).json(db.prepare('SELECT * FROM selections WHERE id=?').get(id));
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.put('/selection/:id', authenticate, (req, res) => {
  try {
    const { name, sub_info, barrier_number, jockey, trainer, weight, age, form, colour, win_odds, place_odds } = req.body;
    const db=getDb(), sel=db.prepare('SELECT * FROM selections WHERE id=?').get(req.params.id);
    if (!sel) return res.status(404).json({error:'Not found'});
    if (win_odds && parseFloat(win_odds)!==sel.win_odds) {
      db.prepare('INSERT INTO selection_price_history (id,selection_id,price_type,old_price,new_price) VALUES (?,?,?,?,?)').run(uuidv4(),req.params.id,'win',sel.win_odds,parseFloat(win_odds));
      const hist=db.prepare('SELECT id FROM selection_price_history WHERE selection_id=? AND price_type=? ORDER BY changed_at DESC').all(req.params.id,'win');
      if (hist.length>5) for (const old of hist.slice(5)) db.prepare('DELETE FROM selection_price_history WHERE id=?').run(old.id);
    }
    db.prepare(`UPDATE selections SET name=COALESCE(?,name),sub_info=COALESCE(?,sub_info),barrier_number=COALESCE(?,barrier_number),
      jockey=COALESCE(?,jockey),trainer=COALESCE(?,trainer),weight=COALESCE(?,weight),age=COALESCE(?,age),form=COALESCE(?,form),
      colour=COALESCE(?,colour),win_odds=COALESCE(?,win_odds),place_odds=COALESCE(?,place_odds),updated_at=datetime('now') WHERE id=?`)
      .run(name,sub_info,barrier_number,jockey,trainer,weight,age,form,colour,win_odds?parseFloat(win_odds):null,place_odds?parseFloat(place_odds):null,req.params.id);
    const updated=db.prepare('SELECT * FROM selections WHERE id=?').get(req.params.id);
    updated.price_history=db.prepare('SELECT old_price,new_price,changed_at FROM selection_price_history WHERE selection_id=? AND price_type=? ORDER BY changed_at DESC LIMIT 5').all(req.params.id,'win').reverse();
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
    const db=getDb(), sel=db.prepare('SELECT * FROM selections WHERE id=?').get(req.params.id);
    if (!sel||sel.status==='scratched') return res.status(400).json({error:'Already scratched or not found'});
    db.prepare("UPDATE selections SET status='scratched',scratch_deduction=?,scratched_at=datetime('now') WHERE id=?").run(parseFloat(deduction_percent),req.params.id);
    const bets=db.prepare("SELECT b.*,w.cash_balance FROM bets b JOIN wallets w ON b.wallet_id=w.id WHERE b.selection_id=? AND b.status='pending'").all(req.params.id);
    for (const bet of bets) {
      const nb=parseFloat((bet.cash_balance+bet.stake).toFixed(2));
      db.prepare("UPDATE bets SET status='refunded',settled_at=datetime('now') WHERE id=?").run(bet.id);
      db.prepare("UPDATE wallets SET cash_balance=?,updated_at=datetime('now') WHERE id=?").run(nb,bet.wallet_id);
      db.prepare("INSERT INTO transactions (id,wallet_id,operator_id,type,payment_type,amount,balance_before,balance_after,description) VALUES (?,?,?,'refund','cash',?,?,?,?)").run(uuidv4(),bet.wallet_id,bet.operator_id,bet.stake,bet.cash_balance,nb,`Refund: ${sel.name} scratched`);
    }
    res.json({message:`Scratched. ${bets.length} bet(s) refunded.`});
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.get('/:id/results', authenticate, (req, res) => {
  try {
    const db=getDb(), event=db.prepare('SELECT e.*,sp.name as sport_name FROM events e JOIN sports sp ON e.sport_id=sp.id WHERE e.id=?').get(req.params.id);
    if (!event) return res.status(404).json({error:'Not found'});
    const bets=db.prepare('SELECT b.*,w.name as wallet_name,s.name as selection_name FROM bets b JOIN wallets w ON b.wallet_id=w.id JOIN selections s ON b.selection_id=s.id WHERE b.event_id=? ORDER BY b.status,b.created_at DESC').all(req.params.id);
    const summary={total_bets:bets.length,total_staked:bets.reduce((s,b)=>s+b.stake,0),total_paid:bets.filter(b=>b.status==='won').reduce((s,b)=>s+b.actual_return,0),winners:bets.filter(b=>b.status==='won').length,losers:bets.filter(b=>b.status==='lost').length};
    summary.house_profit=summary.total_staked-summary.total_paid;
    res.json({event,summary,bets});
  } catch(err) { res.status(500).json({error:err.message}); }
});

module.exports = router;

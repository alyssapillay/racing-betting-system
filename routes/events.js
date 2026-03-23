const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb, runTransaction } = require('../database/db');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();

// GET all sports
router.get('/sports', authenticate, (req, res) => {
  res.json(getDb().prepare('SELECT * FROM sports WHERE is_active=1 ORDER BY name').all());
});

// GET events (optionally filter by sport)
router.get('/', authenticate, (req, res) => {
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
  const conditions = [], params = [];
  if (sport_id) { conditions.push('e.sport_id=?'); params.push(sport_id); }
  if (status)   { conditions.push('e.status=?');   params.push(status); }
  if (conditions.length) q += ' WHERE ' + conditions.join(' AND ');
  q += ' GROUP BY e.id ORDER BY e.event_date ASC, e.event_time ASC';
  res.json(db.prepare(q).all(...params));
});

// GET single event with selections + liability
router.get('/:id', authenticate, (req, res) => {
  const db = getDb();
  const event = db.prepare(`
    SELECT e.*, sp.name as sport_name, sp.icon as sport_icon,
      COALESCE(co.name,'') as country_name, COALESCE(co.flag,'🏆') as flag,
      COALESCE(cu.name,'') as course_name
    FROM events e
    JOIN sports sp ON e.sport_id=sp.id
    LEFT JOIN countries co ON e.country_id=co.id
    LEFT JOIN courses cu ON e.course_id=cu.id
    WHERE e.id=?
  `).get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const selections = db.prepare('SELECT * FROM selections WHERE event_id=? ORDER BY barrier_number ASC, name ASC').all(req.params.id);

  // Calculate liability per selection
  for (const sel of selections) {
    const staked = db.prepare("SELECT COALESCE(SUM(stake),0) as s FROM bets WHERE selection_id=? AND status='pending'").get(sel.id).s;
    const liability = db.prepare("SELECT COALESCE(SUM(potential_return),0) as s FROM bets WHERE selection_id=? AND status='pending'").get(sel.id).s;
    sel.total_staked   = staked;
    sel.total_liability = liability;
    sel.house_exposure = liability - staked;
    sel.bet_count = db.prepare("SELECT COUNT(*) as c FROM bets WHERE selection_id=? AND status='pending'").get(sel.id).c;
  }

  event.selections = selections;
  res.json(event);
});

// POST create event — super_admin can set times; bookmaker cannot
router.post('/', authenticate, (req, res) => {
  const { sport_id, country_id, course_id, event_name, event_date, event_time, venue, closes_at } = req.body;
  if (!sport_id || !event_name || !event_date || !event_time) return res.status(400).json({ error: 'Sport, name, date and time required' });
  const db = getDb();
  const id = uuidv4();
  db.prepare('INSERT INTO events (id,sport_id,country_id,course_id,event_name,event_date,event_time,venue,closes_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(id, sport_id, country_id||null, course_id||null, event_name.trim(), event_date, event_time, venue||null, closes_at||null, req.user.id);
  res.status(201).json(db.prepare(`
    SELECT e.*, sp.name as sport_name, sp.icon as sport_icon,
      COALESCE(co.flag,'🏆') as flag, COALESCE(co.name,'') as country_name
    FROM events e JOIN sports sp ON e.sport_id=sp.id LEFT JOIN countries co ON e.country_id=co.id WHERE e.id=?
  `).get(id));
});

// PUT update event — only super_admin can change date/time
router.put('/:id', authenticate, (req, res) => {
  const { event_name, event_date, event_time, venue, closes_at, status, country_id, course_id } = req.body;
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  // Bookmakers cannot change date/time
  if (req.user.role !== 'super_admin' && (event_date || event_time)) {
    return res.status(403).json({ error: 'Only Super Admin can change event date/time' });
  }

  db.prepare(`UPDATE events SET
    event_name=COALESCE(?,event_name),
    event_date=COALESCE(?,event_date),
    event_time=COALESCE(?,event_time),
    venue=COALESCE(?,venue),
    closes_at=COALESCE(?,closes_at),
    status=COALESCE(?,status),
    country_id=COALESCE(?,country_id),
    course_id=COALESCE(?,course_id),
    updated_at=datetime('now')
    WHERE id=?`).run(event_name, event_date, event_time, venue, closes_at, status, country_id, course_id, req.params.id);
  res.json(db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id));
});

// DELETE event
router.delete('/:id', authenticate, requireSuperAdmin, (req, res) => {
  getDb().prepare('DELETE FROM events WHERE id=?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// POST declare result & settle bets
router.post('/:id/result', authenticate, (req, res) => {
  const { winner_selection_id } = req.body;
  if (!winner_selection_id) return res.status(400).json({ error: 'Winner selection required' });
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (event.status === 'settled') return res.status(400).json({ error: 'Already settled' });
  const winner = db.prepare('SELECT * FROM selections WHERE id=? AND event_id=?').get(winner_selection_id, req.params.id);
  if (!winner) return res.status(404).json({ error: 'Selection not found in this event' });
  if (winner.status === 'scratched') return res.status(400).json({ error: 'Scratched selection cannot win' });

  const summary = runTransaction(() => {
    db.prepare("UPDATE events SET status='settled', result_selection_id=?, updated_at=datetime('now') WHERE id=?").run(winner_selection_id, req.params.id);
    db.prepare("UPDATE selections SET is_winner=1 WHERE id=?").run(winner_selection_id);

    const totalDeduction = db.prepare("SELECT COALESCE(SUM(scratch_deduction),0) as t FROM selections WHERE event_id=? AND status='scratched'").get(req.params.id).t;
    const pendingBets = db.prepare("SELECT b.*, w.balance as wallet_balance FROM bets b JOIN wallets w ON b.wallet_id=w.id WHERE b.event_id=? AND b.status='pending'").all(req.params.id);

    let winners = 0, losers = 0, total_paid = 0;
    for (const bet of pendingBets) {
      const won = bet.selection_id === winner_selection_id;
      const df = Math.max(0, 1 - (totalDeduction / 100));
      const actualReturn = won ? parseFloat((bet.stake + (bet.potential_return - bet.stake) * df).toFixed(2)) : 0;
      db.prepare("UPDATE bets SET status=?, actual_return=?, deduction_applied=?, settled_at=datetime('now') WHERE id=?").run(won?'won':'lost', actualReturn, totalDeduction, bet.id);
      if (won) {
        const nb = bet.wallet_balance + actualReturn;
        db.prepare("UPDATE wallets SET balance=?, updated_at=datetime('now') WHERE id=?").run(nb, bet.wallet_id);
        db.prepare("INSERT INTO transactions (id,wallet_id,operator_id,type,amount,balance_before,balance_after,description,reference_id) VALUES (?,?,?,?,?,?,?,?,?)").run(uuidv4(), bet.wallet_id, bet.operator_id, 'winnings', actualReturn, bet.wallet_balance, nb, `Won: ${event.event_name}`, bet.id);
        winners++; total_paid += actualReturn;
      } else { losers++; }
    }

    // Settle multi-leg betslips
    const legs = db.prepare("SELECT bl.* FROM betslip_legs bl JOIN betslips bs ON bl.betslip_id=bs.id WHERE bl.event_id=? AND bs.status='pending' AND bs.slip_type='multi'").all(req.params.id);
    for (const leg of legs) {
      const won = leg.selection_id === winner_selection_id;
      db.prepare("UPDATE betslip_legs SET result=? WHERE id=?").run(won?'won':'lost', leg.id);
      const slip = db.prepare('SELECT * FROM betslips WHERE id=?').get(leg.betslip_id);
      const allLegs = db.prepare('SELECT * FROM betslip_legs WHERE betslip_id=?').all(leg.betslip_id);
      if (allLegs.every(l => l.result !== 'pending')) {
        const allWon = allLegs.every(l => l.result === 'won');
        const df = Math.max(0, 1 - (totalDeduction / 100));
        const ar = allWon ? parseFloat((slip.total_stake + (slip.potential_return - slip.total_stake) * df).toFixed(2)) : 0;
        db.prepare("UPDATE betslips SET status=?, actual_return=?, settled_at=datetime('now'), updated_at=datetime('now') WHERE id=?").run(allWon?'won':'lost', ar, slip.id);
        const mb = db.prepare("SELECT * FROM bets WHERE betslip_id=? LIMIT 1").get(slip.id);
        if (mb && allWon) {
          const wallet = db.prepare('SELECT * FROM wallets WHERE id=?').get(slip.wallet_id);
          const nb = wallet.balance + ar;
          db.prepare("UPDATE wallets SET balance=?, updated_at=datetime('now') WHERE id=?").run(nb, wallet.id);
          db.prepare("INSERT INTO transactions (id,wallet_id,operator_id,type,amount,balance_before,balance_after,description) VALUES (?,?,?,?,?,?,?,?)").run(uuidv4(), wallet.id, slip.operator_id, 'winnings', ar, wallet.balance, nb, 'Multi Winnings');
        }
      }
    }
    return { winners, losers, total_paid };
  });

  res.json({ message: 'Event settled', winner: winner.name, ...summary });
});

// ── SELECTIONS ─────────────────────────────────────────────────

router.get('/:id/selections', authenticate, (req, res) => {
  const db = getDb();
  const sels = db.prepare('SELECT * FROM selections WHERE event_id=? ORDER BY barrier_number ASC, name ASC').all(req.params.id);
  for (const s of sels) {
    s.total_staked   = db.prepare("SELECT COALESCE(SUM(stake),0) as v FROM bets WHERE selection_id=? AND status='pending'").get(s.id).v;
    s.total_liability= db.prepare("SELECT COALESCE(SUM(potential_return),0) as v FROM bets WHERE selection_id=? AND status='pending'").get(s.id).v;
    s.bet_count      = db.prepare("SELECT COUNT(*) as c FROM bets WHERE selection_id=? AND status='pending'").get(s.id).c;
  }
  res.json(sels);
});

router.post('/:id/selections', authenticate, (req, res) => {
  const { name, sub_info, barrier_number, jockey, trainer, weight, age, form, colour, odds } = req.body;
  if (!name || !odds) return res.status(400).json({ error: 'Name and odds required' });
  const db = getDb();
  const id = uuidv4();
  db.prepare('INSERT INTO selections (id,event_id,name,sub_info,barrier_number,jockey,trainer,weight,age,form,colour,odds,opening_odds) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, req.params.id, name.trim(), sub_info||null, barrier_number||null, jockey||null, trainer||null, weight||null, age||null, form||null, colour||null, parseFloat(odds), parseFloat(odds));
  res.status(201).json(db.prepare('SELECT * FROM selections WHERE id=?').get(id));
});

router.put('/selection/:id', authenticate, (req, res) => {
  const { name, sub_info, barrier_number, jockey, trainer, weight, age, form, colour, odds } = req.body;
  const db = getDb();
  db.prepare('UPDATE selections SET name=COALESCE(?,name), sub_info=COALESCE(?,sub_info), barrier_number=COALESCE(?,barrier_number), jockey=COALESCE(?,jockey), trainer=COALESCE(?,trainer), weight=COALESCE(?,weight), age=COALESCE(?,age), form=COALESCE(?,form), colour=COALESCE(?,colour), odds=COALESCE(?,odds), updated_at=datetime("now") WHERE id=?')
    .run(name, sub_info, barrier_number, jockey, trainer, weight, age, form, colour, odds?parseFloat(odds):null, req.params.id);
  res.json(db.prepare('SELECT * FROM selections WHERE id=?').get(req.params.id));
});

router.delete('/selection/:id', authenticate, (req, res) => {
  getDb().prepare('DELETE FROM selections WHERE id=?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// Scratch selection
router.post('/selection/:id/scratch', authenticate, (req, res) => {
  const { deduction_percent = 0 } = req.body;
  const db = getDb();
  const sel = db.prepare('SELECT * FROM selections WHERE id=?').get(req.params.id);
  if (!sel) return res.status(404).json({ error: 'Selection not found' });
  if (sel.status === 'scratched') return res.status(400).json({ error: 'Already scratched' });
  db.prepare("UPDATE selections SET status='scratched', scratch_deduction=?, scratched_at=datetime('now') WHERE id=?").run(parseFloat(deduction_percent), req.params.id);
  const bets = db.prepare("SELECT b.*, w.balance FROM bets b JOIN wallets w ON b.wallet_id=w.id WHERE b.selection_id=? AND b.status='pending'").all(req.params.id);
  for (const bet of bets) {
    const nb = bet.balance + bet.stake;
    db.prepare("UPDATE bets SET status='refunded', settled_at=datetime('now') WHERE id=?").run(bet.id);
    db.prepare("UPDATE wallets SET balance=?, updated_at=datetime('now') WHERE id=?").run(nb, bet.wallet_id);
    db.prepare("INSERT INTO transactions (id,wallet_id,operator_id,type,amount,balance_before,balance_after,description,reference_id) VALUES (?,?,?,?,?,?,?,?,?)").run(uuidv4(), bet.wallet_id, bet.operator_id, 'refund', bet.stake, bet.balance, nb, `Refund: ${sel.name} scratched`, bet.id);
  }
  res.json({ message: `${sel.name} scratched. ${bets.length} bet(s) refunded.`, refunded: bets.length });
});

// GET race P&L breakdown
router.get('/:id/results', authenticate, (req, res) => {
  const db = getDb();
  const event = db.prepare('SELECT e.*, sp.name as sport_name FROM events e JOIN sports sp ON e.sport_id=sp.id WHERE e.id=?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Not found' });
  const bets = db.prepare(`
    SELECT b.*, w.name as wallet_name, s.name as selection_name
    FROM bets b JOIN wallets w ON b.wallet_id=w.id JOIN selections s ON b.selection_id=s.id
    WHERE b.event_id=? ORDER BY b.status, b.created_at DESC
  `).all(req.params.id);
  const summary = {
    total_bets: bets.length,
    total_staked: bets.reduce((s,b) => s+b.stake, 0),
    total_paid: bets.filter(b=>b.status==='won').reduce((s,b) => s+b.actual_return, 0),
    winners: bets.filter(b=>b.status==='won').length,
    losers: bets.filter(b=>b.status==='lost').length,
    house_profit: 0
  };
  summary.house_profit = summary.total_staked - summary.total_paid;
  res.json({ event, summary, bets });
});

module.exports = router;

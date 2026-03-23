const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb, runTransaction } = require('../database/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// ─── MEETINGS ─────────────────────────────────────────────────────

router.get('/meetings', authenticate, (req, res) => {
  const db = getDb();
  const { course_id } = req.query;
  let q = `
    SELECT rm.*, co.name as course_name, co.surface, co.location,
      c.name as country_name, c.flag, c.code,
      COUNT(r.id) as race_count
    FROM race_meetings rm
    JOIN courses co ON rm.course_id = co.id
    JOIN countries c ON co.country_id = c.id
    LEFT JOIN races r ON r.meeting_id = rm.id
  `;
  const params = [];
  if (course_id) { q += ' WHERE rm.course_id = ?'; params.push(course_id); }
  q += ' GROUP BY rm.id ORDER BY c.name, rm.meeting_date DESC';
  res.json(db.prepare(q).all(...params));
});

router.post('/meetings', authenticate, requireAdmin, (req, res) => {
  const { course_id, meeting_date, meeting_time } = req.body;
  if (!course_id || !meeting_date || !meeting_time) return res.status(400).json({ error: 'Course, date and time required' });
  const db = getDb();
  const id = uuidv4();
  db.prepare('INSERT INTO race_meetings (id,course_id,meeting_date,meeting_time,created_by) VALUES (?,?,?,?,?)').run(id,course_id,meeting_date,meeting_time,req.user.id);
  res.status(201).json(db.prepare(`
    SELECT rm.*, co.name as course_name, c.name as country_name, c.flag
    FROM race_meetings rm JOIN courses co ON rm.course_id=co.id JOIN countries c ON co.country_id=c.id WHERE rm.id=?
  `).get(id));
});

router.put('/meetings/:id', authenticate, requireAdmin, (req, res) => {
  const { course_id, meeting_date, meeting_time, status } = req.body;
  const db = getDb();
  db.prepare('UPDATE race_meetings SET course_id=COALESCE(?,course_id), meeting_date=COALESCE(?,meeting_date), meeting_time=COALESCE(?,meeting_time), status=COALESCE(?,status), updated_at=datetime("now") WHERE id=?')
    .run(course_id,meeting_date,meeting_time,status,req.params.id);
  res.json(db.prepare('SELECT * FROM race_meetings WHERE id=?').get(req.params.id));
});

router.delete('/meetings/:id', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM race_meetings WHERE id=?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// ─── RACES ────────────────────────────────────────────────────────

router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const { meeting_id } = req.query;
  let q = `
    SELECT r.*, rm.meeting_date, rm.meeting_time, rm.course_id,
      co.name as course_name, co.surface,
      c.name as country_name, c.flag,
      COUNT(h.id) as horse_count,
      hw.horse_name as winner_name
    FROM races r
    LEFT JOIN race_meetings rm ON r.meeting_id = rm.id
    LEFT JOIN courses co ON rm.course_id = co.id
    LEFT JOIN countries c ON co.country_id = c.id
    LEFT JOIN horses h ON h.race_id = r.id
    LEFT JOIN horses hw ON r.result_horse_id = hw.id
  `;
  const params = [];
  if (meeting_id) { q += ' WHERE r.meeting_id=?'; params.push(meeting_id); }
  q += ' GROUP BY r.id ORDER BY rm.meeting_date DESC, r.race_number ASC';
  res.json(db.prepare(q).all(...params));
});

router.get('/:id', authenticate, (req, res) => {
  const db = getDb();
  const race = db.prepare(`
    SELECT r.*, rm.meeting_date, rm.meeting_time,
      co.name as course_name, co.surface, co.location,
      c.name as country_name, c.flag
    FROM races r
    LEFT JOIN race_meetings rm ON r.meeting_id=rm.id
    LEFT JOIN courses co ON rm.course_id=co.id
    LEFT JOIN countries c ON co.country_id=c.id
    WHERE r.id=?
  `).get(req.params.id);
  if (!race) return res.status(404).json({ error: 'Race not found' });
  race.horses = db.prepare('SELECT * FROM horses WHERE race_id=? ORDER BY barrier_number ASC').all(req.params.id);
  res.json(race);
});

router.post('/', authenticate, requireAdmin, (req, res) => {
  const { meeting_id, race_number, race_name, distance, race_class, prize_money, closes_at } = req.body;
  if (!meeting_id || !race_number || !race_name) return res.status(400).json({ error: 'Meeting, number and name required' });
  const db = getDb();
  const id = uuidv4();
  db.prepare('INSERT INTO races (id,meeting_id,race_number,race_name,distance,race_class,prize_money,closes_at) VALUES (?,?,?,?,?,?,?,?)').run(id,meeting_id,race_number,race_name.trim(),distance||null,race_class||null,prize_money||null,closes_at||null);
  res.status(201).json(db.prepare('SELECT * FROM races WHERE id=?').get(id));
});

router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const { race_number, race_name, distance, race_class, prize_money, closes_at, status } = req.body;
  const db = getDb();
  db.prepare('UPDATE races SET race_number=COALESCE(?,race_number), race_name=COALESCE(?,race_name), distance=COALESCE(?,distance), race_class=COALESCE(?,race_class), prize_money=COALESCE(?,prize_money), closes_at=COALESCE(?,closes_at), status=COALESCE(?,status), updated_at=datetime("now") WHERE id=?')
    .run(race_number,race_name,distance,race_class,prize_money,closes_at,status,req.params.id);
  res.json(db.prepare('SELECT * FROM races WHERE id=?').get(req.params.id));
});

router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM races WHERE id=?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// Set race result
router.post('/:id/result', authenticate, requireAdmin, (req, res) => {
  const { winner_horse_id } = req.body;
  if (!winner_horse_id) return res.status(400).json({ error: 'Winner horse ID required' });
  const db = getDb();
  const race = db.prepare('SELECT * FROM races WHERE id=?').get(req.params.id);
  if (!race) return res.status(404).json({ error: 'Race not found' });
  if (race.status === 'finished') return res.status(400).json({ error: 'Already settled' });
  const winner = db.prepare('SELECT * FROM horses WHERE id=? AND race_id=?').get(winner_horse_id, req.params.id);
  if (!winner) return res.status(404).json({ error: 'Horse not found in this race' });

  const summary = runTransaction(() => {
    db.prepare("UPDATE races SET status='finished', result_horse_id=?, updated_at=datetime('now') WHERE id=?").run(winner_horse_id, req.params.id);
    db.prepare('UPDATE horses SET result_position=1 WHERE id=?').run(winner_horse_id);

    const totalDeduction = db.prepare("SELECT COALESCE(SUM(scratch_deduction),0) as t FROM horses WHERE race_id=? AND status='scratched'").get(req.params.id).t;
    const bets = db.prepare("SELECT b.*, u.wallet_balance FROM bets b JOIN users u ON b.user_id=u.id WHERE b.race_id=? AND b.status='pending'").all(req.params.id);

    const s = { winners: 0, losers: 0, total_paid: 0 };
    for (const bet of bets) {
      const won = bet.horse_id === winner_horse_id;
      const df = Math.max(0, 1 - (totalDeduction / 100));
      const actualReturn = won ? parseFloat((bet.stake + (bet.potential_return - bet.stake) * df).toFixed(2)) : 0;
      db.prepare("UPDATE bets SET status=?, actual_return=?, deduction_applied=?, settled_at=datetime('now') WHERE id=?").run(won?'won':'lost', actualReturn, totalDeduction, bet.id);
      if (won) {
        const nb = bet.wallet_balance + actualReturn;
        db.prepare("UPDATE users SET wallet_balance=?, updated_at=datetime('now') WHERE id=?").run(nb, bet.user_id);
        db.prepare("INSERT INTO transactions (id,user_id,type,amount,balance_before,balance_after,description,reference_id) VALUES (?,?,'winnings',?,?,?,?,?)").run(uuidv4(),bet.user_id,actualReturn,bet.wallet_balance,nb,`Winnings: ${race.race_name}`,bet.id);
        s.winners++; s.total_paid += actualReturn;
      } else { s.losers++; }
    }

    // Settle multi betslips
    const sels = db.prepare("SELECT bs.* FROM betslip_selections bs JOIN betslips b ON bs.betslip_id=b.id WHERE bs.race_id=? AND b.status='active' AND b.slip_type='multi'").all(req.params.id);
    for (const sel of sels) {
      const isWin = sel.horse_id === winner_horse_id;
      db.prepare("UPDATE betslip_selections SET result=? WHERE id=?").run(isWin?'won':'lost', sel.id);
      const slip = db.prepare('SELECT * FROM betslips WHERE id=?').get(sel.betslip_id);
      const all = db.prepare('SELECT * FROM betslip_selections WHERE betslip_id=?').all(sel.betslip_id);
      if (all.every(s => s.result !== 'pending')) {
        const allWon = all.every(s => s.result === 'won');
        const df = Math.max(0, 1 - (totalDeduction / 100));
        const ar = allWon ? parseFloat((slip.total_stake + (slip.potential_return - slip.total_stake) * df).toFixed(2)) : 0;
        db.prepare("UPDATE betslips SET status=?, actual_return=?, settled_at=datetime('now'), updated_at=datetime('now') WHERE id=?").run(allWon?'won':'lost', ar, sel.betslip_id);
        const mb = db.prepare("SELECT * FROM bets WHERE betslip_id=? AND bet_type='multi'").get(sel.betslip_id);
        if (mb) {
          db.prepare("UPDATE bets SET status=?, actual_return=?, settled_at=datetime('now') WHERE id=?").run(allWon?'won':'lost', ar, mb.id);
          if (allWon) {
            const u = db.prepare('SELECT * FROM users WHERE id=?').get(mb.user_id);
            const nb = u.wallet_balance + ar;
            db.prepare("UPDATE users SET wallet_balance=?, updated_at=datetime('now') WHERE id=?").run(nb, u.id);
            db.prepare("INSERT INTO transactions (id,user_id,type,amount,balance_before,balance_after,description,reference_id) VALUES (?,?,'winnings',?,?,?,?,?)").run(uuidv4(),u.id,ar,u.wallet_balance,nb,'Multi Winnings',sel.betslip_id);
          }
        }
      }
    }
    return s;
  });

  res.json({ message: 'Race settled', winner: winner.horse_name, ...summary });
});

// ─── HORSES ───────────────────────────────────────────────────────

router.get('/:id/horses', authenticate, (req, res) => {
  res.json(getDb().prepare('SELECT * FROM horses WHERE race_id=? ORDER BY barrier_number ASC').all(req.params.id));
});

router.post('/:id/horses', authenticate, requireAdmin, (req, res) => {
  const { horse_name, barrier_number, jockey, trainer, weight, age, form, colour, odds } = req.body;
  if (!horse_name || !odds) return res.status(400).json({ error: 'Horse name and odds required' });
  const db = getDb();
  const race = db.prepare('SELECT * FROM races WHERE id=?').get(req.params.id);
  if (!race) return res.status(404).json({ error: 'Race not found' });
  const id = uuidv4();
  db.prepare('INSERT INTO horses (id,race_id,horse_name,barrier_number,jockey,trainer,weight,age,form,colour,odds) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,req.params.id,horse_name.trim(),barrier_number||null,jockey||null,trainer||null,weight||null,age||null,form||null,colour||null,parseFloat(odds));
  res.status(201).json(db.prepare('SELECT * FROM horses WHERE id=?').get(id));
});

router.put('/horse/:id', authenticate, requireAdmin, (req, res) => {
  const { horse_name, barrier_number, jockey, trainer, weight, age, form, colour, odds } = req.body;
  const db = getDb();
  db.prepare('UPDATE horses SET horse_name=COALESCE(?,horse_name), barrier_number=COALESCE(?,barrier_number), jockey=COALESCE(?,jockey), trainer=COALESCE(?,trainer), weight=COALESCE(?,weight), age=COALESCE(?,age), form=COALESCE(?,form), colour=COALESCE(?,colour), odds=COALESCE(?,odds), updated_at=datetime("now") WHERE id=?')
    .run(horse_name,barrier_number,jockey,trainer,weight,age,form,colour,odds?parseFloat(odds):null,req.params.id);
  res.json(db.prepare('SELECT * FROM horses WHERE id=?').get(req.params.id));
});

router.post('/horse/:id/scratch', authenticate, requireAdmin, (req, res) => {
  const { deduction_percent } = req.body;
  if (deduction_percent === undefined) return res.status(400).json({ error: 'Deduction required' });
  const db = getDb();
  const horse = db.prepare('SELECT * FROM horses WHERE id=?').get(req.params.id);
  if (!horse) return res.status(404).json({ error: 'Horse not found' });
  db.prepare("UPDATE horses SET status='scratched', scratch_deduction=?, scratched_at=datetime('now'), updated_at=datetime('now') WHERE id=?").run(parseFloat(deduction_percent), req.params.id);
  const bets = db.prepare("SELECT b.*, u.wallet_balance FROM bets b JOIN users u ON b.user_id=u.id WHERE b.horse_id=? AND b.status='pending'").all(req.params.id);
  for (const bet of bets) {
    const nb = bet.wallet_balance + bet.stake;
    db.prepare("UPDATE bets SET status='refunded', settled_at=datetime('now') WHERE id=?").run(bet.id);
    db.prepare("UPDATE users SET wallet_balance=?, updated_at=datetime('now') WHERE id=?").run(nb, bet.user_id);
    db.prepare("INSERT INTO transactions (id,user_id,type,amount,balance_before,balance_after,description,reference_id) VALUES (?,?,'refund',?,?,?,?,?)").run(uuidv4(),bet.user_id,bet.stake,bet.wallet_balance,nb,`Refund: ${horse.horse_name} scratched`,bet.id);
  }
  res.json({ message: `${horse.horse_name} scratched. ${bets.length} bet(s) refunded.`, refunded_bets: bets.length });
});

router.delete('/horse/:id', authenticate, requireAdmin, (req, res) => {
  getDb().prepare('DELETE FROM horses WHERE id=?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

module.exports = router;

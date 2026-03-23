const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb, runTransaction } = require('../database/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/betslips — User gets own; Admin gets all
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const { user_id, status } = req.query;
  let conditions = [];
  let params = [];

  if (req.user.role !== 'admin') {
    conditions.push('bs.user_id = ?');
    params.push(req.user.id);
  } else if (user_id) {
    conditions.push('bs.user_id = ?');
    params.push(user_id);
  }
  if (status) { conditions.push('bs.status = ?'); params.push(status); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const slips = db.prepare(`
    SELECT bs.*, u.username, u.email
    FROM betslips bs
    JOIN users u ON bs.user_id = u.id
    ${where}
    ORDER BY bs.created_at DESC
  `).all(...params);

  // Attach selections to each slip
  for (const slip of slips) {
    slip.selections = db.prepare(`
      SELECT bss.*, h.horse_name, h.odds, h.status as horse_status,
        r.race_name, r.race_number, r.status as race_status,
        rm.course_name, rm.meeting_date
      FROM betslip_selections bss
      JOIN horses h ON bss.horse_id = h.id
      JOIN races r ON bss.race_id = r.id
      JOIN race_meetings rm ON r.meeting_id = rm.id
      WHERE bss.betslip_id = ?
    `).all(slip.id);
  }

  res.json(slips);
});

// GET /api/betslips/:id
router.get('/:id', authenticate, (req, res) => {
  const db = getDb();
  const slip = db.prepare('SELECT bs.*, u.username FROM betslips bs JOIN users u ON bs.user_id = u.id WHERE bs.id = ?').get(req.params.id);
  if (!slip) return res.status(404).json({ error: 'Betslip not found' });
  if (req.user.role !== 'admin' && slip.user_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

  slip.selections = db.prepare(`
    SELECT bss.*, h.horse_name, h.odds, h.status as horse_status,
      r.race_name, r.race_number, rm.course_name, rm.meeting_date
    FROM betslip_selections bss
    JOIN horses h ON bss.horse_id = h.id
    JOIN races r ON bss.race_id = r.id
    JOIN race_meetings rm ON r.meeting_id = rm.id
    WHERE bss.betslip_id = ?
  `).all(req.params.id);

  res.json(slip);
});

// POST /api/betslips — Submit a betslip (single or multi)
router.post('/', authenticate, (req, res) => {
  const { selections, stake, slip_type = 'single' } = req.body;

  if (!selections || !Array.isArray(selections) || selections.length === 0) {
    return res.status(400).json({ error: 'At least one selection required' });
  }
  if (!stake || stake <= 0) return res.status(400).json({ error: 'Valid stake required' });
  if (!['single', 'multi'].includes(slip_type)) return res.status(400).json({ error: 'slip_type must be single or multi' });
  if (slip_type === 'single' && selections.length > 1) return res.status(400).json({ error: 'Single bet can only have one selection' });
  if (slip_type === 'multi' && selections.length < 2) return res.status(400).json({ error: 'Multi bet requires at least 2 selections' });

  const db = getDb();

  // Validate all selections
  const validatedSelections = [];
  const raceIds = new Set();

  for (const sel of selections) {
    const horse = db.prepare(`
      SELECT h.*, r.status as race_status, r.id as race_id
      FROM horses h JOIN races r ON h.race_id = r.id
      WHERE h.id = ?
    `).get(sel.horse_id);

    if (!horse) return res.status(404).json({ error: `Horse ${sel.horse_id} not found` });
    if (horse.status === 'scratched') return res.status(400).json({ error: `${horse.horse_name} is scratched` });
    if (horse.race_status !== 'open') return res.status(400).json({ error: `Race for ${horse.horse_name} is not open` });
    if (raceIds.has(horse.race_id)) return res.status(400).json({ error: 'Cannot have two selections from the same race' });

    raceIds.add(horse.race_id);
    validatedSelections.push({ ...horse });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (user.wallet_balance < stake) return res.status(400).json({ error: 'Insufficient wallet balance' });

  // Calculate returns
  let combinedOdds = 1;
  if (slip_type === 'multi') {
    for (const sel of validatedSelections) combinedOdds *= sel.odds;
  } else {
    combinedOdds = validatedSelections[0].odds;
  }
  const potentialReturn = parseFloat((stake * combinedOdds).toFixed(2));

  const result = runTransaction(() => {
    const slipId = uuidv4();

    // Deduct stake from wallet
    const newBalance = user.wallet_balance - parseFloat(stake);
    db.prepare('UPDATE users SET wallet_balance = ?, updated_at = datetime("now") WHERE id = ?').run(newBalance, user.id);
    db.prepare(`
      INSERT INTO transactions (id, user_id, type, amount, balance_before, balance_after, description, reference_id)
      VALUES (?, ?, 'bet', ?, ?, ?, ?, ?)
    `).run(uuidv4(), user.id, parseFloat(stake), user.wallet_balance, newBalance, `${slip_type === 'multi' ? 'Multi' : 'Single'} Bet`, slipId);

    // Create betslip
    db.prepare(`
      INSERT INTO betslips (id, user_id, slip_type, status, total_stake, potential_return)
      VALUES (?, ?, ?, 'active', ?, ?)
    `).run(slipId, user.id, slip_type, parseFloat(stake), potentialReturn);

    // Add selections
    for (const sel of validatedSelections) {
      db.prepare(`
        INSERT INTO betslip_selections (id, betslip_id, horse_id, race_id, odds_at_time)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuidv4(), slipId, sel.id, sel.race_id, sel.odds);
    }

    // Create individual bet record
    if (slip_type === 'single') {
      const sel = validatedSelections[0];
      db.prepare(`
        INSERT INTO bets (id, user_id, betslip_id, horse_id, race_id, bet_type, stake, odds_at_time, potential_return)
        VALUES (?, ?, ?, ?, ?, 'single', ?, ?, ?)
      `).run(uuidv4(), user.id, slipId, sel.id, sel.race_id, parseFloat(stake), sel.odds, potentialReturn);
    } else {
      const firstSel = validatedSelections[0];
      db.prepare(`
        INSERT INTO bets (id, user_id, betslip_id, horse_id, race_id, bet_type, stake, odds_at_time, potential_return)
        VALUES (?, ?, ?, ?, ?, 'multi', ?, ?, ?)
      `).run(uuidv4(), user.id, slipId, firstSel.id, firstSel.race_id, parseFloat(stake), combinedOdds, potentialReturn);
    }

    return { slipId, newBalance };
  });

  const slip = db.prepare('SELECT * FROM betslips WHERE id = ?').get(result.slipId);
  slip.selections = db.prepare(`
    SELECT bss.*, h.horse_name, r.race_name, rm.course_name
    FROM betslip_selections bss
    JOIN horses h ON bss.horse_id = h.id
    JOIN races r ON bss.race_id = r.id
    JOIN race_meetings rm ON r.meeting_id = rm.id
    WHERE bss.betslip_id = ?
  `).all(result.slipId);

  res.status(201).json({
    message: 'Bet placed successfully',
    betslip: slip,
    new_wallet_balance: result.newBalance,
    combined_odds: combinedOdds,
    potential_return: potentialReturn
  });
});

// GET /api/betslips/race/:raceId/results — See win/loss breakdown
router.get('/race/:raceId/results', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  const race = db.prepare('SELECT * FROM races WHERE id = ?').get(req.params.raceId);
  if (!race) return res.status(404).json({ error: 'Race not found' });

  const bets = db.prepare(`
    SELECT b.*, u.username, u.email, h.horse_name, h.odds
    FROM bets b
    JOIN users u ON b.user_id = u.id
    JOIN horses h ON b.horse_id = h.id
    WHERE b.race_id = ?
    ORDER BY b.status, b.created_at DESC
  `).all(req.params.raceId);

  const summary = {
    total_bets: bets.length,
    total_staked: bets.reduce((s, b) => s + b.stake, 0),
    total_paid: bets.filter(b => b.status === 'won').reduce((s, b) => s + b.actual_return, 0),
    winners: bets.filter(b => b.status === 'won').length,
    losers: bets.filter(b => b.status === 'lost').length,
    refunded: bets.filter(b => b.status === 'refunded').length,
    house_profit: 0
  };
  summary.house_profit = summary.total_staked - summary.total_paid;

  res.json({ race, summary, bets });
});

module.exports = router;

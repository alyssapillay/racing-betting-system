const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb, runTransaction } = require('../database/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// GET betslips
router.get('/', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { wallet_id, status } = req.query;
    let q = `
      SELECT bs.*, w.name as wallet_name
      FROM betslips bs JOIN wallets w ON bs.wallet_id=w.id
    `;
    const conditions = [], params = [];
    if (wallet_id) { conditions.push('bs.wallet_id=?'); params.push(wallet_id); }
    if (status)    { conditions.push('bs.status=?');    params.push(status); }
    if (conditions.length) q += ' WHERE ' + conditions.join(' AND ');
    q += ' ORDER BY bs.created_at DESC LIMIT 200';
    const slips = db.prepare(q).all(...params);
    for (const slip of slips) {
      slip.legs = db.prepare(`
        SELECT bl.*, s.name as selection_name, s.odds, s.status as sel_status,
          e.event_name, e.event_date, e.status as event_status,
          sp.name as sport_name, sp.icon as sport_icon
        FROM betslip_legs bl
        JOIN selections s ON bl.selection_id=s.id
        JOIN events e ON bl.event_id=e.id
        JOIN sports sp ON e.sport_id=sp.id
        WHERE bl.betslip_id=?
      `).all(slip.id);
    }
    res.json(slips);
  } catch(err) { console.error('GET betslips error:', err); res.status(500).json({ error: err.message }); }
});

// POST place bet
router.post('/', authenticate, (req, res) => {
  try {
    const { wallet_id, selections, stake, slip_type = 'single' } = req.body;

    if (!wallet_id)  return res.status(400).json({ error: 'wallet_id required' });
    if (!selections || !Array.isArray(selections) || selections.length === 0) return res.status(400).json({ error: 'At least one selection required' });
    if (!stake || parseFloat(stake) <= 0) return res.status(400).json({ error: 'Valid stake required' });
    if (!['single','multi'].includes(slip_type)) return res.status(400).json({ error: 'slip_type must be single or multi' });
    if (slip_type === 'single' && selections.length > 1) return res.status(400).json({ error: 'Single bet = one selection only' });
    if (slip_type === 'multi'  && selections.length < 2) return res.status(400).json({ error: 'Multi bet needs 2+ selections' });

    const db = getDb();
    const wallet = db.prepare('SELECT * FROM wallets WHERE id=? AND is_active=1').get(wallet_id);
    if (!wallet) return res.status(404).json({ error: 'Wallet not found or inactive' });

    const stakeAmt = parseFloat(parseFloat(stake).toFixed(2));
    if (wallet.balance < stakeAmt) return res.status(400).json({ error: `Insufficient balance. Available: R${wallet.balance.toFixed(2)}` });

    // Validate selections
    const validated = [];
    const seenEvents = new Set();
    for (const sel of selections) {
      if (!sel.selection_id) return res.status(400).json({ error: 'Each selection needs selection_id' });
      const s = db.prepare(`
        SELECT s.*, e.status as event_status, e.id as event_id, e.event_name, e.closes_at
        FROM selections s JOIN events e ON s.event_id=e.id WHERE s.id=?
      `).get(sel.selection_id);
      if (!s)                        return res.status(404).json({ error: `Selection ${sel.selection_id} not found` });
      if (s.status === 'scratched')  return res.status(400).json({ error: `${s.name} is scratched` });
      if (s.event_status !== 'open') return res.status(400).json({ error: `Event for ${s.name} is not open` });
      if (s.closes_at && new Date(s.closes_at) < new Date()) return res.status(400).json({ error: `Betting closed for ${s.event_name}` });
      if (seenEvents.has(s.event_id)) return res.status(400).json({ error: 'Cannot bet on same event twice in one slip' });
      seenEvents.add(s.event_id);
      validated.push(s);
    }

    // Calculate combined odds & return
    const combinedOdds = slip_type === 'multi'
      ? parseFloat(validated.reduce((acc, s) => acc * s.odds, 1).toFixed(4))
      : validated[0].odds;
    const potentialReturn = parseFloat((stakeAmt * combinedOdds).toFixed(2));

    const result = runTransaction(() => {
      const slipId = uuidv4();
      const newBalance = wallet.balance - stakeAmt;

      db.prepare("UPDATE wallets SET balance=?, updated_at=datetime('now') WHERE id=?").run(newBalance, wallet.id);
      db.prepare("INSERT INTO transactions (id,wallet_id,operator_id,type,amount,balance_before,balance_after,description,reference_id) VALUES (?,?,?,?,?,?,?,?,?)").run(uuidv4(), wallet.id, req.user.id, 'bet', stakeAmt, wallet.balance, newBalance, `${slip_type === 'multi' ? 'Multi' : 'Single'} Bet`, slipId);
      db.prepare("INSERT INTO betslips (id,wallet_id,operator_id,slip_type,status,total_stake,potential_return) VALUES (?,?,?,?,?,?,?)").run(slipId, wallet.id, req.user.id, slip_type, 'pending', stakeAmt, potentialReturn);

      for (const s of validated) {
        db.prepare("INSERT INTO betslip_legs (id,betslip_id,selection_id,event_id,odds_at_time) VALUES (?,?,?,?,?)").run(uuidv4(), slipId, s.id, s.event_id, s.odds);
        if (slip_type === 'single') {
          db.prepare("INSERT INTO bets (id,wallet_id,operator_id,betslip_id,selection_id,event_id,bet_type,stake,odds_at_time,potential_return) VALUES (?,?,?,?,?,?,?,?,?,?)").run(uuidv4(), wallet.id, req.user.id, slipId, s.id, s.event_id, 'single', stakeAmt, s.odds, potentialReturn);
        }
      }
      if (slip_type === 'multi') {
        db.prepare("INSERT INTO bets (id,wallet_id,operator_id,betslip_id,selection_id,event_id,bet_type,stake,odds_at_time,potential_return) VALUES (?,?,?,?,?,?,?,?,?,?)").run(uuidv4(), wallet.id, req.user.id, slipId, validated[0].id, validated[0].event_id, 'multi', stakeAmt, combinedOdds, potentialReturn);
      }

      return { slipId, newBalance, combinedOdds, potentialReturn };
    });

    res.status(201).json({ message: 'Bet placed', slip_id: result.slipId, combined_odds: result.combinedOdds, potential_return: result.potentialReturn, new_wallet_balance: result.newBalance });
  } catch(err) {
    console.error('Place bet error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

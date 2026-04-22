const express = require('express');
const { getDb } = require('../database/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// ── SUMMARY ──────────────────────────────────────────────────────
router.get('/summary', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { sport_id, date_from, date_to } = req.query;

    // Build simple reusable WHERE clause
    function where(extra) {
      const parts = [];
      if (date_from) parts.push(`e.event_date >= '${date_from}'`);
      if (date_to)   parts.push(`e.event_date <= '${date_to}'`);
      if (sport_id)  parts.push(`e.sport_id = '${sport_id}'`);
      if (extra)     parts.push(extra);
      return parts.length ? 'WHERE ' + parts.join(' AND ') : '';
    }

    const stats = {
      total_staked:    db.prepare(`SELECT COALESCE(SUM(b.stake),0) as v FROM bets b JOIN events e ON b.event_id=e.id ${where()}`).get().v,
      total_paid:      db.prepare(`SELECT COALESCE(SUM(b.actual_return),0) as v FROM bets b JOIN events e ON b.event_id=e.id ${where("b.status='won'")}`).get().v,
      total_bets:      db.prepare(`SELECT COUNT(*) as v FROM bets b JOIN events e ON b.event_id=e.id ${where()}`).get().v,
      pending_bets:    db.prepare(`SELECT COUNT(*) as v FROM bets b JOIN events e ON b.event_id=e.id ${where("b.status='pending'")}`).get().v,
      total_liability: db.prepare(`SELECT COALESCE(SUM(b.potential_return),0) as v FROM bets b JOIN events e ON b.event_id=e.id ${where("b.status='pending'")}`).get().v,
      won_bets:        db.prepare(`SELECT COUNT(*) as v FROM bets b JOIN events e ON b.event_id=e.id ${where("b.status='won'")}`).get().v,
      lost_bets:       db.prepare(`SELECT COUNT(*) as v FROM bets b JOIN events e ON b.event_id=e.id ${where("b.status='lost'")}`).get().v,
    };
    stats.house_profit = parseFloat((stats.total_staked - stats.total_paid).toFixed(2));
    stats.margin_pct   = stats.total_staked > 0 ? parseFloat((stats.house_profit / stats.total_staked * 100).toFixed(2)) : 0;

    stats.by_sport = db.prepare(`
      SELECT sp.name, sp.icon, sp.id as sport_id,
        COUNT(b.id) as bet_count,
        COALESCE(SUM(b.stake),0) as staked,
        COALESCE(SUM(CASE WHEN b.status='won' THEN b.actual_return ELSE 0 END),0) as paid,
        COALESCE(SUM(CASE WHEN b.status='pending' THEN b.potential_return ELSE 0 END),0) as liability
      FROM sports sp
      LEFT JOIN events e ON e.sport_id=sp.id
      LEFT JOIN bets b ON b.event_id=e.id
      WHERE sp.is_active=1
      GROUP BY sp.id ORDER BY staked DESC
    `).all();

    // Cash taken in per race meeting (horse racing, grouped by course+date)
    stats.cash_per_meeting = db.prepare(`
      SELECT
        e.event_date,
        COALESCE(cu.name, 'Unknown') as course_name,
        COALESCE(co.flag,'🏇') as flag,
        COUNT(DISTINCT e.id) as race_count,
        COUNT(b.id) as bet_count,
        COALESCE(SUM(b.stake),0) as cash_taken,
        COALESCE(SUM(CASE WHEN b.status='won' THEN b.actual_return ELSE 0 END),0) as cash_paid,
        COALESCE(SUM(CASE WHEN b.status='pending' THEN b.potential_return ELSE 0 END),0) as liability
      FROM events e
      JOIN sports sp ON e.sport_id=sp.id
      LEFT JOIN countries co ON e.country_id=co.id
      LEFT JOIN courses cu ON e.course_id=cu.id
      LEFT JOIN bets b ON b.event_id=e.id
      WHERE sp.id='sport_hr'
      GROUP BY e.event_date, e.course_id
      ORDER BY e.event_date DESC
      LIMIT 20
    `).all();
    for (const m of stats.cash_per_meeting) {
      m.house_profit = parseFloat((m.cash_taken - m.cash_paid).toFixed(2));
    }

    res.json(stats);
  } catch(err) { console.error('Summary error:', err.message, err.stack); res.status(500).json({ error: err.message }); }
});

// ── PER EVENT ────────────────────────────────────────────────────
router.get('/by-event', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { sport_id, date_from, date_to, status } = req.query;
    const cond=[], params=[];
    if (sport_id)  { cond.push('e.sport_id=?');    params.push(sport_id); }
    if (status)    { cond.push('e.status=?');       params.push(status); }
    if (date_from) { cond.push('e.event_date>=?');  params.push(date_from); }
    if (date_to)   { cond.push('e.event_date<=?');  params.push(date_to); }
    const where = cond.length ? 'WHERE '+cond.join(' AND ') : '';

    const events = db.prepare(`
      SELECT e.id, e.event_name, e.event_date, e.event_time, e.status,
        sp.name as sport_name, sp.icon as sport_icon,
        COALESCE(co.name,'') as country_name, COALESCE(co.flag,'🏆') as flag,
        COALESCE(cu.name,'') as course_name,
        COUNT(DISTINCT b.id) as total_bets,
        COUNT(DISTINCT b.wallet_id) as unique_bettors,
        COALESCE(SUM(b.stake),0) as total_staked,
        COALESCE(SUM(CASE WHEN b.status='won' THEN b.actual_return ELSE 0 END),0) as total_paid,
        COALESCE(SUM(CASE WHEN b.status='pending' THEN b.potential_return ELSE 0 END),0) as total_liability,
        COUNT(CASE WHEN b.status='won' THEN 1 END) as won_bets,
        COUNT(CASE WHEN b.status='lost' THEN 1 END) as lost_bets,
        COUNT(CASE WHEN b.status='pending' THEN 1 END) as pending_bets
      FROM events e
      JOIN sports sp ON e.sport_id=sp.id
      LEFT JOIN countries co ON e.country_id=co.id
      LEFT JOIN courses cu ON e.course_id=cu.id
      LEFT JOIN bets b ON b.event_id=e.id
      ${where}
      GROUP BY e.id ORDER BY e.event_date DESC, e.event_time DESC
    `).all(...params);

    for (const ev of events) {
      ev.house_profit = parseFloat((ev.total_staked - ev.total_paid).toFixed(2));
      ev.margin_pct   = ev.total_staked > 0 ? parseFloat((ev.house_profit / ev.total_staked * 100).toFixed(2)) : 0;
    }
    res.json(events);
  } catch(err) { console.error('By-event error:', err.message); res.status(500).json({ error: err.message }); }
});

// ── PER WALLET ───────────────────────────────────────────────────
router.get('/by-wallet', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { date_from, date_to, sport_id } = req.query;
    const cond=[], params=[];
    if (sport_id)  { cond.push('e.sport_id=?');   params.push(sport_id); }
    if (date_from) { cond.push('e.event_date>=?'); params.push(date_from); }
    if (date_to)   { cond.push('e.event_date<=?'); params.push(date_to); }
    const joinWhere = cond.length ? 'AND '+cond.join(' AND ') : '';

    const wallets = db.prepare(`
      SELECT w.id, w.name, w.phone, w.balance,
        COALESCE(w.wallet_type,'cash') as wallet_type,
        COUNT(DISTINCT b.id) as total_bets,
        COUNT(DISTINCT b.event_id) as events_bet,
        COALESCE(SUM(b.stake),0) as total_staked,
        COALESCE(SUM(CASE WHEN b.status='won' THEN b.actual_return ELSE 0 END),0) as total_won,
        COALESCE(SUM(CASE WHEN b.status='pending' THEN b.potential_return ELSE 0 END),0) as total_liability,
        COUNT(CASE WHEN b.status='won' THEN 1 END) as won_bets,
        COUNT(CASE WHEN b.status='lost' THEN 1 END) as lost_bets,
        COUNT(CASE WHEN b.status='pending' THEN 1 END) as pending_bets
      FROM wallets w
      LEFT JOIN bets b ON b.wallet_id=w.id
      LEFT JOIN events e ON b.event_id=e.id ${joinWhere}
      GROUP BY w.id ORDER BY total_staked DESC
    `).all(...params);

    for (const w of wallets) {
      w.net_pl   = parseFloat((w.total_won - w.total_staked).toFixed(2));
      w.win_rate = (w.won_bets + w.lost_bets) > 0 ? parseFloat((w.won_bets / (w.won_bets + w.lost_bets) * 100).toFixed(1)) : 0;
    }
    res.json(wallets);
  } catch(err) { console.error('By-wallet error:', err.message); res.status(500).json({ error: err.message }); }
});

// ── PER MEETING ──────────────────────────────────────────────────
router.get('/by-meeting', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { date_from, date_to } = req.query;
    const cond=["sp.id='sport_hr'"], params=[];
    if (date_from) { cond.push('e.event_date>=?'); params.push(date_from); }
    if (date_to)   { cond.push('e.event_date<=?'); params.push(date_to); }
    const where = 'WHERE '+cond.join(' AND ');

    const meetings = db.prepare(`
      SELECT e.event_date,
        COALESCE(cu.name, e.event_name) as venue,
        COALESCE(co.name,'') as country_name, COALESCE(co.flag,'🏇') as flag,
        COUNT(DISTINCT e.id) as race_count,
        COUNT(DISTINCT b.id) as total_bets,
        COUNT(DISTINCT b.wallet_id) as unique_bettors,
        COALESCE(SUM(b.stake),0) as total_staked,
        COALESCE(SUM(CASE WHEN b.status='won' THEN b.actual_return ELSE 0 END),0) as total_paid,
        COALESCE(SUM(CASE WHEN b.status='pending' THEN b.potential_return ELSE 0 END),0) as total_liability,
        COUNT(CASE WHEN b.status='pending' THEN 1 END) as pending_bets
      FROM events e
      JOIN sports sp ON e.sport_id=sp.id
      LEFT JOIN countries co ON e.country_id=co.id
      LEFT JOIN courses cu ON e.course_id=cu.id
      LEFT JOIN bets b ON b.event_id=e.id
      ${where}
      GROUP BY e.event_date, e.course_id
      ORDER BY e.event_date DESC
    `).all(...params);

    for (const m of meetings) {
      m.house_profit = parseFloat((m.total_staked - m.total_paid).toFixed(2));
      m.margin_pct   = m.total_staked > 0 ? parseFloat((m.house_profit / m.total_staked * 100).toFixed(2)) : 0;
    }
    res.json(meetings);
  } catch(err) { console.error('By-meeting error:', err.message); res.status(500).json({ error: err.message }); }
});

// ── EVENT BETS ───────────────────────────────────────────────────
router.get('/event/:id/bets', authenticate, (req, res) => {
  try {
    const db = getDb();
    const event = db.prepare(`
      SELECT e.*, sp.name as sport_name, sp.icon as sport_icon,
        COALESCE(co.flag,'🏆') as flag, COALESCE(cu.name,'') as course_name
      FROM events e JOIN sports sp ON e.sport_id=sp.id
      LEFT JOIN countries co ON e.country_id=co.id LEFT JOIN courses cu ON e.course_id=cu.id
      WHERE e.id=?
    `).get(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const bets = db.prepare(`
      SELECT b.*, w.name as wallet_name, w.phone as wallet_phone,
        COALESCE(w.wallet_type,'cash') as wallet_type,
        s.name as selection_name
      FROM bets b JOIN wallets w ON b.wallet_id=w.id JOIN selections s ON b.selection_id=s.id
      WHERE b.event_id=? ORDER BY b.created_at DESC
    `).all(req.params.id);

    const summary = {
      total_bets:      bets.length,
      total_staked:    bets.reduce((s,b)=>s+b.stake,0),
      cash_staked:     bets.filter(b=>b.wallet_type==='cash').reduce((s,b)=>s+b.stake,0),
      credit_staked:   bets.filter(b=>b.wallet_type==='credit').reduce((s,b)=>s+b.stake,0),
      total_paid:      bets.filter(b=>b.status==='won').reduce((s,b)=>s+b.actual_return,0),
      pending_bets:    bets.filter(b=>b.status==='pending').length,
      won_bets:        bets.filter(b=>b.status==='won').length,
      lost_bets:       bets.filter(b=>b.status==='lost').length,
      total_liability: bets.filter(b=>b.status==='pending').reduce((s,b)=>s+b.potential_return,0),
    };
    summary.house_profit = parseFloat((summary.total_staked - summary.total_paid).toFixed(2));

    const bySelection = db.prepare(`
      SELECT s.name, s.barrier_number,
        COALESCE(s.win_odds,s.odds,2) as win_odds, s.place_odds,
        s.status as sel_status, s.is_winner,
        COUNT(b.id) as bet_count,
        COALESCE(SUM(b.stake),0) as staked,
        COALESCE(SUM(CASE WHEN b.status='won' THEN b.actual_return ELSE 0 END),0) as paid,
        COALESCE(SUM(CASE WHEN b.status='pending' THEN b.potential_return ELSE 0 END),0) as liability
      FROM selections s
      LEFT JOIN bets b ON b.selection_id=s.id AND b.event_id=?
      WHERE s.event_id=?
      GROUP BY s.id ORDER BY s.barrier_number ASC, s.name ASC
    `).all(req.params.id, req.params.id);

    res.json({ event, summary, bets, by_selection: bySelection });
  } catch(err) { console.error('Event bets error:', err.message); res.status(500).json({ error: err.message }); }
});

module.exports = router;

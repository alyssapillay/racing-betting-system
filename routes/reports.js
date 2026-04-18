const express = require('express');
const { getDb } = require('../database/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// ── SUMMARY STATS ───────────────────────────────────────────────
router.get('/summary', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { sport_id, date_from, date_to } = req.query;
    const dateFilter = buildDateFilter(date_from, date_to, 'e.event_date');

    const stats = {
      total_staked:    db.prepare(`SELECT COALESCE(SUM(b.stake),0) as v FROM bets b JOIN events e ON b.event_id=e.id ${buildWhere([dateFilter, sport_id ? 'e.sport_id=?' : ''])}`).get(...buildParams([dateFilter, sport_id])).v,
      total_paid:      db.prepare(`SELECT COALESCE(SUM(b.actual_return),0) as v FROM bets b JOIN events e ON b.event_id=e.id WHERE b.status='won' ${dateFilter ? 'AND '+dateFilter : ''} ${sport_id ? 'AND e.sport_id=?' : ''}`).get(...buildParams([dateFilter, sport_id])).v,
      total_bets:      db.prepare(`SELECT COUNT(*) as v FROM bets b JOIN events e ON b.event_id=e.id ${buildWhere([dateFilter, sport_id ? 'e.sport_id=?' : ''])}`).get(...buildParams([dateFilter, sport_id])).v,
      pending_bets:    db.prepare(`SELECT COUNT(*) as v FROM bets b JOIN events e ON b.event_id=e.id WHERE b.status='pending' ${dateFilter ? 'AND '+dateFilter : ''} ${sport_id ? 'AND e.sport_id=?' : ''}`).get(...buildParams([dateFilter, sport_id])).v,
      total_liability: db.prepare(`SELECT COALESCE(SUM(b.potential_return),0) as v FROM bets b JOIN events e ON b.event_id=e.id WHERE b.status='pending' ${dateFilter ? 'AND '+dateFilter : ''} ${sport_id ? 'AND e.sport_id=?' : ''}`).get(...buildParams([dateFilter, sport_id])).v,
      won_bets:        db.prepare(`SELECT COUNT(*) as v FROM bets b JOIN events e ON b.event_id=e.id WHERE b.status='won' ${dateFilter ? 'AND '+dateFilter : ''} ${sport_id ? 'AND e.sport_id=?' : ''}`).get(...buildParams([dateFilter, sport_id])).v,
      lost_bets:       db.prepare(`SELECT COUNT(*) as v FROM bets b JOIN events e ON b.event_id=e.id WHERE b.status='lost' ${dateFilter ? 'AND '+dateFilter : ''} ${sport_id ? 'AND e.sport_id=?' : ''}`).get(...buildParams([dateFilter, sport_id])).v,
    };
    stats.house_profit = parseFloat((stats.total_staked - stats.total_paid).toFixed(2));
    stats.margin_pct   = stats.total_staked > 0 ? parseFloat((stats.house_profit / stats.total_staked * 100).toFixed(2)) : 0;

    // By sport
    stats.by_sport = db.prepare(`
      SELECT sp.name, sp.icon, sp.id as sport_id,
        COUNT(b.id) as bet_count,
        COALESCE(SUM(b.stake),0) as staked,
        COALESCE(SUM(CASE WHEN b.status='won' THEN b.actual_return ELSE 0 END),0) as paid,
        COALESCE(SUM(CASE WHEN b.status='pending' THEN b.potential_return ELSE 0 END),0) as liability
      FROM sports sp
      LEFT JOIN events e ON e.sport_id=sp.id
      LEFT JOIN bets b ON b.event_id=e.id
        ${dateFilter ? 'AND '+dateFilter.replace('e.event_date','e.event_date') : ''}
      WHERE sp.is_active=1
      GROUP BY sp.id ORDER BY staked DESC
    `).all(...(dateFilter ? buildDateParams(date_from, date_to) : []));

    res.json(stats);
  } catch(err) { console.error('Summary error:', err.message); res.status(500).json({ error: err.message }); }
});

// ── PER RACE / EVENT ────────────────────────────────────────────
router.get('/by-event', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { sport_id, date_from, date_to, status } = req.query;
    const conditions = [];
    const params = [];

    if (sport_id)  { conditions.push('e.sport_id=?');    params.push(sport_id); }
    if (status)    { conditions.push('e.status=?');       params.push(status); }
    if (date_from) { conditions.push('e.event_date>=?');  params.push(date_from); }
    if (date_to)   { conditions.push('e.event_date<=?');  params.push(date_to); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const events = db.prepare(`
      SELECT e.id, e.event_name, e.event_date, e.event_time, e.status,
        sp.name as sport_name, sp.icon as sport_icon,
        COALESCE(co.name,'') as country_name, COALESCE(co.flag,'🏆') as flag,
        COALESCE(cu.name,'') as course_name,
        COUNT(DISTINCT b.id)          as total_bets,
        COUNT(DISTINCT b.wallet_id)   as unique_bettors,
        COALESCE(SUM(b.stake),0)      as total_staked,
        COALESCE(SUM(CASE WHEN b.status='won'  THEN b.actual_return ELSE 0 END),0) as total_paid,
        COALESCE(SUM(CASE WHEN b.status='pending' THEN b.potential_return ELSE 0 END),0) as total_liability,
        COUNT(CASE WHEN b.status='won'  THEN 1 END) as won_bets,
        COUNT(CASE WHEN b.status='lost' THEN 1 END) as lost_bets,
        COUNT(CASE WHEN b.status='pending' THEN 1 END) as pending_bets
      FROM events e
      JOIN sports sp ON e.sport_id=sp.id
      LEFT JOIN countries co ON e.country_id=co.id
      LEFT JOIN courses cu ON e.course_id=cu.id
      LEFT JOIN bets b ON b.event_id=e.id
      ${where}
      GROUP BY e.id
      ORDER BY e.event_date DESC, e.event_time DESC
    `).all(...params);

    // Add house profit
    for (const ev of events) {
      ev.house_profit = parseFloat((ev.total_staked - ev.total_paid).toFixed(2));
      ev.margin_pct   = ev.total_staked > 0 ? parseFloat((ev.house_profit / ev.total_staked * 100).toFixed(2)) : 0;
    }

    res.json(events);
  } catch(err) { console.error('By-event error:', err.message); res.status(500).json({ error: err.message }); }
});

// ── PER WALLET (user) ───────────────────────────────────────────
router.get('/by-wallet', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { date_from, date_to, sport_id } = req.query;
    const conditions = [];
    const params = [];

    if (sport_id)  { conditions.push('e.sport_id=?');   params.push(sport_id); }
    if (date_from) { conditions.push('e.event_date>=?'); params.push(date_from); }
    if (date_to)   { conditions.push('e.event_date<=?'); params.push(date_to); }

    const having   = '';
    const joinWhere = conditions.length ? 'AND ' + conditions.join(' AND ') : '';

    const wallets = db.prepare(`
      SELECT w.id, w.name, w.phone, w.balance,
        COUNT(DISTINCT b.id)        as total_bets,
        COUNT(DISTINCT b.event_id)  as events_bet,
        COALESCE(SUM(b.stake),0)    as total_staked,
        COALESCE(SUM(CASE WHEN b.status='won'  THEN b.actual_return ELSE 0 END),0) as total_won,
        COALESCE(SUM(CASE WHEN b.status='pending' THEN b.potential_return ELSE 0 END),0) as total_liability,
        COUNT(CASE WHEN b.status='won'     THEN 1 END) as won_bets,
        COUNT(CASE WHEN b.status='lost'    THEN 1 END) as lost_bets,
        COUNT(CASE WHEN b.status='pending' THEN 1 END) as pending_bets,
        COUNT(CASE WHEN b.status='refunded' THEN 1 END) as refunded_bets
      FROM wallets w
      LEFT JOIN bets b ON b.wallet_id=w.id
      LEFT JOIN events e ON b.event_id=e.id ${joinWhere}
      GROUP BY w.id
      ORDER BY total_staked DESC
    `).all(...params);

    for (const w of wallets) {
      w.net_pl      = parseFloat((w.total_won - w.total_staked).toFixed(2));
      w.win_rate    = w.total_bets > 0 ? parseFloat((w.won_bets / (w.won_bets + w.lost_bets || 1) * 100).toFixed(1)) : 0;
    }

    res.json(wallets);
  } catch(err) { console.error('By-wallet error:', err.message); res.status(500).json({ error: err.message }); }
});

// ── PER RACE MEETING (grouped by course + date) ─────────────────
router.get('/by-meeting', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { sport_id, date_from, date_to } = req.query;
    const conditions = ["sp.id = 'sport_hr'"]; // Meetings are horse racing
    const params = [];

    if (date_from) { conditions.push('e.event_date>=?'); params.push(date_from); }
    if (date_to)   { conditions.push('e.event_date<=?'); params.push(date_to); }

    const where = 'WHERE ' + conditions.join(' AND ');

    const meetings = db.prepare(`
      SELECT
        e.event_date,
        COALESCE(cu.name, e.event_name) as venue,
        COALESCE(co.name,'') as country_name,
        COALESCE(co.flag,'🏇') as flag,
        COUNT(DISTINCT e.id)            as race_count,
        COUNT(DISTINCT b.id)            as total_bets,
        COUNT(DISTINCT b.wallet_id)     as unique_bettors,
        COALESCE(SUM(b.stake),0)        as total_staked,
        COALESCE(SUM(CASE WHEN b.status='won' THEN b.actual_return ELSE 0 END),0) as total_paid,
        COALESCE(SUM(CASE WHEN b.status='pending' THEN b.potential_return ELSE 0 END),0) as total_liability,
        COUNT(CASE WHEN b.status='pending' THEN 1 END) as pending_bets
      FROM events e
      JOIN sports sp ON e.sport_id=sp.id
      LEFT JOIN countries co ON e.country_id=co.id
      LEFT JOIN courses cu ON e.course_id=cu.id
      LEFT JOIN bets b ON b.event_id=e.id
      ${where}
      GROUP BY e.event_date, cu.id
      ORDER BY e.event_date DESC
    `).all(...params);

    for (const m of meetings) {
      m.house_profit = parseFloat((m.total_staked - m.total_paid).toFixed(2));
      m.margin_pct   = m.total_staked > 0 ? parseFloat((m.house_profit / m.total_staked * 100).toFixed(2)) : 0;
    }

    res.json(meetings);
  } catch(err) { console.error('By-meeting error:', err.message); res.status(500).json({ error: err.message }); }
});

// ── BETS ON A SPECIFIC EVENT ─────────────────────────────────────
router.get('/event/:id/bets', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { wallet_id } = req.query;

    const event = db.prepare(`
      SELECT e.*, sp.name as sport_name, sp.icon as sport_icon,
        COALESCE(co.flag,'🏆') as flag, COALESCE(cu.name,'') as course_name
      FROM events e JOIN sports sp ON e.sport_id=sp.id
      LEFT JOIN countries co ON e.country_id=co.id
      LEFT JOIN courses cu ON e.course_id=cu.id
      WHERE e.id=?
    `).get(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    let q = `
      SELECT b.*, w.name as wallet_name, w.phone as wallet_phone,
        s.name as selection_name, s.odds as current_odds
      FROM bets b
      JOIN wallets w ON b.wallet_id=w.id
      JOIN selections s ON b.selection_id=s.id
      WHERE b.event_id=?
    `;
    const params = [req.params.id];
    if (wallet_id) { q += ' AND b.wallet_id=?'; params.push(wallet_id); }
    q += ' ORDER BY b.created_at DESC';

    const bets = db.prepare(q).all(...params);

    const summary = {
      total_bets:    bets.length,
      total_staked:  bets.reduce((s,b) => s + b.stake, 0),
      total_paid:    bets.filter(b=>b.status==='won').reduce((s,b) => s + b.actual_return, 0),
      pending_bets:  bets.filter(b=>b.status==='pending').length,
      won_bets:      bets.filter(b=>b.status==='won').length,
      lost_bets:     bets.filter(b=>b.status==='lost').length,
      total_liability: bets.filter(b=>b.status==='pending').reduce((s,b) => s + b.potential_return, 0),
    };
    summary.house_profit = parseFloat((summary.total_staked - summary.total_paid).toFixed(2));

    // Per-selection breakdown
    const bySelection = db.prepare(`
      SELECT s.name, s.barrier_number,
        COUNT(b.id) as bet_count,
        COALESCE(SUM(b.stake),0) as staked,
        COALESCE(SUM(CASE WHEN b.status='won' THEN b.actual_return ELSE 0 END),0) as paid,
        COALESCE(SUM(CASE WHEN b.status='pending' THEN b.potential_return ELSE 0 END),0) as liability,
        s.odds, s.status as sel_status, s.is_winner
      FROM selections s
      LEFT JOIN bets b ON b.selection_id=s.id AND b.event_id=?
      WHERE s.event_id=?
      GROUP BY s.id ORDER BY s.barrier_number ASC, s.name ASC
    `).all(req.params.id, req.params.id);

    res.json({ event, summary, bets, by_selection: bySelection });
  } catch(err) { console.error('Event bets error:', err.message); res.status(500).json({ error: err.message }); }
});

// ── HELPERS ─────────────────────────────────────────────────────
function buildDateFilter(from, to, col='e.event_date') {
  if (from && to) return `${col} BETWEEN '${from}' AND '${to}'`;
  if (from)       return `${col} >= '${from}'`;
  if (to)         return `${col} <= '${to}'`;
  return '';
}
function buildWhere(parts) {
  const active = parts.filter(Boolean);
  return active.length ? 'WHERE ' + active.join(' AND ') : '';
}
function buildParams(parts) {
  return parts.filter(Boolean).map(p => typeof p === 'string' && p.includes('?') ? null : p).filter(v=>v!==null);
}
function buildDateParams(from, to) {
  const p = [];
  if (from) p.push(from);
  if (to)   p.push(to);
  return p;
}

module.exports = router;

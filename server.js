require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { initDb, getDb } = require('./database/db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Startup validation ─────────────────────────────────────────
console.log('=== Special Bet Starting ===');
console.log('Node version:', process.version);
console.log('PORT:', PORT);
console.log('JWT_SECRET set:', !!process.env.JWT_SECRET);
console.log('ADMIN_EMAIL:', process.env.ADMIN_EMAIL || 'admin@racingbet.com (default)');
console.log('DB_PATH:', process.env.DB_PATH || '(default)');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Init DB ────────────────────────────────────────────────────
try {
  initDb();
  console.log('✅ Database initialized');
} catch(err) {
  console.error('❌ Database init failed:', err.message);
  process.exit(1);
}

// ── Seed demo data ─────────────────────────────────────────────
try {
  require('./database/seed');
} catch(e) {
  console.log('Seed note:', e.message);
}

// ── Routes ─────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/operators',  require('./routes/operators'));
app.use('/api/wallets',    require('./routes/wallets'));
app.use('/api/events',     require('./routes/events'));
app.use('/api/betslips',   require('./routes/betslips'));
app.use('/api/countries',  require('./routes/countries'));
app.use('/api/reports',    require('./routes/reports'));

// ── Health check ───────────────────────────────────────────────

// ── Reset demo data (Super Admin only) ──────────────────────────
app.post('/api/reset-demo', require('./middleware/auth').authenticate, (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Super Admin only' });
    const db = getDb();
    // Wipe all data except operators
    db.exec(`
      DELETE FROM bets;
      DELETE FROM betslip_legs;
      DELETE FROM betslips;
      DELETE FROM transactions;
      DELETE FROM selection_price_history;
      DELETE FROM selections;
      DELETE FROM events;
      DELETE FROM courses;
      DELETE FROM countries;
      DELETE FROM wallets;
    `);
    // Re-seed
    const { runSeed } = require('./database/seed');
    runSeed();
    res.json({ message: 'Demo data reset successfully' });
  } catch(err) {
    console.error('Reset error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  try {
    const db = getDb();
    const ops    = db.prepare('SELECT COUNT(*) as c FROM operators').get().c;
    const wal    = db.prepare('SELECT COUNT(*) as c FROM wallets').get().c;
    const events = db.prepare('SELECT COUNT(*) as c FROM events').get().c;
    const bets   = db.prepare('SELECT COUNT(*) as c FROM bets').get().c;
    res.json({ status: 'ok', operators: ops, wallets: wal, events, bets });
  } catch(err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ── Test login endpoint (no auth needed, for debugging) ────────
app.get('/api/test', (req, res) => {
  try {
    const db  = getDb();
    const ops = db.prepare('SELECT id, username, email, role FROM operators').all();
    res.json({
      message:    'Special Bet API is running',
      jwt_set:    !!process.env.JWT_SECRET,
      node:       process.version,
      operators:  ops.map(o => ({ username: o.username, email: o.email, role: o.role }))
    });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Dashboard stats ─────────────────────────────────────────────
app.get('/api/dashboard/stats', require('./middleware/auth').authenticate, (req, res) => {
  try {
    const db = getDb();
    const stats = {
      total_wallets:    db.prepare("SELECT COUNT(*) as c FROM wallets WHERE is_active=1").get().c,
      open_events:      db.prepare("SELECT COUNT(*) as c FROM events WHERE status='open'").get().c,
      total_bets:       db.prepare("SELECT COUNT(*) as c FROM bets").get().c,
      pending_bets:     db.prepare("SELECT COUNT(*) as c FROM bets WHERE status='pending'").get().c,
      total_staked:     db.prepare("SELECT COALESCE(SUM(stake),0) as s FROM bets").get().s,
      total_paid:       db.prepare("SELECT COALESCE(SUM(actual_return),0) as s FROM bets WHERE status='won'").get().s,
      total_liability:  db.prepare("SELECT COALESCE(SUM(potential_return),0) as s FROM bets WHERE status='pending'").get().s,
    };
    stats.house_profit = stats.total_staked - stats.total_paid;

    stats.sports_breakdown = db.prepare(`
      SELECT sp.name, sp.icon, COUNT(b.id) as bet_count,
        COALESCE(SUM(b.stake),0) as staked,
        COALESCE(SUM(CASE WHEN b.status='won' THEN b.actual_return ELSE 0 END),0) as paid
      FROM sports sp
      LEFT JOIN events e ON e.sport_id=sp.id
      LEFT JOIN bets b ON b.event_id=e.id
      WHERE sp.is_active=1 GROUP BY sp.id ORDER BY staked DESC
    `).all();

    stats.recent_bets = db.prepare(`
      SELECT b.*, w.name as wallet_name, s.name as selection_name,
        e.event_name, sp.name as sport_name, sp.icon as sport_icon
      FROM bets b
      JOIN wallets w ON b.wallet_id=w.id
      JOIN selections s ON b.selection_id=s.id
      JOIN events e ON b.event_id=e.id
      JOIN sports sp ON e.sport_id=sp.id
      ORDER BY b.created_at DESC LIMIT 15
    `).all();

    res.json(stats);
  } catch(err) {
    console.error('Dashboard error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── SPA fallback ────────────────────────────────────────────────
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ error: 'Server error: ' + err.message });
});

app.listen(PORT, () => {
  console.log(`\n✅ Special Bet running on http://localhost:${PORT}`);
  console.log(`   Admin: ${process.env.ADMIN_EMAIL || 'admin@racingbet.com'} / ${process.env.ADMIN_PASSWORD || 'Admin@123456'}`);
  console.log(`   Test:  http://localhost:${PORT}/api/test\n`);
});

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb, getDb, runTransaction } = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Init DB then auto-seed demo data if empty ──────────────────
initDb();
try { require('./database/seed'); } catch(e) { console.log('Seed skipped:', e.message); }

app.use('/api/auth',      require('./routes/auth'));
app.use('/api/users',     require('./routes/users'));
app.use('/api/races',     require('./routes/races'));
app.use('/api/betslips',  require('./routes/betslips'));
app.use('/api/countries', require('./routes/countries'));

// ── Dashboard stats ────────────────────────────────────────────
app.get('/api/dashboard/stats', require('./middleware/auth').authenticate, (req, res) => {
  try {
    const db = getDb();
    const stats = {};
    if (req.user.role === 'admin') {
      stats.total_users     = db.prepare("SELECT COUNT(*) as c FROM users WHERE role!='admin'").get().c;
      stats.active_meetings = db.prepare("SELECT COUNT(*) as c FROM race_meetings WHERE status='upcoming' OR status='active'").get().c;
      stats.total_races     = db.prepare("SELECT COUNT(*) as c FROM races").get().c;
      stats.open_races      = db.prepare("SELECT COUNT(*) as c FROM races WHERE status='open'").get().c;
      stats.total_bets      = db.prepare("SELECT COUNT(*) as c FROM bets").get().c;
      stats.pending_bets    = db.prepare("SELECT COUNT(*) as c FROM bets WHERE status='pending'").get().c;
      stats.total_staked    = db.prepare("SELECT COALESCE(SUM(stake),0) as s FROM bets").get().s;
      stats.total_paid      = db.prepare("SELECT COALESCE(SUM(actual_return),0) as s FROM bets WHERE status='won'").get().s;
      stats.house_profit    = stats.total_staked - stats.total_paid;
      stats.recent_bets     = db.prepare(`
        SELECT b.*, u.username, h.horse_name, r.race_name,
          COALESCE(co.name,'') as course_name, COALESCE(c.flag,'🏁') as flag
        FROM bets b
        JOIN users u ON b.user_id=u.id
        JOIN horses h ON b.horse_id=h.id
        JOIN races r ON b.race_id=r.id
        JOIN race_meetings rm ON r.meeting_id=rm.id
        JOIN courses co ON rm.course_id=co.id
        JOIN countries c ON co.country_id=c.id
        ORDER BY b.created_at DESC LIMIT 10
      `).all();
    } else {
      const uid = req.user.id;
      stats.wallet_balance = db.prepare('SELECT wallet_balance FROM users WHERE id=?').get(uid).wallet_balance;
      stats.my_bets        = db.prepare("SELECT COUNT(*) as c FROM bets WHERE user_id=?").get(uid).c;
      stats.pending_bets   = db.prepare("SELECT COUNT(*) as c FROM bets WHERE user_id=? AND status='pending'").get(uid).c;
      stats.total_won      = db.prepare("SELECT COALESCE(SUM(actual_return),0) as s FROM bets WHERE user_id=? AND status='won'").get(uid).s;
      stats.total_staked   = db.prepare("SELECT COALESCE(SUM(stake),0) as s FROM bets WHERE user_id=?").get(uid).s;
      stats.recent_bets    = db.prepare(`
        SELECT b.*, h.horse_name, r.race_name,
          COALESCE(co.name,'') as course_name, COALESCE(c.name,'') as country_name,
          COALESCE(c.flag,'🏁') as flag
        FROM bets b
        JOIN horses h ON b.horse_id=h.id
        JOIN races r ON b.race_id=r.id
        JOIN race_meetings rm ON r.meeting_id=rm.id
        JOIN courses co ON rm.course_id=co.id
        JOIN countries c ON co.country_id=c.id
        WHERE b.user_id=?
        ORDER BY b.created_at DESC LIMIT 10
      `).all(uid);
    }
    res.json(stats);
  } catch(err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ───────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  try {
    const db = getDb();
    const users    = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const races    = db.prepare('SELECT COUNT(*) as c FROM races').get().c;
    const horses   = db.prepare('SELECT COUNT(*) as c FROM horses').get().c;
    res.json({ status: 'ok', users, races, horses });
  } catch(err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, req, res, next) => { console.error(err.stack); res.status(500).json({ error: 'Server error' }); });

app.listen(PORT, () => {
  console.log(`\n🏇 RaceVault running on http://localhost:${PORT}`);
  console.log(`   Admin: ${process.env.ADMIN_EMAIL || 'admin@racingbet.com'}`);
  console.log(`   Demo users password: Demo@1234\n`);
});

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { initDb, getDb } = require('./database/db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

initDb();
try { require('./database/seed'); } catch(e) { console.log('Seed:', e.message); }

app.use('/api/auth',       require('./routes/auth'));
app.use('/api/operators',  require('./routes/operators'));
app.use('/api/wallets',    require('./routes/wallets'));
app.use('/api/events',     require('./routes/events'));
app.use('/api/betslips',   require('./routes/betslips'));
app.use('/api/countries',  require('./routes/countries'));

// Dashboard stats
app.get('/api/dashboard/stats', require('./middleware/auth').authenticate, (req, res) => {
  try {
    const db = getDb();
    const stats = {
      total_wallets:  db.prepare("SELECT COUNT(*) as c FROM wallets WHERE is_active=1").get().c,
      open_events:    db.prepare("SELECT COUNT(*) as c FROM events WHERE status='open'").get().c,
      total_bets:     db.prepare("SELECT COUNT(*) as c FROM bets").get().c,
      pending_bets:   db.prepare("SELECT COUNT(*) as c FROM bets WHERE status='pending'").get().c,
      total_staked:   db.prepare("SELECT COALESCE(SUM(stake),0) as s FROM bets").get().s,
      total_paid:     db.prepare("SELECT COALESCE(SUM(actual_return),0) as s FROM bets WHERE status='won'").get().s,
    };
    stats.house_profit = stats.total_staked - stats.total_paid;
    stats.total_liability = db.prepare("SELECT COALESCE(SUM(potential_return),0) as s FROM bets WHERE status='pending'").get().s;

    // Per-sport breakdown
    stats.sports_breakdown = db.prepare(`
      SELECT sp.name, sp.icon, COUNT(b.id) as bet_count,
        COALESCE(SUM(b.stake),0) as staked,
        COALESCE(SUM(CASE WHEN b.status='won' THEN b.actual_return ELSE 0 END),0) as paid
      FROM sports sp
      LEFT JOIN events e ON e.sport_id=sp.id
      LEFT JOIN bets b ON b.event_id=e.id
      WHERE sp.is_active=1
      GROUP BY sp.id ORDER BY staked DESC
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
  } catch(err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.get('/api/health', (req, res) => {
  try {
    const db = getDb();
    res.json({
      status: 'ok',
      wallets:  db.prepare('SELECT COUNT(*) as c FROM wallets').get().c,
      events:   db.prepare('SELECT COUNT(*) as c FROM events').get().c,
      bets:     db.prepare('SELECT COUNT(*) as c FROM bets').get().c,
    });
  } catch(err) { res.status(500).json({ status: 'error', error: err.message }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, req, res, next) => { console.error(err.stack); res.status(500).json({ error: 'Server error' }); });

app.listen(PORT, () => console.log(`\n🏇 RaceVault on http://localhost:${PORT}\n   Admin: ${process.env.ADMIN_EMAIL || 'admin@racingbet.com'}`));

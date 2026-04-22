const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path   = require('path');
const fs     = require('fs');
require('dotenv').config();

function resolveDbPath() {
  const raw = process.env.DB_PATH;
  if (!raw)            return path.join(__dirname, 'racing.db');
  if (raw === '/data') return path.join('/data', 'racing.db');
  if (path.isAbsolute(raw)) {
    const dir = path.dirname(raw);
    try { if (!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true}); } catch(e) { return path.join(__dirname,'racing.db'); }
    return raw;
  }
  return path.join(__dirname, '..', raw);
}

const DB_PATH = resolveDbPath();
try { const d=path.dirname(DB_PATH); if(!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); } catch(e){}
console.log('Database:', DB_PATH);

let db;
function getDb() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
  }
  return db;
}

function runTransaction(fn) {
  const database = getDb();
  database.exec('BEGIN');
  try { const r = fn(database); database.exec('COMMIT'); return r; }
  catch(err) { database.exec('ROLLBACK'); throw err; }
}

function initDb() {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS operators (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'bookmaker',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      cash_balance REAL NOT NULL DEFAULT 0.00,
      credit_limit REAL NOT NULL DEFAULT 0.00,
      credit_used  REAL NOT NULL DEFAULT 0.00,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS countries (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      code TEXT UNIQUE NOT NULL,
      flag TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      country_id TEXT NOT NULL,
      name TEXT NOT NULL,
      location TEXT,
      surface TEXT DEFAULT 'Turf',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sports (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      icon TEXT NOT NULL DEFAULT '🏆',
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      sport_id TEXT NOT NULL,
      country_id TEXT,
      course_id TEXT,
      meeting_key TEXT,
      race_number INTEGER DEFAULT 1,
      event_name TEXT NOT NULL,
      race_description TEXT,
      distance TEXT,
      race_class TEXT,
      prize_money TEXT,
      event_date TEXT NOT NULL,
      event_time TEXT NOT NULL,
      venue TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      closes_at TEXT,
      result_selection_id TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (sport_id) REFERENCES sports(id),
      FOREIGN KEY (country_id) REFERENCES countries(id),
      FOREIGN KEY (course_id) REFERENCES courses(id)
    );

    CREATE TABLE IF NOT EXISTS selections (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sub_info TEXT,
      barrier_number INTEGER,
      jockey TEXT,
      trainer TEXT,
      weight TEXT,
      age INTEGER,
      form TEXT,
      colour TEXT,
      win_odds  REAL NOT NULL DEFAULT 2.00,
      place_odds REAL,
      opening_win_odds REAL NOT NULL DEFAULT 2.00,
      status TEXT NOT NULL DEFAULT 'active',
      scratch_deduction REAL DEFAULT 0.00,
      scratched_at TEXT,
      is_winner INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS selection_price_history (
      id TEXT PRIMARY KEY,
      selection_id TEXT NOT NULL,
      price_type TEXT NOT NULL DEFAULT 'win',
      old_price REAL NOT NULL,
      new_price REAL NOT NULL,
      changed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (selection_id) REFERENCES selections(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS betslips (
      id TEXT PRIMARY KEY,
      wallet_id TEXT NOT NULL,
      operator_id TEXT NOT NULL,
      slip_type TEXT NOT NULL DEFAULT 'single',
      payment_type TEXT NOT NULL DEFAULT 'cash',
      status TEXT NOT NULL DEFAULT 'pending',
      total_stake REAL NOT NULL DEFAULT 0.00,
      potential_return REAL NOT NULL DEFAULT 0.00,
      actual_return REAL DEFAULT 0.00,
      cashout_value REAL DEFAULT 0.00,
      cashed_out_at TEXT,
      settled_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (wallet_id) REFERENCES wallets(id),
      FOREIGN KEY (operator_id) REFERENCES operators(id)
    );

    CREATE TABLE IF NOT EXISTS betslip_legs (
      id TEXT PRIMARY KEY,
      betslip_id TEXT NOT NULL,
      selection_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      bet_type TEXT NOT NULL DEFAULT 'win',
      odds_at_time REAL NOT NULL,
      result TEXT DEFAULT 'pending',
      FOREIGN KEY (betslip_id) REFERENCES betslips(id) ON DELETE CASCADE,
      FOREIGN KEY (selection_id) REFERENCES selections(id),
      FOREIGN KEY (event_id) REFERENCES events(id)
    );

    CREATE TABLE IF NOT EXISTS bets (
      id TEXT PRIMARY KEY,
      wallet_id TEXT NOT NULL,
      operator_id TEXT NOT NULL,
      betslip_id TEXT NOT NULL,
      selection_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      bet_type TEXT NOT NULL DEFAULT 'single',
      bet_on TEXT NOT NULL DEFAULT 'win',
      payment_type TEXT NOT NULL DEFAULT 'cash',
      stake REAL NOT NULL,
      odds_at_time REAL NOT NULL,
      potential_return REAL NOT NULL,
      actual_return REAL DEFAULT 0.00,
      cashout_value REAL DEFAULT 0.00,
      deduction_applied REAL DEFAULT 0.00,
      status TEXT NOT NULL DEFAULT 'pending',
      settled_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (wallet_id) REFERENCES wallets(id),
      FOREIGN KEY (operator_id) REFERENCES operators(id),
      FOREIGN KEY (betslip_id) REFERENCES betslips(id),
      FOREIGN KEY (selection_id) REFERENCES selections(id),
      FOREIGN KEY (event_id) REFERENCES events(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      wallet_id TEXT NOT NULL,
      operator_id TEXT,
      type TEXT NOT NULL,
      payment_type TEXT DEFAULT 'cash',
      amount REAL NOT NULL,
      balance_before REAL NOT NULL,
      balance_after REAL NOT NULL,
      description TEXT,
      reference_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (wallet_id) REFERENCES wallets(id)
    );

    CREATE INDEX IF NOT EXISTS idx_bets_wallet       ON bets(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_bets_event        ON bets(event_id);
    CREATE INDEX IF NOT EXISTS idx_bets_selection    ON bets(selection_id);
    CREATE INDEX IF NOT EXISTS idx_bets_status       ON bets(status);
    CREATE INDEX IF NOT EXISTS idx_selections_event  ON selections(event_id);
    CREATE INDEX IF NOT EXISTS idx_events_sport      ON events(sport_id);
    CREATE INDEX IF NOT EXISTS idx_events_meeting    ON events(meeting_key);
    CREATE INDEX IF NOT EXISTS idx_price_hist_sel    ON selection_price_history(selection_id);
  `);

  const sports = [
    {id:'sport_hr',name:'Horse Racing',icon:'🏇'},
    {id:'sport_fb',name:'Football',    icon:'⚽'},
    {id:'sport_cr',name:'Cricket',     icon:'🏏'},
    {id:'sport_rb',name:'Rugby',       icon:'🏉'},
    {id:'sport_tn',name:'Tennis',      icon:'🎾'},
    {id:'sport_bx',name:'Boxing',      icon:'🥊'},
  ];
  for (const s of sports) database.prepare('INSERT OR IGNORE INTO sports (id,name,icon) VALUES (?,?,?)').run(s.id,s.name,s.icon);

  const adminEmail    = process.env.ADMIN_EMAIL    || 'admin@racingbet.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';
  const adminName     = process.env.ADMIN_NAME     || 'superadmin';
  if (!database.prepare('SELECT id FROM operators WHERE email=?').get(adminEmail)) {
    const {v4:uuidv4} = require('uuid');
    database.prepare('INSERT INTO operators (id,username,email,password_hash,role) VALUES (?,?,?,?,?)').run(uuidv4(),adminName,adminEmail,bcrypt.hashSync(adminPassword,12),'super_admin');
    console.log('Admin seeded:', adminEmail);
  }

  // ── Auto-migrations for existing DBs ────────────────────────────
  const migs = [
    "ALTER TABLE wallets ADD COLUMN cash_balance REAL NOT NULL DEFAULT 0",
    "ALTER TABLE wallets ADD COLUMN credit_limit REAL NOT NULL DEFAULT 0",
    "ALTER TABLE wallets ADD COLUMN credit_used REAL NOT NULL DEFAULT 0",
    "ALTER TABLE transactions ADD COLUMN payment_type TEXT DEFAULT 'cash'",
    "ALTER TABLE bets ADD COLUMN payment_type TEXT DEFAULT 'cash'",
    "ALTER TABLE bets ADD COLUMN bet_on TEXT DEFAULT 'win'",
    "ALTER TABLE betslips ADD COLUMN payment_type TEXT DEFAULT 'cash'",
    "ALTER TABLE betslips ADD COLUMN cashout_value REAL DEFAULT 0",
    "ALTER TABLE betslips ADD COLUMN cashed_out_at TEXT",
    "ALTER TABLE betslip_legs ADD COLUMN bet_on TEXT DEFAULT 'win'",
    "ALTER TABLE betslip_legs ADD COLUMN bet_type TEXT DEFAULT 'win'",
    "ALTER TABLE events ADD COLUMN race_number INTEGER DEFAULT 1",
    "ALTER TABLE events ADD COLUMN meeting_key TEXT",
    "ALTER TABLE events ADD COLUMN distance TEXT",
    "ALTER TABLE events ADD COLUMN prize_money TEXT",
    "ALTER TABLE events ADD COLUMN meeting_name TEXT",
    "ALTER TABLE selections ADD COLUMN win_odds REAL",
    "ALTER TABLE selections ADD COLUMN place_odds REAL",
    "ALTER TABLE selections ADD COLUMN opening_win_odds REAL",
    "CREATE TABLE IF NOT EXISTS selection_price_history (id TEXT PRIMARY KEY, selection_id TEXT NOT NULL, price_type TEXT NOT NULL DEFAULT 'win', old_price REAL NOT NULL, new_price REAL NOT NULL, changed_at TEXT NOT NULL DEFAULT (datetime('now')))",
  ];
  for (const sql of migs) {
    try { database.exec(sql); } catch(e) { /* column already exists */ }
  }
  // Sync legacy data
  try { database.exec("UPDATE wallets SET cash_balance=COALESCE(balance,0) WHERE cash_balance IS NULL OR cash_balance=0 AND balance IS NOT NULL"); } catch(e) {}
  try { database.exec("UPDATE selections SET win_odds=COALESCE(odds,2) WHERE win_odds IS NULL"); } catch(e) {}
  try { database.exec("UPDATE selections SET opening_win_odds=win_odds WHERE opening_win_odds IS NULL"); } catch(e) {}

  console.log('Database ready');
  return database;
}

module.exports = { getDb, initDb, runTransaction };

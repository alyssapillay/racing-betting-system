const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

function resolveDbPath() {
  const raw = process.env.DB_PATH;
  if (!raw || raw === '/data') return path.join(__dirname, 'racing.db');
  if (path.isAbsolute(raw)) return raw;
  return path.join(__dirname, '..', raw);
}

const DB_PATH = resolveDbPath();
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
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
  try {
    const result = fn(database);
    database.exec('COMMIT');
    return result;
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }
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
      balance REAL NOT NULL DEFAULT 0.00,
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
      event_name TEXT NOT NULL,
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
      odds REAL NOT NULL DEFAULT 2.00,
      opening_odds REAL NOT NULL DEFAULT 2.00,
      status TEXT NOT NULL DEFAULT 'active',
      scratch_deduction REAL DEFAULT 0.00,
      scratched_at TEXT,
      is_winner INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS betslips (
      id TEXT PRIMARY KEY,
      wallet_id TEXT NOT NULL,
      operator_id TEXT NOT NULL,
      slip_type TEXT NOT NULL DEFAULT 'single',
      status TEXT NOT NULL DEFAULT 'pending',
      total_stake REAL NOT NULL DEFAULT 0.00,
      potential_return REAL NOT NULL DEFAULT 0.00,
      actual_return REAL DEFAULT 0.00,
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
      stake REAL NOT NULL,
      odds_at_time REAL NOT NULL,
      potential_return REAL NOT NULL,
      actual_return REAL DEFAULT 0.00,
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
      amount REAL NOT NULL,
      balance_before REAL NOT NULL,
      balance_after REAL NOT NULL,
      description TEXT,
      reference_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (wallet_id) REFERENCES wallets(id)
    );

    CREATE INDEX IF NOT EXISTS idx_bets_wallet     ON bets(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_bets_event      ON bets(event_id);
    CREATE INDEX IF NOT EXISTS idx_bets_selection  ON bets(selection_id);
    CREATE INDEX IF NOT EXISTS idx_bets_status     ON bets(status);
    CREATE INDEX IF NOT EXISTS idx_selections_event ON selections(event_id);
    CREATE INDEX IF NOT EXISTS idx_events_sport    ON events(sport_id);
    CREATE INDEX IF NOT EXISTS idx_events_status   ON events(status);
    CREATE INDEX IF NOT EXISTS idx_legs_betslip    ON betslip_legs(betslip_id);
  `);

  // Seed sports
  const sportsList = [
    { id: 'sport_hr',   name: 'Horse Racing', icon: '🏇' },
    { id: 'sport_fb',   name: 'Football',     icon: '⚽' },
    { id: 'sport_cr',   name: 'Cricket',      icon: '🏏' },
    { id: 'sport_rb',   name: 'Rugby',        icon: '🏉' },
    { id: 'sport_tn',   name: 'Tennis',       icon: '🎾' },
    { id: 'sport_bx',   name: 'Boxing',       icon: '🥊' },
  ];
  for (const s of sportsList) {
    database.prepare('INSERT OR IGNORE INTO sports (id,name,icon) VALUES (?,?,?)').run(s.id, s.name, s.icon);
  }

  // Seed super admin
  const adminEmail    = process.env.ADMIN_EMAIL    || 'admin@racingbet.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';
  const adminName     = process.env.ADMIN_NAME     || 'superadmin';
  const existing = database.prepare('SELECT id FROM operators WHERE email=?').get(adminEmail);
  if (!existing) {
    const { v4: uuidv4 } = require('uuid');
    const hash = bcrypt.hashSync(adminPassword, 12);
    database.prepare('INSERT INTO operators (id,username,email,password_hash,role) VALUES (?,?,?,?,?)').run(uuidv4(), adminName, adminEmail, hash, 'super_admin');
    console.log('Super admin seeded:', adminEmail);
  }

  console.log('Database ready');
  return database;
}

module.exports = { getDb, initDb, runTransaction };

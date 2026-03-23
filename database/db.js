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

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'punter',
      wallet_balance REAL NOT NULL DEFAULT 0.00,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS race_meetings (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      meeting_date TEXT NOT NULL,
      meeting_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'upcoming',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (course_id) REFERENCES courses(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS races (
      id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL,
      race_number INTEGER NOT NULL,
      race_name TEXT NOT NULL,
      distance TEXT,
      race_class TEXT,
      prize_money TEXT,
      closes_at TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      deduction_applied REAL NOT NULL DEFAULT 0.00,
      result_horse_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (meeting_id) REFERENCES race_meetings(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS horses (
      id TEXT PRIMARY KEY,
      race_id TEXT NOT NULL,
      horse_name TEXT NOT NULL,
      barrier_number INTEGER,
      jockey TEXT,
      trainer TEXT,
      weight TEXT,
      age INTEGER,
      form TEXT,
      colour TEXT,
      odds REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      scratch_deduction REAL DEFAULT 0.00,
      scratched_at TEXT,
      result_position INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (race_id) REFERENCES races(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS betslips (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      slip_type TEXT NOT NULL DEFAULT 'single',
      status TEXT NOT NULL DEFAULT 'pending',
      total_stake REAL NOT NULL DEFAULT 0.00,
      potential_return REAL NOT NULL DEFAULT 0.00,
      actual_return REAL DEFAULT 0.00,
      settled_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS betslip_selections (
      id TEXT PRIMARY KEY,
      betslip_id TEXT NOT NULL,
      horse_id TEXT NOT NULL,
      race_id TEXT NOT NULL,
      odds_at_time REAL NOT NULL,
      result TEXT DEFAULT 'pending',
      FOREIGN KEY (betslip_id) REFERENCES betslips(id) ON DELETE CASCADE,
      FOREIGN KEY (horse_id) REFERENCES horses(id),
      FOREIGN KEY (race_id) REFERENCES races(id)
    );

    CREATE TABLE IF NOT EXISTS bets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      betslip_id TEXT NOT NULL,
      horse_id TEXT NOT NULL,
      race_id TEXT NOT NULL,
      bet_type TEXT NOT NULL DEFAULT 'win',
      stake REAL NOT NULL,
      odds_at_time REAL NOT NULL,
      potential_return REAL NOT NULL,
      actual_return REAL DEFAULT 0.00,
      deduction_applied REAL DEFAULT 0.00,
      status TEXT NOT NULL DEFAULT 'pending',
      settled_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (betslip_id) REFERENCES betslips(id),
      FOREIGN KEY (horse_id) REFERENCES horses(id),
      FOREIGN KEY (race_id) REFERENCES races(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      balance_before REAL NOT NULL,
      balance_after REAL NOT NULL,
      description TEXT,
      reference_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_bets_user ON bets(user_id);
    CREATE INDEX IF NOT EXISTS idx_bets_race ON bets(race_id);
    CREATE INDEX IF NOT EXISTS idx_bets_horse ON bets(horse_id);
    CREATE INDEX IF NOT EXISTS idx_horses_race ON horses(race_id);
    CREATE INDEX IF NOT EXISTS idx_races_meeting ON races(meeting_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_courses_country ON courses(country_id);
    CREATE INDEX IF NOT EXISTS idx_meetings_course ON race_meetings(course_id);
  `);

  const adminEmail    = process.env.ADMIN_EMAIL    || 'admin@racingbet.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';
  const adminName     = process.env.ADMIN_NAME     || 'System Owner';

  const existing = database.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existing) {
    const { v4: uuidv4 } = require('uuid');
    const hash = bcrypt.hashSync(adminPassword, 12);
    database.prepare(`INSERT INTO users (id,username,email,password_hash,role,wallet_balance) VALUES (?,?,?,?,'admin',999999.00)`)
      .run(uuidv4(), adminName.replace(/\s+/g,'_').toLowerCase(), adminEmail, hash);
    console.log('Admin seeded:', adminEmail);
  }

  console.log('Database ready');
  return database;
}

module.exports = { getDb, initDb, runTransaction };

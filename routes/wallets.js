const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// GET all wallets
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const wallets = db.prepare('SELECT * FROM wallets ORDER BY name ASC').all();
  // Attach bet summary per wallet
  for (const w of wallets) {
    w.total_bets    = db.prepare("SELECT COUNT(*) as c FROM bets WHERE wallet_id=?").get(w.id).c;
    w.pending_bets  = db.prepare("SELECT COUNT(*) as c FROM bets WHERE wallet_id=? AND status='pending'").get(w.id).c;
    w.total_staked  = db.prepare("SELECT COALESCE(SUM(stake),0) as s FROM bets WHERE wallet_id=?").get(w.id).s;
    w.total_won     = db.prepare("SELECT COALESCE(SUM(actual_return),0) as s FROM bets WHERE wallet_id=? AND status='won'").get(w.id).s;
  }
  res.json(wallets);
});

// GET single wallet
router.get('/:id', authenticate, (req, res) => {
  const db = getDb();
  const w = db.prepare('SELECT * FROM wallets WHERE id=?').get(req.params.id);
  if (!w) return res.status(404).json({ error: 'Wallet not found' });
  res.json(w);
});

// POST create wallet
router.post('/', authenticate, (req, res) => {
  const { name, phone, balance = 0 } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const db = getDb();
  const id = uuidv4();
  db.prepare('INSERT INTO wallets (id,name,phone,balance) VALUES (?,?,?,?)').run(id, name.trim(), phone || null, parseFloat(balance));
  if (balance > 0) {
    db.prepare('INSERT INTO transactions (id,wallet_id,operator_id,type,amount,balance_before,balance_after,description) VALUES (?,?,?,?,?,0,?,?)')
      .run(uuidv4(), id, req.user.id, 'deposit', parseFloat(balance), parseFloat(balance), 'Initial deposit');
  }
  res.status(201).json(db.prepare('SELECT * FROM wallets WHERE id=?').get(id));
});

// PUT update wallet
router.put('/:id', authenticate, (req, res) => {
  const { name, phone, is_active } = req.body;
  const db = getDb();
  db.prepare('UPDATE wallets SET name=COALESCE(?,name), phone=COALESCE(?,phone), is_active=COALESCE(?,is_active), updated_at=datetime("now") WHERE id=?')
    .run(name, phone, is_active !== undefined ? (is_active ? 1 : 0) : null, req.params.id);
  res.json(db.prepare('SELECT * FROM wallets WHERE id=?').get(req.params.id));
});

// DELETE wallet
router.delete('/:id', authenticate, (req, res) => {
  const db = getDb();
  const pending = db.prepare("SELECT COUNT(*) as c FROM bets WHERE wallet_id=? AND status='pending'").get(req.params.id).c;
  if (pending > 0) return res.status(400).json({ error: `Cannot delete — ${pending} pending bets` });
  db.prepare('DELETE FROM wallets WHERE id=?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// POST deposit
router.post('/:id/deposit', authenticate, (req, res) => {
  const { amount, description = 'Deposit' } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required' });
  const db = getDb();
  const w = db.prepare('SELECT * FROM wallets WHERE id=?').get(req.params.id);
  if (!w) return res.status(404).json({ error: 'Wallet not found' });
  const newBal = w.balance + parseFloat(amount);
  db.prepare('UPDATE wallets SET balance=?, updated_at=datetime("now") WHERE id=?').run(newBal, w.id);
  db.prepare('INSERT INTO transactions (id,wallet_id,operator_id,type,amount,balance_before,balance_after,description) VALUES (?,?,?,?,?,?,?,?)')
    .run(uuidv4(), w.id, req.user.id, 'deposit', parseFloat(amount), w.balance, newBal, description);
  res.json({ new_balance: newBal });
});

// POST withdraw
router.post('/:id/withdraw', authenticate, (req, res) => {
  const { amount, description = 'Withdrawal' } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required' });
  const db = getDb();
  const w = db.prepare('SELECT * FROM wallets WHERE id=?').get(req.params.id);
  if (!w) return res.status(404).json({ error: 'Wallet not found' });
  if (w.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });
  const newBal = w.balance - parseFloat(amount);
  db.prepare('UPDATE wallets SET balance=?, updated_at=datetime("now") WHERE id=?').run(newBal, w.id);
  db.prepare('INSERT INTO transactions (id,wallet_id,operator_id,type,amount,balance_before,balance_after,description) VALUES (?,?,?,?,?,?,?,?)')
    .run(uuidv4(), w.id, req.user.id, 'withdrawal', parseFloat(amount), w.balance, newBal, description);
  res.json({ new_balance: newBal });
});

// GET wallet transactions
router.get('/:id/transactions', authenticate, (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM transactions WHERE wallet_id=? ORDER BY created_at DESC LIMIT 100').all(req.params.id));
});

// GET wallet bets
router.get('/:id/bets', authenticate, (req, res) => {
  const db = getDb();
  const bets = db.prepare(`
    SELECT b.*, s.name as selection_name, e.event_name, e.event_date,
      sp.name as sport_name, sp.icon as sport_icon
    FROM bets b
    JOIN selections s ON b.selection_id=s.id
    JOIN events e ON b.event_id=e.id
    JOIN sports sp ON e.sport_id=sp.id
    WHERE b.wallet_id=? ORDER BY b.created_at DESC LIMIT 50
  `).all(req.params.id);
  res.json(bets);
});

module.exports = router;

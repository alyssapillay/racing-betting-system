const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/users — Admin: all users; Punter: own profile
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  if (req.user.role === 'admin') {
    const users = db.prepare(`
      SELECT id, username, email, role, wallet_balance, is_active, created_at
      FROM users ORDER BY created_at DESC
    `).all();
    return res.json(users);
  }
  const user = db.prepare('SELECT id, username, email, role, wallet_balance, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json([user]);
});

// POST /api/users — Admin creates new user
router.post('/', authenticate, requireAdmin, (req, res) => {
  const { username, email, password, role = 'punter', wallet_balance = 0 } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'Username, email and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (!['punter', 'admin', 'clerk'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const db = getDb();
  const exists = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email.toLowerCase(), username);
  if (exists) return res.status(409).json({ error: 'Email or username already exists' });

  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 12);
  db.prepare(`
    INSERT INTO users (id, username, email, password_hash, role, wallet_balance)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, username, email.toLowerCase(), hash, role, wallet_balance);

  if (wallet_balance > 0) {
    db.prepare(`
      INSERT INTO transactions (id, user_id, type, amount, balance_before, balance_after, description)
      VALUES (?, ?, 'deposit', ?, 0, ?, 'Initial wallet allocation')
    `).run(uuidv4(), id, wallet_balance, wallet_balance);
  }

  const user = db.prepare('SELECT id, username, email, role, wallet_balance, created_at FROM users WHERE id = ?').get(id);
  res.status(201).json(user);
});

// PUT /api/users/:id — Admin updates user
router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const { username, email, role, is_active } = req.body;
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare(`
    UPDATE users SET
      username = COALESCE(?, username),
      email = COALESCE(?, email),
      role = COALESCE(?, role),
      is_active = COALESCE(?, is_active),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(username, email, role, is_active !== undefined ? (is_active ? 1 : 0) : null, req.params.id);

  const updated = db.prepare('SELECT id, username, email, role, wallet_balance, is_active, created_at FROM users WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// POST /api/users/:id/deposit — Admin deposits to wallet
router.post('/:id/deposit', authenticate, requireAdmin, (req, res) => {
  const { amount, description = 'Admin deposit' } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid positive amount required' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const newBalance = user.wallet_balance + parseFloat(amount);
  db.prepare('UPDATE users SET wallet_balance = ?, updated_at = datetime("now") WHERE id = ?').run(newBalance, user.id);
  db.prepare(`
    INSERT INTO transactions (id, user_id, type, amount, balance_before, balance_after, description)
    VALUES (?, ?, 'deposit', ?, ?, ?, ?)
  `).run(uuidv4(), user.id, parseFloat(amount), user.wallet_balance, newBalance, description);

  res.json({ message: 'Deposit successful', new_balance: newBalance });
});

// POST /api/users/:id/withdraw — Admin withdraws from wallet
router.post('/:id/withdraw', authenticate, requireAdmin, (req, res) => {
  const { amount, description = 'Admin withdrawal' } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid positive amount required' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.wallet_balance < amount) return res.status(400).json({ error: 'Insufficient funds' });

  const newBalance = user.wallet_balance - parseFloat(amount);
  db.prepare('UPDATE users SET wallet_balance = ?, updated_at = datetime("now") WHERE id = ?').run(newBalance, user.id);
  db.prepare(`
    INSERT INTO transactions (id, user_id, type, amount, balance_before, balance_after, description)
    VALUES (?, ?, 'withdrawal', ?, ?, ?, ?)
  `).run(uuidv4(), user.id, parseFloat(amount), user.wallet_balance, newBalance, description);

  res.json({ message: 'Withdrawal successful', new_balance: newBalance });
});

// DELETE /api/users/:id — Soft delete (deactivate)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'admin') return res.status(403).json({ error: 'Cannot deactivate admin accounts' });

  db.prepare('UPDATE users SET is_active = 0, updated_at = datetime("now") WHERE id = ?').run(req.params.id);
  res.json({ message: 'User deactivated' });
});

// GET /api/users/:id/transactions
router.get('/:id/transactions', authenticate, (req, res) => {
  if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const db = getDb();
  const txs = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').all(req.params.id);
  res.json(txs);
});

module.exports = router;

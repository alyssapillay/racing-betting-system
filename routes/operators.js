const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();

// GET all operators
router.get('/', authenticate, requireSuperAdmin, (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT id,username,email,role,is_active,created_at FROM operators ORDER BY created_at DESC').all());
});

// POST create operator
router.post('/', authenticate, requireSuperAdmin, (req, res) => {
  const { username, email, password, role = 'bookmaker' } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });
  if (!['super_admin','bookmaker','clerk'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const db = getDb();
  if (db.prepare('SELECT id FROM operators WHERE email=?').get(email)) return res.status(409).json({ error: 'Email exists' });
  const id = uuidv4();
  db.prepare('INSERT INTO operators (id,username,email,password_hash,role) VALUES (?,?,?,?,?)').run(id, username, email.toLowerCase(), bcrypt.hashSync(password, 12), role);
  res.status(201).json(db.prepare('SELECT id,username,email,role,is_active FROM operators WHERE id=?').get(id));
});

// PUT update
router.put('/:id', authenticate, requireSuperAdmin, (req, res) => {
  const { username, role, is_active, password } = req.body;
  const db = getDb();
  if (password && password.length >= 8) {
    db.prepare('UPDATE operators SET password_hash=?, updated_at=datetime("now") WHERE id=?').run(bcrypt.hashSync(password, 12), req.params.id);
  }
  db.prepare('UPDATE operators SET username=COALESCE(?,username), role=COALESCE(?,role), is_active=COALESCE(?,is_active), updated_at=datetime("now") WHERE id=?')
    .run(username, role, is_active !== undefined ? (is_active ? 1 : 0) : null, req.params.id);
  res.json(db.prepare('SELECT id,username,email,role,is_active FROM operators WHERE id=?').get(req.params.id));
});

// DELETE
router.delete('/:id', authenticate, requireSuperAdmin, (req, res) => {
  const db = getDb();
  const op = db.prepare('SELECT * FROM operators WHERE id=?').get(req.params.id);
  if (!op) return res.status(404).json({ error: 'Not found' });
  if (op.role === 'super_admin') return res.status(403).json({ error: 'Cannot delete super admin' });
  db.prepare('UPDATE operators SET is_active=0 WHERE id=?').run(req.params.id);
  res.json({ message: 'Deactivated' });
});

module.exports = router;

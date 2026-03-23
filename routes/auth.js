const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const db = getDb();
  const op = db.prepare('SELECT * FROM operators WHERE email=? AND is_active=1').get(email.toLowerCase().trim());
  if (!op || !bcrypt.compareSync(password, op.password_hash))
    return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: op.id, email: op.email, role: op.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, operator: { id: op.id, username: op.username, email: op.email, role: op.role } });
});

router.get('/me', authenticate, (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT id,username,email,role FROM operators WHERE id=?').get(req.user.id));
});

router.post('/change-password', authenticate, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password || new_password.length < 8)
    return res.status(400).json({ error: 'Valid passwords required (min 8 chars)' });
  const db = getDb();
  const op = db.prepare('SELECT * FROM operators WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, op.password_hash))
    return res.status(401).json({ error: 'Current password incorrect' });
  db.prepare('UPDATE operators SET password_hash=?, updated_at=datetime("now") WHERE id=?').run(bcrypt.hashSync(new_password, 12), req.user.id);
  res.json({ message: 'Password updated' });
});

module.exports = router;

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { getDb } = require('../database/db');
const { authenticate } = require('../middleware/auth');
const router  = express.Router();

function getSecret() {
  return process.env.JWT_SECRET || 'specialbet_fallback_secret_key_change_in_production';
}

router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password required' });

    const db = getDb();
    const op = db.prepare('SELECT * FROM operators WHERE email=? AND is_active=1')
                 .get(email.toLowerCase().trim());

    if (!op)
      return res.status(401).json({ error: 'No account found for that email' });

    const valid = bcrypt.compareSync(password, op.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Incorrect password' });

    const token = jwt.sign(
      { id: op.id, email: op.email, role: op.role },
      getSecret(),
      { expiresIn: '24h' }
    );

    res.json({
      token,
      operator: {
        id:       op.id,
        username: op.username,
        email:    op.email,
        role:     op.role
      }
    });
  } catch(err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed: ' + err.message });
  }
});

router.get('/me', authenticate, (req, res) => {
  try {
    const db = getDb();
    const op = db.prepare('SELECT id,username,email,role FROM operators WHERE id=?').get(req.user.id);
    if (!op) return res.status(404).json({ error: 'Operator not found' });
    res.json(op);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/change-password', authenticate, (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password || new_password.length < 8)
      return res.status(400).json({ error: 'Valid passwords required (min 8 chars)' });
    const db = getDb();
    const op = db.prepare('SELECT * FROM operators WHERE id=?').get(req.user.id);
    if (!bcrypt.compareSync(current_password, op.password_hash))
      return res.status(401).json({ error: 'Current password incorrect' });
    db.prepare('UPDATE operators SET password_hash=?, updated_at=datetime("now") WHERE id=?')
      .run(bcrypt.hashSync(new_password, 12), req.user.id);
    res.json({ message: 'Password updated' });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const jwt    = require('jsonwebtoken');
const { getDb } = require('../database/db');

function getSecret() {
  return process.env.JWT_SECRET || 'specialbet_fallback_secret_key_change_in_production';
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer '))
    return res.status(401).json({ error: 'Not authenticated — please log in' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, getSecret());
    const db = getDb();
    const op = db.prepare('SELECT id,username,email,role,is_active FROM operators WHERE id=?').get(decoded.id);
    if (!op)           return res.status(401).json({ error: 'Account not found' });
    if (!op.is_active) return res.status(401).json({ error: 'Account is inactive' });
    req.user = op;
    next();
  } catch(err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Session expired — please log in again' });
    return res.status(401).json({ error: 'Invalid session — please log in again' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'super_admin' && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
}

function requireSuperAdmin(req, res, next) {
  if (req.user.role !== 'super_admin')
    return res.status(403).json({ error: 'Super Admin access required' });
  next();
}

module.exports = { authenticate, requireAdmin, requireSuperAdmin };

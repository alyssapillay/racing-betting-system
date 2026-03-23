const jwt = require('jsonwebtoken');
const { getDb } = require('../database/db');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer '))
    return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const db = getDb();
    const op = db.prepare('SELECT id,username,email,role,is_active FROM operators WHERE id=?').get(decoded.id);
    if (!op || !op.is_active) return res.status(401).json({ error: 'Operator not found or inactive' });
    req.user = op;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super Admin access required' });
  }
  next();
}

module.exports = { authenticate, requireAdmin, requireSuperAdmin };

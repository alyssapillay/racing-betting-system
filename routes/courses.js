const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const { country_id } = req.query;
  let q = `SELECT co.*, c.name as country_name, c.flag, c.code as country_code,
    COUNT(DISTINCT rm.id) as meeting_count
    FROM courses co JOIN countries c ON co.country_id=c.id
    LEFT JOIN race_meetings rm ON rm.course_id=co.id`;
  const params = [];
  if (country_id) { q += ' WHERE co.country_id=?'; params.push(country_id); }
  q += ' GROUP BY co.id ORDER BY c.name, co.name';
  res.json(db.prepare(q).all(...params));
});

router.post('/', authenticate, requireAdmin, (req, res) => {
  const { country_id, name, city, surface, description } = req.body;
  if (!country_id || !name) return res.status(400).json({ error: 'country_id and name required' });
  const db = getDb();
  const id = uuidv4();
  db.prepare('INSERT INTO courses (id,country_id,name,city,surface,description) VALUES (?,?,?,?,?,?)').run(id, country_id, name.trim(), city || null, surface || 'Turf', description || null);
  res.status(201).json(db.prepare('SELECT co.*, c.name as country_name, c.flag FROM courses co JOIN countries c ON co.country_id=c.id WHERE co.id=?').get(id));
});

router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const { name, city, surface, description, is_active } = req.body;
  const db = getDb();
  db.prepare('UPDATE courses SET name=COALESCE(?,name), city=COALESCE(?,city), surface=COALESCE(?,surface), description=COALESCE(?,description), is_active=COALESCE(?,is_active) WHERE id=?')
    .run(name, city, surface, description, is_active !== undefined ? (is_active ? 1 : 0) : null, req.params.id);
  res.json(db.prepare('SELECT co.*, c.name as country_name, c.flag FROM courses co JOIN countries c ON co.country_id=c.id WHERE co.id=?').get(req.params.id));
});

router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM courses WHERE id=?').run(req.params.id);
  res.json({ message: 'Course deleted' });
});

module.exports = router;

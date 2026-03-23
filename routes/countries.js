const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// GET all countries with course counts
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT c.*, COUNT(co.id) as course_count
    FROM countries c
    LEFT JOIN courses co ON co.country_id = c.id AND co.is_active = 1
    GROUP BY c.id ORDER BY c.name
  `).all();
  res.json(rows);
});

// POST create country
router.post('/', authenticate, requireAdmin, (req, res) => {
  const { name, code, flag } = req.body;
  if (!name || !code || !flag) return res.status(400).json({ error: 'Name, code and flag required' });
  const db = getDb();
  const ex = db.prepare('SELECT id FROM countries WHERE code=?').get(code.toUpperCase());
  if (ex) return res.status(409).json({ error: 'Country code already exists' });
  const id = uuidv4();
  db.prepare('INSERT INTO countries (id,name,code,flag) VALUES (?,?,?,?)').run(id,name.trim(),code.toUpperCase(),flag.trim());
  res.status(201).json(db.prepare('SELECT * FROM countries WHERE id=?').get(id));
});

// PUT update
router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const { name, code, flag, is_active } = req.body;
  const db = getDb();
  db.prepare('UPDATE countries SET name=COALESCE(?,name), code=COALESCE(?,code), flag=COALESCE(?,flag), is_active=COALESCE(?,is_active) WHERE id=?')
    .run(name, code, flag, is_active !== undefined ? (is_active ? 1 : 0) : null, req.params.id);
  res.json(db.prepare('SELECT * FROM countries WHERE id=?').get(req.params.id));
});

// DELETE
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM countries WHERE id=?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// GET courses for a country
router.get('/:id/courses', authenticate, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT co.*, c.name as country_name, c.flag, c.code,
      COUNT(rm.id) as meeting_count
    FROM courses co
    JOIN countries c ON co.country_id = c.id
    LEFT JOIN race_meetings rm ON rm.course_id = co.id
    WHERE co.country_id = ?
    GROUP BY co.id ORDER BY co.name
  `).all(req.params.id);
  res.json(rows);
});

// ─── COURSES ─────────────────────────────────────────────────────

// GET all courses (with country info)
router.get('/courses/all', authenticate, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT co.*, c.name as country_name, c.flag, c.code,
      COUNT(rm.id) as meeting_count
    FROM courses co
    JOIN countries c ON co.country_id = c.id
    LEFT JOIN race_meetings rm ON rm.course_id = co.id
    WHERE co.is_active = 1
    GROUP BY co.id ORDER BY c.name, co.name
  `).all();
  res.json(rows);
});

// POST create course
router.post('/courses', authenticate, requireAdmin, (req, res) => {
  const { country_id, name, location, surface } = req.body;
  if (!country_id || !name) return res.status(400).json({ error: 'Country and course name required' });
  const db = getDb();
  const id = uuidv4();
  db.prepare('INSERT INTO courses (id,country_id,name,location,surface) VALUES (?,?,?,?,?)').run(id,country_id,name.trim(),location||null,surface||'Turf');
  const course = db.prepare(`
    SELECT co.*, c.name as country_name, c.flag, c.code
    FROM courses co JOIN countries c ON co.country_id=c.id WHERE co.id=?
  `).get(id);
  res.status(201).json(course);
});

// PUT update course
router.put('/courses/:id', authenticate, requireAdmin, (req, res) => {
  const { name, location, surface, is_active } = req.body;
  const db = getDb();
  db.prepare('UPDATE courses SET name=COALESCE(?,name), location=COALESCE(?,location), surface=COALESCE(?,surface), is_active=COALESCE(?,is_active) WHERE id=?')
    .run(name, location, surface, is_active !== undefined ? (is_active ? 1 : 0) : null, req.params.id);
  res.json(db.prepare('SELECT * FROM courses WHERE id=?').get(req.params.id));
});

// DELETE course
router.delete('/courses/:id', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM courses WHERE id=?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

module.exports = router;

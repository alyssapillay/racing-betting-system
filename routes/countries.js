const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();

// ── COURSES routes MUST come before /:id routes ─────────────────

// GET all courses across all countries
router.get('/courses/all', authenticate, (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT co.*, c.name as country_name, c.flag, c.code
      FROM courses co
      JOIN countries c ON co.country_id = c.id
      WHERE co.is_active = 1
      ORDER BY c.name ASC, co.name ASC
    `).all();
    res.json(rows);
  } catch(err) { console.error('GET courses/all error:', err); res.status(500).json({ error: err.message }); }
});

// POST create course
router.post('/courses', authenticate, requireSuperAdmin, (req, res) => {
  try {
    const { country_id, name, location, surface } = req.body;
    if (!country_id || !name) return res.status(400).json({ error: 'Country and name required' });
    const db = getDb();
    const id = uuidv4();
    db.prepare('INSERT INTO courses (id,country_id,name,location,surface) VALUES (?,?,?,?,?)')
      .run(id, country_id, name.trim(), location || null, surface || 'Turf');
    const course = db.prepare(`
      SELECT co.*, c.name as country_name, c.flag, c.code
      FROM courses co JOIN countries c ON co.country_id=c.id WHERE co.id=?
    `).get(id);
    res.status(201).json(course);
  } catch(err) { console.error('POST course error:', err); res.status(500).json({ error: err.message }); }
});

// PUT update course
router.put('/courses/:id', authenticate, requireSuperAdmin, (req, res) => {
  try {
    const { name, location, surface, is_active } = req.body;
    const db = getDb();
    db.prepare('UPDATE courses SET name=COALESCE(?,name), location=COALESCE(?,location), surface=COALESCE(?,surface), is_active=COALESCE(?,is_active) WHERE id=?')
      .run(name, location, surface, is_active !== undefined ? (is_active ? 1 : 0) : null, req.params.id);
    res.json(db.prepare('SELECT * FROM courses WHERE id=?').get(req.params.id));
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// DELETE course
router.delete('/courses/:id', authenticate, requireSuperAdmin, (req, res) => {
  try {
    getDb().prepare('DELETE FROM courses WHERE id=?').run(req.params.id);
    res.json({ message: 'Deleted' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── COUNTRIES routes ─────────────────────────────────────────────

// GET all countries with course counts
router.get('/', authenticate, (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT c.*, COUNT(co.id) as course_count
      FROM countries c
      LEFT JOIN courses co ON co.country_id = c.id AND co.is_active = 1
      GROUP BY c.id ORDER BY c.name ASC
    `).all();
    res.json(rows);
  } catch(err) { console.error('GET countries error:', err); res.status(500).json({ error: err.message }); }
});

// GET courses for one country
router.get('/:id/courses', authenticate, (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT co.*, c.name as country_name, c.flag, c.code,
        COUNT(ev.id) as meeting_count
      FROM courses co
      JOIN countries c ON co.country_id = c.id
      LEFT JOIN events ev ON ev.course_id = co.id
      WHERE co.country_id = ?
      GROUP BY co.id ORDER BY co.name ASC
    `).all(req.params.id);
    res.json(rows);
  } catch(err) { console.error('GET country courses error:', err); res.status(500).json({ error: err.message }); }
});

// POST create country
router.post('/', authenticate, requireSuperAdmin, (req, res) => {
  try {
    const { name, code, flag } = req.body;
    if (!name || !code || !flag) return res.status(400).json({ error: 'Name, code and flag required' });
    const db = getDb();
    if (db.prepare('SELECT id FROM countries WHERE code=?').get(code.toUpperCase()))
      return res.status(409).json({ error: 'Country code already exists' });
    const id = uuidv4();
    db.prepare('INSERT INTO countries (id,name,code,flag) VALUES (?,?,?,?)').run(id, name.trim(), code.toUpperCase(), flag.trim());
    res.status(201).json(db.prepare('SELECT * FROM countries WHERE id=?').get(id));
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// PUT update country
router.put('/:id', authenticate, requireSuperAdmin, (req, res) => {
  try {
    const { name, code, flag, is_active } = req.body;
    const db = getDb();
    db.prepare('UPDATE countries SET name=COALESCE(?,name), code=COALESCE(?,code), flag=COALESCE(?,flag), is_active=COALESCE(?,is_active) WHERE id=?')
      .run(name, code ? code.toUpperCase() : null, flag, is_active !== undefined ? (is_active ? 1 : 0) : null, req.params.id);
    res.json(db.prepare('SELECT * FROM countries WHERE id=?').get(req.params.id));
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// DELETE country
router.delete('/:id', authenticate, requireSuperAdmin, (req, res) => {
  try {
    getDb().prepare('DELETE FROM countries WHERE id=?').run(req.params.id);
    res.json({ message: 'Deleted' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

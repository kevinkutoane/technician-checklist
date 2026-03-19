'use strict';

const express = require('express');
const db = require('../db/database');
const bcrypt = require('bcryptjs');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All routes require at least authentication
router.use(requireAuth);

// ── Classrooms ────────────────────────────────────────────────────────────────

// GET /api/classrooms — accessible to all authenticated users (for dropdown menus)
router.get('/classrooms', (req, res) => {
  const classrooms = db.prepare('SELECT * FROM classrooms ORDER BY name').all();
  res.json(classrooms);
});

// POST /api/classrooms
router.post('/classrooms', requireAdmin, (req, res) => {
  const { name, building, floor } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Classroom name is required' });
  }
  const stmt = db.prepare('INSERT INTO classrooms (name, building, floor) VALUES (?, ?, ?)');
  const result = stmt.run(name.trim(), (building || '').trim(), (floor || '').trim());
  const classroom = db.prepare('SELECT * FROM classrooms WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(classroom);
});

// PUT /api/classrooms/:id
router.put('/classrooms/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, building, floor } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Classroom name is required' });
  }
  const stmt = db.prepare('UPDATE classrooms SET name = ?, building = ?, floor = ? WHERE id = ?');
  const result = stmt.run(name.trim(), (building || '').trim(), (floor || '').trim(), id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Classroom not found' });
  }
  const classroom = db.prepare('SELECT * FROM classrooms WHERE id = ?').get(id);
  res.json(classroom);
});

// DELETE /api/classrooms/:id
router.delete('/classrooms/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM classrooms WHERE id = ?').run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Classroom not found' });
  }
  res.json({ message: 'Classroom deleted' });
});

// ── Equipment ─────────────────────────────────────────────────────────────────

// GET /api/equipment/:classroomId — accessible to all authenticated users
router.get('/equipment/:classroomId', (req, res) => {
  const { classroomId } = req.params;
  const equipment = db
    .prepare('SELECT * FROM equipment WHERE classroom_id = ? ORDER BY name')
    .all(classroomId);
  res.json(equipment);
});

// POST /api/equipment
router.post('/equipment', requireAdmin, (req, res) => {
  const { classroom_id, name, description } = req.body;
  if (!classroom_id || !name || !name.trim()) {
    return res.status(400).json({ error: 'classroom_id and name are required' });
  }
  const classroom = db.prepare('SELECT id FROM classrooms WHERE id = ?').get(classroom_id);
  if (!classroom) {
    return res.status(404).json({ error: 'Classroom not found' });
  }
  const stmt = db.prepare(
    'INSERT INTO equipment (classroom_id, name, description) VALUES (?, ?, ?)'
  );
  const result = stmt.run(classroom_id, name.trim(), (description || '').trim());
  const equipment = db.prepare('SELECT * FROM equipment WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(equipment);
});

// PUT /api/equipment/:id
router.put('/equipment/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Equipment name is required' });
  }
  const stmt = db.prepare('UPDATE equipment SET name = ?, description = ? WHERE id = ?');
  const result = stmt.run(name.trim(), (description || '').trim(), id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Equipment not found' });
  }
  const equipment = db.prepare('SELECT * FROM equipment WHERE id = ?').get(id);
  res.json(equipment);
});

// DELETE /api/equipment/:id
router.delete('/equipment/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM equipment WHERE id = ?').run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Equipment not found' });
  }
  res.json({ message: 'Equipment deleted' });
});

// ── Technicians ───────────────────────────────────────────────────────────────

// GET /api/technicians — admin only
router.get('/technicians', requireAdmin, (req, res) => {
  const technicians = db
    .prepare("SELECT id, username, full_name, role, created_at FROM users WHERE role = 'technician' ORDER BY full_name")
    .all();
  res.json(technicians);
});

// POST /api/technicians
router.post('/technicians', requireAdmin, async (req, res) => {
  const { username, password, full_name } = req.body;
  if (!username || !username.trim() || !password || !full_name || !full_name.trim()) {
    return res.status(400).json({ error: 'username, password, and full_name are required' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const stmt = db.prepare(
      "INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, 'technician')"
    );
    const result = stmt.run(username.trim(), hash, full_name.trim());
    const user = db
      .prepare('SELECT id, username, full_name, role, created_at FROM users WHERE id = ?')
      .get(result.lastInsertRowid);
    res.status(201).json(user);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Failed to create technician' });
  }
});

// PUT /api/technicians/:id
router.put('/technicians/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { username, password, full_name } = req.body;
  if (!username || !username.trim() || !full_name || !full_name.trim()) {
    return res.status(400).json({ error: 'username and full_name are required' });
  }

  try {
    let stmt;
    if (password && password.trim() !== '') {
      const hash = await bcrypt.hash(password, 10);
      stmt = db.prepare('UPDATE users SET username = ?, full_name = ?, password = ? WHERE id = ? AND role = \'technician\'');
      stmt.run(username.trim(), full_name.trim(), hash, id);
    } else {
      stmt = db.prepare('UPDATE users SET username = ?, full_name = ? WHERE id = ? AND role = \'technician\'');
      stmt.run(username.trim(), full_name.trim(), id);
    }

    const user = db
      .prepare('SELECT id, username, full_name, role, created_at FROM users WHERE id = ?')
      .get(id);
    
    if (!user) {
       return res.status(404).json({ error: 'Technician not found' });
    }
    
    res.json(user);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Failed to update technician' });
  }
});

// DELETE /api/technicians/:id
router.delete('/technicians/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const user = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'technician'").get(id);
  if (!user) {
    return res.status(404).json({ error: 'Technician not found' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ message: 'Technician deleted' });
});

module.exports = router;

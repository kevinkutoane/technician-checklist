'use strict';

const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = express.Router();

router.use(requireAuth);

// GET /api/hybrid?date=YYYY-MM-DD  — list hybrid setups for a given day (default: today)
router.get('/', (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const list = db.prepare(`
    SELECT hs.id, hs.classroom_id, c.name AS classroom_name,
           u.full_name AS set_by_name, hs.set_by_id,
           hs.notes, hs.created_at
    FROM hybrid_setups hs
    JOIN classrooms c ON hs.classroom_id = c.id
    JOIN users u ON hs.set_by_id = u.id
    WHERE hs.setup_date = ?
    ORDER BY hs.created_at ASC
  `).all(date);
  res.json(list);
});

// POST /api/hybrid  — mark a classroom hybrid for today; re-posting updates the note
router.post('/', (req, res) => {
  const { classroom_id, notes = '' } = req.body;
  const setup_date = new Date().toISOString().slice(0, 10);
  const set_by_id  = req.session.user.id;

  if (!classroom_id) {
    return res.status(400).json({ error: 'classroom_id is required' });
  }

  const classroom = db.prepare('SELECT id FROM classrooms WHERE id = ?').get(Number(classroom_id));
  if (!classroom) {
    return res.status(404).json({ error: 'Classroom not found' });
  }

  db.prepare(`
    INSERT INTO hybrid_setups (classroom_id, setup_date, set_by_id, notes)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(classroom_id, setup_date)
    DO UPDATE SET set_by_id = excluded.set_by_id,
                  notes     = excluded.notes,
                  created_at = CURRENT_TIMESTAMP
  `).run(Number(classroom_id), setup_date, set_by_id, String(notes).trim());

  const record = db.prepare(`
    SELECT hs.id, hs.classroom_id, c.name AS classroom_name,
           u.full_name AS set_by_name, hs.set_by_id,
           hs.notes, hs.created_at
    FROM hybrid_setups hs
    JOIN classrooms c ON hs.classroom_id = c.id
    JOIN users u ON hs.set_by_id = u.id
    WHERE hs.classroom_id = ? AND hs.setup_date = ?
  `).get(Number(classroom_id), setup_date);

  logAudit(req, 'hybrid.mark', 'hybrid_setups', record.id,
    `${record.classroom_name} marked hybrid for ${setup_date}`);

  res.status(201).json(record);
});

// DELETE /api/hybrid/:id  — clear a hybrid setup; any authenticated user (team awareness tool)
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const record = db.prepare(`
    SELECT hs.id, hs.setup_date, c.name AS classroom_name
    FROM hybrid_setups hs
    JOIN classrooms c ON hs.classroom_id = c.id
    WHERE hs.id = ?
  `).get(id);

  if (!record) return res.status(404).json({ error: 'Not found' });

  db.prepare('DELETE FROM hybrid_setups WHERE id = ?').run(id);

  logAudit(req, 'hybrid.clear', 'hybrid_setups', id,
    `${record.classroom_name} hybrid cleared for ${record.setup_date}`);

  res.json({ success: true });
});

module.exports = router;

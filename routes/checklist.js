'use strict';

const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// POST /api/checklists
router.post('/', (req, res) => {
  const { classroom_id, submission_date, general_notes, items } = req.body;
  const technician_id = req.session.user.id;

  if (!classroom_id || !submission_date) {
    return res.status(400).json({ error: 'classroom_id and submission_date are required' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one checklist item is required' });
  }

  const validStatuses = new Set(['working', 'not_working', 'needs_repair']);
  for (const item of items) {
    if (!item.equipment_id || !validStatuses.has(item.status)) {
      return res.status(400).json({ error: 'Each item needs equipment_id and a valid status' });
    }
  }

  const insertSubmission = db.prepare(`
    INSERT INTO checklist_submissions (technician_id, classroom_id, submission_date, general_notes)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(technician_id, classroom_id, submission_date)
    DO UPDATE SET general_notes = excluded.general_notes, updated_at = CURRENT_TIMESTAMP
  `);

  const insertItem = db.prepare(`
    INSERT INTO checklist_items (submission_id, equipment_id, status, notes)
    VALUES (?, ?, ?, ?)
  `);

  const deleteItems = db.prepare(`
    DELETE FROM checklist_items WHERE submission_id = ?
  `);

  const runTransaction = db.transaction(() => {
    insertSubmission.run(
      technician_id,
      classroom_id,
      submission_date,
      (general_notes || '').trim()
    );

    // Get the submission id (whether inserted or updated)
    const submission = db
      .prepare(
        'SELECT id FROM checklist_submissions WHERE technician_id = ? AND classroom_id = ? AND submission_date = ?'
      )
      .get(technician_id, classroom_id, submission_date);

    // Delete old items (in case of update)
    deleteItems.run(submission.id);

    for (const item of items) {
      insertItem.run(submission.id, item.equipment_id, item.status, (item.notes || '').trim());
    }

    return submission;
  });

  try {
    const submission = runTransaction();
    const full = db
      .prepare('SELECT * FROM checklist_submissions WHERE id = ?')
      .get(submission.id);
    res.status(201).json(full);
  } catch (err) {
    console.error('Checklist submission error:', err);
    res.status(500).json({ error: 'Failed to save checklist' });
  }
});

// GET /api/checklists
router.get('/', (req, res) => {
  const { date, classroom_id, technician_id, start_date, end_date } = req.query;

  let sql = `
    SELECT
      cs.id,
      cs.submission_date,
      cs.general_notes,
      cs.created_at,
      cs.updated_at,
      u.id AS technician_id,
      u.full_name AS technician_name,
      u.username AS technician_username,
      c.id AS classroom_id,
      c.name AS classroom_name
    FROM checklist_submissions cs
    JOIN users u ON cs.technician_id = u.id
    JOIN classrooms c ON cs.classroom_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (date) {
    sql += ' AND cs.submission_date = ?';
    params.push(date);
  }
  if (start_date) {
    sql += ' AND cs.submission_date >= ?';
    params.push(start_date);
  }
  if (end_date) {
    sql += ' AND cs.submission_date <= ?';
    params.push(end_date);
  }
  if (classroom_id) {
    sql += ' AND cs.classroom_id = ?';
    params.push(classroom_id);
  }
  // Security: non-admins can only see their own submissions
  const effectiveTechnicianId =
    req.session.user.role !== 'admin' ? req.session.user.id : (technician_id || null);
  if (effectiveTechnicianId) {
    sql += ' AND cs.technician_id = ?';
    params.push(effectiveTechnicianId);
  }

  sql += ' ORDER BY cs.submission_date DESC, cs.created_at DESC';

  const submissions = db.prepare(sql).all(...params);
  res.json(submissions);
});

// GET /api/checklists/:id
router.get('/:id', (req, res) => {
  const { id } = req.params;

  const submission = db
    .prepare(`
      SELECT
        cs.*,
        u.full_name AS technician_name,
        u.username AS technician_username,
        c.name AS classroom_name
      FROM checklist_submissions cs
      JOIN users u ON cs.technician_id = u.id
      JOIN classrooms c ON cs.classroom_id = c.id
      WHERE cs.id = ?
    `)
    .get(id);

  if (!submission) {
    return res.status(404).json({ error: 'Submission not found' });
  }

  const items = db
    .prepare(`
      SELECT ci.*, e.name AS equipment_name
      FROM checklist_items ci
      JOIN equipment e ON ci.equipment_id = e.id
      WHERE ci.submission_id = ?
      ORDER BY e.name
    `)
    .all(id);

  res.json({ ...submission, items });
});

module.exports = router;

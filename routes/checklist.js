'use strict';

const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { sendFlagAlert } = require('../utils/mailer');

const router = express.Router();

router.use(requireAuth);

// GET /api/checklists/latest-notes?classroom_id=X
// Returns per-equipment notes from the most recent submission for this classroom
// by the current technician. Used to pre-fill the form.
router.get('/latest-notes', (req, res) => {
  const classroomId   = parseInt(req.query.classroom_id, 10);
  const technicianId  = req.session.user.id;

  if (!classroomId) return res.status(400).json({ error: 'classroom_id is required' });

  // Find the most recent submission (excluding today so we don't overwrite what's just been done)
  const today = new Date().toISOString().slice(0, 10);
  const submission = db.prepare(`
    SELECT id FROM checklist_submissions
    WHERE classroom_id = ? AND technician_id = ? AND submission_date < ?
    ORDER BY submission_date DESC, created_at DESC
    LIMIT 1
  `).get(classroomId, technicianId, today);

  if (!submission) return res.json([]);

  const items = db.prepare(`
    SELECT ci.equipment_id, ci.notes
    FROM checklist_items ci
    WHERE ci.submission_id = ? AND ci.notes != ''
  `).all(submission.id);

  res.json(items);
});

// POST /api/checklists
router.post('/', async (req, res) => {
  const { classroom_id, submission_date, general_notes, items } = req.body;
  const technician_id = req.session.user.id;

  if (!classroom_id || !submission_date) {
    return res.status(400).json({ error: 'classroom_id and submission_date are required' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(submission_date)) {
    return res.status(400).json({ error: 'submission_date must be in YYYY-MM-DD format' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one checklist item is required' });
  }
  if (items.length > 200) {
    return res.status(400).json({ error: 'Too many checklist items (max 200)' });
  }

  const validStatuses = new Set(['working', 'not_working', 'needs_repair']);
  for (const item of items) {
    if (!item.equipment_id || !validStatuses.has(item.status)) {
      return res.status(400).json({ error: 'Each item needs equipment_id and a valid status' });
    }
  }

  // Validate all equipment IDs belong to the specified classroom
  const classroomEquip = db.prepare('SELECT id FROM equipment WHERE classroom_id = ?').all(classroom_id);
  const validEquipIds = new Set(classroomEquip.map((e) => e.id));
  for (const item of items) {
    if (!validEquipIds.has(Number(item.equipment_id))) {
      return res.status(400).json({ error: `Equipment ID ${item.equipment_id} does not belong to this classroom` });
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

    // Audit log
    const classroomRow = db.prepare('SELECT name FROM classrooms WHERE id = ?').get(classroom_id);
    const classroomLabel = classroomRow ? classroomRow.name : `Classroom ${classroom_id}`;
    logAudit(req, 'checklist.submit', 'checklist_submission', submission.id,
      `${classroomLabel} on ${submission_date}`);

    // Email alert for flagged items
    const flagged = items.filter((i) => i.status === 'not_working' || i.status === 'needs_repair');
    if (flagged.length > 0) {
      const equipNames = db.prepare(`
        SELECT id, name FROM equipment WHERE id IN (${flagged.map(() => '?').join(',')})
      `).all(...flagged.map((i) => i.equipment_id));
      const nameMap = Object.fromEntries(equipNames.map((e) => [e.id, e.name]));

      const classroom = db.prepare('SELECT name FROM classrooms WHERE id = ?').get(classroom_id);
      const tech      = db.prepare('SELECT full_name FROM users WHERE id = ?').get(technician_id);

      sendFlagAlert(
        flagged.map((i) => ({ equipment_name: nameMap[i.equipment_id] || `#${i.equipment_id}`, status: i.status, notes: i.notes })),
        classroom ? classroom.name : String(classroom_id),
        tech ? tech.full_name : String(technician_id),
        submission_date
      ).catch((e) => console.error('[mailer] sendFlagAlert failed:', e.message));
    }

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

  // Non-admins can only view their own submissions
  if (req.session.user.role !== 'admin' && submission.technician_id !== Number(req.session.user.id)) {
    return res.status(403).json({ error: 'Forbidden' });
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

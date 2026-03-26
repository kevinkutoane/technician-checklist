'use strict';

const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = express.Router();
router.use(requireAuth);

// GET /api/handover — list submissions, newest first; optional ?classroom_id=N&limit=N
router.get('/', (req, res) => {
  const { classroom_id, limit = 100 } = req.query;
  const safeLimit = Math.min(Number(limit) || 100, 500);

  let sql = `
    SELECT h.*, c.name AS classroom_name
    FROM classroom_handovers h
    LEFT JOIN classrooms c ON h.classroom_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (classroom_id) {
    sql += ' AND h.classroom_id = ?';
    params.push(Number(classroom_id));
  }

  sql += ' ORDER BY h.handover_date DESC, h.created_at DESC LIMIT ?';
  params.push(safeLimit);

  const records = db.prepare(sql).all(...params);
  res.json(records);
});

// GET /api/handover/:id — single record for admin detail modal
router.get('/:id', (req, res) => {
  const record = db.prepare(`
    SELECT h.*, c.name AS classroom_name
    FROM classroom_handovers h
    LEFT JOIN classrooms c ON h.classroom_id = c.id
    WHERE h.id = ?
  `).get(req.params.id);

  if (!record) return res.status(404).json({ error: 'Handover record not found' });
  res.json(record);
});

// POST /api/handover — create a new handover record
router.post('/', (req, res) => {
  const {
    handover_date,
    checking_start_time,
    class_start_time,
    classroom_id,
    programme_name,
    faculty_name,
    session_producer_name,
    programme_manager_name,
    services_data,
    faculty_arrived,
    faculty_comments,
    faculty_signature,
    session_producer_arrived,
    session_producer_comments,
    session_producer_signature,
    programme_manager_arrived,
    programme_manager_comments,
    programme_manager_signature,
    additional_comments,
  } = req.body;

  if (!classroom_id) {
    return res.status(400).json({ error: 'Classroom is required' });
  }
  if (!handover_date) {
    return res.status(400).json({ error: 'Handover date is required' });
  }

  // Sanitise signature data — must start with data:image/ or be stripped to ''
  const cleanSig = (s) => (s && String(s).startsWith('data:image/') ? s : '');

  // Normalise services_data to a valid JSON string
  const servicesStr = (() => {
    if (!services_data) return '{}';
    if (typeof services_data === 'string') {
      try { JSON.parse(services_data); return services_data; } catch { return '{}'; }
    }
    return JSON.stringify(services_data);
  })();

  const submitted_by_id = req.session.user.id;
  const technician_name = req.session.user.full_name;

  const result = db.prepare(`
    INSERT INTO classroom_handovers (
      submitted_by_id, handover_date, checking_start_time, class_start_time,
      classroom_id, programme_name, technician_name,
      faculty_name, session_producer_name, programme_manager_name,
      services_data,
      faculty_arrived, faculty_comments, faculty_signature,
      session_producer_arrived, session_producer_comments, session_producer_signature,
      programme_manager_arrived, programme_manager_comments, programme_manager_signature,
      additional_comments
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    submitted_by_id,
    handover_date,
    checking_start_time || '',
    class_start_time || '',
    Number(classroom_id),
    (programme_name || '').trim(),
    technician_name,
    (faculty_name || '').trim(),
    (session_producer_name || '').trim(),
    (programme_manager_name || '').trim(),
    servicesStr,
    faculty_arrived || '',
    (faculty_comments || '').trim(),
    cleanSig(faculty_signature),
    session_producer_arrived || '',
    (session_producer_comments || '').trim(),
    cleanSig(session_producer_signature),
    programme_manager_arrived || '',
    (programme_manager_comments || '').trim(),
    cleanSig(programme_manager_signature),
    (additional_comments || '').trim(),
  );

  logAudit(req, 'handover.create', 'classroom_handover', result.lastInsertRowid,
    `Classroom: ${classroom_id}, Date: ${handover_date}`);

  res.status(201).json({ id: result.lastInsertRowid, success: true });
});

module.exports = router;

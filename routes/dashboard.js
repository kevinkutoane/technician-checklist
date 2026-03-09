'use strict';

const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// GET /api/dashboard/summary
router.get('/summary', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const totalSubmissions = db
    .prepare("SELECT COUNT(*) AS count FROM checklist_submissions WHERE submission_date = ?")
    .get(today).count;

  const flaggedItems = db
    .prepare(`
      SELECT COUNT(*) AS count FROM checklist_items ci
      JOIN checklist_submissions cs ON ci.submission_id = cs.id
      WHERE cs.submission_date = ? AND ci.status IN ('not_working', 'needs_repair')
    `)
    .get(today).count;

  const notWorkingItems = db
    .prepare(`
      SELECT COUNT(*) AS count FROM checklist_items ci
      JOIN checklist_submissions cs ON ci.submission_id = cs.id
      WHERE cs.submission_date = ? AND ci.status = 'not_working'
    `)
    .get(today).count;

  const totalClassrooms = db.prepare('SELECT COUNT(*) AS count FROM classrooms').get().count;
  const totalTechnicians = db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'technician'")
    .get().count;

  res.json({
    today,
    totalSubmissions,
    flaggedItems,
    notWorkingItems,
    totalClassrooms,
    totalTechnicians,
  });
});

// GET /api/dashboard/issues
router.get('/issues', (req, res) => {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().slice(0, 10);

  const issues = db
    .prepare(`
      SELECT
        ci.id,
        ci.status,
        ci.notes AS item_notes,
        e.name AS equipment_name,
        c.name AS classroom_name,
        u.full_name AS technician_name,
        cs.submission_date,
        cs.id AS submission_id
      FROM checklist_items ci
      JOIN checklist_submissions cs ON ci.submission_id = cs.id
      JOIN equipment e ON ci.equipment_id = e.id
      JOIN classrooms c ON cs.classroom_id = c.id
      JOIN users u ON cs.technician_id = u.id
      WHERE cs.submission_date = ? AND ci.status IN ('not_working', 'needs_repair')
      ORDER BY ci.status, c.name, e.name
    `)
    .all(targetDate);

  res.json(issues);
});

// GET /api/dashboard/export
router.get('/export', (req, res) => {
  const { start_date, end_date, classroom_id, technician_id } = req.query;
  const today = new Date().toISOString().slice(0, 10);

  let sql = `
    SELECT
      cs.submission_date,
      u.full_name AS technician_name,
      u.username AS technician_username,
      c.name AS classroom_name,
      e.name AS equipment_name,
      ci.status,
      ci.notes AS item_notes,
      cs.general_notes
    FROM checklist_items ci
    JOIN checklist_submissions cs ON ci.submission_id = cs.id
    JOIN users u ON cs.technician_id = u.id
    JOIN classrooms c ON cs.classroom_id = c.id
    JOIN equipment e ON ci.equipment_id = e.id
    WHERE 1=1
  `;
  const params = [];

  if (start_date) {
    sql += ' AND cs.submission_date >= ?';
    params.push(start_date);
  } else {
    sql += ' AND cs.submission_date = ?';
    params.push(today);
  }
  if (end_date) {
    sql += ' AND cs.submission_date <= ?';
    params.push(end_date);
  }
  if (classroom_id) {
    sql += ' AND cs.classroom_id = ?';
    params.push(classroom_id);
  }
  if (technician_id) {
    sql += ' AND cs.technician_id = ?';
    params.push(technician_id);
  }

  sql += ' ORDER BY cs.submission_date DESC, c.name, e.name';

  const rows = db.prepare(sql).all(...params);

  // Build CSV
  const headers = [
    'Date', 'Technician', 'Username', 'Classroom', 'Equipment', 'Status', 'Item Notes', 'General Notes',
  ];
  const csvRows = [headers.join(',')];

  for (const row of rows) {
    const values = [
      row.submission_date,
      `"${(row.technician_name || '').replace(/"/g, '""')}"`,
      row.technician_username,
      `"${(row.classroom_name || '').replace(/"/g, '""')}"`,
      `"${(row.equipment_name || '').replace(/"/g, '""')}"`,
      row.status,
      `"${(row.item_notes || '').replace(/"/g, '""')}"`,
      `"${(row.general_notes || '').replace(/"/g, '""')}"`,
    ];
    csvRows.push(values.join(','));
  }

  const csv = csvRows.join('\n');
  const filename = `checklist-export-${today}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

module.exports = router;

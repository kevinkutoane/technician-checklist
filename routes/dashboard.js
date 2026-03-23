'use strict';

const express = require('express');
const db = require('../db/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// GET /api/dashboard/today-progress
// Returns every classroom with whether the current user (or all users for admin)
// has submitted a checklist today.
router.get('/today-progress', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const isAdmin = req.session.user.role === 'admin';
  const userId  = req.session.user.id;

  const classrooms = db.prepare('SELECT id, name FROM classrooms ORDER BY name').all();

  const result = classrooms.map((c) => {
    // How many distinct technicians have submitted for this classroom today?
    const totalToday = db.prepare(`
      SELECT COUNT(*) AS n FROM checklist_submissions
      WHERE classroom_id = ? AND submission_date = ?
    `).get(c.id, today).n;

    // Has the current user submitted?
    const submittedByMe = db.prepare(`
      SELECT 1 FROM checklist_submissions
      WHERE classroom_id = ? AND submission_date = ? AND technician_id = ?
    `).get(c.id, today, userId) ? true : false;

    return { id: c.id, name: c.name, submitted_by_me: submittedByMe, total_today: totalToday };
  });

  res.json(result);
});

// GET /api/dashboard/classroom-status-today
// Returns every classroom with per-submission detail (technician, items) for today.
// Accessible to all authenticated users.
router.get('/classroom-status-today', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const classrooms = db.prepare('SELECT id, name FROM classrooms ORDER BY name').all();

  const result = classrooms.map((c) => {
    const subs = db.prepare(`
      SELECT cs.id, cs.technician_id, u.full_name AS technician_name,
             cs.general_notes, cs.created_at AS submitted_at
      FROM checklist_submissions cs
      JOIN users u ON cs.technician_id = u.id
      WHERE cs.classroom_id = ? AND cs.submission_date = ?
      ORDER BY cs.created_at ASC
    `).all(c.id, today);

    const subsWithItems = subs.map((s) => {
      const items = db.prepare(`
        SELECT e.name AS equipment_name, ci.status, ci.notes
        FROM checklist_items ci
        JOIN equipment e ON ci.equipment_id = e.id
        WHERE ci.submission_id = ?
        ORDER BY e.name ASC
      `).all(s.id);
      return {
        technician_id: s.technician_id,
        technician_name: s.technician_name,
        submitted_at: s.submitted_at,
        general_notes: s.general_notes || '',
        items,
      };
    });

    return { id: c.id, name: c.name, submissions: subsWithItems };
  });

  res.json(result);
});

// GET /api/dashboard/equipment-trends?classroom_id=X&days=14
// Returns daily status counts for every piece of equipment in a classroom,
// for the last N days (default 14, max 90).
router.get('/equipment-trends', requireAdmin, (req, res) => {
  const classroomId = parseInt(req.query.classroom_id, 10);
  const days = Math.min(parseInt(req.query.days || '14', 10), 90);

  if (!classroomId) {
    return res.status(400).json({ error: 'classroom_id is required' });
  }

  const classroom = db.prepare('SELECT id, name FROM classrooms WHERE id = ?').get(classroomId);
  if (!classroom) return res.status(404).json({ error: 'Classroom not found' });

  const equipment = db.prepare('SELECT id, name FROM equipment WHERE classroom_id = ? ORDER BY name').all(classroomId);

  // Build date range
  const dateLabels = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dateLabels.push(d.toISOString().slice(0, 10));
  }

  const cutoff = dateLabels[0];

  // Fetch all item results in one query
  const rows = db.prepare(`
    SELECT ci.equipment_id, cs.submission_date, ci.status
    FROM checklist_items ci
    JOIN checklist_submissions cs ON ci.submission_id = cs.id
    WHERE cs.classroom_id = ? AND cs.submission_date >= ?
    ORDER BY cs.submission_date
  `).all(classroomId, cutoff);

  // Build a map: equipment_id -> date -> last status
  const statusMap = {};
  for (const row of rows) {
    if (!statusMap[row.equipment_id]) statusMap[row.equipment_id] = {};
    statusMap[row.equipment_id][row.submission_date] = row.status;
  }

  const datasets = equipment.map((eq) => ({
    id:   eq.id,
    name: eq.name,
    data: dateLabels.map((d) => statusMap[eq.id]?.[d] || null),
  }));

  res.json({ classroom: classroom.name, labels: dateLabels, datasets });
});

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

  const totalAssetAgreements = db
    .prepare("SELECT COUNT(*) AS count FROM asset_agreements WHERE submission_date = ?")
    .get(today).count;

  const totalQAChecklists = db
    .prepare("SELECT COUNT(*) AS count FROM qa_submissions WHERE submission_date = ?")
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
    totalAssetAgreements,
    totalQAChecklists,
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

// GET /api/dashboard/charts — admin only (exposes per-technician performance data)
router.get('/charts', requireAdmin, (req, res) => {
  // ── 1. Last 7 days: submissions AND flagged items per day ──────────────────
  const dayLabels = [];
  const checksData = [];
  const flagsData = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    dayLabels.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));

    const checks = db.prepare(
      'SELECT COUNT(*) as c FROM checklist_submissions WHERE submission_date = ?'
    ).get(dateStr).c;

    const flags = db.prepare(`
      SELECT COUNT(*) as c FROM checklist_items ci
      JOIN checklist_submissions cs ON ci.submission_id = cs.id
      WHERE cs.submission_date = ? AND ci.status IN ('not_working','needs_repair')
    `).get(dateStr).c;

    checksData.push(checks);
    flagsData.push(flags);
  }

  // ── 2. Equipment status mix (last 7 days) ──────────────────────────────────
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 6);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const statusMix = db.prepare(`
    SELECT ci.status, COUNT(*) as count
    FROM checklist_items ci
    JOIN checklist_submissions cs ON ci.submission_id = cs.id
    WHERE cs.submission_date >= ?
    GROUP BY ci.status
  `).all(cutoffStr);

  const statusMap = { working: 0, needs_repair: 0, not_working: 0 };
  statusMix.forEach(r => { statusMap[r.status] = r.count; });

  // ── 3. Top 5 classrooms by flagged item count (last 7 days) ───────────────
  const topClassrooms = db.prepare(`
    SELECT c.name, COUNT(*) as flagCount
    FROM checklist_items ci
    JOIN checklist_submissions cs ON ci.submission_id = cs.id
    JOIN classrooms c ON cs.classroom_id = c.id
    WHERE cs.submission_date >= ? AND ci.status IN ('not_working','needs_repair')
    GROUP BY cs.classroom_id
    ORDER BY flagCount DESC
    LIMIT 5
  `).all(cutoffStr);

  // ── 4. Technician activity — submissions count last 7 days ────────────────
  const techActivity = db.prepare(`
    SELECT u.full_name, COUNT(*) as subCount
    FROM checklist_submissions cs
    JOIN users u ON cs.technician_id = u.id
    WHERE cs.submission_date >= ?
    GROUP BY cs.technician_id
    ORDER BY subCount DESC
  `).all(cutoffStr);

  res.json({
    dailyActivity: {
      labels: dayLabels,
      checks: checksData,
      flags: flagsData,
    },
    statusMix: {
      labels: ['Working', 'Needs Repair', 'Not Working'],
      data: [statusMap.working, statusMap.needs_repair, statusMap.not_working],
    },
    topClassrooms: {
      labels: topClassrooms.map(r => r.name),
      data: topClassrooms.map(r => r.flagCount),
    },
    techActivity: {
      labels: techActivity.map(r => r.full_name.split(' ')[0]),
      fullNames: techActivity.map(r => r.full_name),
      data: techActivity.map(r => r.subCount),
    },
  });
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
  // Non-admins can only export their own data
  const effectiveTechId =
    req.session.user.role !== 'admin' ? req.session.user.id : (technician_id || null);
  if (effectiveTechId) {
    sql += ' AND cs.technician_id = ?';
    params.push(effectiveTechId);
  }

  sql += ' ORDER BY cs.submission_date DESC, c.name, e.name';

  const rows = db.prepare(sql).all(...params);

  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ margin: 30, size: 'A4' });

  const filename = `checklist-export-${today}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  
  doc.pipe(res);

  doc.fontSize(20).text('Technician Checklist Export', { align: 'center' });
  doc.moveDown();

  if (rows.length === 0) {
    doc.fontSize(12).text('No submissions found for the selected filters.');
    doc.end();
    return;
  }

  let currentSubmissionDate = '';
  let currentClassroom = '';

  for (const row of rows) {
    if (row.submission_date !== currentSubmissionDate || row.classroom_name !== currentClassroom) {
      currentSubmissionDate = row.submission_date;
      currentClassroom = row.classroom_name;
      
      doc.moveDown();
      doc.fontSize(16).fillColor('#2563eb').text(`${currentClassroom}`, { continued: true });
      doc.fillColor('#000').text(`  —  ${currentSubmissionDate}`);
      doc.fontSize(10).fillColor('#6b7280').text(`Technician: ${row.technician_name} (${row.technician_username})`);
      if (row.general_notes) {
        doc.fontSize(10).fillColor('#4b5563').text(`General Notes: ${row.general_notes}`);
      }
      doc.moveDown(0.5);
    }

    doc.fontSize(12).fillColor('#000').text(`• ${row.equipment_name}: `, { continued: true });
    
    let statusColor = '#dc2626'; // default danger
    if (row.status === 'working') statusColor = '#16a34a';
    else if (row.status === 'needs_repair') statusColor = '#d97706';
    
    const formattedStatus = row.status.replace('_', ' ').toUpperCase();
    doc.fillColor(statusColor).text(formattedStatus);

    if (row.item_notes) {
       doc.fontSize(10).fillColor('#6b7280').text(`    Notes: ${row.item_notes}`);
    }
  }

  doc.end();
});

// GET /api/dashboard/admin-overview
// Admin-only summary for the Overview tab in the admin panel
router.get('/admin-overview', requireAdmin, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  // Totals
  const classrooms_total = db.prepare('SELECT COUNT(*) AS n FROM classrooms').get().n;
  const equipment_total  = db.prepare('SELECT COUNT(*) AS n FROM equipment').get().n;
  const technicians_total = db.prepare(
    "SELECT COUNT(*) AS n FROM users WHERE role = 'technician'"
  ).get().n;

  // Classrooms checked today (at least one submission today)
  const classrooms_checked_today = db.prepare(`
    SELECT COUNT(DISTINCT classroom_id) AS n FROM checklist_submissions
    WHERE submission_date = ?
  `).get(today).n;

  // Unchecked classrooms today
  const uncheckedRows = db.prepare(`
    SELECT c.name FROM classrooms c
    WHERE c.id NOT IN (
      SELECT DISTINCT classroom_id FROM checklist_submissions WHERE submission_date = ?
    )
    ORDER BY c.name
  `).all(today);
  const classrooms_unchecked = uncheckedRows.map((r) => r.name);

  // Flagged items today (working = not flagged; anything else is flagged)
  const flagged_today = db.prepare(`
    SELECT COUNT(*) AS n FROM checklist_items ci
    JOIN checklist_submissions cs ON ci.submission_id = cs.id
    WHERE cs.submission_date = ? AND ci.status != 'working'
  `).get(today).n;

  // Top 5 flagged items today with context
  const top_flagged_today = db.prepare(`
    SELECT e.name AS equipment_name,
           c.name AS classroom_name,
           ci.status,
           ci.notes,
           u.full_name AS technician
    FROM checklist_items ci
    JOIN checklist_submissions cs ON ci.submission_id = cs.id
    JOIN equipment e ON ci.equipment_id = e.id
    JOIN classrooms c ON cs.classroom_id = c.id
    JOIN users u ON cs.technician_id = u.id
    WHERE cs.submission_date = ? AND ci.status != 'working'
    ORDER BY ci.status DESC, c.name
    LIMIT 5
  `).all(today);

  // Top 5 most problematic equipment (last 30 days)
  const top_problem_equipment = db.prepare(`
    SELECT e.name AS equipment_name,
           COUNT(*) AS issue_count
    FROM checklist_items ci
    JOIN checklist_submissions cs ON ci.submission_id = cs.id
    JOIN equipment e ON ci.equipment_id = e.id
    WHERE cs.submission_date >= ? AND ci.status != 'working'
    GROUP BY e.id
    ORDER BY issue_count DESC
    LIMIT 5
  `).all(thirtyDaysAgo);

  // Recent audit log entries (last 5)
  let recent_audit = [];
  try {
    recent_audit = db.prepare(`
      SELECT al.action, al.details, al.created_at, u.full_name AS actor
      FROM audit_log al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT 5
    `).all();
  } catch (_) {
    // audit_log table may not exist in all deployments
  }

  res.json({
    classrooms_total,
    equipment_total,
    technicians_total,
    classrooms_checked_today,
    classrooms_unchecked,
    flagged_today,
    top_flagged_today,
    top_problem_equipment,
    recent_audit,
  });
});

module.exports = router;

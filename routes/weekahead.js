'use strict';

const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const crypto = require('crypto');
const db = require('../db/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = express.Router();

// Multer — accept single .xlsx file up to 5 MB, memory storage only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.xlsx')) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx files are allowed'));
    }
  },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

const MONTH_MAP = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7,
  sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse a day-label like "Monday 24 February 2025" → "2025-02-24".
 * Returns null if the label cannot be parsed.
 */
function parseDayLabel(label) {
  if (!label || typeof label !== 'string') return null;
  // Pattern: optional weekday, day number, month name, year
  const m = label.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monthIdx = MONTH_MAP[m[2].toLowerCase()];
  const year = parseInt(m[3], 10);
  if (monthIdx === undefined || isNaN(day) || isNaN(year)) return null;
  const dd = String(day).padStart(2, '0');
  const mm = String(monthIdx + 1).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * Parse the uploaded XLSX buffer into an array of event objects grouped by date.
 * Expected sheet layout:
 *   Row with cell[0]="DATE" and cell[1]="Monday 24 February 2025" → date header
 *   Subsequent non-blank rows → events for that date
 *   Columns: TIMES(0), VENUE(1), COMPANY/COURSE(2), Contact(3), Pax campus(4),
 *            Pax zoom(5), Lecturer(6), Syndicates(7), Tech(8), IT support(9)
 */
function parseWeekAheadXlsx(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('Workbook has no sheets');

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

  const events = [];
  let currentDate = null;
  let currentDayLabel = '';

  for (const row of rows) {
    const cell0 = String(row[0] || '').trim().toUpperCase();

    // Detect DATE header row — scan across merged cells for the label
    if (cell0 === 'DATE') {
      let dayLabel = '';
      for (let i = 1; i < row.length; i++) {
        const v = String(row[i] || '').trim();
        if (v) { dayLabel = v; break; }
      }
      const parsed = parseDayLabel(dayLabel);
      if (parsed) {
        currentDate = parsed;
        currentDayLabel = dayLabel;
      }
      continue;
    }

    // Skip header row (TIMES, VENUE, …) or blank rows
    if (cell0 === 'TIMES' || cell0 === '') continue;
    if (!currentDate) continue;

    // This is an event row
    const timeRange = String(row[0] || '').trim();
    const venue = String(row[1] || '').trim();
    const companyCourse = String(row[2] || '').trim();

    // Skip rows where all key fields are empty
    if (!timeRange && !venue && !companyCourse) continue;
    // Skip summary/header rows that don't start with a time (e.g. "TOTAL DELEGATES", "Day", "Various")
    if (!/^\d{1,2}[:h]\d{2}/.test(timeRange)) continue;

    events.push({
      event_date: currentDate,
      day_label: currentDayLabel,
      time_range: timeRange,
      venue,
      company_course: companyCourse,
      contact_person: String(row[3] || '').trim(),
      pax_campus: parseInt(row[4], 10) || 0,
      pax_zoom: parseInt(row[5], 10) || 0,
      lecturer: String(row[6] || '').trim(),
      syndicates_other_venues: String(row[7] || '').trim(),
      assigned_tech: String(row[8] || '').trim(),
      it_support_required: String(row[9] || '').trim(),
    });
  }

  return events;
}

// ── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/week-ahead/upload
 * Technician uploads XLSX → parse → store events.
 * Auto-replaces events for overlapping dates.
 */
router.post('/upload', requireAuth, (req, res, next) => {
  // Only technicians can upload
  if (req.session.user.role !== 'technician') {
    return res.status(403).json({ error: 'Only technicians can upload schedules' });
  }
  next();
}, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  let events;
  try {
    events = parseWeekAheadXlsx(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ error: `Failed to parse file: ${err.message}` });
  }

  if (!events.length) {
    return res.status(400).json({ error: 'No events found in the uploaded file' });
  }

  const batchId = crypto.randomUUID();
  const userId = req.session.user.id;
  const dates = events.map(e => e.event_date).sort();
  const weekStart = dates[0];
  const weekEnd = dates[dates.length - 1];

  // Auto-replace: delete existing events for overlapping dates
  const uniqueDates = [...new Set(dates)];
  const deletePlaceholders = uniqueDates.map(() => '?').join(',');

  const insertBatch = db.transaction(() => {
    // Remove old events for these dates
    db.prepare(
      `DELETE FROM week_ahead_events WHERE event_date IN (${deletePlaceholders})`
    ).run(...uniqueDates);

    // Remove orphaned uploads (uploads with no remaining events)
    db.exec(`DELETE FROM week_ahead_uploads WHERE id NOT IN (SELECT DISTINCT upload_batch_id FROM week_ahead_events) AND id != '${batchId}'`);

    // Insert upload record
    db.prepare(`
      INSERT INTO week_ahead_uploads (id, filename, week_start, week_end, row_count, uploaded_by_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(batchId, req.file.originalname, weekStart, weekEnd, events.length, userId);

    // Insert events
    const ins = db.prepare(`
      INSERT INTO week_ahead_events
        (event_date, day_label, time_range, venue, company_course, contact_person,
         pax_campus, pax_zoom, lecturer, syndicates_other_venues, assigned_tech,
         it_support_required, upload_batch_id, uploaded_by_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const e of events) {
      ins.run(
        e.event_date, e.day_label, e.time_range, e.venue, e.company_course,
        e.contact_person, e.pax_campus, e.pax_zoom, e.lecturer,
        e.syndicates_other_venues, e.assigned_tech, e.it_support_required,
        batchId, userId
      );
    }
  });

  insertBatch();
  logAudit(req, 'weekahead.upload', 'week_ahead_uploads', batchId,
    `${events.length} events for ${weekStart} to ${weekEnd}`);

  res.status(201).json({
    batch_id: batchId,
    filename: req.file.originalname,
    week_start: weekStart,
    week_end: weekEnd,
    event_count: events.length,
    dates: uniqueDates,
  });
});

/**
 * GET /api/week-ahead
 * Returns today's events (or events for ?date=YYYY-MM-DD).
 */
router.get('/', requireAuth, (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const events = db.prepare(`
    SELECT e.*, u.full_name AS uploaded_by_name
    FROM week_ahead_events e
    LEFT JOIN users u ON u.id = e.uploaded_by_id
    WHERE e.event_date = ?
    ORDER BY e.time_range ASC
  `).all(date);
  res.json(events);
});

/**
 * GET /api/week-ahead/week
 * Returns a full week of events starting from ?start=YYYY-MM-DD (defaults to current Monday).
 */
router.get('/week', requireAuth, (req, res) => {
  let start = req.query.start;
  if (!start) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    start = monday.toISOString().slice(0, 10);
  }
  // Compute end = start + 6 days
  const startDate = new Date(start + 'T00:00:00');
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  const end = endDate.toISOString().slice(0, 10);

  const events = db.prepare(`
    SELECT e.*, u.full_name AS uploaded_by_name
    FROM week_ahead_events e
    LEFT JOIN users u ON u.id = e.uploaded_by_id
    WHERE e.event_date BETWEEN ? AND ?
    ORDER BY e.event_date ASC, e.time_range ASC
  `).all(start, end);
  res.json(events);
});

/**
 * GET /api/week-ahead/uploads
 * Returns upload history. Technicians see own, admins see all.
 */
router.get('/uploads', requireAuth, (req, res) => {
  const user = req.session.user;
  let uploads;
  if (user.role === 'admin') {
    uploads = db.prepare(`
      SELECT wu.*, u.full_name AS uploaded_by_name
      FROM week_ahead_uploads wu
      LEFT JOIN users u ON u.id = wu.uploaded_by_id
      ORDER BY wu.created_at DESC
    `).all();
  } else {
    uploads = db.prepare(`
      SELECT wu.*, u.full_name AS uploaded_by_name
      FROM week_ahead_uploads wu
      LEFT JOIN users u ON u.id = wu.uploaded_by_id
      WHERE wu.uploaded_by_id = ?
      ORDER BY wu.created_at DESC
    `).all(user.id);
  }
  res.json(uploads);
});

/**
 * DELETE /api/week-ahead/:batchId
 * Technicians can delete own batches. Admins can delete any.
 */
router.delete('/:batchId', requireAuth, (req, res) => {
  const { batchId } = req.params;
  const user = req.session.user;

  const batch = db.prepare('SELECT * FROM week_ahead_uploads WHERE id = ?').get(batchId);
  if (!batch) return res.status(404).json({ error: 'Upload batch not found' });

  if (user.role !== 'admin' && batch.uploaded_by_id !== user.id) {
    return res.status(403).json({ error: 'You can only delete your own uploads' });
  }

  db.prepare('DELETE FROM week_ahead_events WHERE upload_batch_id = ?').run(batchId);
  db.prepare('DELETE FROM week_ahead_uploads WHERE id = ?').run(batchId);

  logAudit(req, 'weekahead.delete', 'week_ahead_uploads', batchId, batch.filename);
  res.json({ success: true });
});

// Handle multer errors (e.g. file too large)
router.use((err, req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large (max 5 MB)' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;

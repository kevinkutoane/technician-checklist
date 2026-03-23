'use strict';

const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = express.Router();
router.use(requireAuth);

// GET /api/onboarding
router.get('/', (req, res) => {
  const { limit = 50, start_date, end_date, technician_id } = req.query;
  const isAdmin = req.session.user.role === 'admin';
  const safeLimit = Math.min(Number(limit) || 50, 200);

  let sql = `
    SELECT o.*, u.full_name as technician_name, u.username as technician_username
    FROM asset_agreements o
    JOIN users u ON o.technician_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (!isAdmin) {
    sql += ' AND o.technician_id = ?';
    params.push(req.session.user.id);
  } else if (technician_id) {
    sql += ' AND o.technician_id = ?';
    params.push(technician_id);
  }

  if (start_date) {
    sql += ' AND o.submission_date >= ?';
    params.push(start_date);
  }
  if (end_date) {
    sql += ' AND o.submission_date <= ?';
    params.push(end_date);
  }

  sql += ' ORDER BY o.created_at DESC LIMIT ?';
  params.push(safeLimit);

  const submissions = db.prepare(sql).all(...params);
  res.json(submissions);
});

// POST /api/onboarding
router.post('/', (req, res) => {
  const {
    employee_name, laptop_serial_number, sim_card_number,
    dongle, laptop_charger, laptop_bag, mouse, monitor, keyboard,
    signature_data,
  } = req.body;

  if (!employee_name) {
    return res.status(400).json({ error: 'Employee name is required' });
  }

  // Validate signature_data is a plain base64 data URL string (no executable content)
  let safeSignature = '';
  if (signature_data && typeof signature_data === 'string' && signature_data.startsWith('data:image/')) {
    safeSignature = signature_data;
  }

  const submission_date = new Date().toISOString().slice(0, 10);
  const technician_id = req.session.user.id;

  const stmt = db.prepare(`
    INSERT INTO asset_agreements (
      technician_id, employee_name, laptop_serial_number, sim_card_number,
      dongle, laptop_charger, laptop_bag, mouse, monitor, keyboard,
      submission_date, signature_data
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  try {
    const result = stmt.run(
      technician_id, employee_name.trim(), (laptop_serial_number || '').trim(), (sim_card_number || '').trim(),
      dongle ? 1 : 0, laptop_charger ? 1 : 0, laptop_bag ? 1 : 0,
      mouse ? 1 : 0, monitor ? 1 : 0, keyboard ? 1 : 0,
      submission_date, safeSignature
    );
    logAudit(req, 'asset_agreement.submit', 'asset_agreement', result.lastInsertRowid,
      `Employee: ${employee_name.trim()}`);
    res.status(201).json({ id: result.lastInsertRowid, success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save asset agreement' });
  }
});

// GET /api/onboarding/export  — download a single asset agreement as PDF
router.get('/export', (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id is required' });

  const isAdmin = req.session.user.role === 'admin';
  const submission = db.prepare(`
    SELECT o.*, u.full_name AS technician_name
    FROM asset_agreements o
    JOIN users u ON o.technician_id = u.id
    WHERE o.id = ?
  `).get(id);

  if (!submission) return res.status(404).json({ error: 'Asset agreement not found' });
  if (!isAdmin && submission.technician_id !== Number(req.session.user.id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="asset-agreement-${submission.id}.pdf"`);
  doc.pipe(res);

  doc.fontSize(22).fillColor('#2563eb').text('Asset Agreement', { align: 'center' });
  doc.fontSize(11).fillColor('#6b7280').text(`Date: ${submission.submission_date}  |  Issued by: ${submission.technician_name}`, { align: 'center' });
  doc.moveDown();

  doc.fontSize(13).fillColor('#111827').text('Employee Details', { underline: true });
  doc.moveDown(0.4);
  doc.fontSize(11).fillColor('#374151');
  doc.text(`Employee Name: ${submission.employee_name}`);
  if (submission.laptop_serial_number) doc.text(`Laptop Serial Number: ${submission.laptop_serial_number}`);
  if (submission.sim_card_number) doc.text(`SIM Card Number: ${submission.sim_card_number}`);
  doc.moveDown();

  doc.fontSize(13).fillColor('#111827').text('Equipment Issued', { underline: true });
  doc.moveDown(0.4);
  const items = [
    ['dongle',         'Dongle'],
    ['laptop_charger', 'Laptop Charger'],
    ['laptop_bag',     'Laptop Bag'],
    ['mouse',          'Mouse'],
    ['monitor',        'Monitor'],
    ['keyboard',       'Keyboard'],
  ];
  for (const [key, label] of items) {
    const included = submission[key] === 1;
    doc.fontSize(11).fillColor(included ? '#16a34a' : '#9ca3af')
       .text(`${included ? '[x]' : '[ ]'}  ${label}`);
  }

  doc.moveDown(1.5);
  doc.fontSize(10).fillColor('#374151')
     .text('Agreement: I confirm that the above equipment was issued to me upon commencing employment with GIBS. I agree that upon my termination of employment with GIBS, I will return all IT equipment and campus access cards.', { width: 480 });

  doc.moveDown(2.5);
  // Signature area
  if (submission.signature_data && submission.signature_data.startsWith('data:image/')) {
    try {
      // Convert data URL to buffer for pdfkit
      const base64 = submission.signature_data.split(',')[1];
      const imgBuffer = Buffer.from(base64, 'base64');
      doc.text('Employee Signature:', { continued: false });
      doc.image(imgBuffer, { width: 200, height: 60 });
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#6b7280').text('Date: ' + submission.submission_date);
    } catch (_) {
      // Signature image failed — fall back to blank line
      doc.fontSize(10).fillColor('#374151').text('___________________________          ___________________________');
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#6b7280').text('Employee Signature                         Date');
    }
  } else {
    doc.fontSize(10).fillColor('#374151').text('___________________________          ___________________________');
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#6b7280').text('Employee Signature                         Date');
  }

  doc.moveDown();
  doc.fontSize(9).fillColor('#9ca3af').text(`Generated ${new Date().toLocaleString()}`, { align: 'right' });
  doc.end();
});

module.exports = router;

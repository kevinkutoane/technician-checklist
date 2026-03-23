'use strict';

const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/qa
router.get('/', (req, res) => {
  const { limit = 50, start_date, end_date, technician_id } = req.query;
  const isAdmin = req.session.user.role === 'admin';
  const safeLimit = Math.min(Number(limit) || 50, 200);

  let sql = `
    SELECT q.*, u.full_name as technician_name
    FROM qa_submissions q
    JOIN users u ON q.technician_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (!isAdmin) {
    sql += ' AND q.technician_id = ?';
    params.push(req.session.user.id);
  } else if (technician_id) {
    sql += ' AND q.technician_id = ?';
    params.push(technician_id);
  }

  if (start_date) {
    sql += ' AND q.submission_date >= ?';
    params.push(start_date);
  }
  if (end_date) {
    sql += ' AND q.submission_date <= ?';
    params.push(end_date);
  }

  sql += ' ORDER BY q.created_at DESC LIMIT ?';
  params.push(safeLimit);

  const submissions = db.prepare(sql).all(...params);
  res.json(submissions);
});

// POST /api/qa
router.post('/', (req, res) => {
  const body = req.body;
  if (!body.username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const submission_date = new Date().toISOString().slice(0, 10);
  const technician_id = req.session.user.id;

  const b = (val) => (val ? 1 : 0);

  const stmt = db.prepare(`
    INSERT INTO qa_submissions (
      technician_id, username, machine_serial, call_ref,
      backup_user_profile, backup_internet_favorites, backup_outlook_cache,
      join_domain, windows_updates, drivers_3g, windows_defender, mimecast_mso,
      bios_updated, vpn_setup, remove_local_admin, onedrive_home_dir,
      mapped_drive, onedrive_default_save, nic_power_management,
      staff_distribution_list, intranet_homepage, direct_shortcut,
      rendezvous_shortcut, windows_activated, office_activated,
      private_wifi, accpac_installed, test_vga, test_usb,
      klite_codec, regional_settings, register_office_credentials,
      printers_installed, other_software, submission_date
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?
    )
  `);

  try {
    const result = stmt.run(
      technician_id, body.username.trim(), (body.machine_serial || '').trim(), (body.call_ref || '').trim(),
      b(body.backup_user_profile), b(body.backup_internet_favorites), b(body.backup_outlook_cache),
      b(body.join_domain), b(body.windows_updates), b(body.drivers_3g), b(body.windows_defender), b(body.mimecast_mso),
      b(body.bios_updated), b(body.vpn_setup), b(body.remove_local_admin), b(body.onedrive_home_dir),
      b(body.mapped_drive), b(body.onedrive_default_save), b(body.nic_power_management),
      b(body.staff_distribution_list), b(body.intranet_homepage), b(body.direct_shortcut),
      b(body.rendezvous_shortcut), b(body.windows_activated), b(body.office_activated),
      b(body.private_wifi), b(body.accpac_installed), b(body.test_vga), b(body.test_usb),
      b(body.klite_codec), b(body.regional_settings), b(body.register_office_credentials),
      (body.printers_installed || '').trim(), (body.other_software || '').trim(), submission_date
    );
    res.status(201).json({ id: result.lastInsertRowid, success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save QA Checklist' });
  }
});

// GET /api/qa/export  — download a single QA submission as PDF
router.get('/export', (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id is required' });

  const isAdmin = req.session.user.role === 'admin';
  const submission = db.prepare(`
    SELECT q.*, u.full_name AS technician_name
    FROM qa_submissions q
    JOIN users u ON q.technician_id = u.id
    WHERE q.id = ?
  `).get(id);

  if (!submission) return res.status(404).json({ error: 'QA submission not found' });
  if (!isAdmin && submission.technician_id !== Number(req.session.user.id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="qa-checklist-${submission.id}.pdf"`);
  doc.pipe(res);

  doc.fontSize(20).fillColor('#2563eb').text('QA Checklist', { align: 'center' });
  doc.fontSize(11).fillColor('#6b7280').text(`Date: ${submission.submission_date}  |  Technician: ${submission.technician_name}`, { align: 'center' });
  doc.moveDown();

  doc.fontSize(13).fillColor('#111827').text('Setup Details', { underline: true });
  doc.moveDown(0.4);
  doc.fontSize(11).fillColor('#374151');
  doc.text(`Username: ${submission.username}`);
  if (submission.machine_serial) doc.text(`Machine Serial: ${submission.machine_serial}`);
  if (submission.call_ref) doc.text(`Call Ref: ${submission.call_ref}`);
  doc.moveDown();

  const checks = [
    ['backup_user_profile',        'Backup & Restore: User Profile'],
    ['backup_internet_favorites',  'Backup & Restore: Internet Favorites'],
    ['backup_outlook_cache',       'Backup & Restore: Outlook Email Cache Working'],
    ['join_domain',                'Join computer to GIBS domain'],
    ['windows_updates',            'Latest Windows updates installed'],
    ['drivers_3g',                 'Drivers for internal 3G installed and tested'],
    ['windows_defender',           'Windows Defender installed and healthy'],
    ['mimecast_mso',               'Latest Mimecast MSO installed'],
    ['bios_updated',               'BIOS updated with latest version'],
    ['vpn_setup',                  'VPN connection setup and tested'],
    ['remove_local_admin',         'Local Administrator permissions removed for user'],
    ['onedrive_home_dir',          'User Home directory created on OneDrive'],
    ['mapped_drive',               'Mapped departmental drive'],
    ['onedrive_default_save',      'Set default Save location to OneDrive'],
    ['nic_power_management',       'Power Management for NIC disabled'],
    ['staff_distribution_list',    'User added to GIBS Staff Distribution list'],
    ['intranet_homepage',          'Configure GIBS Intranet as Homepage'],
    ['direct_shortcut',            'Created GIBS Direct shortcut on Desktop'],
    ['rendezvous_shortcut',        'Created Rendezvous shortcut on Desktop if required'],
    ['windows_activated',          'Windows activated'],
    ['office_activated',           'Microsoft Office activated'],
    ['private_wifi',               'GIBS Private Wifi setup and set to auto-connect'],
    ['accpac_installed',           'Accpac installed if required'],
    ['test_vga',                   'Test ext. VGA port on laptop with LCD monitor'],
    ['test_usb',                   'Test all USB ports and working'],
    ['klite_codec',                'Install latest K-Lite codec pack'],
    ['regional_settings',          'Regional settings set for South Africa'],
    ['register_office_credentials','Register user credentials when opening Office'],
  ];

  doc.fontSize(13).fillColor('#111827').text('Checklist Items', { underline: true });
  doc.moveDown(0.4);
  for (const [key, label] of checks) {
    const done = submission[key] === 1;
    doc.fontSize(10).fillColor(done ? '#16a34a' : '#dc2626')
       .text(`${done ? '[x]' : '[ ]'}  ${label}`);
  }

  doc.moveDown();
  if (submission.printers_installed) {
    doc.fontSize(11).fillColor('#374151').text(`Printers Installed: ${submission.printers_installed}`);
  }
  if (submission.other_software) {
    doc.fontSize(11).fillColor('#374151').text(`Other Software: ${submission.other_software}`);
  }

  doc.moveDown();
  doc.fontSize(9).fillColor('#9ca3af').text(`Generated ${new Date().toLocaleString()}`, { align: 'right' });
  doc.end();
});

module.exports = router;

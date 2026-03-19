'use strict';

const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/qa
router.get('/', (req, res) => {
  const { limit = 50 } = req.query;
  const isAdmin = req.session.user.role === 'admin';

  let sql = `
    SELECT q.*, u.full_name as technician_name
    FROM qa_submissions q
    JOIN users u ON q.technician_id = u.id
  `;
  const params = [];

  if (!isAdmin) {
    sql += ' WHERE q.technician_id = ?';
    params.push(req.session.user.id);
  }

  sql += ' ORDER BY q.created_at DESC LIMIT ?';
  params.push(Number(limit));

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

module.exports = router;

'use strict';

const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/onboarding
router.get('/', (req, res) => {
  const { limit = 50 } = req.query;
  const isAdmin = req.session.user.role === 'admin';

  let sql = `
    SELECT o.*, u.full_name as technician_name, u.username as technician_username
    FROM asset_agreements o
    JOIN users u ON o.technician_id = u.id
  `;
  const params = [];

  if (!isAdmin) {
    sql += ' WHERE o.technician_id = ?';
    params.push(req.session.user.id);
  }

  sql += ' ORDER BY o.created_at DESC LIMIT ?';
  params.push(Number(limit));

  const submissions = db.prepare(sql).all(...params);
  res.json(submissions);
});

// POST /api/onboarding
router.post('/', (req, res) => {
  const {
    employee_name, laptop_serial_number, sim_card_number,
    dongle, laptop_charger, laptop_bag, mouse, monitor, keyboard
  } = req.body;

  if (!employee_name) {
    return res.status(400).json({ error: 'Employee name is required' });
  }

  const submission_date = new Date().toISOString().slice(0, 10);
  const technician_id = req.session.user.id;

  const stmt = db.prepare(`
    INSERT INTO asset_agreements (
      technician_id, employee_name, laptop_serial_number, sim_card_number,
      dongle, laptop_charger, laptop_bag, mouse, monitor, keyboard, submission_date
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  try {
    const result = stmt.run(
      technician_id, employee_name.trim(), (laptop_serial_number || '').trim(), (sim_card_number || '').trim(),
      dongle ? 1 : 0, laptop_charger ? 1 : 0, laptop_bag ? 1 : 0,
      mouse ? 1 : 0, monitor ? 1 : 0, keyboard ? 1 : 0,
      submission_date
    );
    res.status(201).json({ id: result.lastInsertRowid, success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save asset agreement' });
  }
});

module.exports = router;

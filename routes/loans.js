'use strict';

const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = express.Router();
router.use(requireAuth);

// GET /api/loans — outstanding by default; ?status=all for full history
router.get('/', (req, res) => {
  const { status = 'outstanding', limit = 100 } = req.query;
  const safeLimit = Math.min(Number(limit) || 100, 500);

  let sql = `
    SELECT l.*, u.full_name AS logged_by_name, u.username AS logged_by_username
    FROM equipment_loans l
    JOIN users u ON l.technician_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (status === 'outstanding') {
    sql += ' AND l.returned = 0';
  }

  sql += ' ORDER BY l.returned ASC, l.loan_date DESC, l.created_at DESC LIMIT ?';
  params.push(safeLimit);

  const loans = db.prepare(sql).all(...params);
  res.json(loans);
});

// POST /api/loans — log a new loan
router.post('/', (req, res) => {
  const { borrower_name, item_description, notes } = req.body;

  if (!borrower_name || !borrower_name.trim()) {
    return res.status(400).json({ error: 'Borrower name is required' });
  }
  if (!item_description || !item_description.trim()) {
    return res.status(400).json({ error: 'Item description is required' });
  }

  const loan_date = new Date().toISOString().slice(0, 10);
  const technician_id = req.session.user.id;

  const result = db.prepare(`
    INSERT INTO equipment_loans (technician_id, borrower_name, item_description, notes, loan_date)
    VALUES (?, ?, ?, ?, ?)
  `).run(technician_id, borrower_name.trim(), item_description.trim(), (notes || '').trim(), loan_date);

  logAudit(req, 'loan.create', 'equipment_loan', result.lastInsertRowid,
    `${borrower_name.trim()} borrowed: ${item_description.trim()}`);

  res.status(201).json({ id: result.lastInsertRowid, success: true });
});

// PATCH /api/loans/:id/return — mark a loan as returned
router.patch('/:id/return', (req, res) => {
  const { id } = req.params;

  const loan = db.prepare('SELECT * FROM equipment_loans WHERE id = ?').get(id);
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  if (loan.returned) return res.status(400).json({ error: 'Item already marked as returned' });

  const returned_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
  db.prepare('UPDATE equipment_loans SET returned = 1, returned_at = ? WHERE id = ?').run(returned_at, id);

  logAudit(req, 'loan.return', 'equipment_loan', Number(id),
    `${loan.borrower_name} returned: ${loan.item_description}`);

  res.json({ success: true });
});

module.exports = router;

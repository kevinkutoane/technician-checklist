'use strict';

const db = require('../db/database');

/**
 * Write an entry to the audit_log table.
 *
 * @param {object} req         Express request (for user id + IP)
 * @param {string} action      e.g. 'login', 'checklist.submit', 'technician.delete'
 * @param {string} targetType  e.g. 'checklist_submission', 'user', 'classroom'
 * @param {number|null} targetId  The PK of the affected row
 * @param {string} details     Short human-readable description
 */
function logAudit(req, action, targetType = '', targetId = null, details = '') {
  try {
    const userId = req.session && req.session.user ? req.session.user.id : null;
    const ip     = req.ip || req.connection.remoteAddress || '';
    db.prepare(`
      INSERT INTO audit_log (user_id, action, target_type, target_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, action, targetType, targetId, details, ip);
  } catch (err) {
    // Audit logging must never crash the request
    console.error('[audit] Failed to write audit log:', err.message);
  }
}

module.exports = { logAudit };

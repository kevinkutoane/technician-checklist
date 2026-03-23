'use strict';

/**
 * Email alert helper using nodemailer.
 * Reads configuration from environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, ALERT_EMAIL
 *
 * If SMTP_HOST is not set the module logs a warning and sendFlagAlert is a no-op.
 */

const nodemailer = require('nodemailer');
const db = require('../db/database');

const SMTP_HOST  = process.env.SMTP_HOST  || '';
const SMTP_PORT  = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true'; // true for port 465
const SMTP_USER  = process.env.SMTP_USER  || '';
const SMTP_PASS  = process.env.SMTP_PASS  || '';
const ALERT_EMAIL = process.env.ALERT_EMAIL || '';
const FROM_EMAIL  = process.env.FROM_EMAIL  || SMTP_USER || 'noreply@gibs.ac.za';

let transporter = null;

if (SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
} else {
  console.warn('[mailer] SMTP_HOST not set — email alerts disabled');
}

/**
 * Send an alert email when flagged equipment is detected in a checklist submission.
 *
 * @param {Array}  flaggedItems  Array of {equipment_name, status, notes}
 * @param {string} classroomName
 * @param {string} technicianName
 * @param {string} submissionDate YYYY-MM-DD
 */
async function sendFlagAlert(flaggedItems, classroomName, technicianName, submissionDate) {
  if (!transporter) return;

  // Collect recipients: admin users who have set an alert_email preference,
  // or fall back to the ALERT_EMAIL environment variable.
  let recipients = [];
  try {
    const rows = db.prepare(`
      SELECT up.pref_value AS email
      FROM user_preferences up
      JOIN users u ON u.id = up.user_id
      WHERE u.role = 'admin' AND up.pref_key = 'alert_email'
        AND up.pref_value != ''
    `).all();
    recipients = rows.map((r) => r.email);
  } catch (_) { /* table not yet created */ }

  if (recipients.length === 0 && ALERT_EMAIL) recipients = [ALERT_EMAIL];
  if (recipients.length === 0) return;

  const subject = `[Checklist Alert] Flagged equipment in ${classroomName} — ${submissionDate}`;

  const rows = flaggedItems.map((item) => {
    const statusLabel = item.status === 'not_working' ? '❌ Not Working' : '⚠️ Needs Repair';
    const notes = item.notes ? ` — ${item.notes}` : '';
    return `<tr><td style="padding:4px 8px">${item.equipment_name}</td><td style="padding:4px 8px">${statusLabel}${notes}</td></tr>`;
  }).join('');

  const html = `
    <h2 style="color:#ef4444">Equipment Alert — ${classroomName}</h2>
    <p><strong>Date:</strong> ${submissionDate}<br/>
       <strong>Reported by:</strong> ${technicianName}</p>
    <table border="1" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
      <thead><tr style="background:#f3f4f6">
        <th style="padding:4px 8px">Equipment</th>
        <th style="padding:4px 8px">Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="color:#6b7280;font-size:12px;margin-top:16px">
      This is an automated alert from the GIBS Technician Checklist system.
    </p>
  `;

  try {
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: recipients.join(','),
      subject,
      html,
    });
  } catch (err) {
    console.error('[mailer] Failed to send flag alert:', err.message);
  }
}

module.exports = { sendFlagAlert };

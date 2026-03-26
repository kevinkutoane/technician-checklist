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

// Escape user-supplied content before inserting into HTML email bodies
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
    const notes = item.notes ? ` — ${escHtml(item.notes)}` : '';
    return `<tr><td style="padding:4px 8px">${escHtml(item.equipment_name)}</td><td style="padding:4px 8px">${statusLabel}${notes}</td></tr>`;
  }).join('');

  const html = `
    <h2 style="color:#ef4444">Equipment Alert — ${escHtml(classroomName)}</h2>
    <p><strong>Date:</strong> ${escHtml(submissionDate)}<br/>
       <strong>Reported by:</strong> ${escHtml(technicianName)}</p>
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

/**
 * Send a password-reset email to an admin user.
 *
 * @param {string} toEmail   Recipient email address
 * @param {string} resetLink Full URL to the reset page (includes token query param)
 * @param {string} username  Admin's username (used for personalisation)
 */
async function sendPasswordReset(toEmail, resetLink, username) {
  if (!transporter) return;

  const subject = '[Technician Checklist] Password Reset Request';
  const html = `
    <h2 style="color:#4f46e5">Password Reset</h2>
    <p>Hi <strong>${escHtml(username)}</strong>,</p>
    <p>We received a request to reset your password. Click the button below to choose a new one.
       This link is valid for <strong>1 hour</strong> and can only be used once.</p>
    <p style="margin:1.5rem 0">
      <a href="${escHtml(resetLink)}"
         style="background:#4f46e5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
        Reset My Password
      </a>
    </p>
    <p>If the button doesn't work, copy and paste this link into your browser:<br/>
       <a href="${escHtml(resetLink)}">${escHtml(resetLink)}</a></p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:1.5rem 0"/>
    <p style="color:#6b7280;font-size:12px">
      If you did not request a password reset, you can safely ignore this email — your password will not change.<br/>
      This is an automated message from the GIBS Technician Checklist system.
    </p>
  `;

  try {
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: toEmail,
      subject,
      html,
    });
  } catch (err) {
    console.error('[mailer] Failed to send password reset email:', err.message);
  }
}

module.exports = { sendFlagAlert, sendPasswordReset };

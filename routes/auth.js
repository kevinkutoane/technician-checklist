'use strict';

const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { sendPasswordReset } = require('../utils/mailer');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  try {
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Regenerate session to prevent session fixation attacks
    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) return reject(err);
        req.session.user = {
          id: user.id,
          username: user.username,
          full_name: user.full_name,
          role: user.role,
        };
        resolve();
      });
    });

    return res.json({
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
    });
  } catch {
    return res.status(500).json({ error: 'Authentication error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Session destroy error:', err);
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out' });
  });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json(req.session.user);
});

// POST /api/auth/forgot-password
// Accepts { identifier } — a username or email address.
// Only admin accounts can trigger a self-service reset.
// Always returns a neutral message to prevent user enumeration.
router.post('/forgot-password', async (req, res) => {
  const { identifier } = req.body;
  const neutral = { message: 'If an account exists for that username or email, a reset link has been sent.' };

  if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
    return res.json(neutral);
  }

  const cleaned = identifier.trim();

  // Look for an admin with matching username or email
  const user = db.prepare(
    "SELECT id, username, email FROM users WHERE role = 'admin' AND (username = ? OR email = ?)"
  ).get(cleaned, cleaned);

  // Always respond neutrally — even if no account was found
  if (!user || !user.email) {
    return res.json(neutral);
  }

  try {
    // Generate a cryptographically random token (32 bytes = 64 hex chars)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expires = Date.now() + 60 * 60 * 1000; // 1 hour

    db.prepare(
      'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?'
    ).run(tokenHash, expires, user.id);

    const APP_URL = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
    const resetLink = `${APP_URL}/reset-password?token=${rawToken}`;
    await sendPasswordReset(user.email, resetLink, user.username);
  } catch (err) {
    console.error('[auth] forgot-password error:', err.message);
  }

  res.json(neutral);
});

// POST /api/auth/reset-password
// Accepts { token, newPassword }.
// Validates the token, hashes the new password, and clears the token (single-use).
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({ error: 'Reset token is required' });
  }
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
  const now = Date.now();

  const user = db.prepare(
    'SELECT id, username FROM users WHERE reset_token = ? AND reset_token_expires > ?'
  ).get(tokenHash, now);

  if (!user) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
  }

  try {
    const hash = await bcrypt.hash(newPassword, 12);
    db.prepare(
      'UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?'
    ).run(hash, user.id);

    res.json({ message: 'Password updated successfully. You can now log in.' });
  } catch (err) {
    console.error('[auth] reset-password error:', err.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;

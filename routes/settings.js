'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPref(userId, key) {
  const row = db.prepare(
    'SELECT pref_value FROM user_preferences WHERE user_id = ? AND pref_key = ?'
  ).get(userId, key);
  return row ? row.pref_value : null;
}

function setPref(userId, key, value) {
  db.prepare(`
    INSERT INTO user_preferences (user_id, pref_key, pref_value, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, pref_key) DO UPDATE SET pref_value = excluded.pref_value,
                                                  updated_at = excluded.updated_at
  `).run(userId, key, value);
}

// ── Profile ───────────────────────────────────────────────────────────────────

// GET /api/settings/profile
router.get('/profile', (req, res) => {
  const user = db.prepare('SELECT full_name, username, email FROM users WHERE id = ?')
    .get(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// PUT /api/settings/profile
router.put('/profile', (req, res) => {
  const { full_name, username, email, current_password, new_password } = req.body;

  if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
    return res.status(400).json({ error: 'Display name is required' });
  }
  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const cleanName = full_name.trim();
  const cleanUsername = username.trim().toLowerCase();
  const cleanEmail = email && typeof email === 'string' ? email.trim().toLowerCase() : null;

  // Basic email format validation (optional field)
  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  // Username uniqueness check (exclude self)
  const existing = db.prepare(
    'SELECT id FROM users WHERE username = ? AND id != ?'
  ).get(cleanUsername, req.session.user.id);
  if (existing) {
    return res.status(400).json({ error: 'Username already taken' });
  }

  // Password change requested
  if (new_password !== undefined && new_password !== '') {
    if (!current_password) {
      return res.status(400).json({ error: 'Current password required to change password' });
    }
    if (typeof new_password !== 'string' || new_password.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const row = db.prepare('SELECT password FROM users WHERE id = ?')
      .get(req.session.user.id);
    if (!bcrypt.compareSync(current_password, row.password)) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const hash = bcrypt.hashSync(new_password, 12);
    db.prepare('UPDATE users SET full_name = ?, username = ?, email = ?, password = ? WHERE id = ?')
      .run(cleanName, cleanUsername, cleanEmail, hash, req.session.user.id);
  } else {
    db.prepare('UPDATE users SET full_name = ?, username = ?, email = ? WHERE id = ?')
      .run(cleanName, cleanUsername, cleanEmail, req.session.user.id);
  }

  // Refresh session
  req.session.user.full_name = cleanName;
  req.session.user.username = cleanUsername;

  res.json({ success: true });
});

// ── Preferences ───────────────────────────────────────────────────────────────

// GET /api/settings/preferences
router.get('/preferences', (req, res) => {
  const userId = req.session.user.id;
  const theme = getPref(userId, 'theme') || 'light';
  const result = { theme };

  if (req.session.user.role === 'admin') {
    result.alert_email = getPref(userId, 'alert_email') || '';
  }

  res.json(result);
});

// PUT /api/settings/preferences
router.put('/preferences', (req, res) => {
  const userId = req.session.user.id;
  const { theme, alert_email } = req.body;

  if (theme !== undefined) {
    if (theme !== 'light' && theme !== 'dark') {
      return res.status(400).json({ error: 'theme must be "light" or "dark"' });
    }
    setPref(userId, 'theme', theme);
  }

  if (alert_email !== undefined) {
    if (req.session.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can set alert email' });
    }
    // Basic email validation — empty string clears the preference
    const cleaned = typeof alert_email === 'string' ? alert_email.trim() : '';
    if (cleaned !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (cleaned === '') {
      db.prepare('DELETE FROM user_preferences WHERE user_id = ? AND pref_key = ?')
        .run(userId, 'alert_email');
    } else {
      setPref(userId, 'alert_email', cleaned);
    }
  }

  res.json({ success: true });
});

module.exports = router;

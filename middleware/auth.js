'use strict';

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/');
  }
  if (req.session.user.role !== 'admin') {
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return res.redirect('/checklist');
  }
  next();
}

module.exports = { requireAuth, requireAdmin };

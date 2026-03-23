'use strict';

const express = require('express');
const session = require('express-session');
const BetterSqlite3Store = require('better-sqlite3-session-store')(session);
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const checklistRoutes = require('./routes/checklist');
const dashboardRoutes = require('./routes/dashboard');
const onboardingRoutes = require('./routes/onboarding');
const qaRoutes = require('./routes/qa');
const { requireAuth, requireAdmin } = require('./middleware/auth');
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Start scheduled backup (runs daily at 02:00)
require('./utils/backup');

// Security Headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc:  ["'none'"],
      baseUri:    ["'self'"],
      formAction: ["'self'"],
    },
  },
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
const sessionSecret = process.env.SESSION_SECRET || 'checklist-secret-key-change-in-prod';
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new BetterSqlite3Store({ client: db }),
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    },
  })
);

// CSRF protection — validate Origin/Referer for state-mutating API requests
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin || req.headers.referer || '';
  const host = req.headers.host || '';
  if (!origin) return next(); // same-origin requests without Origin header (e.g. curl)
  try {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      return res.status(403).json({ error: 'CSRF check failed' });
    }
  } catch {
    return res.status(403).json({ error: 'CSRF check failed' });
  }
  next();
});

// Rate limiting — strict limit on auth endpoints to prevent brute-force
// Skip entirely during automated tests (TEST_DB is set to ':memory:' in test env)
const isTestEnv = () => !!process.env.TEST_DB;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  skip: isTestEnv,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// General API rate limit
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  skip: isTestEnv,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// General page rate limit
const pageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  skip: isTestEnv,
  standardHeaders: true,
  legacyHeaders: false,
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// ── Page Routes ───────────────────────────────────────────────────────────────

app.get('/', pageLimiter, (req, res) => {
  if (req.session && req.session.user) {
    if (req.session.user.role === 'admin') {
      return res.redirect('/admin');
    }
    return res.redirect('/checklist');
  }
  res.sendFile(path.join(__dirname, 'public', 'pages', 'login.html'));
});

app.get('/checklist', pageLimiter, requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'checklist.html'));
});

app.get('/onboarding', pageLimiter, requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'onboarding.html'));
});

app.get('/qa', pageLimiter, requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'qa.html'));
});

app.get('/dashboard', pageLimiter, requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'dashboard.html'));
});

app.get('/admin', pageLimiter, requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'admin.html'));
});

// ── API Routes ────────────────────────────────────────────────────────────────

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api', apiLimiter, adminRoutes);          // classrooms, equipment, technicians under /api
app.use('/api/checklists', apiLimiter, checklistRoutes);
app.use('/api/dashboard', apiLimiter, dashboardRoutes);
app.use('/api/onboarding', apiLimiter, onboardingRoutes);
app.use('/api/qa', apiLimiter, qaRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Technician Checklist running on http://localhost:${PORT}`);
  });
}

module.exports = app;

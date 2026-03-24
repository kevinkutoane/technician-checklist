'use strict';
// Must be first — sets TEST_DB before anything else is required
const { setupTestDb } = require('./helpers/testDb');
const request = require('supertest');

// Force module re-evaluation with the in-memory DB (preserve db/database so seeds are shared)
Object.keys(require.cache).forEach((k) => {
  if (!k.includes('node_modules') && !k.includes('testDb') && !k.endsWith('database.js')) {
    delete require.cache[k];
  }
});

const app = require('../server');

beforeAll(() => {
  setupTestDb();
});

// ─── Helper: obtain a session cookie by logging in ───────────────────────────
async function loginAs(username, password = 'admin123') {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username, password });
  return res.headers['set-cookie'];
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
describe('POST /api/auth/login', () => {
  test('valid admin credentials returns 200 with user object', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('admin');
    expect(res.body.role).toBe('admin');
    expect(res.body).not.toHaveProperty('password');
  });

  test('valid technician credentials returns 200', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'tech1', password: 'tech123' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('technician');
  });

  test('wrong password returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrongpass' });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('unknown user returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'anything' });
    expect(res.status).toBe(401);
  });

  test('empty credentials returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: '', password: '' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('missing body fields returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});
    expect(res.status).toBe(400);
  });

  test('response does not leak password hash', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    expect(res.body).not.toHaveProperty('password');
  });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
describe('GET /api/auth/me', () => {
  test('authenticated user returns 200 with user info', async () => {
    const cookie = await loginAs('admin');
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('admin');
    expect(res.body.role).toBe('admin');
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('full_name');
  });

  test('unauthenticated returns 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('tech user /me returns technician role', async () => {
    const cookie = await loginAs('tech1', 'tech123');
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('technician');
  });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
describe('POST /api/auth/logout', () => {
  test('authenticated logout returns 200', async () => {
    const cookie = await loginAs('admin');
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
  });

  test('after logout /me returns 401', async () => {
    const cookie = await loginAs('admin');
    await request(app).post('/api/auth/logout').set('Cookie', cookie);
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  test('unauthenticated logout still returns 200 (session destroy is idempotent)', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
  });
});

// ─── Auth guard on protected pages ───────────────────────────────────────────
describe('Auth guard — unauthenticated access to protected routes', () => {
  const protectedApis = [
    ['GET',    '/api/classrooms'],
    ['GET',    '/api/dashboard/summary'],
    ['GET',    '/api/checklists'],
    ['GET',    '/api/onboarding'],
    ['GET',    '/api/qa'],
  ];

  test.each(protectedApis)('%s %s returns 401 without session', async (method, path) => {
    const res = await request(app)[method.toLowerCase()](path);
    expect(res.status).toBe(401);
  });
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
describe('POST /api/auth/forgot-password', () => {
  const NEUTRAL = 'If an account exists for that username or email, a reset link has been sent.';

  test('always returns 200 and neutral message for unknown user', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ identifier: 'nobody' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe(NEUTRAL);
  });

  test('always returns 200 and neutral message for technician account', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ identifier: 'tech1' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe(NEUTRAL);
  });

  test('returns 200 and neutral message for admin without email set', async () => {
    // The seeded admin has no email, so no reset is sent — but response is still neutral
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ identifier: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe(NEUTRAL);
  });

  test('empty identifier returns neutral message (not 400)', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ identifier: '' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe(NEUTRAL);
  });

  test('missing identifier returns neutral message', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.message).toBe(NEUTRAL);
  });
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
describe('POST /api/auth/reset-password', () => {
  const crypto = require('crypto');
  const db = require('../db/database');

  function plantToken(userId, rawToken, expiresOffset = 3600000) {
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?')
      .run(hash, Date.now() + expiresOffset, userId);
  }

  function clearToken(userId) {
    db.prepare('UPDATE users SET reset_token = NULL, reset_token_expires = NULL WHERE id = ?').run(userId);
  }

  test('valid token updates password and clears token', async () => {
    const user = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
    const raw = 'validtoken1234567890abcdef';
    plantToken(user.id, raw);

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: raw, newPassword: 'newpassword99' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');

    // Token should be cleared
    const updated = db.prepare('SELECT reset_token FROM users WHERE id = ?').get(user.id);
    expect(updated.reset_token).toBeNull();

    // Can now log in with the new password
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'newpassword99' });
    expect(login.status).toBe(200);

    // Restore original password for other tests
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, user.id);
  });

  test('expired token returns 400', async () => {
    const user = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
    const raw = 'expiredtoken9999';
    plantToken(user.id, raw, -1000); // already expired

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: raw, newPassword: 'newpassword99' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    clearToken(user.id);
  });

  test('invalid token returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'totallyinvalidtoken', newPassword: 'newpassword99' });
    expect(res.status).toBe(400);
  });

  test('token reuse returns 400', async () => {
    const user = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
    const raw = 'reuse-token-abc123';
    plantToken(user.id, raw);

    // First use — succeeds
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: raw, newPassword: 'firstReset99' });

    // Second use — should fail
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: raw, newPassword: 'secondReset99' });

    expect(res.status).toBe(400);

    // Restore
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, user.id);
  });

  test('password shorter than 8 chars returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'anytoken', newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('missing token returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ newPassword: 'newpassword99' });
    expect(res.status).toBe(400);
  });
});

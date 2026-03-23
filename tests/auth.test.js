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

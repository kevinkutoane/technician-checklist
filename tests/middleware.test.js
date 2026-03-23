'use strict';
const { setupTestDb, getDb } = require('./helpers/testDb');
const request = require('supertest');

Object.keys(require.cache).forEach((k) => {
  if (!k.includes('node_modules') && !k.includes('testDb') && !k.endsWith('database.js')) {
    delete require.cache[k];
  }
});

const app = require('../server');

beforeAll(() => {
  setupTestDb();
});

async function loginAs(username, password = 'admin123') {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username, password });
  return res.headers['set-cookie'];
}

// ═══ requireAuth middleware ═══════════════════════════════════════════════════

describe('requireAuth middleware', () => {
  test('unauthenticated API request returns 401 JSON', async () => {
    const res = await request(app).get('/api/checklists');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Unauthorized');
  });

  test('authenticated request proceeds to handler (200)', async () => {
    const cookie = await loginAs('admin');
    const res = await request(app).get('/api/checklists').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });
});

// ═══ requireAdmin middleware ══════════════════════════════════════════════════

describe('requireAdmin middleware', () => {
  test('unauthenticated request returns 401', async () => {
    const res = await request(app).get('/api/technicians');
    expect(res.status).toBe(401);
  });

  test('technician role returns 403', async () => {
    const cookie = await loginAs('tech1', 'tech123');
    const res = await request(app).get('/api/technicians').set('Cookie', cookie);
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error', 'Forbidden');
  });

  test('admin role proceeds (200)', async () => {
    const cookie = await loginAs('admin');
    const res = await request(app).get('/api/technicians').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });
});

// ═══ logAudit utility ════════════════════════════════════════════════════════

describe('logAudit utility', () => {
  const { logAudit } = require('../middleware/audit');
  const db = getDb();

  function makeReq(user = null) {
    return {
      session: user ? { user } : {},
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
    };
  }

  test('inserts a row into audit_log on happy path', () => {
    const countBefore = db.prepare('SELECT COUNT(*) as n FROM audit_log').get().n;
    logAudit(makeReq({ id: 1, role: 'admin' }), 'test.action', 'test_type', 42, 'Unit test');
    const countAfter = db.prepare('SELECT COUNT(*) as n FROM audit_log').get().n;
    expect(countAfter).toBe(countBefore + 1);
  });

  test('stored row has correct fields', () => {
    logAudit(makeReq({ id: 1, role: 'admin' }), 'test.fields', 'resource', 99, 'Details here');
    const row = db.prepare("SELECT * FROM audit_log WHERE action = 'test.fields'").get();
    expect(row).toBeTruthy();
    expect(row.user_id).toBe(1);
    expect(row.target_id).toBe(99);
    expect(row.target_type).toBe('resource');
    expect(row.details).toBe('Details here');
  });

  test('does not crash when session is missing (user_id stored as null)', () => {
    const req = { session: {}, ip: '', connection: { remoteAddress: '' } };
    expect(() => logAudit(req, 'anon.action', 'type', null, '')).not.toThrow();
    const row = db.prepare("SELECT * FROM audit_log WHERE action = 'anon.action'").get();
    expect(row).toBeTruthy();
    expect(row.user_id).toBeNull();
  });

  test('does not crash when req.session is undefined', () => {
    const req = { ip: '' };
    expect(() => logAudit(req, 'no.session', '', null, '')).not.toThrow();
  });
});

// ═══ Page route redirect branches (non-API paths) ═════════════════════════════

describe('requireAuth redirect (page routes)', () => {
  test('unauthenticated GET /checklist redirects to /', async () => {
    const res = await request(app).get('/checklist');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });
});

describe('requireAdmin redirect (page routes)', () => {
  test('unauthenticated GET /admin redirects to /', async () => {
    const res = await request(app).get('/admin');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  test('technician GET /admin redirects to /checklist', async () => {
    const cookie = await loginAs('tech1', 'tech123');
    const res = await request(app).get('/admin').set('Cookie', cookie);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/checklist');
  });
});

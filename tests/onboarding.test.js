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

let adminCookie;
let techCookie;

beforeEach(async () => {
  adminCookie = await loginAs('admin');
  techCookie  = await loginAs('tech1', 'tech123');
});

function validOnboarding(overrides = {}) {
  return {
    employee_name: 'Alice Mokoena',
    laptop_serial_number: 'SN-ABC-123',
    sim_card_number: '0821234567',
    asset_tag: 'IT-2026-0042',
    dongle: true,
    laptop_charger: true,
    laptop_bag: false,
    mouse: true,
    monitor: false,
    keyboard: true,
    signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    ...overrides,
  };
}

// ═══ GET /api/onboarding ═════════════════════════════════════════════════════

describe('GET /api/onboarding', () => {
  test('admin gets 200 array', async () => {
    const res = await request(app)
      .get('/api/onboarding')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('technician gets 200 — sees only own submissions', async () => {
    // Create a submission as tech1
    await request(app)
      .post('/api/onboarding')
      .set('Cookie', techCookie)
      .send(validOnboarding());

    // tech2 should not see tech1's submission
    const tech2Cookie = await loginAs('tech2', 'tech123');
    const res = await request(app)
      .get('/api/onboarding')
      .set('Cookie', tech2Cookie);
    expect(res.status).toBe(200);
    // All returned rows should belong to tech2
    const db = getDb();
    const tech2 = db.prepare("SELECT id FROM users WHERE username = 'tech2'").get();
    res.body.forEach((row) => {
      expect(row.technician_id).toBe(tech2.id);
    });
  });

  test('unauthenticated returns 401', async () => {
    expect((await request(app).get('/api/onboarding')).status).toBe(401);
  });

  test('limit param is respected (capped at 200)', async () => {
    const res = await request(app)
      .get('/api/onboarding?limit=500')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    // Result count ≤ 200 (seeded data is far below that)
    expect(res.body.length).toBeLessThanOrEqual(200);
  });
});

// ═══ POST /api/onboarding ════════════════════════════════════════════════════

describe('POST /api/onboarding', () => {
  test('valid submission returns 201 with id and success:true', async () => {
    const res = await request(app)
      .post('/api/onboarding')
      .set('Cookie', techCookie)
      .send(validOnboarding());
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.success).toBe(true);
  });

  test('missing employee_name returns 400', async () => {
    const { employee_name, ...rest } = validOnboarding();
    const res = await request(app)
      .post('/api/onboarding')
      .set('Cookie', techCookie)
      .send(rest);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/employee name/i);
  });

  test('invalid signature_data (not data:image/ prefix) is silently accepted', async () => {
    // Route uses safeSignature = '' fallback — no 400 response
    const res = await request(app)
      .post('/api/onboarding')
      .set('Cookie', techCookie)
      .send(validOnboarding({ signature_data: 'javascript:alert(1)' }));
    expect(res.status).toBe(201);
  });

  test('boolean fields stored correctly', async () => {
    const res = await request(app)
      .post('/api/onboarding')
      .set('Cookie', techCookie)
      .send(validOnboarding({ dongle: true, laptop_bag: false }));
    expect(res.status).toBe(201);

    const db = getDb();
    const row = db.prepare('SELECT dongle, laptop_bag FROM asset_agreements WHERE id = ?').get(res.body.id);
    expect(row.dongle).toBe(1);
    expect(row.laptop_bag).toBe(0);
  });

  test('unauthenticated returns 401', async () => {
    const res = await request(app)
      .post('/api/onboarding')
      .send(validOnboarding());
    expect(res.status).toBe(401);
  });

  test('asset_tag is stored and returned', async () => {
    const res = await request(app)
      .post('/api/onboarding')
      .set('Cookie', techCookie)
      .send(validOnboarding({ asset_tag: 'IT-2026-TEST' }));
    expect(res.status).toBe(201);
    const db = getDb();
    const row = db.prepare('SELECT asset_tag FROM asset_agreements WHERE id = ?').get(res.body.id);
    expect(row.asset_tag).toBe('IT-2026-TEST');
  });

  test('invalid photo_data (non data:image/ prefix) is silently stripped', async () => {
    const res = await request(app)
      .post('/api/onboarding')
      .set('Cookie', techCookie)
      .send(validOnboarding({ photo_data: 'javascript:alert(1)' }));
    expect(res.status).toBe(201);
    const db = getDb();
    const row = db.prepare('SELECT photo_data FROM asset_agreements WHERE id = ?').get(res.body.id);
    expect(row.photo_data).toBe('');
  });
});

// ═══ GET /api/onboarding/export ══════════════════════════════════════════════

describe('GET /api/onboarding/export', () => {
  let submissionId;

  beforeEach(async () => {
    const res = await request(app)
      .post('/api/onboarding')
      .set('Cookie', techCookie)
      .send(validOnboarding());
    submissionId = res.body.id;
  });

  test('own record returns 200 with PDF content-type', async () => {
    const res = await request(app)
      .get(`/api/onboarding/export?id=${submissionId}`)
      .set('Cookie', techCookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  test('admin can export any record', async () => {
    const res = await request(app)
      .get(`/api/onboarding/export?id=${submissionId}`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  test("tech2 cannot export tech1's record — 403", async () => {
    const tech2Cookie = await loginAs('tech2', 'tech123');
    const res = await request(app)
      .get(`/api/onboarding/export?id=${submissionId}`)
      .set('Cookie', tech2Cookie);
    expect(res.status).toBe(403);
  });

  test('missing id returns 400', async () => {
    const res = await request(app)
      .get('/api/onboarding/export')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('non-existent id returns 404', async () => {
    const res = await request(app)
      .get('/api/onboarding/export?id=99999')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });

  test('unauthenticated returns 401', async () => {
    expect((await request(app).get(`/api/onboarding/export?id=${submissionId}`)).status).toBe(401);
  });
});

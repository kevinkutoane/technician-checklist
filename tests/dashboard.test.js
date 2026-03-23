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

// ═══ GET /api/dashboard/summary ════════════════════════════════════════════

describe('GET /api/dashboard/summary', () => {
  test('returns 200 with all required keys', async () => {
    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    const keys = [
      'today', 'totalSubmissions', 'flaggedItems', 'notWorkingItems',
      'totalAssetAgreements', 'totalQAChecklists', 'totalClassrooms', 'totalTechnicians',
    ];
    keys.forEach((k) => expect(res.body).toHaveProperty(k));
  });

  test('technician also gets 200', async () => {
    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Cookie', techCookie);
    expect(res.status).toBe(200);
  });

  test('totalClassrooms reflects seeded data (>=2)', async () => {
    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Cookie', adminCookie);
    expect(res.body.totalClassrooms).toBeGreaterThanOrEqual(2);
  });

  test('totalTechnicians counts only technician role users (>=3)', async () => {
    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Cookie', adminCookie);
    expect(res.body.totalTechnicians).toBeGreaterThanOrEqual(3);
  });

  test('unauthenticated returns 401', async () => {
    expect((await request(app).get('/api/dashboard/summary')).status).toBe(401);
  });
});

// ═══ GET /api/dashboard/issues ═══════════════════════════════════════════════

describe('GET /api/dashboard/issues', () => {
  test('returns 200 array (may be empty when no flagged items today)', async () => {
    const res = await request(app)
      .get('/api/dashboard/issues')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('date query param filters correctly', async () => {
    const res = await request(app)
      .get('/api/dashboard/issues?date=2000-01-01')
      .set('Cookie', techCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('unauthenticated returns 401', async () => {
    expect((await request(app).get('/api/dashboard/issues')).status).toBe(401);
  });
});

// ═══ GET /api/dashboard/today-progress ═══════════════════════════════════════

describe('GET /api/dashboard/today-progress', () => {
  test('returns 200 array with required shape', async () => {
    const res = await request(app)
      .get('/api/dashboard/today-progress')
      .set('Cookie', techCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Each item should have the 4 expected keys
    if (res.body.length > 0) {
      const item = res.body[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('submitted_by_me');
      expect(item).toHaveProperty('total_today');
    }
  });

  test('count matches seeded classrooms (>=2 classrooms returned)', async () => {
    const res = await request(app)
      .get('/api/dashboard/today-progress')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  test('submitted_by_me is boolean', async () => {
    const res = await request(app)
      .get('/api/dashboard/today-progress')
      .set('Cookie', techCookie);
    res.body.forEach((item) => {
      expect(typeof item.submitted_by_me).toBe('boolean');
    });
  });

  test('unauthenticated returns 401', async () => {
    expect((await request(app).get('/api/dashboard/today-progress')).status).toBe(401);
  });
});

// ═══ GET /api/dashboard/charts ═══════════════════════════════════════════════

describe('GET /api/dashboard/charts', () => {
  test('admin gets 200 with all chart sections', async () => {
    const res = await request(app)
      .get('/api/dashboard/charts')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('dailyActivity');
    expect(res.body).toHaveProperty('statusMix');
    expect(res.body).toHaveProperty('topClassrooms');
    expect(res.body).toHaveProperty('techActivity');
    // dailyActivity should have 7 labels
    expect(res.body.dailyActivity.labels).toHaveLength(7);
  });

  test('technician gets 403', async () => {
    const res = await request(app)
      .get('/api/dashboard/charts')
      .set('Cookie', techCookie);
    expect(res.status).toBe(403);
  });

  test('unauthenticated returns 401', async () => {
    expect((await request(app).get('/api/dashboard/charts')).status).toBe(401);
  });
});

// ═══ GET /api/dashboard/equipment-trends ════════════════════════════════════

describe('GET /api/dashboard/equipment-trends', () => {
  test('admin + classroom_id returns 200 with labels and datasets', async () => {
    const res = await request(app)
      .get('/api/dashboard/equipment-trends?classroom_id=1')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('classroom');
    expect(res.body).toHaveProperty('labels');
    expect(res.body).toHaveProperty('datasets');
    expect(Array.isArray(res.body.labels)).toBe(true);
    expect(Array.isArray(res.body.datasets)).toBe(true);
  });

  test('default 14 labels returned when no days param', async () => {
    const res = await request(app)
      .get('/api/dashboard/equipment-trends?classroom_id=1')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.labels).toHaveLength(14);
  });

  test('days param is capped at 90', async () => {
    const res = await request(app)
      .get('/api/dashboard/equipment-trends?classroom_id=1&days=200')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.labels).toHaveLength(90);
  });

  test('missing classroom_id returns 400', async () => {
    const res = await request(app)
      .get('/api/dashboard/equipment-trends')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('non-existent classroom_id returns 404', async () => {
    const res = await request(app)
      .get('/api/dashboard/equipment-trends?classroom_id=99999')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });

  test('technician gets 403', async () => {
    const res = await request(app)
      .get('/api/dashboard/equipment-trends?classroom_id=1')
      .set('Cookie', techCookie);
    expect(res.status).toBe(403);
  });
});

// ═══ GET /api/dashboard/export ════════════════════════════════════════════════

describe('GET /api/dashboard/export', () => {
  test('authenticated user gets PDF content-type', async () => {
    const res = await request(app)
      .get('/api/dashboard/export')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  test('export with submission data renders PDF row loop', async () => {
    // Create today's submission so the export query returns rows, covering
    // the for-loop, section headers, status colours and item_notes branches
    const today = new Date().toISOString().slice(0, 10);
    await request(app)
      .post('/api/checklists')
      .set('Cookie', techCookie)
      .send({
        classroom_id: 1,
        submission_date: today,
        general_notes: 'All systems checked',
        items: [
          { equipment_id: 1, status: 'working',     notes: '' },
          { equipment_id: 2, status: 'not_working',  notes: 'Screen cracked' },
          { equipment_id: 3, status: 'needs_repair', notes: '' },
        ],
      });

    const res = await request(app)
      .get('/api/dashboard/export')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  test('technician can export their own data (non-admin scope)', async () => {
    const res = await request(app)
      .get('/api/dashboard/export')
      .set('Cookie', techCookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  test('unauthenticated returns 401', async () => {
    expect((await request(app).get('/api/dashboard/export')).status).toBe(401);
  });
});

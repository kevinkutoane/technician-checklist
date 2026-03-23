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

// Helper: build a valid submission payload for classroom 1
// Seed has equipment IDs 1-3 in classroom 1, IDs 4-5 in classroom 2
function validPayload(overrides = {}) {
  return {
    classroom_id: 1,
    submission_date: '2030-01-15',
    general_notes: 'All good',
    items: [
      { equipment_id: 1, status: 'working', notes: '' },
      { equipment_id: 2, status: 'needs_repair', notes: 'Cracked screen' },
    ],
    ...overrides,
  };
}

// ═══ GET /api/checklists/latest-notes ════════════════════════════════════════

describe('GET /api/checklists/latest-notes', () => {
  test('returns 200 empty array when no previous submissions', async () => {
    const res = await request(app)
      .get('/api/checklists/latest-notes?classroom_id=1')
      .set('Cookie', techCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('missing classroom_id returns 400', async () => {
    const res = await request(app)
      .get('/api/checklists/latest-notes')
      .set('Cookie', techCookie);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('unauthenticated returns 401', async () => {
    expect(
      (await request(app).get('/api/checklists/latest-notes?classroom_id=1')).status
    ).toBe(401);
  });

  test('returns notes from most recent past submission', async () => {
    // Submit with a definitively past date so the query (submission_date < today) picks it up
    await request(app)
      .post('/api/checklists')
      .set('Cookie', techCookie)
      .send({
        classroom_id: 1,
        submission_date: '2020-06-15',
        items: [
          { equipment_id: 1, status: 'working', notes: 'Cleaned lens' },
          { equipment_id: 2, status: 'needs_repair', notes: 'Cracked screen' },
        ],
      });

    const res = await request(app)
      .get('/api/checklists/latest-notes?classroom_id=1')
      .set('Cookie', techCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('equipment_id');
    expect(res.body[0]).toHaveProperty('notes');
  });
});

// ═══ POST /api/checklists ════════════════════════════════════════════════════

describe('POST /api/checklists', () => {
  test('valid submission returns 201 with full submission object', async () => {
    const res = await request(app)
      .post('/api/checklists')
      .set('Cookie', techCookie)
      .send(validPayload());
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.classroom_id).toBe(1);
  });

  test('upsert on same day+classroom returns 201 (idempotent)', async () => {
    const payload = validPayload({ submission_date: '2030-02-10' });
    // First submission
    const first = await request(app)
      .post('/api/checklists')
      .set('Cookie', techCookie)
      .send(payload);
    expect(first.status).toBe(201);

    // Second submission same day+classroom — should upsert, same or new id
    const second = await request(app)
      .post('/api/checklists')
      .set('Cookie', techCookie)
      .send({ ...payload, general_notes: 'Updated notes' });
    expect(second.status).toBe(201);
    // Same submission id (upsert keeps same row)
    expect(second.body.id).toBe(first.body.id);
  });

  test('missing classroom_id returns 400', async () => {
    const { classroom_id, ...rest } = validPayload();
    const res = await request(app)
      .post('/api/checklists')
      .set('Cookie', techCookie)
      .send(rest);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('missing submission_date returns 400', async () => {
    const { submission_date, ...rest } = validPayload();
    const res = await request(app)
      .post('/api/checklists')
      .set('Cookie', techCookie)
      .send(rest);
    expect(res.status).toBe(400);
  });

  test('invalid submission_date format returns 400', async () => {
    const res = await request(app)
      .post('/api/checklists')
      .set('Cookie', techCookie)
      .send(validPayload({ submission_date: '15/01/2030' }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/YYYY-MM-DD/i);
  });

  test('empty items array returns 400', async () => {
    const res = await request(app)
      .post('/api/checklists')
      .set('Cookie', techCookie)
      .send(validPayload({ items: [] }));
    expect(res.status).toBe(400);
  });

  test('invalid status returns 400', async () => {
    const res = await request(app)
      .post('/api/checklists')
      .set('Cookie', techCookie)
      .send(validPayload({
        items: [{ equipment_id: 1, status: 'broken', notes: '' }],
      }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid status/i);
  });

  test('equipment not belonging to classroom returns 400', async () => {
    // equipment_id 4 belongs to classroom 2, not classroom 1
    const res = await request(app)
      .post('/api/checklists')
      .set('Cookie', techCookie)
      .send(validPayload({
        items: [{ equipment_id: 4, status: 'working', notes: '' }],
      }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not belong/i);
  });

  test('unauthenticated returns 401', async () => {
    const res = await request(app)
      .post('/api/checklists')
      .send(validPayload());
    expect(res.status).toBe(401);
  });
});

// ═══ GET /api/checklists ══════════════════════════════════════════════════════

describe('GET /api/checklists', () => {
  beforeEach(async () => {
    // Create a submission as tech1 so there is data
    await request(app)
      .post('/api/checklists')
      .set('Cookie', techCookie)
      .send(validPayload({ submission_date: '2030-03-01' }));
  });

  test('admin sees all submissions', async () => {
    const res = await request(app)
      .get('/api/checklists')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toHaveProperty('technician_name');
    expect(res.body[0]).toHaveProperty('classroom_name');
  });

  test('technician only sees own submissions', async () => {
    // Login as tech2 and do NOT create any submissions for tech2
    const tech2Cookie = await loginAs('tech2', 'tech123');
    const res = await request(app)
      .get('/api/checklists')
      .set('Cookie', tech2Cookie);
    expect(res.status).toBe(200);
    // tech2 has no submissions — should be empty
    expect(res.body.every((s) => s.technician_username === 'tech2')).toBe(true);
  });

  test('date filter works', async () => {
    const res = await request(app)
      .get('/api/checklists?date=2030-03-01')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    res.body.forEach((s) => expect(s.submission_date).toBe('2030-03-01'));
  });

  test('unauthenticated returns 401', async () => {
    expect((await request(app).get('/api/checklists')).status).toBe(401);
  });
});

// ═══ GET /api/checklists/:id ══════════════════════════════════════════════════

describe('GET /api/checklists/:id', () => {
  let submissionId;

  beforeEach(async () => {
    const res = await request(app)
      .post('/api/checklists')
      .set('Cookie', techCookie)
      .send(validPayload({ submission_date: '2030-04-01' }));
    submissionId = res.body.id;
  });

  test('returns 200 with submission data and items array', async () => {
    const res = await request(app)
      .get(`/api/checklists/${submissionId}`)
      .set('Cookie', techCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', submissionId);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBe(2);
  });

  test('non-existent id returns 404', async () => {
    const res = await request(app)
      .get('/api/checklists/99999')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });

  test("tech cannot access another tech's submission", async () => {
    const tech2Cookie = await loginAs('tech2', 'tech123');
    const res = await request(app)
      .get(`/api/checklists/${submissionId}`)
      .set('Cookie', tech2Cookie);
    // tech1's submission — tech2 should be forbidden
    expect(res.status).toBe(403);
  });

  test('admin can access any submission', async () => {
    const res = await request(app)
      .get(`/api/checklists/${submissionId}`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
  });

  test('unauthenticated returns 401', async () => {
    expect((await request(app).get(`/api/checklists/${submissionId}`)).status).toBe(401);
  });
});

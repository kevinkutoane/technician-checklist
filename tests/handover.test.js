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

function validHandover(overrides = {}) {
  return {
    handover_date:          '2026-03-25',
    classroom_id:           1,
    checking_start_time:    '08:00',
    class_start_time:       '09:00',
    programme_name:         'MBA Finance',
    faculty_name:           'Prof. Smith',
    session_producer_name:  'SP Jones',
    programme_manager_name: 'PM Brown',
    services_data:          { pc_working: { ok: true, comments: 'Working fine' } },
    faculty_arrived:        '08:45',
    faculty_comments:       'On time',
    faculty_signature:      '',
    additional_comments:    'All systems clear',
    ...overrides,
  };
}

// ═══ GET /api/handover ═══════════════════════════════════════════════════════

describe('GET /api/handover', () => {
  test('unauthenticated returns 401', async () => {
    const res = await request(app).get('/api/handover');
    expect(res.status).toBe(401);
  });

  test('returns 200 array for technician', async () => {
    const res = await request(app)
      .get('/api/handover')
      .set('Cookie', techCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('returns 200 array for admin', async () => {
    const res = await request(app)
      .get('/api/handover')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ═══ POST /api/handover ══════════════════════════════════════════════════════

describe('POST /api/handover', () => {
  test('unauthenticated returns 401', async () => {
    const res = await request(app).post('/api/handover').send(validHandover());
    expect(res.status).toBe(401);
  });

  test('missing classroom_id returns 400', async () => {
    const { classroom_id, ...rest } = validHandover();
    const res = await request(app)
      .post('/api/handover')
      .set('Cookie', techCookie)
      .send(rest);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/classroom/i);
  });

  test('missing handover_date returns 400', async () => {
    const { handover_date, ...rest } = validHandover();
    const res = await request(app)
      .post('/api/handover')
      .set('Cookie', techCookie)
      .send(rest);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/date/i);
  });

  test('valid payload returns 201 with id', async () => {
    const res = await request(app)
      .post('/api/handover')
      .set('Cookie', techCookie)
      .send(validHandover());
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.success).toBe(true);
  });

  test('invalid faculty_signature is stripped to empty string', async () => {
    const res = await request(app)
      .post('/api/handover')
      .set('Cookie', techCookie)
      .send(validHandover({ faculty_signature: 'INVALID_NOT_BASE64' }));
    expect(res.status).toBe(201);
    const row = getDb().prepare('SELECT faculty_signature FROM classroom_handovers WHERE id = ?').get(res.body.id);
    expect(row.faculty_signature).toBe('');
  });

  test('valid data:image signature is stored correctly', async () => {
    const fakeSig = 'data:image/png;base64,abc123';
    const res = await request(app)
      .post('/api/handover')
      .set('Cookie', techCookie)
      .send(validHandover({ faculty_signature: fakeSig }));
    expect(res.status).toBe(201);
    const row = getDb().prepare('SELECT faculty_signature FROM classroom_handovers WHERE id = ?').get(res.body.id);
    expect(row.faculty_signature).toBe(fakeSig);
  });

  test('services_data is stored as JSON string', async () => {
    const res = await request(app)
      .post('/api/handover')
      .set('Cookie', techCookie)
      .send(validHandover());
    expect(res.status).toBe(201);
    const row = getDb().prepare('SELECT services_data FROM classroom_handovers WHERE id = ?').get(res.body.id);
    const parsed = JSON.parse(row.services_data);
    expect(parsed.pc_working.ok).toBe(true);
  });

  test('admin can also create a handover record', async () => {
    const res = await request(app)
      .post('/api/handover')
      .set('Cookie', adminCookie)
      .send(validHandover());
    expect(res.status).toBe(201);
  });
});

// ═══ GET /api/handover/:id ═══════════════════════════════════════════════════

describe('GET /api/handover/:id', () => {
  test('returns 404 for non-existent record', async () => {
    const res = await request(app)
      .get('/api/handover/99999')
      .set('Cookie', techCookie);
    expect(res.status).toBe(404);
  });

  test('returns full record for existing id with classroom_name', async () => {
    const created = await request(app)
      .post('/api/handover')
      .set('Cookie', techCookie)
      .send(validHandover());
    const res = await request(app)
      .get(`/api/handover/${created.body.id}`)
      .set('Cookie', techCookie);
    expect(res.status).toBe(200);
    expect(res.body.classroom_id).toBe(1);
    expect(res.body.classroom_name).toBe('Room A');
  });
});

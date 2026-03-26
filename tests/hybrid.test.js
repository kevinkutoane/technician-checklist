'use strict';

const { setupTestDb } = require('./helpers/testDb');
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

async function loginAs(username, password = 'tech123') {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username, password });
  return res.headers['set-cookie'];
}

let techCookie;
let tech2Cookie;
let adminCookie;

beforeEach(async () => {
  techCookie  = await loginAs('tech1');
  tech2Cookie = await loginAs('tech2');
  adminCookie = await loginAs('admin', 'admin123');
});

// ─── GET /api/hybrid ─────────────────────────────────────────────────────────
describe('GET /api/hybrid', () => {
  test('unauthenticated returns 401', async () => {
    expect((await request(app).get('/api/hybrid')).status).toBe(401);
  });

  test('technician gets 200 with an array', async () => {
    const res = await request(app).get('/api/hybrid').set('Cookie', techCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('admin gets 200', async () => {
    const res = await request(app).get('/api/hybrid').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─── POST /api/hybrid ────────────────────────────────────────────────────────
describe('POST /api/hybrid', () => {
  test('unauthenticated returns 401', async () => {
    const res = await request(app).post('/api/hybrid').send({ classroom_id: 1 });
    expect(res.status).toBe(401);
  });

  test('missing classroom_id returns 400', async () => {
    const res = await request(app)
      .post('/api/hybrid')
      .set('Cookie', techCookie)
      .send({});
    expect(res.status).toBe(400);
  });

  test('non-existent classroom_id returns 404', async () => {
    const res = await request(app)
      .post('/api/hybrid')
      .set('Cookie', techCookie)
      .send({ classroom_id: 9999 });
    expect(res.status).toBe(404);
  });

  test('technician marks classroom hybrid — 201 with classroom_name and notes', async () => {
    const res = await request(app)
      .post('/api/hybrid')
      .set('Cookie', techCookie)
      .send({ classroom_id: 1, notes: 'Zoom with London office' });
    expect(res.status).toBe(201);
    expect(res.body.classroom_name).toBe('Room A');
    expect(res.body.notes).toBe('Zoom with London office');
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('set_by_name');
  });

  test('re-marking same room updates note — no duplicate in GET list', async () => {
    await request(app)
      .post('/api/hybrid')
      .set('Cookie', techCookie)
      .send({ classroom_id: 2, notes: 'first note' });

    const res = await request(app)
      .post('/api/hybrid')
      .set('Cookie', tech2Cookie)
      .send({ classroom_id: 2, notes: 'updated note' });

    expect(res.status).toBe(201);
    expect(res.body.notes).toBe('updated note');

    const list = await request(app).get('/api/hybrid').set('Cookie', techCookie);
    const room2Entries = list.body.filter((h) => h.classroom_id === 2);
    expect(room2Entries.length).toBe(1);
  });

  test('admin can mark a classroom hybrid', async () => {
    const res = await request(app)
      .post('/api/hybrid')
      .set('Cookie', adminCookie)
      .send({ classroom_id: 1, notes: '' });
    expect(res.status).toBe(201);
  });

  test('marked room appears in GET /api/hybrid list', async () => {
    await request(app)
      .post('/api/hybrid')
      .set('Cookie', techCookie)
      .send({ classroom_id: 1, notes: 'Teams meeting' });

    const list = await request(app).get('/api/hybrid').set('Cookie', techCookie);
    expect(list.body.some((h) => h.classroom_id === 1)).toBe(true);
  });
});

// ─── DELETE /api/hybrid/:id ───────────────────────────────────────────────────
describe('DELETE /api/hybrid/:id', () => {
  async function markHybrid(cookie = techCookie, classroom_id = 1, notes = '') {
    const res = await request(app)
      .post('/api/hybrid')
      .set('Cookie', cookie)
      .send({ classroom_id, notes });
    return res.body.id;
  }

  test('unauthenticated returns 401', async () => {
    const id = await markHybrid();
    expect((await request(app).delete(`/api/hybrid/${id}`)).status).toBe(401);
  });

  test('non-existent id returns 404', async () => {
    const res = await request(app)
      .delete('/api/hybrid/99999')
      .set('Cookie', techCookie);
    expect(res.status).toBe(404);
  });

  test('any technician can clear hybrid — returns 200 {success:true}', async () => {
    const id = await markHybrid(techCookie, 1);
    const res = await request(app)
      .delete(`/api/hybrid/${id}`)
      .set('Cookie', tech2Cookie);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('admin can clear hybrid', async () => {
    const id = await markHybrid(techCookie, 2, 'test');
    const res = await request(app)
      .delete(`/api/hybrid/${id}`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
  });

  test('cleared entry no longer appears in GET /api/hybrid', async () => {
    const id = await markHybrid(techCookie, 1, 'temp');
    await request(app).delete(`/api/hybrid/${id}`).set('Cookie', techCookie);
    const list = await request(app).get('/api/hybrid').set('Cookie', techCookie);
    expect(list.body.find((h) => h.id === id)).toBeUndefined();
  });
});

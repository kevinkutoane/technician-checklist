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

function validLoan(overrides = {}) {
  return {
    borrower_name:    'Jane Doe',
    item_description: 'Laptop Charger',
    notes:            'Returns after 15:00',
    ...overrides,
  };
}

// ═══ GET /api/loans ══════════════════════════════════════════════════════════

describe('GET /api/loans', () => {
  test('returns 200 array for technician', async () => {
    const res = await request(app)
      .get('/api/loans')
      .set('Cookie', techCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('returns 200 array for admin', async () => {
    const res = await request(app)
      .get('/api/loans')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('unauthenticated returns 401', async () => {
    const res = await request(app).get('/api/loans');
    expect(res.status).toBe(401);
  });

  test('status=all returns all loans including returned', async () => {
    // Create and then return a loan
    const create = await request(app)
      .post('/api/loans')
      .set('Cookie', techCookie)
      .send(validLoan());
    await request(app)
      .patch(`/api/loans/${create.body.id}/return`)
      .set('Cookie', techCookie);

    const outstanding = await request(app)
      .get('/api/loans?status=outstanding')
      .set('Cookie', techCookie);
    const all = await request(app)
      .get('/api/loans?status=all')
      .set('Cookie', techCookie);

    // all should include the returned loan; outstanding should not
    expect(all.body.length).toBeGreaterThanOrEqual(outstanding.body.length);
    const returnedInAll = all.body.some(l => l.id === create.body.id && l.returned === 1);
    expect(returnedInAll).toBe(true);
  });
});

// ═══ POST /api/loans ═════════════════════════════════════════════════════════

describe('POST /api/loans', () => {
  test('valid loan returns 201 with id and success:true', async () => {
    const res = await request(app)
      .post('/api/loans')
      .set('Cookie', techCookie)
      .send(validLoan());
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.success).toBe(true);
  });

  test('missing borrower_name returns 400', async () => {
    const { borrower_name, ...rest } = validLoan();
    const res = await request(app)
      .post('/api/loans')
      .set('Cookie', techCookie)
      .send(rest);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/borrower name/i);
  });

  test('missing item_description returns 400', async () => {
    const { item_description, ...rest } = validLoan();
    const res = await request(app)
      .post('/api/loans')
      .set('Cookie', techCookie)
      .send(rest);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/item description/i);
  });

  test('unauthenticated returns 401', async () => {
    const res = await request(app)
      .post('/api/loans')
      .send(validLoan());
    expect(res.status).toBe(401);
  });

  test('notes field is optional', async () => {
    const res = await request(app)
      .post('/api/loans')
      .set('Cookie', techCookie)
      .send({ borrower_name: 'Bob', item_description: 'Mouse' });
    expect(res.status).toBe(201);
  });
});

// ═══ PATCH /api/loans/:id/return ════════════════════════════════════════════

describe('PATCH /api/loans/:id/return', () => {
  let loanId;

  beforeEach(async () => {
    const res = await request(app)
      .post('/api/loans')
      .set('Cookie', techCookie)
      .send(validLoan());
    loanId = res.body.id;
  });

  test('marks loan as returned — returns 200 success', async () => {
    const res = await request(app)
      .patch(`/api/loans/${loanId}/return`)
      .set('Cookie', techCookie);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const db = getDb();
    const row = db.prepare('SELECT returned, returned_at FROM equipment_loans WHERE id = ?').get(loanId);
    expect(row.returned).toBe(1);
    expect(row.returned_at).toBeTruthy();
  });

  test('marking already-returned loan returns 400', async () => {
    await request(app)
      .patch(`/api/loans/${loanId}/return`)
      .set('Cookie', techCookie);
    const res = await request(app)
      .patch(`/api/loans/${loanId}/return`)
      .set('Cookie', techCookie);
    expect(res.status).toBe(400);
  });

  test('non-existent loan returns 404', async () => {
    const res = await request(app)
      .patch('/api/loans/999999/return')
      .set('Cookie', techCookie);
    expect(res.status).toBe(404);
  });

  test('unauthenticated returns 401', async () => {
    const res = await request(app)
      .patch(`/api/loans/${loanId}/return`);
    expect(res.status).toBe(401);
  });

  test('admin can mark any loan as returned', async () => {
    const res = await request(app)
      .patch(`/api/loans/${loanId}/return`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
  });
});

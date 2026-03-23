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

function validQA(overrides = {}) {
  return {
    username: 'jsmith',
    machine_serial: 'LAPTOP-ABC-001',
    call_ref: 'REF-00123',
    backup_user_profile: true,
    backup_internet_favorites: true,
    backup_outlook_cache: false,
    join_domain: true,
    windows_updates: true,
    drivers_3g: false,
    windows_defender: true,
    mimecast_mso: true,
    bios_updated: false,
    vpn_setup: true,
    remove_local_admin: true,
    onedrive_home_dir: true,
    mapped_drive: true,
    onedrive_default_save: true,
    nic_power_management: true,
    staff_distribution_list: false,
    intranet_homepage: true,
    direct_shortcut: true,
    rendezvous_shortcut: false,
    windows_activated: true,
    office_activated: true,
    private_wifi: true,
    accpac_installed: false,
    test_vga: true,
    test_usb: true,
    klite_codec: true,
    regional_settings: true,
    register_office_credentials: true,
    printers_installed: 'HP LaserJet Pro',
    other_software: '',
    ...overrides,
  };
}

// ═══ GET /api/qa ═════════════════════════════════════════════════════════════

describe('GET /api/qa', () => {
  test('admin gets 200 array', async () => {
    const res = await request(app)
      .get('/api/qa')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('technician sees only own submissions', async () => {
    // Create a submission as tech1
    await request(app).post('/api/qa').set('Cookie', techCookie).send(validQA());

    // tech2 should not see tech1's submissions
    const tech2Cookie = await loginAs('tech2', 'tech123');
    const res = await request(app).get('/api/qa').set('Cookie', tech2Cookie);
    expect(res.status).toBe(200);
    const db = getDb();
    const tech2 = db.prepare("SELECT id FROM users WHERE username = 'tech2'").get();
    res.body.forEach((row) => {
      expect(row.technician_id).toBe(tech2.id);
    });
  });

  test('limit param is respected (capped at 200)', async () => {
    const res = await request(app)
      .get('/api/qa?limit=999')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(200);
  });

  test('unauthenticated returns 401', async () => {
    expect((await request(app).get('/api/qa')).status).toBe(401);
  });
});

// ═══ POST /api/qa ════════════════════════════════════════════════════════════

describe('POST /api/qa', () => {
  test('valid submission returns 201 with id and success:true', async () => {
    const res = await request(app)
      .post('/api/qa')
      .set('Cookie', techCookie)
      .send(validQA());
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.success).toBe(true);
  });

  test('missing username returns 400', async () => {
    const { username, ...rest } = validQA();
    const res = await request(app)
      .post('/api/qa')
      .set('Cookie', techCookie)
      .send(rest);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/username/i);
  });

  test('boolean fields stored as 0/1 correctly', async () => {
    const res = await request(app)
      .post('/api/qa')
      .set('Cookie', techCookie)
      .send(validQA({ backup_user_profile: true, windows_defender: false }));
    expect(res.status).toBe(201);

    const db = getDb();
    const row = db
      .prepare('SELECT backup_user_profile, windows_defender FROM qa_submissions WHERE id = ?')
      .get(res.body.id);
    expect(row.backup_user_profile).toBe(1);
    expect(row.windows_defender).toBe(0);
  });

  test('optional fields default correctly when omitted', async () => {
    const res = await request(app)
      .post('/api/qa')
      .set('Cookie', techCookie)
      .send({ username: 'minimal_user' });
    expect(res.status).toBe(201);

    const db = getDb();
    const row = db.prepare("SELECT machine_serial, call_ref FROM qa_submissions WHERE id = ?").get(res.body.id);
    expect(row.machine_serial).toBe('');
    expect(row.call_ref).toBe('');
  });

  test('unauthenticated returns 401', async () => {
    const res = await request(app)
      .post('/api/qa')
      .send(validQA());
    expect(res.status).toBe(401);
  });
});

// ═══ GET /api/qa/export ══════════════════════════════════════════════════════

describe('GET /api/qa/export', () => {
  let submissionId;

  beforeEach(async () => {
    const res = await request(app)
      .post('/api/qa')
      .set('Cookie', techCookie)
      .send(validQA());
    submissionId = res.body.id;
  });

  test('own record returns 200 with PDF content-type', async () => {
    const res = await request(app)
      .get(`/api/qa/export?id=${submissionId}`)
      .set('Cookie', techCookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  test('admin can export any record', async () => {
    const res = await request(app)
      .get(`/api/qa/export?id=${submissionId}`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  test("tech2 cannot export tech1's record — 403", async () => {
    const tech2Cookie = await loginAs('tech2', 'tech123');
    const res = await request(app)
      .get(`/api/qa/export?id=${submissionId}`)
      .set('Cookie', tech2Cookie);
    expect(res.status).toBe(403);
  });

  test('missing id returns 400', async () => {
    const res = await request(app)
      .get('/api/qa/export')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('non-existent id returns 404', async () => {
    const res = await request(app)
      .get('/api/qa/export?id=99999')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });

  test('unauthenticated returns 401', async () => {
    expect((await request(app).get(`/api/qa/export?id=${submissionId}`)).status).toBe(401);
  });
});

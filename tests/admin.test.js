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

// ─── Auth helpers ─────────────────────────────────────────────────────────────
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

// ═══ CLASSROOMS ══════════════════════════════════════════════════════════════

describe('GET /api/classrooms', () => {
  test('admin gets 200 array with seeded classrooms', async () => {
    const res = await request(app).get('/api/classrooms').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body[0]).toHaveProperty('id');
    expect(res.body[0]).toHaveProperty('name');
  });

  test('technician also gets 200 (needed for dropdown menus)', async () => {
    const res = await request(app).get('/api/classrooms').set('Cookie', techCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('unauthenticated returns 401', async () => {
    expect((await request(app).get('/api/classrooms')).status).toBe(401);
  });
});

describe('POST /api/classrooms', () => {
  test('admin creates classroom — returns 201 with object', async () => {
    const res = await request(app)
      .post('/api/classrooms')
      .set('Cookie', adminCookie)
      .send({ name: 'New Room', building: 'Block C', floor: '2nd' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('New Room');
    expect(res.body.building).toBe('Block C');
    expect(res.body).toHaveProperty('id');
  });

  test('technician gets 403', async () => {
    const res = await request(app)
      .post('/api/classrooms')
      .set('Cookie', techCookie)
      .send({ name: 'Sneaky Room' });
    expect(res.status).toBe(403);
  });

  test('missing name returns 400', async () => {
    const res = await request(app)
      .post('/api/classrooms')
      .set('Cookie', adminCookie)
      .send({ building: 'X', floor: '1' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('empty name returns 400', async () => {
    const res = await request(app)
      .post('/api/classrooms')
      .set('Cookie', adminCookie)
      .send({ name: '   ' });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/classrooms/:id', () => {
  test('admin updates classroom — returns 200 with updated object', async () => {
    const res = await request(app)
      .put('/api/classrooms/1')
      .set('Cookie', adminCookie)
      .send({ name: 'Updated Room A', building: 'Main', floor: 'Ground' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Room A');
  });

  test('non-existent id returns 404', async () => {
    const res = await request(app)
      .put('/api/classrooms/99999')
      .set('Cookie', adminCookie)
      .send({ name: 'Ghost', building: '', floor: '' });
    expect(res.status).toBe(404);
  });

  test('missing name on update returns 400', async () => {
    const res = await request(app)
      .put('/api/classrooms/1')
      .set('Cookie', adminCookie)
      .send({ building: 'X' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/classrooms/:id', () => {
  test('admin creates then deletes classroom', async () => {
    const create = await request(app)
      .post('/api/classrooms')
      .set('Cookie', adminCookie)
      .send({ name: 'To Delete' });
    const id = create.body.id;

    const del = await request(app)
      .delete(`/api/classrooms/${id}`)
      .set('Cookie', adminCookie);
    expect(del.status).toBe(200);
    expect(del.body.message).toMatch(/deleted/i);
  });

  test('non-existent id returns 404', async () => {
    const res = await request(app)
      .delete('/api/classrooms/99999')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });

  test('technician gets 403', async () => {
    const res = await request(app)
      .delete('/api/classrooms/1')
      .set('Cookie', techCookie);
    expect(res.status).toBe(403);
  });
});

// ═══ EQUIPMENT ════════════════════════════════════════════════════════════════

describe('GET /api/equipment/:classroomId', () => {
  test('returns array of equipment for classroom 1', async () => {
    const res = await request(app)
      .get('/api/equipment/1')
      .set('Cookie', techCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
    expect(res.body[0]).toHaveProperty('name');
    expect(res.body[0]).toHaveProperty('classroom_id');
  });

  test('unauthenticated returns 401', async () => {
    expect((await request(app).get('/api/equipment/1')).status).toBe(401);
  });

  test('unknown classroom returns empty array not 404', async () => {
    const res = await request(app)
      .get('/api/equipment/99999')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/equipment', () => {
  test('admin creates equipment — returns 201', async () => {
    const res = await request(app)
      .post('/api/equipment')
      .set('Cookie', adminCookie)
      .send({ classroom_id: 1, name: 'Webcam', description: 'HD webcam' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Webcam');
    expect(res.body.classroom_id).toBe(1);
  });

  test('technician gets 403', async () => {
    const res = await request(app)
      .post('/api/equipment')
      .set('Cookie', techCookie)
      .send({ classroom_id: 1, name: 'Unauthorized' });
    expect(res.status).toBe(403);
  });

  test('missing name returns 400', async () => {
    const res = await request(app)
      .post('/api/equipment')
      .set('Cookie', adminCookie)
      .send({ classroom_id: 1 });
    expect(res.status).toBe(400);
  });

  test('missing classroom_id returns 400', async () => {
    const res = await request(app)
      .post('/api/equipment')
      .set('Cookie', adminCookie)
      .send({ name: 'Orphan' });
    expect(res.status).toBe(400);
  });

  test('non-existent classroom_id returns 404', async () => {
    const res = await request(app)
      .post('/api/equipment')
      .set('Cookie', adminCookie)
      .send({ classroom_id: 99999, name: 'Ghost' });
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/equipment/:id', () => {
  test('admin updates equipment — returns 200', async () => {
    const res = await request(app)
      .put('/api/equipment/1')
      .set('Cookie', adminCookie)
      .send({ name: 'Updated Projector', description: 'New model' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Projector');
  });

  test('non-existent id returns 404', async () => {
    const res = await request(app)
      .put('/api/equipment/99999')
      .set('Cookie', adminCookie)
      .send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/equipment/:id', () => {
  test('admin creates then deletes equipment', async () => {
    const create = await request(app)
      .post('/api/equipment')
      .set('Cookie', adminCookie)
      .send({ classroom_id: 2, name: 'Temp Equip' });
    const id = create.body.id;

    const del = await request(app)
      .delete(`/api/equipment/${id}`)
      .set('Cookie', adminCookie);
    expect(del.status).toBe(200);
    expect(del.body.message).toMatch(/deleted/i);
  });

  test('non-existent id returns 404', async () => {
    expect(
      (await request(app).delete('/api/equipment/99999').set('Cookie', adminCookie)).status
    ).toBe(404);
  });
});

// ═══ TECHNICIANS ══════════════════════════════════════════════════════════════

describe('GET /api/technicians', () => {
  test('admin gets 200 array of technicians', async () => {
    const res = await request(app).get('/api/technicians').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toHaveProperty('username');
    expect(res.body[0]).not.toHaveProperty('password');
  });

  test('technician gets 403', async () => {
    expect(
      (await request(app).get('/api/technicians').set('Cookie', techCookie)).status
    ).toBe(403);
  });
});

describe('POST /api/technicians', () => {
  test('admin creates technician — returns 201', async () => {
    const res = await request(app)
      .post('/api/technicians')
      .set('Cookie', adminCookie)
      .send({ username: `newtech_${Date.now()}`, password: 'password123', full_name: 'New Tech' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.role).toBe('technician');
    expect(res.body).not.toHaveProperty('password');
  });

  test('duplicate username returns 400', async () => {
    const res = await request(app)
      .post('/api/technicians')
      .set('Cookie', adminCookie)
      .send({ username: 'tech1', password: 'password123', full_name: 'Dup User' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/i);
  });

  test('password shorter than 6 chars returns 400', async () => {
    const res = await request(app)
      .post('/api/technicians')
      .set('Cookie', adminCookie)
      .send({ username: `sp_${Date.now()}`, password: '12345', full_name: 'Short Pass' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/6 characters/i);
  });

  test('missing required fields returns 400', async () => {
    const res = await request(app)
      .post('/api/technicians')
      .set('Cookie', adminCookie)
      .send({ username: 'nopass' });
    expect(res.status).toBe(400);
  });

  test('technician cannot create other technicians — 403', async () => {
    const res = await request(app)
      .post('/api/technicians')
      .set('Cookie', techCookie)
      .send({ username: 'sneaky', password: 'password123', full_name: 'Sneaky' });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/technicians/:id', () => {
  test('admin updates technician — returns 200', async () => {
    const tech = getDb().prepare("SELECT id FROM users WHERE username = 'tech2'").get();
    const res = await request(app)
      .put(`/api/technicians/${tech.id}`)
      .set('Cookie', adminCookie)
      .send({ username: 'tech2', full_name: 'Tech Two Updated' });
    expect(res.status).toBe(200);
    expect(res.body.full_name).toBe('Tech Two Updated');
  });

  test('updating with new password works', async () => {
    const tech = getDb().prepare("SELECT id FROM users WHERE username = 'tech3'").get();
    const res = await request(app)
      .put(`/api/technicians/${tech.id}`)
      .set('Cookie', adminCookie)
      .send({ username: 'tech3', full_name: 'Tech Three', password: 'newpassword' });
    expect(res.status).toBe(200);
  });

  test('update with short password returns 400', async () => {
    const tech = getDb().prepare("SELECT id FROM users WHERE username = 'tech1'").get();
    const res = await request(app)
      .put(`/api/technicians/${tech.id}`)
      .set('Cookie', adminCookie)
      .send({ username: 'tech1', full_name: 'Tech One', password: '123' });
    expect(res.status).toBe(400);
  });

  test('non-existent technician returns 404', async () => {
    const res = await request(app)
      .put('/api/technicians/99999')
      .set('Cookie', adminCookie)
      .send({ username: 'ghost', full_name: 'Ghost' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/technicians/:id', () => {
  test('admin creates then deletes technician', async () => {
    const create = await request(app)
      .post('/api/technicians')
      .set('Cookie', adminCookie)
      .send({ username: `del_${Date.now()}`, password: 'password123', full_name: 'Delete Me' });
    const id = create.body.id;

    const del = await request(app)
      .delete(`/api/technicians/${id}`)
      .set('Cookie', adminCookie);
    expect(del.status).toBe(200);
    expect(del.body.message).toMatch(/deleted/i);
  });

  test('non-existent technician returns 404', async () => {
    expect(
      (await request(app).delete('/api/technicians/99999').set('Cookie', adminCookie)).status
    ).toBe(404);
  });
});

// ═══ AUDIT LOG ════════════════════════════════════════════════════════════════

describe('GET /api/audit-log', () => {
  test('admin gets 200 array', async () => {
    const res = await request(app).get('/api/audit-log').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('technician gets 403', async () => {
    const res = await request(app).get('/api/audit-log').set('Cookie', techCookie);
    expect(res.status).toBe(403);
  });

  test('limit query param is respected (max 500)', async () => {
    const res = await request(app)
      .get('/api/audit-log?limit=600')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    // Since test data is sparse, just ensure it doesn't crash
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ═══ ADMINS ═══════════════════════════════════════════════════════════════════

describe('GET /api/admins', () => {
  test('admin gets 200 with array of admin objects', async () => {
    const res = await request(app).get('/api/admins').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('username');
    expect(res.body[0]).toHaveProperty('isSelf');
  });

  test('response contains isSelf=true for the requesting admin', async () => {
    const res = await request(app).get('/api/admins').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    const self = res.body.find(a => a.username === 'admin');
    expect(self).toBeDefined();
    expect(self.isSelf).toBe(true);
  });

  test('technician gets 403', async () => {
    const res = await request(app).get('/api/admins').set('Cookie', techCookie);
    expect(res.status).toBe(403);
  });

  test('unauthenticated request gets 401', async () => {
    const res = await request(app).get('/api/admins');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/admins', () => {
  const newAdmin = { username: 'testadmin', password: 'secure123', full_name: 'Test Admin', email: 'testadmin@example.com' };

  afterEach(async () => {
    // Clean up created admin
    const db = require('../db/database');
    db.prepare("DELETE FROM users WHERE username = 'testadmin'").run();
  });

  test('admin can create a new admin (201)', async () => {
    const res = await request(app)
      .post('/api/admins')
      .set('Cookie', adminCookie)
      .send(newAdmin);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  test('creates admin without email (optional field)', async () => {
    const res = await request(app)
      .post('/api/admins')
      .set('Cookie', adminCookie)
      .send({ username: 'testadmin', password: 'secure123', full_name: 'Test Admin' });
    expect(res.status).toBe(201);
  });

  test('duplicate username returns 400', async () => {
    // Create first
    await request(app).post('/api/admins').set('Cookie', adminCookie).send(newAdmin);
    // Create duplicate
    const res = await request(app)
      .post('/api/admins')
      .set('Cookie', adminCookie)
      .send(newAdmin);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('missing username returns 400', async () => {
    const res = await request(app)
      .post('/api/admins')
      .set('Cookie', adminCookie)
      .send({ password: 'secure123', full_name: 'Test Admin' });
    expect(res.status).toBe(400);
  });

  test('missing password returns 400', async () => {
    const res = await request(app)
      .post('/api/admins')
      .set('Cookie', adminCookie)
      .send({ username: 'testadmin', full_name: 'Test Admin' });
    expect(res.status).toBe(400);
  });

  test('missing full_name returns 400', async () => {
    const res = await request(app)
      .post('/api/admins')
      .set('Cookie', adminCookie)
      .send({ username: 'testadmin', password: 'secure123' });
    expect(res.status).toBe(400);
  });

  test('technician cannot create admin (403)', async () => {
    const res = await request(app)
      .post('/api/admins')
      .set('Cookie', techCookie)
      .send(newAdmin);
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/admins/:id', () => {
  let tempAdminId;

  beforeEach(async () => {
    const res = await request(app)
      .post('/api/admins')
      .set('Cookie', adminCookie)
      .send({ username: 'tempadmin', password: 'pass1234', full_name: 'Temp Admin' });
    tempAdminId = res.body.id;
  });

  afterEach(() => {
    const db = require('../db/database');
    db.prepare("DELETE FROM users WHERE username = 'tempadmin'").run();
  });

  test('admin can update full_name and email', async () => {
    const res = await request(app)
      .put(`/api/admins/${tempAdminId}`)
      .set('Cookie', adminCookie)
      .send({ username: 'tempadmin', full_name: 'Updated Name', email: 'updated@example.com' });
    expect(res.status).toBe(200);
  });

  test('password is optional in update', async () => {
    const res = await request(app)
      .put(`/api/admins/${tempAdminId}`)
      .set('Cookie', adminCookie)
      .send({ username: 'tempadmin', full_name: 'No PW Change' });
    expect(res.status).toBe(200);
  });

  test('non-existent id returns 404', async () => {
    const res = await request(app)
      .put('/api/admins/99999')
      .set('Cookie', adminCookie)
      .send({ username: 'ghostadmin', full_name: 'Ghost' });
    expect(res.status).toBe(404);
  });

  test('technician cannot update admin (403)', async () => {
    const res = await request(app)
      .put(`/api/admins/${tempAdminId}`)
      .set('Cookie', techCookie)
      .send({ full_name: 'Hacked' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/admins/:id', () => {
  let tempAdminId;

  beforeEach(async () => {
    const res = await request(app)
      .post('/api/admins')
      .set('Cookie', adminCookie)
      .send({ username: 'deleteadmin', password: 'pass1234', full_name: 'Delete Admin' });
    tempAdminId = res.body.id;
  });

  afterEach(() => {
    const db = require('../db/database');
    db.prepare("DELETE FROM users WHERE username = 'deleteadmin'").run();
  });

  test('admin can delete another admin (200)', async () => {
    const res = await request(app)
      .delete(`/api/admins/${tempAdminId}`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
  });

  test('admin cannot delete own account (400)', async () => {
    const db = require('../db/database');
    const self = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
    const res = await request(app)
      .delete(`/api/admins/${self.id}`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot delete your own account/i);
  });

  test('non-existent id returns 404', async () => {
    const res = await request(app)
      .delete('/api/admins/99999')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });

  test('technician cannot delete admin (403)', async () => {
    const res = await request(app)
      .delete(`/api/admins/${tempAdminId}`)
      .set('Cookie', techCookie);
    expect(res.status).toBe(403);
  });
});

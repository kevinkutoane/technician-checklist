'use strict';
const { setupTestDb } = require('./helpers/testDb');
const request = require('supertest');
const XLSX = require('xlsx');

Object.keys(require.cache).forEach((k) => {
  if (!k.includes('node_modules') && !k.includes('testDb') && !k.endsWith('database.js')) {
    delete require.cache[k];
  }
});

const app = require('../server');

beforeAll(() => {
  setupTestDb();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loginAs(username, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username, password: password || (username === 'admin' ? 'admin123' : 'tech123') });
  return res.headers['set-cookie'];
}

/**
 * Build a minimal .xlsx buffer with the expected Week Ahead layout.
 */
function buildXlsx(data) {
  // data is an array of [dayLabel, events[]]
  // where each event is [time, venue, course, contact, paxCampus, paxZoom, lecturer, syndicates, tech, it]
  const rows = [];
  for (const { dayLabel, events } of data) {
    rows.push(['DATE', dayLabel]);
    rows.push(['TIMES', 'VENUE', 'COMPANY/COURSE', 'Contact', 'Pax on campus', 'Pax via Zoom', 'Lecturer', 'Syndicates & Other Venues', 'Tech', 'IT technical support required']);
    for (const evt of events) {
      rows.push(evt);
    }
    rows.push([]); // blank separator
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Schedule');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const sampleData = [
  {
    dayLabel: 'Monday 24 February 2025',
    events: [
      ['07:30-16:30', 'Auditorium', 'PDBA FT 2025 Photos', 'Lungisani Zulu', 30, 0, 'Dr Smith', 'Classroom 3', 'Tshepo', 'IT required'],
      ['17:00-21:00', 'Classroom 9', 'PGDip 2025 PT Red', 'Tracy Sebeza', 68, 0, 'Prof John Ford', '', 'Thabo', 'IT on standby'],
    ],
  },
  {
    dayLabel: 'Tuesday 25 February 2025',
    events: [
      ['08:00-12:00', 'Room B', 'Workshop A', 'Jane Doe', 20, 5, 'Mr Lee', '', 'Kevin', ''],
    ],
  },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Week Ahead API', () => {
  describe('POST /api/week-ahead/upload', () => {
    test('rejects unauthenticated requests', async () => {
      const buf = buildXlsx(sampleData);
      const res = await request(app)
        .post('/api/week-ahead/upload')
        .attach('file', buf, 'schedule.xlsx');
      expect(res.status).toBe(401);
    });

    test('rejects admin upload (only technicians can upload)', async () => {
      const cookie = await loginAs('admin');
      const buf = buildXlsx(sampleData);
      const res = await request(app)
        .post('/api/week-ahead/upload')
        .set('Cookie', cookie)
        .attach('file', buf, 'schedule.xlsx');
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/technician/i);
    });

    test('technician can upload xlsx and events are parsed', async () => {
      const cookie = await loginAs('tech1');
      const buf = buildXlsx(sampleData);
      const res = await request(app)
        .post('/api/week-ahead/upload')
        .set('Cookie', cookie)
        .attach('file', buf, 'schedule.xlsx');
      expect(res.status).toBe(201);
      expect(res.body.event_count).toBe(3);
      expect(res.body.week_start).toBe('2025-02-24');
      expect(res.body.week_end).toBe('2025-02-25');
      expect(res.body.batch_id).toBeDefined();
    });

    test('rejects upload with no file', async () => {
      const cookie = await loginAs('tech1');
      const res = await request(app)
        .post('/api/week-ahead/upload')
        .set('Cookie', cookie);
      expect(res.status).toBe(400);
    });

    test('auto-replaces events for overlapping dates', async () => {
      const cookie = await loginAs('tech1');
      // Upload original
      const buf1 = buildXlsx(sampleData);
      await request(app)
        .post('/api/week-ahead/upload')
        .set('Cookie', cookie)
        .attach('file', buf1, 'v1.xlsx');

      // Upload replacement for same dates with different data
      const replacementData = [
        {
          dayLabel: 'Monday 24 February 2025',
          events: [
            ['09:00-10:00', 'Lab A', 'Replacement Event', 'New Contact', 10, 2, '', '', '', ''],
          ],
        },
      ];
      const buf2 = buildXlsx(replacementData);
      const res2 = await request(app)
        .post('/api/week-ahead/upload')
        .set('Cookie', cookie)
        .attach('file', buf2, 'v2.xlsx');
      expect(res2.status).toBe(201);
      expect(res2.body.event_count).toBe(1);

      // Verify Monday now only has the replacement event
      const getRes = await request(app)
        .get('/api/week-ahead?date=2025-02-24')
        .set('Cookie', cookie);
      expect(getRes.status).toBe(200);
      expect(getRes.body.length).toBe(1);
      expect(getRes.body[0].company_course).toBe('Replacement Event');
    });
  });

  describe('GET /api/week-ahead', () => {
    beforeAll(async () => {
      const cookie = await loginAs('tech1');
      const buf = buildXlsx(sampleData);
      await request(app)
        .post('/api/week-ahead/upload')
        .set('Cookie', cookie)
        .attach('file', buf, 'schedule.xlsx');
    });

    test('rejects unauthenticated requests', async () => {
      const res = await request(app).get('/api/week-ahead');
      expect(res.status).toBe(401);
    });

    test('returns events for a specific date', async () => {
      const cookie = await loginAs('tech1');
      const res = await request(app)
        .get('/api/week-ahead?date=2025-02-24')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // At least one event for that date
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].event_date).toBe('2025-02-24');
    });

    test('admins can also view events', async () => {
      const cookie = await loginAs('admin');
      const res = await request(app)
        .get('/api/week-ahead?date=2025-02-24')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/week-ahead/week', () => {
    test('returns events for a full week', async () => {
      const cookie = await loginAs('tech1');
      const res = await request(app)
        .get('/api/week-ahead/week?start=2025-02-24')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/week-ahead/uploads', () => {
    test('technician sees own uploads only', async () => {
      const cookie = await loginAs('tech1');
      const res = await request(app)
        .get('/api/week-ahead/uploads')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    test('admin sees all uploads', async () => {
      const cookie = await loginAs('admin');
      const res = await request(app)
        .get('/api/week-ahead/uploads')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('DELETE /api/week-ahead/:batchId', () => {
    test('technician can delete own batch', async () => {
      const cookie = await loginAs('tech1');
      const buf = buildXlsx(sampleData);
      const uploadRes = await request(app)
        .post('/api/week-ahead/upload')
        .set('Cookie', cookie)
        .attach('file', buf, 'to-delete.xlsx');
      const batchId = uploadRes.body.batch_id;

      const delRes = await request(app)
        .delete(`/api/week-ahead/${batchId}`)
        .set('Cookie', cookie);
      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);
    });

    test('technician cannot delete another tech\'s batch', async () => {
      const cookie1 = await loginAs('tech1');
      const buf = buildXlsx(sampleData);
      const uploadRes = await request(app)
        .post('/api/week-ahead/upload')
        .set('Cookie', cookie1)
        .attach('file', buf, 'tech1.xlsx');
      const batchId = uploadRes.body.batch_id;

      const cookie2 = await loginAs('tech2');
      const delRes = await request(app)
        .delete(`/api/week-ahead/${batchId}`)
        .set('Cookie', cookie2);
      expect(delRes.status).toBe(403);
    });

    test('admin can delete any batch', async () => {
      const techCookie = await loginAs('tech1');
      const buf = buildXlsx(sampleData);
      const uploadRes = await request(app)
        .post('/api/week-ahead/upload')
        .set('Cookie', techCookie)
        .attach('file', buf, 'admin-del.xlsx');
      const batchId = uploadRes.body.batch_id;

      const adminCookie = await loginAs('admin');
      const delRes = await request(app)
        .delete(`/api/week-ahead/${batchId}`)
        .set('Cookie', adminCookie);
      expect(delRes.status).toBe(200);
    });

    test('returns 404 for non-existent batch', async () => {
      const cookie = await loginAs('admin');
      const res = await request(app)
        .delete('/api/week-ahead/nonexistent-id')
        .set('Cookie', cookie);
      expect(res.status).toBe(404);
    });
  });
});

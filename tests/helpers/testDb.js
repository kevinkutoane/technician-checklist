'use strict';
/**
 * testDb.js — Bootstrap a fresh in-memory SQLite DB for every test file.
 *
 * Usage at the top of each test file:
 *   const { setupTestDb, seed } = require('./helpers/testDb');
 *   beforeAll(() => { setupTestDb(); });
 *
 * The helper sets process.env.TEST_DB = ':memory:' so that when server.js /
 * routes require('../db/database') they get the in-memory instance.
 */

process.env.TEST_DB = ':memory:';

// Ensure the DB module has not been cached with a different path
delete require.cache[require.resolve('../../db/database')];

const db = require('../../db/database');
const bcrypt = require('bcryptjs');

// ─── Seed data constants ──────────────────────────────────────────────────────
const ADMIN_PASS_HASH = bcrypt.hashSync('admin123', 10);
const TECH_PASS_HASH  = bcrypt.hashSync('tech123',  10);

const USERS = [
  { username: 'admin',  password: ADMIN_PASS_HASH, full_name: 'Admin User',   role: 'admin' },
  { username: 'tech1',  password: TECH_PASS_HASH,  full_name: 'Tech One',     role: 'technician' },
  { username: 'tech2',  password: TECH_PASS_HASH,  full_name: 'Tech Two',     role: 'technician' },
  { username: 'tech3',  password: TECH_PASS_HASH,  full_name: 'Tech Three',   role: 'technician' },
];

function setupTestDb() {
  // Wipe any existing data (safe for :memory: — tables already created by database.js)
  const tables = ['audit_log', 'checklist_items', 'checklist_submissions',
                  'asset_agreements', 'qa_submissions', 'equipment',
                  'classrooms', 'users'];
  for (const t of tables) {
    db.prepare(`DELETE FROM ${t}`).run();
  }

  // Insert users
  const insertUser = db.prepare(
    'INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)'
  );
  for (const u of USERS) {
    insertUser.run(u.username, u.password, u.full_name, u.role);
  }

  // Insert 2 classrooms
  db.prepare("INSERT INTO classrooms (id, name, building, floor) VALUES (1, 'Room A', 'Main Block', 'Ground')").run();
  db.prepare("INSERT INTO classrooms (id, name, building, floor) VALUES (2, 'Room B', 'Science Wing', 'First')").run();

  // Insert 3 pieces of equipment for Room A (id=1) and 2 for Room B (id=2)
  db.prepare("INSERT INTO equipment (id, classroom_id, name) VALUES (1, 1, 'Projector')").run();
  db.prepare("INSERT INTO equipment (id, classroom_id, name) VALUES (2, 1, 'Desktop PC')").run();
  db.prepare("INSERT INTO equipment (id, classroom_id, name) VALUES (3, 1, 'Speakers')").run();
  db.prepare("INSERT INTO equipment (id, classroom_id, name) VALUES (4, 2, 'Projector')").run();
  db.prepare("INSERT INTO equipment (id, classroom_id, name) VALUES (5, 2, 'Laptop')").run();
}

/**
 * Returns the in-memory db instance for direct queries in tests.
 */
function getDb() {
  return db;
}

/**
 * Helper: get a user row by username.
 */
function getUser(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

module.exports = { setupTestDb, getDb, getUser };

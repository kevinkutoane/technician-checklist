'use strict';

const bcrypt = require('bcryptjs');
const db = require('./database');

const SALT_ROUNDS = 10;

async function seed() {
  console.log('Seeding database...');

  // Clear existing data
  db.exec(`
    DELETE FROM checklist_items;
    DELETE FROM checklist_submissions;
    DELETE FROM equipment;
    DELETE FROM classrooms;
    DELETE FROM users;
  `);

  // Seed users
  const users = [
    { username: 'admin', password: 'admin123', full_name: 'Administrator', role: 'admin' },
    { username: 'tech1', password: 'tech123', full_name: 'Technician One', role: 'technician' },
    { username: 'tech2', password: 'tech123', full_name: 'Technician Two', role: 'technician' },
    { username: 'tech3', password: 'tech123', full_name: 'Technician Three', role: 'technician' },
    { username: 'tech4', password: 'tech123', full_name: 'Technician Four', role: 'technician' },
    { username: 'tech5', password: 'tech123', full_name: 'Technician Five', role: 'technician' },
  ];

  const insertUser = db.prepare(
    'INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)'
  );

  for (const user of users) {
    const hash = await bcrypt.hash(user.password, SALT_ROUNDS);
    insertUser.run(user.username, hash, user.full_name, user.role);
    console.log(`  Created user: ${user.username}`);
  }

  // Seed classrooms and equipment
  const classroomData = [
    {
      name: 'Classroom 1', building: 'Main Block', floor: 'Ground',
      equipment: ['Projector', 'Desktop PC', 'Speakers', 'Interactive Whiteboard', 'Air Conditioner'],
    },
    {
      name: 'Classroom 2', building: 'Main Block', floor: 'Ground',
      equipment: ['Projector', 'Laptop', 'Printer', 'Speakers', 'Air Conditioner'],
    },
    {
      name: 'Classroom 3', building: 'Main Block', floor: 'First',
      equipment: ['Projector', 'Desktop PC', 'Document Camera', 'Speakers', 'Air Conditioner'],
    },
    {
      name: 'Classroom 4', building: 'Main Block', floor: 'First',
      equipment: ['Projector', 'Desktop PC', 'Desktop PC (2)', 'Printer', 'Speakers', 'Air Conditioner'],
    },
    {
      name: 'Classroom 5', building: 'Main Block', floor: 'Second',
      equipment: ['Projector', 'Laptop', 'Speakers', 'Webcam', 'Air Conditioner'],
    },
    {
      name: 'Classroom 6', building: 'Main Block', floor: 'Second',
      equipment: ['Projector', 'Desktop PC', 'Interactive Whiteboard', 'Speakers', 'Air Conditioner'],
    },
    {
      name: 'Classroom 7', building: 'Science Wing', floor: 'Ground',
      equipment: ['Projector', 'Laptop', 'Printer', 'Scanner', 'Speakers', 'Air Conditioner'],
    },
    {
      name: 'Classroom 8', building: 'Science Wing', floor: 'Ground',
      equipment: ['Projector', 'Desktop PC', 'Speakers', 'Microphone', 'Air Conditioner'],
    },
    {
      name: 'Classroom 9', building: 'Science Wing', floor: 'First',
      equipment: ['Projector', 'Laptop', 'Laptop (2)', 'Speakers', 'Webcam', 'Air Conditioner'],
    },
    {
      name: 'Classroom 10', building: 'Science Wing', floor: 'First',
      equipment: ['Projector', 'Desktop PC', 'Document Camera', 'Printer', 'Speakers', 'Air Conditioner'],
    },
    {
      name: 'Classroom 11', building: 'Arts Block', floor: 'Ground',
      equipment: ['Projector', 'Laptop', 'Interactive Whiteboard', 'Speakers', 'Air Conditioner'],
    },
    {
      name: 'Classroom 12', building: 'Arts Block', floor: 'Ground',
      equipment: ['Projector', 'Desktop PC', 'Speakers', 'Microphone', 'Webcam', 'Air Conditioner'],
    },
  ];

  const insertClassroom = db.prepare(
    'INSERT INTO classrooms (name, building, floor) VALUES (?, ?, ?)'
  );
  const insertEquipment = db.prepare(
    'INSERT INTO equipment (classroom_id, name) VALUES (?, ?)'
  );

  for (const cr of classroomData) {
    const result = insertClassroom.run(cr.name, cr.building, cr.floor);
    const classroomId = result.lastInsertRowid;
    for (const eq of cr.equipment) {
      insertEquipment.run(classroomId, eq);
    }
    console.log(`  Created classroom: ${cr.name} with ${cr.equipment.length} equipment items`);
  }

  console.log('Database seeded successfully!');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

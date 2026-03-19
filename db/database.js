'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'checklist.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'technician')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS classrooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    building TEXT DEFAULT '',
    floor TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    classroom_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS checklist_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    technician_id INTEGER NOT NULL,
    classroom_id INTEGER NOT NULL,
    submission_date DATE NOT NULL,
    general_notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (technician_id) REFERENCES users(id),
    FOREIGN KEY (classroom_id) REFERENCES classrooms(id),
    UNIQUE(technician_id, classroom_id, submission_date)
  );

  CREATE TABLE IF NOT EXISTS checklist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL,
    equipment_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('working', 'not_working', 'needs_repair')),
    notes TEXT DEFAULT '',
    FOREIGN KEY (submission_id) REFERENCES checklist_submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (equipment_id) REFERENCES equipment(id)
  );

  CREATE TABLE IF NOT EXISTS asset_agreements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    technician_id INTEGER NOT NULL,
    employee_name TEXT NOT NULL,
    laptop_serial_number TEXT DEFAULT '',
    sim_card_number TEXT DEFAULT '',
    dongle BOOLEAN DEFAULT 0,
    laptop_charger BOOLEAN DEFAULT 0,
    laptop_bag BOOLEAN DEFAULT 0,
    mouse BOOLEAN DEFAULT 0,
    monitor BOOLEAN DEFAULT 0,
    keyboard BOOLEAN DEFAULT 0,
    submission_date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (technician_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS qa_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    technician_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    machine_serial TEXT DEFAULT '',
    call_ref TEXT DEFAULT '',
    
    backup_user_profile BOOLEAN DEFAULT 0,
    backup_internet_favorites BOOLEAN DEFAULT 0,
    backup_outlook_cache BOOLEAN DEFAULT 0,
    join_domain BOOLEAN DEFAULT 0,
    windows_updates BOOLEAN DEFAULT 0,
    drivers_3g BOOLEAN DEFAULT 0,
    windows_defender BOOLEAN DEFAULT 0,
    mimecast_mso BOOLEAN DEFAULT 0,
    bios_updated BOOLEAN DEFAULT 0,
    vpn_setup BOOLEAN DEFAULT 0,
    remove_local_admin BOOLEAN DEFAULT 0,
    onedrive_home_dir BOOLEAN DEFAULT 0,
    mapped_drive BOOLEAN DEFAULT 0,
    onedrive_default_save BOOLEAN DEFAULT 0,
    nic_power_management BOOLEAN DEFAULT 0,
    staff_distribution_list BOOLEAN DEFAULT 0,
    intranet_homepage BOOLEAN DEFAULT 0,
    direct_shortcut BOOLEAN DEFAULT 0,
    rendezvous_shortcut BOOLEAN DEFAULT 0,
    windows_activated BOOLEAN DEFAULT 0,
    office_activated BOOLEAN DEFAULT 0,
    private_wifi BOOLEAN DEFAULT 0,
    accpac_installed BOOLEAN DEFAULT 0,
    test_vga BOOLEAN DEFAULT 0,
    test_usb BOOLEAN DEFAULT 0,
    klite_codec BOOLEAN DEFAULT 0,
    regional_settings BOOLEAN DEFAULT 0,
    register_office_credentials BOOLEAN DEFAULT 0,
    
    printers_installed TEXT DEFAULT '',
    other_software TEXT DEFAULT '',
    
    submission_date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (technician_id) REFERENCES users(id)
  );
`);

module.exports = db;

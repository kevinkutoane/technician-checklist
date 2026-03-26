'use strict';

const Database = require('better-sqlite3');
const path = require('path');

// On Azure App Service, DB_PATH should point to /home/checklist.db so the
// database persists across deployments. Set the DB_PATH env var in Azure
// Application Settings. Falls back to the project root for local development.
const DB_PATH = process.env.TEST_DB || process.env.DB_PATH || path.join(__dirname, '..', 'checklist.db');

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

// Audit log table
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    target_type TEXT DEFAULT '',
    target_id INTEGER,
    details TEXT DEFAULT '',
    ip_address TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add signature_data column to asset_agreements if it doesn't exist yet
try {
  db.exec(`ALTER TABLE asset_agreements ADD COLUMN signature_data TEXT DEFAULT ''`);
} catch (_) {
  // Column already exists — safe to ignore
}

// Add asset_tag and photo_data columns if they don't exist yet
for (const col of ["asset_tag TEXT DEFAULT ''", "photo_data TEXT DEFAULT ''"]) {
  try {
    db.exec(`ALTER TABLE asset_agreements ADD COLUMN ${col}`);
  } catch (_) {
    // Column already exists — safe to ignore
  }
}

// Add email and password-reset columns to users if they don't exist yet
for (const col of [
  "email TEXT",
  "reset_token TEXT",
  "reset_token_expires INTEGER",
]) {
  try {
    db.exec(`ALTER TABLE users ADD COLUMN ${col}`);
  } catch (_) {
    // Column already exists — safe to ignore
  }
}

// User preferences — key/value store per user (theme, alert_email, etc.)
db.exec(`
  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id   INTEGER NOT NULL,
    pref_key  TEXT    NOT NULL,
    pref_value TEXT   NOT NULL DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, pref_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Equipment loans — temporary item loans to staff/visitors
db.exec(`
  CREATE TABLE IF NOT EXISTS equipment_loans (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    technician_id    INTEGER NOT NULL,
    borrower_name    TEXT    NOT NULL,
    item_description TEXT    NOT NULL,
    notes            TEXT    DEFAULT '',
    loan_date        DATE    NOT NULL,
    returned         BOOLEAN DEFAULT 0,
    returned_at      DATETIME,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (technician_id) REFERENCES users(id)
  );
`);

// Classroom handovers — session readiness sign-off record
db.exec(`
  CREATE TABLE IF NOT EXISTS classroom_handovers (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    submitted_by_id             INTEGER NOT NULL,
    handover_date               DATE    NOT NULL,
    checking_start_time         TEXT    DEFAULT '',
    class_start_time            TEXT    DEFAULT '',
    classroom_id                INTEGER NOT NULL,
    programme_name              TEXT    DEFAULT '',
    technician_name             TEXT    DEFAULT '',
    faculty_name                TEXT    DEFAULT '',
    session_producer_name       TEXT    DEFAULT '',
    programme_manager_name      TEXT    DEFAULT '',
    services_data               TEXT    DEFAULT '{}',
    faculty_arrived             TEXT    DEFAULT '',
    faculty_comments            TEXT    DEFAULT '',
    faculty_signature           TEXT    DEFAULT '',
    session_producer_arrived    TEXT    DEFAULT '',
    session_producer_comments   TEXT    DEFAULT '',
    session_producer_signature  TEXT    DEFAULT '',
    programme_manager_arrived   TEXT    DEFAULT '',
    programme_manager_comments  TEXT    DEFAULT '',
    programme_manager_signature TEXT    DEFAULT '',
    additional_comments         TEXT    DEFAULT '',
    created_at                  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (submitted_by_id) REFERENCES users(id),
    FOREIGN KEY (classroom_id)   REFERENCES classrooms(id)
  );
`);

// Hybrid classroom setups — per-day flag visible to all technicians
db.exec(`
  CREATE TABLE IF NOT EXISTS hybrid_setups (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    classroom_id INTEGER NOT NULL,
    setup_date   DATE    NOT NULL,
    set_by_id    INTEGER NOT NULL,
    notes        TEXT    DEFAULT '',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(classroom_id, setup_date),
    FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE,
    FOREIGN KEY (set_by_id)    REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_hs_date ON hybrid_setups(setup_date);
`);

// Week-ahead schedule — uploaded XLSX events viewable on dashboard
db.exec(`
  CREATE TABLE IF NOT EXISTS week_ahead_uploads (
    id               TEXT    PRIMARY KEY,
    filename         TEXT    NOT NULL,
    week_start       TEXT,
    week_end         TEXT,
    row_count        INTEGER DEFAULT 0,
    uploaded_by_id   INTEGER NOT NULL,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS week_ahead_events (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    event_date              TEXT    NOT NULL,
    day_label               TEXT    DEFAULT '',
    time_range              TEXT    DEFAULT '',
    venue                   TEXT    DEFAULT '',
    company_course          TEXT    DEFAULT '',
    contact_person          TEXT    DEFAULT '',
    pax_campus              INTEGER DEFAULT 0,
    pax_zoom                INTEGER DEFAULT 0,
    lecturer                TEXT    DEFAULT '',
    syndicates_other_venues TEXT    DEFAULT '',
    assigned_tech           TEXT    DEFAULT '',
    it_support_required     TEXT    DEFAULT '',
    upload_batch_id         TEXT    NOT NULL,
    uploaded_by_id          INTEGER NOT NULL,
    created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (upload_batch_id) REFERENCES week_ahead_uploads(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by_id)  REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_wae_date  ON week_ahead_events(event_date);
  CREATE INDEX IF NOT EXISTS idx_wae_batch ON week_ahead_events(upload_batch_id);
`);

// Performance indexes — keep queries fast as data grows
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_el_returned    ON equipment_loans(returned);
  CREATE INDEX IF NOT EXISTS idx_el_date        ON equipment_loans(loan_date);
  CREATE INDEX IF NOT EXISTS idx_ch_date         ON classroom_handovers(handover_date);
  CREATE INDEX IF NOT EXISTS idx_ch_submitted_by ON classroom_handovers(submitted_by_id);
  CREATE INDEX IF NOT EXISTS idx_ch_classroom    ON classroom_handovers(classroom_id);
  CREATE INDEX IF NOT EXISTS idx_cs_date       ON checklist_submissions(submission_date);
  CREATE INDEX IF NOT EXISTS idx_cs_tech       ON checklist_submissions(technician_id);
  CREATE INDEX IF NOT EXISTS idx_cs_classroom  ON checklist_submissions(classroom_id);
  CREATE INDEX IF NOT EXISTS idx_ci_submission ON checklist_items(submission_id);
  CREATE INDEX IF NOT EXISTS idx_aa_date       ON asset_agreements(submission_date);
  CREATE INDEX IF NOT EXISTS idx_aa_tech       ON asset_agreements(technician_id);
  CREATE INDEX IF NOT EXISTS idx_qa_date       ON qa_submissions(submission_date);
  CREATE INDEX IF NOT EXISTS idx_qa_tech       ON qa_submissions(technician_id);
  CREATE INDEX IF NOT EXISTS idx_al_user       ON audit_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_al_created    ON audit_log(created_at);
`);

module.exports = db;

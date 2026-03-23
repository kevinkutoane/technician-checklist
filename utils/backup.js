'use strict';

/**
 * Automated SQLite backup using node-cron.
 * Runs daily at 02:00 server time.
 * Keeps the last 7 daily backup files.
 *
 * Backup location: <project_root>/backups/checklist-YYYY-MM-DD.db
 */

const cron = require('node-cron');
const fs   = require('fs');
const path = require('path');

const DB_PATH      = path.join(__dirname, '..', 'checklist.db');
const BACKUPS_DIR  = path.join(__dirname, '..', 'backups');
const KEEP_DAYS    = 7;

function runBackup() {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }

    const today    = new Date().toISOString().slice(0, 10);
    const destPath = path.join(BACKUPS_DIR, `checklist-${today}.db`);

    fs.copyFileSync(DB_PATH, destPath);
    console.log(`[backup] SQLite backup written to ${destPath}`);

    // Prune backups older than KEEP_DAYS
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter((f) => /^checklist-\d{4}-\d{2}-\d{2}\.db$/.test(f))
      .sort(); // lexicographic = chronological for ISO dates

    if (files.length > KEEP_DAYS) {
      const toDelete = files.slice(0, files.length - KEEP_DAYS);
      for (const f of toDelete) {
        fs.unlinkSync(path.join(BACKUPS_DIR, f));
        console.log(`[backup] Pruned old backup: ${f}`);
      }
    }
  } catch (err) {
    console.error('[backup] Backup failed:', err.message);
  }
}

// Schedule daily at 02:00
cron.schedule('0 2 * * *', runBackup);

console.log('[backup] Daily backup scheduled at 02:00');

module.exports = { runBackup };

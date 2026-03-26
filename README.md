# Technician Checklist — Ops Hub

A mobile-friendly, session-authenticated web application that replaces a paper-based daily equipment checklist system. Technicians submit daily equipment-status checks across multiple classrooms; admins get a real-time overview of operations, flagged issues, and audit history.

---

## Features

### For All Users
- **Authentication** — Session-based login (bcrypt-hashed passwords, 8-hour sessions), two roles: `admin` and `technician`
- **Forgot Password** — Admin accounts can request a password-reset link via email; signed JWT-free tokens (SHA-256 hash stored, raw token emailed) expire after 1 hour and are single-use
- **Classroom Checklist** — Select a classroom, set equipment status (Working / Needs Repair / Not Working), add notes, submit
- **Asset Agreement (Onboarding)** — Log laptop/peripheral issuance with a digital signature capture
- **QA Checklist** — 28-step IT setup verification form for new machines
- **Classroom Handover Form** — Session readiness log: 12 service checks (PC, projector, Wi-Fi, cables, microphones, cameras, Zoom/Teams, etc.) with Y/N status and comments, plus digital sign-off panels for Faculty, Session Producer, and Programme Manager (arrival time, comments, and signature capture)
- **Hybrid Classroom Notifications** — Any technician can flag a classroom as a hybrid setup for the day (with an optional note); all users see a live "🎥 Hybrid Classrooms Today" card on the Dashboard and a 🎥 badge on the classroom coverage tile; flags are date-scoped and reset daily
- **Week Ahead Schedule** — Technicians upload a weekly XLSX schedule (events with times, venues, programmes, contacts, tech assignments, IT support); all users see a "📅 Today's Schedule" card on the Dashboard; technicians manage uploads from a dedicated Week Ahead page with week navigation and day tabs; admins view all uploads in the Admin panel
- **Dashboard** — Today's coverage tiles, today's schedule, submission history, flagged issues table, filter by date/classroom/technician, export to PDF
- **Settings** — Change display name, username, email address, and password; toggle dark/light theme

### For Admins Only
- **Admin Panel** — Full CRUD for classrooms, equipment, technicians, and admin accounts; view all checklist, QA, onboarding, and handover submissions; audit log
- **Admins Management** — Create, edit, and delete admin accounts from the Admins tab; self-deletion is prevented; email address per admin enables password-reset flow
- **Admin Overview Tab** — Daily at-a-glance: total classrooms / equipment / technicians, coverage today, unchecked classrooms, flagged items, most-problematic equipment (30-day trend), recent audit activity
- **Dashboard Enhancements** — Coverage percentage stat, unchecked-classroom alert banner, data charts (daily pulse, equipment health mix, high-maintenance classrooms, technician performance, equipment trends)
- **Notifications Settings** — Per-admin alert email address for flagged-equipment notifications

---

## Tech Stack

| Layer       | Technology                            |
|-------------|---------------------------------------|
| Runtime     | Node.js 18+                           |
| Web server  | Express 4                             |
| Database    | SQLite via `better-sqlite3`           |
| Sessions    | `express-session` + SQLite store      |
| Security    | Helmet v8, CSRF (Origin check), bcrypt, rate limiting |
| Email       | Nodemailer (SMTP)                     |
| PDF export  | PDFKit                                |
| XLSX parse  | SheetJS (`xlsx`)                      |
| File upload | Multer (memory storage, 5 MB limit)   |
| Frontend    | Vanilla JS, custom CSS (no framework) |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Seed the database with classrooms, equipment, and demo accounts
npm run seed

# 3. Start the server
npm start
```

The app runs on **http://localhost:3000** by default.

---

## Default Demo Credentials

| Role        | Username | Password  |
|-------------|----------|-----------|
| Admin       | `admin`  | `admin123` |
| Technician  | `tech1`  | `tech123`  |
| Technician  | `tech2`  | `tech123`  |
| Technician  | `tech3`  | `tech123`  |
| Technician  | `tech4`  | `tech123`  |
| Technician  | `tech5`  | `tech123`  |

> **Production note:** Do not run `npm run seed` in production. Create admin account(s) via `init-prod.js` or directly via the admin panel after first launch.

---

## Environment Variables

| Variable         | Default                               | Description                                              |
|------------------|---------------------------------------|----------------------------------------------------------|
| `PORT`           | `3000`                                | HTTP port                                                |
| `SESSION_SECRET` | `checklist-secret-key-change-in-prod` | Express session secret — **change in production**        |
| `NODE_ENV`       | —                                     | Set to `production` for secure cookies                   |
| `SMTP_HOST`      | —                                     | SMTP server hostname (email alerts disabled if not set)  |
| `SMTP_PORT`      | `587`                                 | SMTP port                                                |
| `SMTP_SECURE`    | `false`                               | `true` for port 465 / TLS                                |
| `SMTP_USER`      | —                                     | SMTP username                                            |
| `SMTP_PASS`      | —                                     | SMTP password                                            |
| `APP_URL`        | `http://localhost:3000`               | Base URL used in password-reset email links              |
| `ALERT_EMAIL`    | —                                     | Fallback recipient for flagged-equipment alerts          |
| `FROM_EMAIL`     | SMTP_USER or `noreply@example.com`    | From address for outbound email                          |
| `BACKUP_DIR`     | `./backups`                           | Directory for automatic daily SQLite backups             |

> Admin users can override `ALERT_EMAIL` per-account from **Settings → Notifications**.

---

## Project Structure

```
├── server.js                  # Express app entry point
├── db/
│   ├── database.js            # SQLite schema & connection (better-sqlite3)
│   └── seed.js                # Demo data seeder
├── middleware/
│   └── auth.js                # requireAuth / requireAdmin helpers
├── routes/
│   ├── auth.js                # POST /api/auth/login|logout, GET /api/auth/me
│   ├── admin.js               # Classrooms, equipment, technicians CRUD + audit log
│   ├── checklist.js           # Checklist submission endpoints
│   ├── dashboard.js           # Dashboard data, charts, export, admin-overview
│   ├── handover.js          # Classroom handover form endpoints
│   └── hybrid.js            # Hybrid classroom setup flag endpoints
│   ├── onboarding.js          # Asset agreement endpoints
│   ├── qa.js                  # QA checklist endpoints
│   ├── weekahead.js           # Week ahead XLSX upload & schedule endpoints
│   └── settings.js            # Profile & preferences endpoints
├── utils/
│   ├── mailer.js              # Nodemailer — flag-alert and password-reset email helpers
│   └── backup.js              # Scheduled SQLite backup (daily at 02:00)
└── public/
    ├── css/styles.css         # All styles (light & dark theme, component library)
    ├── js/
    │   ├── admin.js
    │   ├── checklist.js
    │   ├── dashboard.js
    │   ├── handover.js
    │   ├── login.js
    │   ├── onboarding.js
    │   ├── qa.js
    │   ├── reset-password.js      # Forgot-password & reset-password page logic
    │   ├── settings.js
    │   └── week-ahead.js          # Week ahead page — upload, week nav, day tabs
    └── pages/
        ├── admin.html
        ├── checklist.html
        ├── dashboard.html
        ├── handover.html
        ├── login.html
        ├── onboarding.html
        ├── qa.html
        ├── reset-password.html    # Forgot-password request & token-based reset UI
        ├── settings.html
        └── week-ahead.html        # Week ahead schedule viewer & upload page
```

---

## Database Schema (key tables)

| Table                 | Purpose                                             |
|-----------------------|-----------------------------------------------------|
| `users`               | Technicians and admins — includes `email`, `reset_token` (SHA-256 hash), `reset_token_expires` (unix ms) |
| `classrooms`          | Room list                                           |
| `equipment`           | Equipment per classroom                             |
| `checklist_submissions` | One per technician/classroom/date              |
| `checklist_items`     | One row per equipment item per submission           |
| `asset_agreements`    | Onboarding / laptop issuance records + signature    |
| `qa_checklists`       | QA process submissions                              |
| `user_preferences`    | Per-user key/value settings (theme, alert_email)    |
| `audit_log`           | Admin action log                                    |
| `equipment_loans`     | Temporary equipment loan records                    |
| `classroom_handovers` | Session handover records — 12 service checks, 3 sign-off panels (Faculty, Session Producer, Programme Manager) with arrival time, comments, and signature |
| `hybrid_setups`       | Per-day hybrid classroom flags — one record per classroom per date; shared across all technicians |
| `week_ahead_uploads`  | Upload batch records — filename, date range, row count, uploader |
| `week_ahead_events`   | Parsed schedule events — date, time, venue, programme, contacts, tech, IT support; cascades on batch delete |

---

## API Endpoints (summary)

### Auth
| Method | Path                            | Auth  | Description                                         |
|--------|---------------------------------|-------|-----------------------------------------------------|
| POST   | `/api/auth/login`               | —     | Login (returns session cookie)                      |
| POST   | `/api/auth/logout`              | any   | Logout                                              |
| GET    | `/api/auth/me`                  | any   | Current user session info                           |
| POST   | `/api/auth/forgot-password`     | —     | Request password-reset email (admin accounts only); always returns neutral 200 (no user enumeration) |
| POST   | `/api/auth/reset-password`      | —     | Consume reset token and set new password            |

### Settings
| Method | Path                          | Description                                 |
|--------|-------------------------------|---------------------------------------------|
| GET    | `/api/settings/profile`       | Get display name, username, and email       |
| PUT    | `/api/settings/profile`       | Update name, username, email, and password  |
| GET    | `/api/settings/preferences`   | Get theme (+ alert_email for admins)        |
| PUT    | `/api/settings/preferences`   | Update theme / alert_email                  |

### Dashboard
| Method | Path                              | Auth    | Description                 |
|--------|-----------------------------------|---------|-----------------------------|
| GET    | `/api/dashboard/today-progress`   | any     | Classroom coverage tiles    |
| GET    | `/api/dashboard/summary`          | any     | Stats counts                |
| GET    | `/api/dashboard/issues`           | any     | Flagged items table         |
| GET    | `/api/dashboard/charts`           | admin   | Chart data                  |
| GET    | `/api/dashboard/admin-overview`   | admin   | Overview tab data           |
| GET    | `/api/dashboard/export`           | any     | PDF export                  |

### Admin — Admins Management
| Method | Path                  | Auth  | Description                                       |
|--------|-----------------------|-------|---------------------------------------------------|
| GET    | `/api/admins`         | admin | List all admin accounts (includes `isSelf` flag)  |
| POST   | `/api/admins`         | admin | Create a new admin account                        |
| PUT    | `/api/admins/:id`     | admin | Update admin name, email, or password             |
| DELETE | `/api/admins/:id`     | admin | Delete an admin (self-deletion returns 400)       |

### Handover
| Method | Path                    | Auth | Description                                                   |
|--------|-------------------------|------|---------------------------------------------------------------|
| GET    | `/api/handover`         | any  | List records, newest first; `?classroom_id=N&limit=N`         |
| GET    | `/api/handover/:id`     | any  | Single record with `classroom_name`                           |
| POST   | `/api/handover`         | any  | Create handover record; validates `classroom_id` and `handover_date`; strips invalid signature data |

### Hybrid Setups
| Method | Path               | Auth | Description                                                              |
|--------|--------------------|------|--------------------------------------------------------------------------|
| GET    | `/api/hybrid`      | any  | Today's hybrid classrooms; `?date=YYYY-MM-DD` for other dates            |
| POST   | `/api/hybrid`      | any  | Flag a classroom hybrid for today; re-posting updates the note           |
| DELETE | `/api/hybrid/:id`  | any  | Clear a hybrid flag; any authenticated user can clear                    |

### Week Ahead
| Method | Path                        | Auth       | Description                                                        |
|--------|-----------------------------|------------|--------------------------------------------------------------------|
| POST   | `/api/week-ahead/upload`    | technician | Upload XLSX schedule; auto-replaces events for overlapping dates   |
| GET    | `/api/week-ahead`           | any        | Today's events (or `?date=YYYY-MM-DD`)                             |
| GET    | `/api/week-ahead/week`      | any        | Full week from `?start=YYYY-MM-DD` (defaults to current Monday)   |
| GET    | `/api/week-ahead/uploads`   | any        | Upload history (technician sees own, admin sees all)               |
| DELETE | `/api/week-ahead/:batchId`  | any        | Delete batch; technician own only, admin any                       |

---

## Running Tests

```bash
npm test               # Jest
npm run test:coverage  # With coverage report (≥85% line, ≥80% branch)
```

> **243 tests** across 11 suites (auth, checklist, dashboard, middleware, onboarding, QA, admin, loans, handover, hybrid, weekahead).

---

## Security Notes

- All state-mutating API requests are protected by an Origin/Referer CSRF check.
- Passwords are hashed with bcrypt (cost factor 12).
- Content-Security-Policy is enforced via Helmet.
- Rate limiting is applied to all API and page routes (stricter on auth endpoints).
- Session cookies are `httpOnly`, `sameSite: strict`, and `secure` in production.
- SQL queries use parameterised statements (no string interpolation).


## Prerequisites

- Node.js 18+
- npm 8+

## Installation

```bash
# 1. Install dependencies
npm install

# 2. Seed the database with sample data and default accounts
npm run seed

# 3. Start the server
npm start
```

The app runs on **http://localhost:3000** by default.

## Default Credentials

| Role        | Username | Password   |
|-------------|----------|------------|
| Admin       | admin    | admin123   |
| Technician  | tech1    | tech123    |
| Technician  | tech2    | tech123    |
| Technician  | tech3    | tech123    |
| Technician  | tech4    | tech123    |
| Technician  | tech5    | tech123    |

## Environment Variables

| Variable        | Default                               | Description              |
|-----------------|---------------------------------------|--------------------------|
| `PORT`          | `3000`                                | HTTP port to listen on   |
| `SESSION_SECRET`| `checklist-secret-key-change-in-prod` | Express session secret   |

Create a `.env` file (excluded from git) to override these values.

## Usage

### Technicians
1. Log in at `http://localhost:3000`
2. Go to **Checklist** in the navigation
3. Select a classroom and date
4. Set a status for each piece of equipment
5. Add optional notes and submit

### Admins
1. Log in — you are redirected to the **Admin Panel** automatically
2. Use the **Classrooms** tab to add / edit / delete classrooms
3. Use the **Equipment** tab to manage equipment per classroom
4. Use the **Technicians** tab to add or remove technician accounts
5. Use the **Submissions** tab to browse all submitted checklists
6. Visit the **Dashboard** for today's summary stats and flagged issues

## Customising Classrooms & Equipment

Use the Admin Panel (`/admin`) after logging in as `admin`. Changes are persisted immediately to the SQLite database.

To fully reset to the default seed data, run:

```bash
npm run seed
```

> ⚠️ This clears all existing data.

## Project Structure

```
technician-checklist/
├── server.js              # Express entry point
├── db/
│   ├── database.js        # SQLite connection & schema creation
│   └── seed.js            # Seed script
├── routes/
│   ├── auth.js            # Login / logout / me
│   ├── admin.js           # Classroom, equipment, technician CRUD
│   ├── checklist.js       # Checklist submission routes
│   └── dashboard.js       # Summary, issues, CSV export
├── middleware/
│   └── auth.js            # Session auth & role guards
└── public/
    ├── css/styles.css
    ├── js/
    │   ├── login.js
    │   ├── admin.js
    │   ├── checklist.js
    │   └── dashboard.js
    └── pages/
        ├── login.html
        ├── admin.html
        ├── checklist.html
        └── dashboard.html
```

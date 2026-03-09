# Technician Checklist

A mobile-friendly web application that replaces a paper-based daily equipment checklist system. Five technicians submit daily checklists covering equipment functionality across 12 classrooms.

## Features

- **Authentication** — Session-based login with bcrypt-hashed passwords and two roles: `admin` and `technician`
- **Admin Panel** — Manage classrooms, equipment, technicians, and view all submissions
- **Checklist Form** — Technicians select a classroom, report equipment status (Working / Not Working / Needs Repair) and add notes
- **Dashboard** — View today's submissions and flagged issues, filter by date range / classroom / technician, export to CSV
- **Mobile-first** — Responsive design with large touch-friendly buttons

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

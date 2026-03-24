'use strict';

// ─── Shared fetch helper ──────────────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ─── HTML escape ─────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Theme ────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme || 'light');
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
// Builds the sidebar, applies the saved theme, and returns the authenticated user.
// Pass the current page's href (e.g. '/checklist') to mark the correct link active.
// Returns the user object on success, or null if already redirecting to login.
async function initNav(activeHref) {
  let user;
  try {
    user = await apiFetch('/api/auth/me');
  } catch (err) {
    if (!err.status || err.status === 401) window.location.href = '/';
    return null;
  }

  document.getElementById('navUser').textContent = user.full_name;
  const avatarEl = document.getElementById('navAvatar');
  if (avatarEl) avatarEl.textContent = user.full_name[0].toUpperCase();

  const navLinks = document.getElementById('navLinks');
  const links = [];
  if (user.role === 'technician') {
    links.push(`<li><a href="/checklist"${activeHref === '/checklist' ? ' class="active"' : ''}><span class="icon">✅</span> Checklist</a></li>`);
    links.push(`<li><a href="/onboarding"${activeHref === '/onboarding' ? ' class="active"' : ''}><span class="icon">💻</span> Asset Agreement</a></li>`);
    links.push(`<li><a href="/qa"${activeHref === '/qa' ? ' class="active"' : ''}><span class="icon">🔍</span> QA Checklist</a></li>`);
  }
  links.push(`<li><a href="/dashboard"${activeHref === '/dashboard' ? ' class="active"' : ''}><span class="icon">📊</span> Dashboard</a></li>`);
  links.push(`<li><a href="/loans"${activeHref === '/loans' ? ' class="active"' : ''}><span class="icon">🔄</span> Loans</a></li>`);
  if (user.role === 'admin') {
    links.push(`<li><a href="/admin"${activeHref === '/admin' ? ' class="active"' : ''}><span class="icon">⚙️</span> Admin</a></li>`);
  }
  links.push(`<li><a href="/settings"${activeHref === '/settings' ? ' class="active"' : ''}><span class="icon">🔧</span> Settings</a></li>`);
  navLinks.innerHTML = links.join('');

  try {
    const prefs = await apiFetch('/api/settings/preferences');
    applyTheme(prefs.theme);
  } catch (_) { /* ignore */ }

  document.getElementById('logoutBtn').addEventListener('click', () => {
    window.location.href = '/logout';
  });

  // ─── Help Button & Modal ─────────────────────────────────────────────────
  (function injectHelp(role) {
    const logoutBtn = document.getElementById('logoutBtn');
    if (!logoutBtn) return;

    const helpBtn = document.createElement('button');
    helpBtn.id = 'helpBtn';
    helpBtn.className = 'btn btn-block btn-sm';
    helpBtn.style.cssText = 'background:rgba(255,255,255,0.10);color:rgba(255,255,255,0.85);border:1px solid rgba(255,255,255,0.18);margin-bottom:0.5rem';
    helpBtn.textContent = '❓ Help';
    logoutBtn.parentElement.insertBefore(helpBtn, logoutBtn);

    const TABS = [
      {
        id: 'hDashboard', label: '📊 Dashboard',
        html: `<p><strong>Your central hub</strong> — view today's classroom coverage, submission history, flagged equipment and more.</p>
<h4>Key sections</h4>
<ul>
  <li><strong>Today's Coverage</strong> — live view of which rooms have been checked and by whom. Auto-refreshes every 30 s.</li>
  <li><strong>Quick Actions</strong> (technicians) — shortcuts to Checklist, Asset Agreement and QA forms.</li>
  <li><strong>Stats bar</strong> — at-a-glance counts for checks, flags, agreements and QA runs today.</li>
  <li><strong>Filter &amp; Export</strong> — narrow by date range, classroom or technician, then export to PDF.</li>
  <li><strong>Charts</strong> (admins) — daily pulse, equipment health mix, top-maintenance classrooms and technician activity for the last 7–14 days.</li>
</ul>
<h4>Tips</h4>
<ul>
  <li>Unchecked classrooms appear in an orange alert visible to admins.</li>
  <li>Apply filters before clicking <em>Export PDF</em> to download a filtered report.</li>
</ul>`
      },
      {
        id: 'hChecklist', label: '✅ Checklist',
        html: `<p><strong>Daily classroom equipment check</strong> — record the status of every item in a classroom.</p>
<h4>How to submit</h4>
<ol>
  <li>Select the <strong>Classroom</strong> from the dropdown.</li>
  <li>Confirm or change the <strong>Date</strong> (defaults to today).</li>
  <li>For each item choose a status:
    <ul>
      <li>✅ <strong>Working</strong> — functioning normally.</li>
      <li>❌ <strong>Not Working</strong> — completely non-functional.</li>
      <li>⚠️ <strong>Needs Repair</strong> — partial fault or minor issue.</li>
    </ul>
  </li>
  <li>Add optional notes per item, then fill in <em>General Notes</em> if needed.</li>
  <li>Click <strong>Submit Checklist</strong>.</li>
</ol>
<h4>Tips</h4>
<ul>
  <li>If another technician already checked a classroom today, an orange banner shows their name and check-in time.</li>
  <li>Notes from your most recent previous submission are pre-filled to save time.</li>
  <li>Flagged items (Not Working / Needs Repair) automatically trigger an email alert to the admin.</li>
  <li>Re-submitting overwrites your earlier entry for that classroom and date.</li>
</ul>`
      },
      {
        id: 'hAsset', label: '💻 Asset Agreement',
        html: `<p><strong>Issue IT equipment to an employee</strong> — creates a signed digital agreement record.</p>
<h4>How to complete</h4>
<ol>
  <li>Enter the <strong>Employee Name</strong> (required).</li>
  <li>Fill in <strong>Laptop Serial Number</strong> and <strong>SIM Card Number</strong> where applicable.</li>
  <li>Tick the equipment items being issued (Dongle, Charger, Bag, Mouse, Monitor, Keyboard).</li>
  <li>Have the employee sign in the <strong>Signature</strong> box. Use <em>Clear Signature</em> to redo.</li>
  <li>Click <strong>Submit &amp; Save Agreement</strong>.</li>
</ol>
<h4>Tips</h4>
<ul>
  <li>The agreement includes a standard return-on-termination clause.</li>
  <li>Admins can view past agreements in Admin → <em>Asset Agreements</em> tab.</li>
</ul>`
      },
      {
        id: 'hQA', label: '🔍 QA Checklist',
        html: `<p><strong>New-machine setup verification</strong> — confirm a laptop was configured correctly before handover.</p>
<h4>How to complete</h4>
<ol>
  <li>Enter the <strong>Username</strong> the machine is being set up for (required).</li>
  <li>Optionally enter <strong>Machine Serial #</strong> and <strong>Call Ref #</strong>.</li>
  <li>Toggle each task <strong>ON</strong> once it is done. Items are grouped by category (Backup &amp; Restore, System Config, Applications, etc.).</li>
  <li>Add any <strong>Notes</strong> at the bottom, then click <strong>Submit QA Checklist</strong>.</li>
</ol>
<h4>Tips</h4>
<ul>
  <li>You can submit a partial QA and update it later by re-submitting for the same machine.</li>
  <li>Completed records appear in Dashboard → <em>Recent QA Checklists</em>.</li>
</ul>`
      },
    ];

    if (role === 'admin') {
      TABS.push({
        id: 'hAdmin', label: '⚙️ Admin',
        html: `<p><strong>Manage the entire system</strong> — classrooms, equipment, users and all records.</p>
<h4>Tabs at a glance</h4>
<ul>
  <li><strong>Overview</strong> — today's top stats, unchecked classrooms, recent flags.</li>
  <li><strong>Classrooms</strong> — add, rename or delete classrooms.</li>
  <li><strong>Equipment</strong> — manage the equipment list per classroom. Select a classroom first, then add/edit/delete items.</li>
  <li><strong>Technicians</strong> — create, edit or deactivate technician accounts. Reset passwords by editing the account.</li>
  <li><strong>Admins</strong> — manage admin accounts. Admins can reset their password via the Forgot Password link on the login page.</li>
  <li><strong>Checklist Submissions</strong> — search and view all checklist records with full item detail.</li>
  <li><strong>QA Submissions</strong> — browse all QA checklist records.</li>
  <li><strong>Asset Agreements</strong> — view all issued-equipment agreements.</li>
  <li><strong>Audit Log</strong> — append-only log of every action performed in the system.</li>
</ul>
<h4>Tips</h4>
<ul>
  <li>Deleting a classroom or user is permanent and cascades to all related records — use with caution.</li>
  <li>The Audit Log cannot be edited or deleted by anyone.</li>
</ul>`
      });
    }

    TABS.push({
      id: 'hLoans', label: '🔄 Loans',
      html: `<p><strong>Track temporary equipment loans</strong> — log items borrowed by staff and mark them returned when handed back.</p>
<h4>How to log a loan</h4>
<ol>
  <li>Enter the <strong>Borrower Name</strong> (required).</li>
  <li>Describe the <strong>Item</strong> — e.g. Laptop Charger, Mouse, HDMI Cable (required).</li>
  <li>Add an optional <strong>Note</strong> — e.g. "Returns after 14:00".</li>
  <li>Click <strong>Log Loan</strong>.</li>
</ol>
<h4>Marking items returned</h4>
<ul>
  <li>Click <strong>✅ Mark Returned</strong> next to any outstanding loan — any logged-in technician can do this.</li>
  <li>The item moves out of the Outstanding list and records the return time.</li>
</ul>
<h4>History view</h4>
<ul>
  <li>Switch to <strong>All History</strong> to see returned items with a green badge and return timestamp.</li>
</ul>`
    });

    TABS.push({
      id: 'hSettings', label: '🔧 Settings',
      html: `<p><strong>Manage your account and preferences.</strong></p>
<h4>Profile tab</h4>
<ul>
  <li>Update your <strong>Display Name</strong>, <strong>Username</strong> and <strong>Email</strong>.</li>
  <li><strong>Change Password</strong> — enter your current password, then the new one (min 8 characters).</li>
</ul>
<h4>Preferences tab</h4>
<ul>
  <li>Toggle <strong>Dark Mode</strong> — saved to your account and applied across all devices.</li>
</ul>
<h4>Notifications tab (admins only)</h4>
<ul>
  <li>Set the <strong>Flag Alert Email</strong> that receives alerts when broken equipment is logged.</li>
  <li>Leave blank to use the system-wide <code>ALERT_EMAIL</code> environment variable.</li>
</ul>`
    });

    const tabBtns = TABS.map((t, i) =>
      `<button class="tab-btn${i === 0 ? ' active' : ''}" data-htab="${t.id}">${t.label}</button>`
    ).join('');

    const tabPanels = TABS.map((t, i) =>
      `<div id="${t.id}" class="tab-content${i === 0 ? ' active' : ''}"><div class="help-body">${t.html}</div></div>`
    ).join('');

    const overlayEl = document.createElement('div');
    overlayEl.id = 'helpModalOverlay';
    overlayEl.className = 'modal-overlay';
    overlayEl.innerHTML = `
      <div class="modal" style="max-width:680px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
          <h2 class="modal-title" style="margin:0">❓ Help &amp; Guide</h2>
          <button id="helpModalClose" class="btn btn-secondary btn-sm" style="min-height:unset;padding:0.3rem 0.75rem">✕ Close</button>
        </div>
        <div class="tabs" style="flex-wrap:wrap;gap:0.5rem 0;margin-bottom:1.5rem">${tabBtns}</div>
        <div style="max-height:55vh;overflow-y:auto;padding-right:4px">${tabPanels}</div>
      </div>`;
    document.body.appendChild(overlayEl);

    helpBtn.addEventListener('click', () => overlayEl.classList.add('open'));
    overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) overlayEl.classList.remove('open'); });
    overlayEl.querySelector('#helpModalClose').addEventListener('click', () => overlayEl.classList.remove('open'));
    overlayEl.querySelectorAll('[data-htab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        overlayEl.querySelectorAll('[data-htab]').forEach((b) => b.classList.remove('active'));
        overlayEl.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
        btn.classList.add('active');
        overlayEl.querySelector('#' + btn.dataset.htab).classList.add('active');
      });
    });
  })(user.role);

  return user;
}

// ─── Classroom Status Panel ───────────────────────────────────────────────────
// Renders today's classroom coverage into the element with the given id.
// currentUserId is used to flag "Your submission" on the matching entry.
// Returns the raw data array so callers can use it (e.g. for existingAlert).
async function loadClassroomStatus(containerId, currentUserId) {
  const el = document.getElementById(containerId);
  if (!el) return [];

  const STATUS_ICON = { working: '✅', not_working: '❌', needs_repair: '⚠️' };
  const STATUS_LABEL = { working: 'Working', not_working: 'Not Working', needs_repair: 'Needs Repair' };

  let data;
  try {
    data = await apiFetch('/api/dashboard/classroom-status-today');
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
    return [];
  }

  if (!data.length) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:0.875rem;padding:0.5rem 0">No classrooms configured.</p>';
    return data;
  }

  el.innerHTML = data.map((classroom) => {
    const checked = classroom.submissions.length > 0;
    const headerBg    = checked ? 'var(--success-light, #d1fae5)' : 'var(--gray-100, #f3f4f6)';
    const headerColor = checked ? '#065f46' : 'var(--text-muted)';
    const checkIcon   = checked ? '✅' : '○';

    const subRows = classroom.submissions.map((sub) => {
      const isMe = sub.technician_id === currentUserId;
      const initials = esc(sub.technician_name).charAt(0).toUpperCase();
      const timeStr = sub.submitted_at
        ? new Date(sub.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';
      const myBadge = isMe
        ? '<span style="background:#4f46e5;color:#fff;border-radius:4px;padding:1px 6px;font-size:0.7rem;margin-left:6px">You</span>'
        : '';
      const generalNote = sub.general_notes
        ? `<div style="font-size:0.78rem;color:var(--text-muted);margin:4px 0 6px 0;padding-left:32px">${esc(sub.general_notes)}</div>`
        : '';
      const itemRows = sub.items.map((item) => {
        const icon = STATUS_ICON[item.status] || '?';
        const label = STATUS_LABEL[item.status] || item.status;
        const note = item.notes ? ` — <em style="color:var(--text-muted)">${esc(item.notes)}</em>` : '';
        return `<div style="display:flex;gap:6px;align-items:baseline;font-size:0.78rem;padding:2px 0 2px 32px">
          <span style="min-width:18px">${icon}</span>
          <span><strong>${esc(item.equipment_name)}</strong>: ${label}${note}</span>
        </div>`;
      }).join('');

      return `<div style="padding:8px 12px;border-top:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
          <div style="width:26px;height:26px;border-radius:50%;background:#4f46e5;color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;flex-shrink:0">${initials}</div>
          <span style="font-weight:600;font-size:0.875rem">${esc(sub.technician_name)}</span>
          ${myBadge}
          <span style="margin-left:auto;font-size:0.75rem;color:var(--text-muted)">${timeStr}</span>
        </div>
        ${generalNote}
        ${itemRows}
      </div>`;
    }).join('');

    const emptyRow = !checked
      ? `<div style="padding:8px 12px;border-top:1px solid var(--border);font-size:0.82rem;color:var(--text-muted)">Not yet checked today</div>`
      : '';

    return `<div style="border:1px solid var(--border);border-radius:10px;margin-bottom:12px;overflow:hidden">
      <div style="background:${headerBg};padding:8px 12px;display:flex;align-items:center;gap:8px">
        <span style="font-size:1rem">${checkIcon}</span>
        <span style="font-weight:700;color:${headerColor}">${esc(classroom.name)}</span>
        <span style="margin-left:auto;font-size:0.75rem;color:${headerColor}">${classroom.submissions.length} submission${classroom.submissions.length !== 1 ? 's' : ''}</span>
      </div>
      ${subRows}${emptyRow}
    </div>`;
  }).join('');

  return data;
}

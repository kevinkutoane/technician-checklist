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

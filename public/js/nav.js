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

'use strict';

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

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme || 'light');
}

// ─── Nav ─────────────────────────────────────────────────────────────────────
let currentUser = null;

async function initNav() {
  try {
    currentUser = await apiFetch('/api/auth/me');
  } catch (err) {
    if (!err.status || err.status === 401) window.location.href = '/';
    return;
  }

  document.getElementById('navUser').textContent = currentUser.full_name;
  const avatarEl = document.getElementById('navAvatar');
  if (avatarEl) avatarEl.textContent = currentUser.full_name[0].toUpperCase();

  const navLinks = document.getElementById('navLinks');
  const links = [];
  if (currentUser.role === 'technician') {
    links.push(`<li><a href="/checklist"><span class="icon">✅</span> Checklist</a></li>`);
    links.push(`<li><a href="/onboarding"><span class="icon">💻</span> Asset Agreement</a></li>`);
    links.push(`<li><a href="/qa"><span class="icon">🔍</span> QA Checklist</a></li>`);
  }
  links.push(`<li><a href="/dashboard"><span class="icon">📊</span> Dashboard</a></li>`);
  if (currentUser.role === 'admin') {
    links.push(`<li><a href="/admin"><span class="icon">⚙️</span> Admin</a></li>`);
  }
  links.push(`<li><a href="/settings" class="active"><span class="icon">🔧</span> Settings</a></li>`);
  navLinks.innerHTML = links.join('');

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  });

  // Show Notifications tab for admins only
  if (currentUser.role === 'admin') {
    document.getElementById('notificationsTabBtn').classList.remove('hidden');
  }
}

// ─── Tab handling ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function showMsg(id, text, isError = false) {
  const el = document.getElementById(id);
  el.className = isError ? 'alert alert-danger' : 'alert alert-success';
  el.textContent = text;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

// ─── Profile ─────────────────────────────────────────────────────────────────
async function loadProfile() {
  try {
    const p = await apiFetch('/api/settings/profile');
    document.getElementById('inputFullName').value = p.full_name;
    document.getElementById('inputUsername').value = p.username;
  } catch (err) {
    showMsg('profileMsg', err.message, true);
  }
}

document.getElementById('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await apiFetch('/api/settings/profile', {
      method: 'PUT',
      body: JSON.stringify({
        full_name: document.getElementById('inputFullName').value.trim(),
        username: document.getElementById('inputUsername').value.trim(),
      }),
    });
    showMsg('profileMsg', 'Profile saved successfully.');
    document.getElementById('navUser').textContent = document.getElementById('inputFullName').value.trim();
  } catch (err) {
    showMsg('profileMsg', err.message, true);
  }
});

document.getElementById('passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const newPw = document.getElementById('inputNewPassword').value;
  const confirmPw = document.getElementById('inputConfirmPassword').value;
  if (newPw !== confirmPw) {
    showMsg('passwordMsg', 'New passwords do not match.', true);
    return;
  }
  try {
    await apiFetch('/api/settings/profile', {
      method: 'PUT',
      body: JSON.stringify({
        full_name: document.getElementById('inputFullName').value.trim(),
        username: document.getElementById('inputUsername').value.trim(),
        current_password: document.getElementById('inputCurrentPassword').value,
        new_password: newPw,
      }),
    });
    showMsg('passwordMsg', 'Password changed successfully.');
    e.target.reset();
  } catch (err) {
    showMsg('passwordMsg', err.message, true);
  }
});

// ─── Preferences ─────────────────────────────────────────────────────────────
async function loadPreferences() {
  try {
    const p = await apiFetch('/api/settings/preferences');
    applyTheme(p.theme);
    document.getElementById('darkModeToggle').checked = p.theme === 'dark';
    if (p.alert_email !== undefined) {
      document.getElementById('inputAlertEmail').value = p.alert_email || '';
    }
  } catch (err) {
    console.error('Preferences load error:', err);
  }
}

document.getElementById('darkModeToggle').addEventListener('change', async (e) => {
  const theme = e.target.checked ? 'dark' : 'light';
  applyTheme(theme);
  try {
    await apiFetch('/api/settings/preferences', {
      method: 'PUT',
      body: JSON.stringify({ theme }),
    });
  } catch (err) {
    console.error('Failed to save theme:', err);
  }
});

// ─── Notifications ────────────────────────────────────────────────────────────
document.getElementById('notificationsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await apiFetch('/api/settings/preferences', {
      method: 'PUT',
      body: JSON.stringify({
        alert_email: document.getElementById('inputAlertEmail').value.trim(),
      }),
    });
    showMsg('notificationsMsg', 'Alert email saved.');
  } catch (err) {
    showMsg('notificationsMsg', err.message, true);
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────
(async function init() {
  await initNav();
  await Promise.all([loadProfile(), loadPreferences()]);
})();

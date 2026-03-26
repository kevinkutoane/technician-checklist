'use strict';

let currentUser = null;

// ─── Tab handling ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
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
    document.getElementById('inputEmail').value = p.email || '';
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
        email: document.getElementById('inputEmail').value.trim(),
      }),
    });
    showMsg('profileMsg', 'Profile saved successfully.');
    const newName = document.getElementById('inputFullName').value.trim();
    document.getElementById('navUser').textContent = newName;
    const avatarEl = document.getElementById('navAvatar');
    if (avatarEl && newName) avatarEl.textContent = newName[0].toUpperCase();
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
  if (newPw.length < 8) {
    showMsg('passwordMsg', 'New password must be at least 8 characters.', true);
    return;
  }
  try {
    await apiFetch('/api/settings/profile', {
      method: 'PUT',
      body: JSON.stringify({
        full_name: document.getElementById('inputFullName').value.trim(),
        username: document.getElementById('inputUsername').value.trim(),
        email: document.getElementById('inputEmail').value.trim(),
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
  currentUser = await initNav('/settings');
  if (!currentUser) return;
  if (currentUser.role === 'admin') {
    document.getElementById('notificationsTabBtn').classList.remove('hidden');
  }
  await Promise.all([loadProfile(), loadPreferences()]);
})();

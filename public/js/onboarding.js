'use strict';

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let currentUser = null;

// ─── Nav ─────────────────────────────────────────────────────────────────────
async function initNav() {
  try {
    currentUser = await apiFetch('/api/auth/me');
  } catch {
    window.location.href = '/';
    return;
  }

  document.getElementById('navUser').textContent = currentUser.full_name;
  const avatarEl = document.getElementById('navAvatar');
  if (avatarEl) avatarEl.textContent = currentUser.full_name[0].toUpperCase();

  const navLinks = document.getElementById('navLinks');
  const links = [];
  if (currentUser.role === 'technician') {
    links.push(`<li><a href="/checklist"><span class="icon">✅</span> Checklist</a></li>`);
    links.push(`<li><a href="/onboarding" class="active"><span class="icon">💻</span> Asset Agreement</a></li>`);
    links.push(`<li><a href="/qa"><span class="icon">🔍</span> QA Checklist</a></li>`);
  }
  links.push(`<li><a href="/dashboard"><span class="icon">📊</span> Dashboard</a></li>`);
  if (currentUser.role === 'admin') {
    links.push(`<li><a href="/admin"><span class="icon">⚙️</span> Admin</a></li>`);
  }
  navLinks.innerHTML = links.join('');

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  });
}

// ─── Form Logic ─────────────────────────────────────────────────────────────
document.getElementById('submitBtn').addEventListener('click', async () => {
  const employee_name = document.getElementById('employeeName').value.trim();
  
  const errEl = document.getElementById('submitError');
  const successEl = document.getElementById('submitSuccess');
  
  errEl.classList.add('hidden');
  successEl.classList.add('hidden');

  if (!employee_name) {
    errEl.textContent = 'Employee name is required.';
    errEl.classList.remove('hidden');
    return;
  }

  const payload = {
    employee_name,
    laptop_serial_number: document.getElementById('laptopSerialNumber').value.trim(),
    sim_card_number: document.getElementById('simCardNumber').value.trim(),
    dongle: document.getElementById('dongle').checked,
    laptop_charger: document.getElementById('laptopCharger').checked,
    laptop_bag: document.getElementById('laptopBag').checked,
    mouse: document.getElementById('mouse').checked,
    monitor: document.getElementById('monitor').checked,
    keyboard: document.getElementById('keyboard').checked
  };

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    await apiFetch('/api/onboarding', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    successEl.textContent = 'Asset Agreement saved successfully!';
    successEl.classList.remove('hidden');
    
    // Reset form
    document.getElementById('assetAgreementForm').reset();
    
    await loadHistory();
  } catch (err) {
    errEl.textContent = err.message || 'Failed to save Asset Agreement.';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Asset Agreement';
  }
});

// ─── History Logic ──────────────────────────────────────────────────────────
async function loadHistory() {
  const container = document.getElementById('historyList');
  try {
    const list = await apiFetch('/api/onboarding?limit=5');
    if (!list.length) {
      container.innerHTML = '<div class="empty-state"><p>No recent agreements.</p></div>';
      return;
    }
    
    container.innerHTML = list.map(item => `
      <div class="history-item" style="padding: 10px; border-bottom: 1px solid var(--border);">
        <strong>${esc(item.employee_name)}</strong> 
        <br/><small style="color: var(--text-muted);">SN: ${esc(item.laptop_serial_number || 'N/A')}</small>
        <br/><small style="color: var(--text-muted);">Issued by ${esc(item.technician_name)} on ${item.submission_date}</small>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="alert alert-danger">Failed to load history</div>';
  }
}

// ─── Init ───────────────────────────────────────────────────────────────────
(async function init() {
  await initNav();
  await loadHistory();
})();

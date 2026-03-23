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

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let currentUser = null;
let selectedEquipment = [];
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme || 'light');
}
// ─── Nav ─────────────────────────────────────────────────────────────────────
async function initNav() {
  try {
    currentUser = await apiFetch('/api/auth/me');
  } catch (err) {
    // Only redirect to login on genuine 401 — not on rate-limit (429) or server errors
    if (!err.status || err.status === 401) window.location.href = '/';
    return;
  }

  document.getElementById('navUser').textContent = currentUser.full_name;
  const avatarEl = document.getElementById('navAvatar');
  if (avatarEl) avatarEl.textContent = currentUser.full_name[0].toUpperCase();

  const navLinks = document.getElementById('navLinks');
  const links = [];
  if (currentUser.role === 'technician') {
    links.push(`<li><a href="/checklist" class="active"><span class="icon">✅</span> Checklist</a></li>`);
    links.push(`<li><a href="/onboarding"><span class="icon">💻</span> Asset Agreement</a></li>`);
    links.push(`<li><a href="/qa"><span class="icon">🔍</span> QA Checklist</a></li>`);
  }
  links.push(`<li><a href="/dashboard"><span class="icon">📊</span> Dashboard</a></li>`);
  if (currentUser.role === 'admin') {
    links.push(`<li><a href="/admin"><span class="icon">⚙️</span> Admin</a></li>`);
  }
  links.push(`<li><a href="/settings"><span class="icon">🔧</span> Settings</a></li>`);
  navLinks.innerHTML = links.join('');

  // Apply saved theme
  try {
    const prefs = await apiFetch('/api/settings/preferences');
    applyTheme(prefs.theme);
  } catch (_) { /* ignore */ }

  document.getElementById('logoutBtn').addEventListener('click', () => {
    window.location.href = '/logout';
  });
}
async function loadClassrooms() {
  try {
    const classrooms = await apiFetch('/api/classrooms');
    const sel = document.getElementById('classroomSelect');
    sel.innerHTML = '<option value="">-- Select a classroom --</option>' +
      classrooms.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  } catch (err) {
    console.error('Failed to load classrooms', err);
  }
}

// ─── Controls ────────────────────────────────────────────────────────────────
const classroomSelect = document.getElementById('classroomSelect');
const submissionDateInput = document.getElementById('submissionDate');
const checklistForm = document.getElementById('checklistForm');

// Set today's date
submissionDateInput.value = new Date().toISOString().slice(0, 10);

async function loadChecklistData() {
  const classroomId = classroomSelect.value;
  if (!classroomId) {
    checklistForm.classList.add('hidden');
    return;
  }

  document.getElementById('loadingSpinner').classList.remove('hidden');
  checklistForm.classList.add('hidden');

  try {
    // Load equipment
    selectedEquipment = await apiFetch(`/api/equipment/${classroomId}`);

    if (!selectedEquipment.length) {
      alert('No equipment configured for this classroom. Please contact an admin.');
      document.getElementById('loadingSpinner').classList.add('hidden');
      return;
    }

    // Check for existing submission
    const date = submissionDateInput.value;
    const params = new URLSearchParams({
      classroom_id: classroomId,
      technician_id: currentUser.id,
      date,
    });
    const existing = await apiFetch(`/api/checklists?${params}`);
    const existingAlert = document.getElementById('existingAlert');
    if (existing.length > 0) {
      existingAlert.classList.remove('hidden');
    } else {
      existingAlert.classList.add('hidden');
    }

    renderEquipmentList(selectedEquipment);
    document.getElementById('generalNotes').value = '';
    checklistForm.classList.remove('hidden');

    // Pre-fill notes from most recent previous submission
    try {
      const prevNotes = await apiFetch(`/api/checklists/latest-notes?classroom_id=${classroomId}`);
      if (prevNotes.length > 0) {
        const noteMap = Object.fromEntries(prevNotes.map((n) => [n.equipment_id, n.notes]));
        for (const eq of selectedEquipment) {
          const prev = noteMap[eq.id];
          if (prev) {
            const noteInput = document.getElementById(`notes-${eq.id}`);
            if (noteInput) noteInput.value = prev;
          }
        }
      }
    } catch (_) {
      // Pre-fill is best-effort — ignore errors
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    document.getElementById('loadingSpinner').classList.add('hidden');
  }
}

classroomSelect.addEventListener('change', loadChecklistData);
submissionDateInput.addEventListener('change', loadChecklistData);

function renderEquipmentList(equipment) {
  const container = document.getElementById('equipmentList');
  container.innerHTML = equipment.map((eq) => `
    <div class="equipment-item" id="equip-${eq.id}" data-id="${eq.id}">
      <div class="equipment-name">📌 ${esc(eq.name)}</div>
      <div class="status-options">
        <button type="button" class="status-btn" data-equip="${eq.id}" data-status="working">✅ Working</button>
        <button type="button" class="status-btn" data-equip="${eq.id}" data-status="not_working">❌ Not Working</button>
        <button type="button" class="status-btn" data-equip="${eq.id}" data-status="needs_repair">⚠️ Needs Repair</button>
      </div>
      <div class="item-notes">
        <input
          class="form-control"
          type="text"
          id="notes-${eq.id}"
          placeholder="Notes for this item (optional)"
        />
      </div>
    </div>
  `).join('');

  // Attach status button handlers
  container.querySelectorAll('.status-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const equipId = btn.dataset.equip;
      const status = btn.dataset.status;
      const itemEl = document.getElementById(`equip-${equipId}`);

      // Clear other selected buttons for this equipment
      itemEl.querySelectorAll('.status-btn').forEach((b) => {
        b.className = 'status-btn';
      });

      // Set selected
      btn.classList.add(`selected-${status}`);

      // Update container border
      itemEl.className = `equipment-item status-${status}`;
    });
  });
}

// ─── Submit ────────────────────────────────────────────────────────────────
document.getElementById('cancelBtn').addEventListener('click', () => {
  checklistForm.classList.add('hidden');
  document.getElementById('submitSuccess').classList.add('hidden');
  document.getElementById('submitError').classList.add('hidden');
});

document.getElementById('submitBtn').addEventListener('click', async () => {
  const classroomId = classroomSelect.value;
  const date = submissionDateInput.value;
  const generalNotes = document.getElementById('generalNotes').value.trim();

  const errEl = document.getElementById('submitError');
  const successEl = document.getElementById('submitSuccess');
  errEl.classList.add('hidden');
  successEl.classList.add('hidden');

  // Build items array
  const items = [];
  let missingStatus = false;

  for (const eq of selectedEquipment) {
    const itemEl = document.getElementById(`equip-${eq.id}`);
    const selectedBtn = itemEl.querySelector('.status-btn[class*="selected-"]');
    if (!selectedBtn) {
      missingStatus = true;
      itemEl.style.outline = '2px solid var(--danger)';
      continue;
    }
    itemEl.style.outline = '';
    const status = selectedBtn.dataset.status;
    const notes = document.getElementById(`notes-${eq.id}`).value.trim();
    items.push({ equipment_id: eq.id, status, notes });
  }

  if (missingStatus) {
    errEl.textContent = 'Please select a status for all equipment items.';
    errEl.classList.remove('hidden');
    return;
  }

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  try {
    await apiFetch('/api/checklists', {
      method: 'POST',
      body: JSON.stringify({ classroom_id: classroomId, submission_date: date, general_notes: generalNotes, items }),
    });
    successEl.textContent = '✅ Checklist submitted successfully!';
    successEl.classList.remove('hidden');
    checklistForm.classList.add('hidden');
    // Reset form
    classroomSelect.value = '';
  } catch (err) {
    errEl.textContent = `Error: ${err.message}`;
    errEl.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Checklist';
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────
(async function init() {
  await initNav();
  await loadClassrooms();
})();

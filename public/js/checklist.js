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
let selectedEquipment = [];

// ─── Nav ─────────────────────────────────────────────────────────────────────
async function initNav() {
  try {
    currentUser = await apiFetch('/api/auth/me');
  } catch {
    window.location.href = '/';
    return;
  }

  document.getElementById('navUser').textContent = currentUser.full_name;

  const navLinks = document.getElementById('navLinks');
  const links = [
    `<li><a href="/checklist" class="active">Checklist</a></li>`,
    `<li><a href="/dashboard">Dashboard</a></li>`,
  ];
  if (currentUser.role === 'admin') {
    links.push(`<li><a href="/admin">Admin</a></li>`);
  }
  navLinks.innerHTML = links.join('');

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  });
}

// ─── Load classrooms ──────────────────────────────────────────────────────────
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
const loadBtn = document.getElementById('loadChecklistBtn');
const checklistForm = document.getElementById('checklistForm');

// Set today's date
submissionDateInput.value = new Date().toISOString().slice(0, 10);

classroomSelect.addEventListener('change', () => {
  loadBtn.disabled = !classroomSelect.value;
});

loadBtn.addEventListener('click', async () => {
  const classroomId = classroomSelect.value;
  if (!classroomId) return;

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
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    document.getElementById('loadingSpinner').classList.add('hidden');
  }
});

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
    loadBtn.disabled = true;
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

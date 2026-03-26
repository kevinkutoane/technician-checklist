'use strict';

let currentUser = null;
let selectedEquipment = [];
let loadChecklistSeq = 0;

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
  const seq = ++loadChecklistSeq;
  const classroomId = classroomSelect.value;
  const errEl = document.getElementById('loadError');
  if (errEl) errEl.classList.add('hidden');
  if (!classroomId) {
    checklistForm.classList.add('hidden');
    return;
  }

  document.getElementById('loadingSpinner').classList.remove('hidden');
  checklistForm.classList.add('hidden');

  try {
    // Load equipment
    selectedEquipment = await apiFetch(`/api/equipment/${classroomId}`);
    if (seq !== loadChecklistSeq) return;

    if (!selectedEquipment.length) {
      if (errEl) { errEl.textContent = 'No equipment configured for this classroom. Please contact an admin.'; errEl.classList.remove('hidden'); }
      document.getElementById('loadingSpinner').classList.add('hidden');
      return;
    }

    // Check for existing submission
    const date = submissionDateInput.value;
    const today = new Date().toISOString().slice(0, 10);
    const existingAlert = document.getElementById('existingAlert');
    const detailEl    = document.getElementById('existingAlertDetail');
    const msgEl       = document.getElementById('existingAlertMsg');

    if (date === today) {
      // For today: statusData (from dashboard API) contains submissions for ALL techs
      const room  = statusData.find((c) => String(c.id) === String(classroomId));
      const subs  = room ? room.submissions : [];
      const others = subs.filter((s) => s.technician_id !== currentUser.id);
      const isMine = subs.some((s) => s.technician_id === currentUser.id);

      if (subs.length > 0) {
        existingAlert.classList.remove('hidden');
        if (msgEl) {
          if (others.length > 0 && !isMine) {
            msgEl.textContent = 'This classroom was already checked by another technician today.';
          } else if (others.length > 0 && isMine) {
            msgEl.textContent = 'This classroom has already been checked today (including by you). Submitting again will overwrite your entry.';
          } else {
            msgEl.textContent = 'You already submitted a checklist for this classroom today. Submitting again will overwrite it.';
          }
        }
        if (detailEl) {
          detailEl.innerHTML = subs.map((s) => {
            const isMe = s.technician_id === currentUser.id;
            const time = s.submitted_at
              ? new Date(s.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '';
            const nameHtml = isMe
              ? '<strong>You</strong>'
              : `<strong>${esc(s.technician_name)}</strong>`;
            return `<div>👤 ${nameHtml} &mdash; checked in at ${time}</div>`;
          }).join('');
        }
      } else {
        existingAlert.classList.add('hidden');
        if (detailEl) detailEl.innerHTML = '';
      }
    } else {
      // For past/future dates: check current user's own submission via API
      const params = new URLSearchParams({ classroom_id: classroomId, technician_id: currentUser.id, date });
      const existing = await apiFetch(`/api/checklists?${params}`);
      if (existing.length > 0) {
        existingAlert.classList.remove('hidden');
        if (msgEl) msgEl.textContent = 'You already submitted a checklist for this classroom on this date. Submitting again will overwrite it.';
        if (detailEl) detailEl.innerHTML = '';
      } else {
        existingAlert.classList.add('hidden');
        if (detailEl) detailEl.innerHTML = '';
      }
    }

    renderEquipmentList(selectedEquipment);
    document.getElementById('generalNotes').value = '';
    checklistForm.classList.remove('hidden');

    // Pre-fill notes from most recent previous submission
    try {
      const prevNotes = await apiFetch(`/api/checklists/latest-notes?classroom_id=${classroomId}`);
      if (seq !== loadChecklistSeq) return;
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
    if (seq !== loadChecklistSeq) return;
    if (errEl) { errEl.textContent = `Error: ${err.message}`; errEl.classList.remove('hidden'); }
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
    // Refresh the status panel so the new submission shows immediately
    await refreshStatus();
  } catch (err) {
    errEl.textContent = `Error: ${err.message}`;
    errEl.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Checklist';
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────
let statusData = [];   // cache from loadClassroomStatus — used by existingAlert
let statusPollId = null;

async function refreshStatus() {
  statusData = await loadClassroomStatus('todayStatusPanel', currentUser.id);
}

(async function init() {
  currentUser = await initNav('/checklist');
  if (!currentUser) return;
  await Promise.all([loadClassrooms(), refreshStatus()]);
  statusPollId = setInterval(refreshStatus, 30_000);
  window.addEventListener('beforeunload', () => clearInterval(statusPollId));
})();

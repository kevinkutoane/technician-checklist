'use strict';

// ─── Shared helpers ────────────────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function statusBadge(status) {
  const labels = { working: '✅ Working', not_working: '❌ Not Working', needs_repair: '⚠️ Needs Repair' };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

// ─── Nav / Auth ────────────────────────────────────────────────────────────
let currentUser = null;

async function initNav() {
  try {
    currentUser = await apiFetch('/api/auth/me');
  } catch {
    window.location.href = '/';
    return;
  }

  document.getElementById('navUser').textContent = currentUser.full_name;

  const navLinks = document.getElementById('navLinks');
  navLinks.innerHTML = `
    <li><a href="/checklist">Checklist</a></li>
    <li><a href="/dashboard">Dashboard</a></li>
    <li><a href="/admin" class="active">Admin</a></li>
  `;

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  });
}

// ─── Tab handling ──────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ─── Modals ────────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.getElementById('closeClassroomModal').addEventListener('click', () => closeModal('classroomModal'));
document.getElementById('closeEquipmentModal').addEventListener('click', () => closeModal('equipmentModal'));
document.getElementById('closeTechnicianModal').addEventListener('click', () => closeModal('technicianModal'));

// Close modal on overlay click
['classroomModal', 'equipmentModal', 'technicianModal'].forEach((id) => {
  document.getElementById(id).addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal(id);
  });
});

// ─── Classrooms ────────────────────────────────────────────────────────────
let classrooms = [];

async function loadClassrooms() {
  const el = document.getElementById('classroomsList');
  el.innerHTML = '<div class="spinner"></div>';
  try {
    classrooms = await apiFetch('/api/classrooms');
    renderClassrooms();
    populateClassroomSelects();
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

function renderClassrooms() {
  const el = document.getElementById('classroomsList');
  if (!classrooms.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🏫</div><p>No classrooms yet</p></div>';
    return;
  }
  el.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead><tr><th>Name</th><th>Building</th><th>Floor</th><th>Actions</th></tr></thead>
        <tbody>
          ${classrooms.map((c) => `
            <tr>
              <td><strong>${esc(c.name)}</strong></td>
              <td>${esc(c.building || '—')}</td>
              <td>${esc(c.floor || '—')}</td>
              <td>
                <button class="btn btn-secondary btn-sm" onclick="editClassroom(${c.id})">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteClassroom(${c.id}, '${esc(c.name)}')">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function populateClassroomSelects() {
  const selects = ['equipClassroomFilter', 'equipmentClassroom', 'subClassroomFilter'];
  selects.forEach((selId) => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const prev = sel.value;
    const isFilter = selId !== 'equipmentClassroom';
    sel.innerHTML = (isFilter ? '<option value="">All</option>' : '') +
      classrooms.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    if (prev) sel.value = prev;
  });
}

document.getElementById('addClassroomBtn').addEventListener('click', () => {
  document.getElementById('classroomModalTitle').textContent = 'Add Classroom';
  document.getElementById('classroomId').value = '';
  document.getElementById('classroomName').value = '';
  document.getElementById('classroomBuilding').value = '';
  document.getElementById('classroomFloor').value = '';
  document.getElementById('classroomModalError').classList.add('hidden');
  openModal('classroomModal');
});

window.editClassroom = function (id) {
  const c = classrooms.find((x) => x.id === id);
  if (!c) return;
  document.getElementById('classroomModalTitle').textContent = 'Edit Classroom';
  document.getElementById('classroomId').value = c.id;
  document.getElementById('classroomName').value = c.name;
  document.getElementById('classroomBuilding').value = c.building || '';
  document.getElementById('classroomFloor').value = c.floor || '';
  document.getElementById('classroomModalError').classList.add('hidden');
  openModal('classroomModal');
};

window.deleteClassroom = async function (id, name) {
  if (!confirm(`Delete classroom "${name}"? This will also delete all its equipment and submissions.`)) return;
  try {
    await apiFetch(`/api/classrooms/${id}`, { method: 'DELETE' });
    await loadClassrooms();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
};

document.getElementById('saveClassroomBtn').addEventListener('click', async () => {
  const id = document.getElementById('classroomId').value;
  const name = document.getElementById('classroomName').value.trim();
  const building = document.getElementById('classroomBuilding').value.trim();
  const floor = document.getElementById('classroomFloor').value.trim();
  const errEl = document.getElementById('classroomModalError');

  if (!name) { errEl.textContent = 'Name is required'; errEl.classList.remove('hidden'); return; }
  errEl.classList.add('hidden');

  try {
    if (id) {
      await apiFetch(`/api/classrooms/${id}`, { method: 'PUT', body: JSON.stringify({ name, building, floor }) });
    } else {
      await apiFetch('/api/classrooms', { method: 'POST', body: JSON.stringify({ name, building, floor }) });
    }
    closeModal('classroomModal');
    await loadClassrooms();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

// ─── Equipment ─────────────────────────────────────────────────────────────
let equipmentList = [];

document.getElementById('equipClassroomFilter').addEventListener('change', async (e) => {
  if (e.target.value) await loadEquipment(e.target.value);
  else document.getElementById('equipmentList').innerHTML =
    '<div class="empty-state"><div class="empty-icon">📦</div><p>Select a classroom</p></div>';
});

async function loadEquipment(classroomId) {
  const el = document.getElementById('equipmentList');
  el.innerHTML = '<div class="spinner"></div>';
  try {
    equipmentList = await apiFetch(`/api/equipment/${classroomId}`);
    renderEquipment(classroomId);
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

function renderEquipment(classroomId) {
  const el = document.getElementById('equipmentList');
  if (!equipmentList.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>No equipment for this classroom yet</p></div>';
    return;
  }
  el.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead><tr><th>Name</th><th>Description</th><th>Actions</th></tr></thead>
        <tbody>
          ${equipmentList.map((eq) => `
            <tr>
              <td><strong>${esc(eq.name)}</strong></td>
              <td>${esc(eq.description || '—')}</td>
              <td>
                <button class="btn btn-secondary btn-sm" onclick="editEquipment(${eq.id}, ${classroomId})">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteEquipment(${eq.id}, '${esc(eq.name)}', ${classroomId})">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

document.getElementById('addEquipmentBtn').addEventListener('click', () => {
  document.getElementById('equipmentModalTitle').textContent = 'Add Equipment';
  document.getElementById('equipmentId').value = '';
  document.getElementById('equipmentName').value = '';
  document.getElementById('equipmentDescription').value = '';
  document.getElementById('equipmentModalError').classList.add('hidden');
  // Pre-select current filter classroom
  const filterVal = document.getElementById('equipClassroomFilter').value;
  if (filterVal) document.getElementById('equipmentClassroom').value = filterVal;
  openModal('equipmentModal');
});

window.editEquipment = function (id, classroomId) {
  const eq = equipmentList.find((x) => x.id === id);
  if (!eq) return;
  document.getElementById('equipmentModalTitle').textContent = 'Edit Equipment';
  document.getElementById('equipmentId').value = eq.id;
  document.getElementById('equipmentName').value = eq.name;
  document.getElementById('equipmentDescription').value = eq.description || '';
  document.getElementById('equipmentClassroom').value = eq.classroom_id;
  document.getElementById('equipmentModalError').classList.add('hidden');
  openModal('equipmentModal');
};

window.deleteEquipment = async function (id, name, classroomId) {
  if (!confirm(`Delete equipment "${name}"?`)) return;
  try {
    await apiFetch(`/api/equipment/${id}`, { method: 'DELETE' });
    await loadEquipment(classroomId);
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
};

document.getElementById('saveEquipmentBtn').addEventListener('click', async () => {
  const id = document.getElementById('equipmentId').value;
  const classroom_id = document.getElementById('equipmentClassroom').value;
  const name = document.getElementById('equipmentName').value.trim();
  const description = document.getElementById('equipmentDescription').value.trim();
  const errEl = document.getElementById('equipmentModalError');

  if (!classroom_id) { errEl.textContent = 'Classroom is required'; errEl.classList.remove('hidden'); return; }
  if (!name) { errEl.textContent = 'Name is required'; errEl.classList.remove('hidden'); return; }
  errEl.classList.add('hidden');

  try {
    if (id) {
      await apiFetch(`/api/equipment/${id}`, { method: 'PUT', body: JSON.stringify({ name, description }) });
    } else {
      await apiFetch('/api/equipment', { method: 'POST', body: JSON.stringify({ classroom_id, name, description }) });
    }
    closeModal('equipmentModal');
    const filterVal = document.getElementById('equipClassroomFilter').value;
    if (filterVal) await loadEquipment(filterVal);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

// ─── Technicians ────────────────────────────────────────────────────────────
let technicians = [];

async function loadTechnicians() {
  const el = document.getElementById('techniciansList');
  el.innerHTML = '<div class="spinner"></div>';
  try {
    technicians = await apiFetch('/api/technicians');
    renderTechnicians();
    populateTechFilter();
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

function renderTechnicians() {
  const el = document.getElementById('techniciansList');
  if (!technicians.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">👷</div><p>No technicians yet</p></div>';
    return;
  }
  el.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead><tr><th>Name</th><th>Username</th><th>Created</th><th>Actions</th></tr></thead>
        <tbody>
          ${technicians.map((t) => `
            <tr>
              <td>${esc(t.full_name)}</td>
              <td><code>${esc(t.username)}</code></td>
              <td>${new Date(t.created_at).toLocaleDateString()}</td>
              <td>
                <button class="btn btn-danger btn-sm" onclick="deleteTechnician(${t.id}, '${esc(t.full_name)}')">Remove</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function populateTechFilter() {
  ['subTechFilter'].forEach((selId) => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">All</option>' +
      technicians.map((t) => `<option value="${t.id}">${esc(t.full_name)}</option>`).join('');
    if (prev) sel.value = prev;
  });
}

document.getElementById('addTechnicianBtn').addEventListener('click', () => {
  document.getElementById('techFullName').value = '';
  document.getElementById('techUsername').value = '';
  document.getElementById('techPassword').value = '';
  document.getElementById('technicianModalError').classList.add('hidden');
  openModal('technicianModal');
});

window.deleteTechnician = async function (id, name) {
  if (!confirm(`Remove technician "${name}"?`)) return;
  try {
    await apiFetch(`/api/technicians/${id}`, { method: 'DELETE' });
    await loadTechnicians();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
};

document.getElementById('saveTechnicianBtn').addEventListener('click', async () => {
  const full_name = document.getElementById('techFullName').value.trim();
  const username = document.getElementById('techUsername').value.trim();
  const password = document.getElementById('techPassword').value;
  const errEl = document.getElementById('technicianModalError');

  if (!full_name || !username || !password) {
    errEl.textContent = 'All fields are required';
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');

  try {
    await apiFetch('/api/technicians', { method: 'POST', body: JSON.stringify({ full_name, username, password }) });
    closeModal('technicianModal');
    await loadTechnicians();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

// ─── Submissions ────────────────────────────────────────────────────────────
document.getElementById('loadSubmissionsBtn').addEventListener('click', loadSubmissions);

async function loadSubmissions() {
  const el = document.getElementById('submissionsList');
  el.innerHTML = '<div class="spinner"></div>';

  const params = new URLSearchParams();
  const sd = document.getElementById('subStartDate').value;
  const ed = document.getElementById('subEndDate').value;
  const cr = document.getElementById('subClassroomFilter').value;
  const te = document.getElementById('subTechFilter').value;
  if (sd) params.set('start_date', sd);
  if (ed) params.set('end_date', ed);
  if (cr) params.set('classroom_id', cr);
  if (te) params.set('technician_id', te);

  try {
    const submissions = await apiFetch(`/api/checklists?${params}`);
    if (!submissions.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📄</div><p>No submissions found</p></div>';
      return;
    }
    el.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Date</th><th>Classroom</th><th>Technician</th><th>Submitted</th><th></th></tr></thead>
          <tbody>
            ${submissions.map((s) => `
              <tr>
                <td>${s.submission_date}</td>
                <td>${esc(s.classroom_name)}</td>
                <td>${esc(s.technician_name)}</td>
                <td>${new Date(s.created_at).toLocaleString()}</td>
                <td><a href="/dashboard" class="btn btn-secondary btn-sm" onclick="viewSubmission(${s.id}); return false;">View</a></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

// ─── Utility ────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Init ────────────────────────────────────────────────────────────────────
(async function init() {
  await initNav();
  await Promise.all([loadClassrooms(), loadTechnicians()]);
})();

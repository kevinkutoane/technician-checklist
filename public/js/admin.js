'use strict';

// ─── Shared helpers ────────────────────────────────────────────────────────
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

function statusBadge(status) {
  const labels = { working: '✅ Working', not_working: '❌ Not Working', needs_repair: '⚠️ Needs Repair' };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

// ─── Theme ────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme || 'light');
}

// ─── Nav / Auth ────────────────────────────────────────────────────────────
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
    links.push(`<li><a href="/admin" class="active"><span class="icon">⚙️</span> Admin</a></li>`);
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
    let defaultOption;
    if (selId === 'equipClassroomFilter') {
      defaultOption = '<option value="">-- Select a classroom --</option>';
    } else if (selId === 'equipmentClassroom') {
      defaultOption = '';
    } else {
      defaultOption = '<option value="">All</option>';
    }
    sel.innerHTML = defaultOption +
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
                <button class="btn btn-secondary btn-sm" onclick="editTechnician(${t.id})">Edit</button>
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
  ['subTechFilter', 'qaTechFilter', 'onboardingTechFilter'].forEach((selId) => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">All</option>' +
      technicians.map((t) => `<option value="${t.id}">${esc(t.full_name)}</option>`).join('');
    if (prev) sel.value = prev;
  });
}

document.getElementById('addTechnicianBtn').addEventListener('click', () => {
  document.getElementById('techId').value = '';
  document.getElementById('technicianModalTitle').textContent = 'Add Technician';
  document.getElementById('techFullName').value = '';
  document.getElementById('techUsername').value = '';
  document.getElementById('techPassword').value = '';
  document.getElementById('techPassword').placeholder = 'Min 6 characters';
  document.getElementById('saveTechnicianBtn').textContent = 'Add Technician';
  document.getElementById('technicianModalError').classList.add('hidden');
  openModal('technicianModal');
});

window.editTechnician = function (id) {
  const t = technicians.find((x) => x.id === id);
  if (!t) return;
  document.getElementById('techId').value = t.id;
  document.getElementById('technicianModalTitle').textContent = 'Edit Technician';
  document.getElementById('techFullName').value = t.full_name;
  document.getElementById('techUsername').value = t.username;
  document.getElementById('techPassword').value = '';
  document.getElementById('techPassword').placeholder = 'Leave blank to keep current password';
  document.getElementById('saveTechnicianBtn').textContent = 'Save Changes';
  document.getElementById('technicianModalError').classList.add('hidden');
  openModal('technicianModal');
};

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
  const id = document.getElementById('techId').value;
  const full_name = document.getElementById('techFullName').value.trim();
  const username = document.getElementById('techUsername').value.trim();
  const password = document.getElementById('techPassword').value;
  const errEl = document.getElementById('technicianModalError');

  if (!full_name || !username) {
    errEl.textContent = 'Name and username are required';
    errEl.classList.remove('hidden');
    return;
  }
  
  if (!id && !password) {
     errEl.textContent = 'Password is required when creating a new technician';
     errEl.classList.remove('hidden');
     return;
  }
  
  errEl.classList.add('hidden');

  try {
    if (id) {
      await apiFetch(`/api/technicians/${id}`, { method: 'PUT', body: JSON.stringify({ full_name, username, password }) });
    } else {
      await apiFetch('/api/technicians', { method: 'POST', body: JSON.stringify({ full_name, username, password }) });
    }
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
                <td><button class="btn btn-secondary btn-sm" onclick="viewDetail(${s.id})">View</button></td>
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

// ─── View Detail Modal (shared with dashboard) ────────────────────────────────
window.viewDetail = async function (id) {
  try {
    const sub = await apiFetch(`/api/checklists/${id}`);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.innerHTML = `
      <div class="modal" style="max-width:600px">
        <h3 class="modal-title">
          ${esc(sub.classroom_name)} — ${sub.submission_date}
        </h3>
        <p style="color:var(--gray-500);font-size:0.875rem;margin-bottom:1rem">
          Submitted by ${esc(sub.technician_name)} at ${new Date(sub.created_at).toLocaleString()}
        </p>
        ${sub.general_notes ? `<p class="mb-2"><strong>Notes:</strong> ${esc(sub.general_notes)}</p>` : ''}
        <div class="table-wrapper">
          <table>
            <thead><tr><th>Equipment</th><th>Status</th><th>Notes</th></tr></thead>
            <tbody>
              ${sub.items.map((item) => `
                <tr>
                  <td>${esc(item.equipment_name)}</td>
                  <td>${statusBadge(item.status)}</td>
                  <td>${esc(item.notes || '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
        </div>
      </div>
    `;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
};

// ─── Utility ────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── QA Submissions (Admin) ──────────────────────────────────────────────────
document.getElementById('loadQABtn').addEventListener('click', loadQASubmissions);

async function loadQASubmissions() {
  const el = document.getElementById('qaList');
  el.innerHTML = '<div class="spinner"></div>';
  const sd = document.getElementById('qaStartDate').value;
  const ed = document.getElementById('qaEndDate').value;
  const te = document.getElementById('qaTechFilter').value;
  const params = new URLSearchParams({ limit: 200 });
  if (sd) params.set('start_date', sd);
  if (ed) params.set('end_date', ed);
  if (te) params.set('technician_id', te);
  try {
    const list = await apiFetch(`/api/qa?${params}`);
    if (!list.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p>No QA submissions found</p></div>';
      return;
    }
    const boolFields = ['backup_user_profile','backup_internet_favorites','backup_outlook_cache','join_domain','windows_updates','drivers_3g','windows_defender','mimecast_mso','bios_updated','vpn_setup','remove_local_admin','onedrive_home_dir','mapped_drive','onedrive_default_save','nic_power_management','staff_distribution_list','intranet_homepage','direct_shortcut','rendezvous_shortcut','windows_activated','office_activated','private_wifi','accpac_installed','test_vga','test_usb','klite_codec','regional_settings','register_office_credentials'];
    
    // Helper to make field names readable
    const formatLabel = (s) => s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    el.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Date</th><th>Technician</th><th>User</th><th>Machine SN</th><th>Call Ref</th><th>Checks Passed</th><th>Printers</th><th>Other SW</th></tr></thead>
          <tbody>
            ${list.map(q => {
              const passedItems = boolFields.filter(f => q[f]);
              const passedCount = passedItems.length;
              const passedList = passedItems.map(f => formatLabel(f)).join('\n');

              return `<tr>
                <td>${q.submission_date}</td>
                <td>${esc(q.technician_name)}</td>
                <td>${esc(q.username)}</td>
                <td>${esc(q.machine_serial || '—')}</td>
                <td>${esc(q.call_ref || '—')}</td>
                <td title="${esc(passedList)}">
                  <div style="display:flex; align-items:center; gap:4px; cursor:help;">
                    <strong>${passedCount}/${boolFields.length}</strong>
                    <span style="font-size:12px; opacity:0.6;">ⓘ</span>
                  </div>
                </td>
                <td>${esc(q.printers_installed || '—')}</td>
                <td>${esc(q.other_software || '—')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

// ─── Asset Agreements (Admin) ────────────────────────────────────────────────
document.getElementById('loadOnboardingBtn').addEventListener('click', loadOnboardingSubmissions);

async function loadOnboardingSubmissions() {
  const el = document.getElementById('onboardingList');
  el.innerHTML = '<div class="spinner"></div>';
  const sd = document.getElementById('onboardingStartDate').value;
  const ed = document.getElementById('onboardingEndDate').value;
  const te = document.getElementById('onboardingTechFilter').value;
  const params = new URLSearchParams({ limit: 200 });
  if (sd) params.set('start_date', sd);
  if (ed) params.set('end_date', ed);
  if (te) params.set('technician_id', te);
  try {
    const list = await apiFetch(`/api/onboarding?${params}`);
    if (!list.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">💻</div><p>No asset agreements found</p></div>';
      return;
    }
    el.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Date</th><th>Issued By</th><th>Employee</th><th>Laptop SN</th><th>SIM</th><th>Equipment Issued</th></tr></thead>
          <tbody>
            ${list.map(a => {
              const issued = ['dongle','laptop_charger','laptop_bag','mouse','monitor','keyboard']
                .filter(f => a[f])
                .map(f => f.replace(/_/g, ' '))
                .join(', ');
              return `<tr>
                <td>${a.submission_date}</td>
                <td>${esc(a.technician_name)}</td>
                <td><strong>${esc(a.employee_name)}</strong></td>
                <td>${esc(a.laptop_serial_number || '—')}</td>
                <td>${esc(a.sim_card_number || '—')}</td>
                <td>${esc(issued || '—')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────
// ─── Audit Log ────────────────────────────────────────────────────────────────
document.getElementById('loadAuditLogBtn').addEventListener('click', loadAuditLog);

async function loadAuditLog() {
  const el = document.getElementById('auditLogList');
  el.innerHTML = '<div class="spinner"></div>';
  try {
    const entries = await apiFetch('/api/audit-log?limit=200');
    if (!entries.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No audit entries yet</p></div>';
      return;
    }
    el.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Target</th><th>Details</th><th>IP</th></tr></thead>
          <tbody>
            ${entries.map((e) => `
              <tr>
                <td style="white-space:nowrap;font-size:0.8rem">${new Date(e.created_at).toLocaleString()}</td>
                <td>${esc(e.user_name || '—')}</td>
                <td><code>${esc(e.action)}</code></td>
                <td style="font-size:0.8rem">${esc(e.target_type || '')}${e.target_id ? ` #${e.target_id}` : ''}</td>
                <td style="font-size:0.8rem">${esc(e.details || '—')}</td>
                <td style="font-size:0.8rem">${esc(e.ip_address || '—')}</td>
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

(async function init() {
  await initNav();
  await Promise.all([loadOverview(), loadClassrooms(), loadTechnicians()]);
})();

// ─── Overview ─────────────────────────────────────────────────────────────
async function loadOverview() {
  const el = document.getElementById('overviewContent');
  try {
    const d = await apiFetch('/api/dashboard/admin-overview');

    const today = new Date().toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const uncheckedHtml = d.classrooms_unchecked.length === 0
      ? `<span class="text-success">All classrooms checked ✅</span>`
      : `<ul class="list" style="margin:0;padding-left:1rem">${d.classrooms_unchecked.map((n) => `<li>${n}</li>`).join('')}</ul>`;

    const flaggedRowsHtml = d.top_flagged_today.length === 0
      ? `<p class="text-muted" style="margin:0">No flagged items today.</p>`
      : d.top_flagged_today.map((f) =>
          `<div class="item-row">
            <span>${f.equipment_name} — <em>${f.classroom_name}</em></span>
            ${statusBadge(f.status)}
            ${f.notes ? `<span class="text-muted" style="font-size:.85em">${f.notes}</span>` : ''}
          </div>`
        ).join('');

    const problemEquipHtml = d.top_problem_equipment.length === 0
      ? `<p class="text-muted" style="margin:0">No issues in past 30 days.</p>`
      : d.top_problem_equipment.map((e) =>
          `<div class="item-row"><span>${e.equipment_name}</span><span class="badge badge-not_working">${e.issue_count} issues</span></div>`
        ).join('');

    const auditHtml = d.recent_audit.length === 0
      ? `<p class="text-muted" style="margin:0">No recent activity.</p>`
      : d.recent_audit.map((a) =>
          `<div class="item-row"><span class="text-muted" style="font-size:.8em">${a.created_at ? a.created_at.slice(0, 16) : ''}</span> <strong>${a.actor || 'System'}</strong> — ${a.action}${a.details ? `: <em>${a.details}</em>` : ''}</div>`
        ).join('');

    el.innerHTML = `
      <p class="text-muted" style="margin-bottom:1rem">${today}</p>

      <div class="stats-grid" style="margin-bottom:1.5rem">
        <div class="stat-card">
          <div class="stat-value">${d.classrooms_total}</div>
          <div class="stat-label">Total Classrooms</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${d.equipment_total}</div>
          <div class="stat-label">Total Equipment</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${d.technicians_total}</div>
          <div class="stat-label">Technicians</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${d.classrooms_checked_today}</div>
          <div class="stat-label">Checked Today</div>
        </div>
        <div class="stat-card ${d.classrooms_unchecked.length > 0 ? 'stat-card-warning' : ''}">
          <div class="stat-value">${d.classrooms_unchecked.length}</div>
          <div class="stat-label">Unchecked Today</div>
        </div>
        <div class="stat-card ${d.flagged_today > 0 ? 'stat-card-danger' : ''}">
          <div class="stat-value">${d.flagged_today}</div>
          <div class="stat-label">Flagged Items Today</div>
        </div>
      </div>

      <div class="overview-grid">
        <div class="card">
          <div class="card-header"><span class="card-title">📋 Unchecked Classrooms Today</span></div>
          <div class="card-body">${uncheckedHtml}</div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">🚩 Flagged Items Today</span></div>
          <div class="card-body">${flaggedRowsHtml}</div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">📉 Most Problematic Equipment (30 days)</span></div>
          <div class="card-body">${problemEquipHtml}</div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">🕒 Recent Activity</span></div>
          <div class="card-body">${auditHtml}</div>
        </div>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

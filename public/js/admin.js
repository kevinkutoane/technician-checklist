'use strict';

function statusBadge(status) {
  const labels = { working: '✅ Working', not_working: '❌ Not Working', needs_repair: '⚠️ Needs Repair' };
  const safeClass = Object.prototype.hasOwnProperty.call(labels, status) ? status : 'unknown';
  return `<span class="badge badge-${safeClass}">${labels[status] || esc(String(status))}</span>`;
}

let currentUser = null;

// ─── Tab handling ──────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
  });
});

// ─── Modals ────────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.getElementById('closeClassroomModal').addEventListener('click', () => closeModal('classroomModal'));
document.getElementById('closeEquipmentModal').addEventListener('click', () => closeModal('equipmentModal'));
document.getElementById('closeTechnicianModal').addEventListener('click', () => closeModal('technicianModal'));
document.getElementById('closeAdminModal').addEventListener('click', () => closeModal('adminModal'));

// Close modal on overlay click
['classroomModal', 'equipmentModal', 'technicianModal', 'adminModal', 'handoverDetailModal'].forEach((id) => {
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
    el.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
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
                <button class="btn btn-danger btn-sm" data-del-id="${c.id}" data-del-name="${esc(c.name)}">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function populateClassroomSelects() {
  const selects = ['equipClassroomFilter', 'equipmentClassroom', 'subClassroomFilter', 'handoverClassroomFilter'];
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
    alert(`Error: ${esc(err.message)}`);
  }
};

document.getElementById('saveClassroomBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const id = document.getElementById('classroomId').value;
  const name = document.getElementById('classroomName').value.trim();
  const building = document.getElementById('classroomBuilding').value.trim();
  const floor = document.getElementById('classroomFloor').value.trim();
  const errEl = document.getElementById('classroomModalError');

  if (!name) { errEl.textContent = 'Name is required'; errEl.classList.remove('hidden'); return; }
  errEl.classList.add('hidden');
  btn.disabled = true;
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
  } finally {
    btn.disabled = false;
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
    el.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
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
                <button class="btn btn-danger btn-sm" data-del-id="${eq.id}" data-del-name="${esc(eq.name)}" data-del-classroom="${classroomId}">Delete</button>
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
    alert(`Error: ${esc(err.message)}`);
  }
};

document.getElementById('saveEquipmentBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const id = document.getElementById('equipmentId').value;
  const classroom_id = document.getElementById('equipmentClassroom').value;
  const name = document.getElementById('equipmentName').value.trim();
  const description = document.getElementById('equipmentDescription').value.trim();
  const errEl = document.getElementById('equipmentModalError');

  if (!classroom_id) { errEl.textContent = 'Classroom is required'; errEl.classList.remove('hidden'); return; }
  if (!name) { errEl.textContent = 'Name is required'; errEl.classList.remove('hidden'); return; }
  errEl.classList.add('hidden');
  btn.disabled = true;
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
  } finally {
    btn.disabled = false;
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
    el.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
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
        <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Created</th><th>Actions</th></tr></thead>
        <tbody>
          ${technicians.map((t) => `
            <tr>
              <td>${esc(t.full_name)}</td>
              <td><code>${esc(t.username)}</code></td>
              <td>${esc(t.email || '—')}</td>
              <td>${t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}</td>
              <td>
                <button class="btn btn-secondary btn-sm" onclick="editTechnician(${t.id})">Edit</button>
                <button class="btn btn-danger btn-sm" data-del-id="${t.id}" data-del-name="${esc(t.full_name)}">Remove</button>
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
  document.getElementById('techEmail').value = '';
  document.getElementById('techPassword').value = '';
  document.getElementById('techPassword').placeholder = 'Min 8 characters';
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
  document.getElementById('techEmail').value = t.email || '';
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
    alert(`Error: ${esc(err.message)}`);
  }
};

document.getElementById('saveTechnicianBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const id = document.getElementById('techId').value;
  const full_name = document.getElementById('techFullName').value.trim();
  const username = document.getElementById('techUsername').value.trim();
  const email = document.getElementById('techEmail').value.trim();
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
  btn.disabled = true;
  try {
    if (id) {
      await apiFetch(`/api/technicians/${id}`, { method: 'PUT', body: JSON.stringify({ full_name, username, email, password }) });
    } else {
      await apiFetch('/api/technicians', { method: 'POST', body: JSON.stringify({ full_name, username, email, password }) });
    }
    closeModal('technicianModal');
    await loadTechnicians();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
});

// ─── Admins ─────────────────────────────────────────────────────────────────
let admins = [];

async function loadAdmins() {
  const el = document.getElementById('adminsList');
  el.innerHTML = '<div class="spinner"></div>';
  try {
    admins = await apiFetch('/api/admins');
    renderAdmins();
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

function renderAdmins() {
  const el = document.getElementById('adminsList');
  if (!admins.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🔐</div><p>No admins found</p></div>';
    return;
  }
  el.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Created</th><th>Actions</th></tr></thead>
        <tbody>
          ${admins.map((a) => `
            <tr>
              <td>${esc(a.full_name)}</td>
              <td><code>${esc(a.username)}</code></td>
              <td>${esc(a.email || '—')}</td>
              <td>${a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td>
              <td>
                <button class="btn btn-secondary btn-sm" onclick="editAdmin(${a.id})">Edit</button>
                ${a.isSelf ? '' : `<button class="btn btn-danger btn-sm" data-del-id="${a.id}" data-del-name="${esc(a.full_name)}">Remove</button>`}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

document.getElementById('addAdminBtn').addEventListener('click', () => {
  document.getElementById('adminId').value = '';
  document.getElementById('adminModalTitle').textContent = 'Add Admin';
  document.getElementById('adminFullName').value = '';
  document.getElementById('adminUsername').value = '';
  document.getElementById('adminEmail').value = '';
  document.getElementById('adminPassword').value = '';
  document.getElementById('adminPassword').placeholder = 'Min 8 characters';
  document.getElementById('saveAdminBtn').textContent = 'Add Admin';
  document.getElementById('adminModalError').classList.add('hidden');
  openModal('adminModal');
});

window.editAdmin = function (id) {
  const a = admins.find((x) => x.id === id);
  if (!a) return;
  document.getElementById('adminId').value = a.id;
  document.getElementById('adminModalTitle').textContent = 'Edit Admin';
  document.getElementById('adminFullName').value = a.full_name;
  document.getElementById('adminUsername').value = a.username;
  document.getElementById('adminEmail').value = a.email || '';
  document.getElementById('adminPassword').value = '';
  document.getElementById('adminPassword').placeholder = 'Leave blank to keep current password';
  document.getElementById('saveAdminBtn').textContent = 'Save Changes';
  document.getElementById('adminModalError').classList.add('hidden');
  openModal('adminModal');
};

window.deleteAdmin = async function (id, name) {
  if (!confirm(`Remove admin "${name}"? This cannot be undone.`)) return;
  try {
    await apiFetch(`/api/admins/${id}`, { method: 'DELETE' });
    await loadAdmins();
  } catch (err) {
    alert(`Error: ${esc(err.message)}`);
  }
};

document.getElementById('saveAdminBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const id = document.getElementById('adminId').value;
  const full_name = document.getElementById('adminFullName').value.trim();
  const username = document.getElementById('adminUsername').value.trim();
  const email = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value;
  const errEl = document.getElementById('adminModalError');

  if (!full_name || !username) {
    errEl.textContent = 'Name and username are required';
    errEl.classList.remove('hidden');
    return;
  }
  if (!id && !password) {
    errEl.textContent = 'Password is required when creating a new admin';
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');
  btn.disabled = true;
  try {
    if (id) {
      await apiFetch(`/api/admins/${id}`, { method: 'PUT', body: JSON.stringify({ full_name, username, email, password }) });
    } else {
      await apiFetch('/api/admins', { method: 'POST', body: JSON.stringify({ full_name, username, email, password }) });
    }
    closeModal('adminModal');
    await loadAdmins();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
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
    el.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
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
    alert(`Error: ${esc(err.message)}`);
  }
};

// ─── Utility ────────────────────────────────────────────────────────────────


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
    el.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
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
    el.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

// ─── Handover Records (Admin) ─────────────────────────────────────────────────
const HANDOVER_SERVICES = [
  { key: 'pc_working',         label: 'Classroom PC Working?' },
  { key: 'projector_working',  label: 'Projector working?' },
  { key: 'wifi_students',      label: 'Wi-Fi Connectivity (Students?)' },
  { key: 'cables_working',     label: 'Cables (HDMI, VGA, AUX) working?' },
  { key: 'microphones',        label: 'Faculty and desk Microphones' },
  { key: 'faculty_mic_zoom',   label: 'Faculty Mic. working over Zoom / Teams?' },
  { key: 'room_mic_zoom',      label: 'Room Mic. Working over Zoom / Teams?' },
  { key: 'classroom_audio',    label: 'Classroom Audio' },
  { key: 'cameras_working',    label: 'Classroom Cameras Working?' },
  { key: 'cameras_positioned', label: 'Cameras Positioned and working?' },
  { key: 'zoom_teams',         label: 'Zoom / MS Teams Account & Session working?' },
  { key: 'contact_supplied',   label: 'Contact Number Supplied to Session Producer and faculty?' },
];

document.getElementById('loadHandoverBtn').addEventListener('click', loadHandoverSubmissions);

async function loadHandoverSubmissions() {
  const el = document.getElementById('handoverList');
  el.innerHTML = '<div class="spinner"></div>';
  const sd = document.getElementById('handoverStartDate').value;
  const ed = document.getElementById('handoverEndDate').value;
  const cf = document.getElementById('handoverClassroomFilter').value;
  const params = new URLSearchParams({ limit: 200 });
  if (sd) params.set('start_date', sd);
  if (ed) params.set('end_date', ed);
  if (cf) params.set('classroom_id', cf);
  try {
    const list = await apiFetch(`/api/handover?${params}`);
    if (!list.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">🤝</div><p>No handover records found</p></div>';
      return;
    }
    el.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Date</th><th>Class Start</th><th>Classroom</th><th>Programme</th><th>Technician</th><th></th></tr></thead>
          <tbody>
            ${list.map((r) => `
              <tr>
                <td>${esc(r.handover_date)}</td>
                <td>${esc(r.class_start_time || '—')}</td>
                <td>${esc(r.classroom_name || '—')}</td>
                <td>${esc(r.programme_name || '—')}</td>
                <td>${esc(r.technician_name)}</td>
                <td><button class="btn btn-secondary btn-sm" onclick="viewHandoverDetail(${r.id})">View</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

async function viewHandoverDetail(id) {
  const body = document.getElementById('handoverDetailBody');
  const title = document.getElementById('handoverDetailTitle');
  body.innerHTML = '<div class="spinner"></div>';
  openModal('handoverDetailModal');
  try {
    const r = await apiFetch(`/api/handover/${id}`);
    title.textContent = `Handover — ${r.handover_date} — ${esc(r.classroom_name || '')}`;

    let services = {};
    try { services = JSON.parse(r.services_data); } catch (_) {}

    const servicesHtml = HANDOVER_SERVICES.map((svc) => {
      const d = services[svc.key] || {};
      const status = d.ok === true ? '<span style="color:var(--success)">✔ Yes</span>'
                   : d.ok === false ? '<span style="color:var(--danger)">✘ No</span>'
                   : '—';
      return `<tr>
        <td style="font-size:0.85rem">${esc(svc.label)}</td>
        <td style="text-align:center">${status}</td>
        <td style="font-size:0.8rem">${esc(d.comments || '')}</td>
      </tr>`;
    }).join('');

    const sigHtml = (label, sig) => sig
      ? `<div style="margin-top:0.5rem"><strong>${label}:</strong><br><img src="${sig}" style="max-width:100%;border:1px solid var(--border);border-radius:4px;margin-top:0.25rem"></div>`
      : '';

    body.innerHTML = `
      <h4 style="margin-top:0">Session Details</h4>
      <div class="table-wrapper" style="margin-bottom:1rem">
        <table><tbody>
          <tr><th style="width:40%">Date</th><td>${esc(r.handover_date)}</td></tr>
          <tr><th>Checking Start Time</th><td>${esc(r.checking_start_time || '—')}</td></tr>
          <tr><th>Class Start Time</th><td>${esc(r.class_start_time || '—')}</td></tr>
          <tr><th>Classroom</th><td>${esc(r.classroom_name || '—')}</td></tr>
          <tr><th>Programme Name</th><td>${esc(r.programme_name || '—')}</td></tr>
          <tr><th>IT Technician</th><td>${esc(r.technician_name)}</td></tr>
          <tr><th>Faculty Name</th><td>${esc(r.faculty_name || '—')}</td></tr>
          <tr><th>Session Producer</th><td>${esc(r.session_producer_name || '—')}</td></tr>
          <tr><th>Programme Manager</th><td>${esc(r.programme_manager_name || '—')}</td></tr>
        </tbody></table>
      </div>
      <h4>Services Tested</h4>
      <div class="table-wrapper" style="margin-bottom:1rem">
        <table>
          <thead><tr><th>Service</th><th style="width:60px;text-align:center">Status</th><th>Comments</th></tr></thead>
          <tbody>${servicesHtml}</tbody>
        </table>
      </div>
      <h4>Sign-offs</h4>
      <div class="table-wrapper" style="margin-bottom:1rem">
        <table><tbody>
          <tr><th style="width:40%">Faculty Arrived</th><td>${esc(r.faculty_arrived || '—')}</td></tr>
          <tr><th>Faculty Comments</th><td>${esc(r.faculty_comments || '—')}</td></tr>
          <tr><th>Session Producer Arrived</th><td>${esc(r.session_producer_arrived || '—')}</td></tr>
          <tr><th>Session Producer Comments</th><td>${esc(r.session_producer_comments || '—')}</td></tr>
          <tr><th>Programme Manager Arrived</th><td>${esc(r.programme_manager_arrived || '—')}</td></tr>
          <tr><th>Programme Manager Comments</th><td>${esc(r.programme_manager_comments || '—')}</td></tr>
        </tbody></table>
      </div>
      ${sigHtml('Faculty Signature', r.faculty_signature)}
      ${sigHtml('Session Producer Signature', r.session_producer_signature)}
      ${sigHtml('Programme Manager Signature', r.programme_manager_signature)}
      ${r.additional_comments ? `<h4>Additional Comments</h4><p style="font-size:0.85rem">${esc(r.additional_comments)}</p>` : ''}
    `;
  } catch (err) {
    body.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
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
    el.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

// ─── Week Ahead Admin Viewer ──────────────────────────────────────────────────
document.getElementById('loadWeekAheadBtn')?.addEventListener('click', loadWeekAheadAdmin);

async function loadWeekAheadAdmin() {
  const el = document.getElementById('weekAheadAdminList');
  if (!el) return;
  el.innerHTML = '<div class="spinner"></div>';
  try {
    const uploads = await apiFetch('/api/week-ahead/uploads');
    if (!uploads.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><p>No week-ahead uploads found</p></div>';
      return;
    }
    el.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr><th>File</th><th>Period</th><th>Events</th><th>Uploaded By</th><th>Date</th><th></th></tr>
          </thead>
          <tbody>
            ${uploads.map(u => `
              <tr>
                <td>${esc(u.filename)}</td>
                <td style="white-space:nowrap">${esc(u.week_start || '—')} → ${esc(u.week_end || '—')}</td>
                <td>${u.row_count}</td>
                <td>${esc(u.uploaded_by || '—')}</td>
                <td style="white-space:nowrap">${new Date(u.created_at).toLocaleString()}</td>
                <td>
                  <button class="btn btn-secondary btn-sm" onclick="viewWeekAheadBatch('${esc(u.id)}')">View</button>
                  <button class="btn btn-danger btn-sm" onclick="deleteWeekAheadBatch('${esc(u.id)}')">Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

window.viewWeekAheadBatch = async function (batchId) {
  try {
    const events = await apiFetch(`/api/week-ahead/week?batch=${batchId}`);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.innerHTML = `
      <div class="modal" style="max-width:800px">
        <h3 class="modal-title">Week Ahead Events (${events.length})</h3>
        <div style="max-height:70vh;overflow-y:auto">
          ${!events.length ? '<p>No events in this batch.</p>' : `
            <div class="table-wrapper">
              <table style="font-size:0.82rem">
                <thead><tr><th>Date</th><th>Time</th><th>Venue</th><th>Programme</th><th>Tech</th><th>IT</th></tr></thead>
                <tbody>
                  ${events.map(e => `
                    <tr>
                      <td style="white-space:nowrap">${esc(e.event_date)}</td>
                      <td style="white-space:nowrap">${esc(e.time_range)}</td>
                      <td>${esc(e.venue)}</td>
                      <td>${esc(e.company_course)}</td>
                      <td>${esc(e.assigned_tech || '—')}</td>
                      <td>${esc(e.it_support_required || '—')}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>`}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
        </div>
      </div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  } catch (err) {
    alert('Error: ' + err.message);
  }
};

window.deleteWeekAheadBatch = async function (batchId) {
  if (!confirm('Delete this upload and all its events?')) return;
  try {
    await apiFetch(`/api/week-ahead/${batchId}`, { method: 'DELETE' });
    await loadWeekAheadAdmin();
  } catch (err) {
    alert('Error: ' + err.message);
  }
};

// ─── Event delegation for delete buttons (safe data-attribute approach) ───────
document.getElementById('classroomsList').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-del-id]');
  if (btn) deleteClassroom(Number(btn.dataset.delId), btn.dataset.delName);
});
document.getElementById('equipmentList').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-del-id]');
  if (btn) deleteEquipment(Number(btn.dataset.delId), btn.dataset.delName, Number(btn.dataset.delClassroom));
});
document.getElementById('techniciansList').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-del-id]');
  if (btn) deleteTechnician(Number(btn.dataset.delId), btn.dataset.delName);
});
document.getElementById('adminsList').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-del-id]');
  if (btn) deleteAdmin(Number(btn.dataset.delId), btn.dataset.delName);
});

(async function init() {
  currentUser = await initNav('/admin');
  if (!currentUser) return;
  await Promise.all([loadOverview(), loadClassrooms(), loadTechnicians(), loadAdmins()]);
})();

// ─── Overview ─────────────────────────────────────────────────────────────
async function loadOverview() {
  const el = document.getElementById('overviewContent');
  try {
    const d = await apiFetch('/api/dashboard/admin-overview');

    const today = new Date().toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const uncheckedHtml = d.classrooms_unchecked.length === 0
      ? `<div style="padding:0.75rem 1rem"><span class="text-success">All classrooms checked ✅</span></div>`
      : d.classrooms_unchecked.map((c) => {
          const name = (typeof c === 'object' && c !== null) ? c.name : String(c);
          const lastChecked = (typeof c === 'object' && c !== null && c.last_checked)
            ? `Last checked: ${esc(String(c.last_checked))}`
            : (typeof c === 'object' && c !== null ? 'No prior submissions on record' : '');
          return `<div style="display:flex;align-items:center;padding:0.65rem 1rem;border-bottom:1px solid var(--border)">
            <div>
              <span style="font-weight:600;font-size:1rem">${esc(name)}</span>
              ${lastChecked ? `<div style="color:var(--text-muted,#64748b);font-size:0.8rem;margin-top:2px">${lastChecked}</div>` : ''}
            </div>
          </div>`;
        }).join('');

    const flaggedRowsHtml = d.top_flagged_today.length === 0
      ? `<p class="text-muted" style="margin:0">No flagged items today.</p>`
      : d.top_flagged_today.map((f) =>
          `<div class="item-row">
            <span>${esc(f.equipment_name)} — <em>${esc(f.classroom_name)}</em></span>
            ${statusBadge(f.status)}
            ${f.notes ? `<span class="text-muted" style="font-size:.85em">${esc(f.notes)}</span>` : ''}
          </div>`
        ).join('');

    const problemEquipHtml = d.top_problem_equipment.length === 0
      ? `<p class="text-muted" style="margin:0">No issues in past 30 days.</p>`
      : d.top_problem_equipment.map((e) =>
          `<div class="item-row"><span>${esc(e.equipment_name)}</span><span class="badge badge-not_working">${e.issue_count} issues</span></div>`
        ).join('');

    const auditHtml = d.recent_audit.length === 0
      ? `<p class="text-muted" style="margin:0">No recent activity.</p>`
      : d.recent_audit.map((a) =>
          `<div class="item-row"><span class="text-muted" style="font-size:.8em">${a.created_at ? a.created_at.slice(0, 16) : ''}</span> <strong>${esc(a.actor || 'System')}</strong> — ${esc(a.action)}${a.details ? `: <em>${esc(a.details)}</em>` : ''}</div>`
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
        <div class="card" style="border-left:4px solid #f59e0b">
          <div class="card-header" style="background:rgba(245,158,11,0.08)">
            <span class="card-title">⚠️ Unchecked Classrooms Today</span>
            ${d.classrooms_unchecked.length > 0 ? `<span style="background:#f59e0b;color:#fff;padding:2px 12px;border-radius:12px;font-size:0.8rem;font-weight:600">${d.classrooms_unchecked.length}</span>` : ''}
          </div>
          <div style="padding:0">${uncheckedHtml}</div>
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
    el.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

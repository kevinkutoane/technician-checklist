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

function statusBadge(status) {
  const labels = {
    working: '✅ Working',
    not_working: '❌ Not Working',
    needs_repair: '⚠️ Needs Repair',
  };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
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

  const navLinks = document.getElementById('navLinks');
  const links = [
    `<li><a href="/checklist">Checklist</a></li>`,
    `<li><a href="/dashboard" class="active">Dashboard</a></li>`,
  ];
  if (currentUser.role === 'admin') {
    links.push(`<li><a href="/admin">Admin</a></li>`);
  }
  navLinks.innerHTML = links.join('');

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  });

  // Hide tech filter for non-admins
  if (currentUser.role !== 'admin') {
    document.getElementById('techFilterGroup').classList.add('hidden');
  }
}

// ─── Stats ────────────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const s = await apiFetch('/api/dashboard/summary');
    document.getElementById('statSubmissions').textContent = s.totalSubmissions;
    document.getElementById('statFlagged').textContent = s.flaggedItems;
    document.getElementById('statNotWorking').textContent = s.notWorkingItems;
    document.getElementById('statClassrooms').textContent = s.totalClassrooms;
  } catch (err) {
    console.error('Stats error:', err);
  }
}

// ─── Issues ───────────────────────────────────────────────────────────────────
async function loadIssues(date) {
  const el = document.getElementById('issuesList');
  el.innerHTML = '<div class="spinner"></div>';
  const params = date ? `?date=${date}` : '';
  try {
    const issues = await apiFetch(`/api/dashboard/issues${params}`);
    if (!issues.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>No issues today!</p></div>';
      return;
    }
    el.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Classroom</th><th>Equipment</th><th>Status</th><th>Technician</th><th>Notes</th></tr></thead>
          <tbody>
            ${issues.map((i) => `
              <tr>
                <td>${esc(i.classroom_name)}</td>
                <td>${esc(i.equipment_name)}</td>
                <td>${statusBadge(i.status)}</td>
                <td>${esc(i.technician_name)}</td>
                <td>${esc(i.item_notes || '—')}</td>
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

// ─── Submissions ──────────────────────────────────────────────────────────────
async function loadSubmissions() {
  const el = document.getElementById('submissionsContainer');
  el.innerHTML = '<div class="spinner"></div>';

  const params = new URLSearchParams();
  const sd = document.getElementById('filterStartDate').value;
  const ed = document.getElementById('filterEndDate').value;
  const cr = document.getElementById('filterClassroom').value;
  const te = document.getElementById('filterTechnician').value;

  if (sd) params.set('start_date', sd);
  if (ed) params.set('end_date', ed);
  if (cr) params.set('classroom_id', cr);
  if (te) params.set('technician_id', te);

  // Non-admins only see their own
  if (currentUser && currentUser.role !== 'admin') {
    params.set('technician_id', currentUser.id);
  }

  try {
    const submissions = await apiFetch(`/api/checklists?${params}`);
    if (!submissions.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📄</div><p>No submissions found</p></div>';
      return;
    }
    el.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Classroom</th>
              <th>Technician</th>
              <th>Submitted At</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${submissions.map((s) => `
              <tr>
                <td>${s.submission_date}</td>
                <td>${esc(s.classroom_name)}</td>
                <td>${esc(s.technician_name)}</td>
                <td>${new Date(s.created_at).toLocaleString()}</td>
                <td>
                  <button class="btn btn-secondary btn-sm" onclick="viewDetail(${s.id})">View</button>
                </td>
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

// ─── Detail Modal ─────────────────────────────────────────────────────────────
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

// ─── Export ────────────────────────────────────────────────────────────────────
document.getElementById('exportBtn').addEventListener('click', () => {
  const params = new URLSearchParams();
  const sd = document.getElementById('filterStartDate').value;
  const ed = document.getElementById('filterEndDate').value;
  const cr = document.getElementById('filterClassroom').value;
  const te = document.getElementById('filterTechnician').value;
  if (sd) params.set('start_date', sd);
  if (ed) params.set('end_date', ed);
  if (cr) params.set('classroom_id', cr);
  if (te) params.set('technician_id', te);
  window.location.href = `/api/dashboard/export?${params}`;
});

// ─── Filter selects ───────────────────────────────────────────────────────────
async function populateFilterSelects() {
  try {
    const [classrooms, technicians] = await Promise.all([
      apiFetch('/api/classrooms'),
      currentUser && currentUser.role === 'admin' ? apiFetch('/api/technicians') : Promise.resolve([]),
    ]);

    const crSel = document.getElementById('filterClassroom');
    crSel.innerHTML = '<option value="">All Classrooms</option>' +
      classrooms.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');

    if (currentUser && currentUser.role === 'admin') {
      const teSel = document.getElementById('filterTechnician');
      teSel.innerHTML = '<option value="">All Technicians</option>' +
        technicians.map((t) => `<option value="${t.id}">${esc(t.full_name)}</option>`).join('');
    }
  } catch (err) {
    console.error('Filter populate error:', err);
  }
}

// ─── Events ────────────────────────────────────────────────────────────────────
document.getElementById('applyFiltersBtn').addEventListener('click', async () => {
  await loadSubmissions();
  const sd = document.getElementById('filterStartDate').value;
  if (sd) await loadIssues(sd);
});

// ─── Init ─────────────────────────────────────────────────────────────────────
(async function init() {
  await initNav();
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('filterStartDate').value = today;
  document.getElementById('filterEndDate').value = today;

  await Promise.all([
    loadStats(),
    loadIssues(),
    loadSubmissions(),
    populateFilterSelects(),
  ]);
})();

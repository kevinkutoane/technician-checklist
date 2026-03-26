'use strict';

let currentUser = null;

function statusBadge(status) {
  const labels = {
    working: '✅ Working',
    not_working: '❌ Not Working',
    needs_repair: '⚠️ Needs Repair',
  };
  const safeClass = Object.prototype.hasOwnProperty.call(labels, status) ? status : 'unknown';
  return `<span class="badge badge-${safeClass}">${labels[status] || esc(String(status))}</span>`;
}

// ─── Stats ────────────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const s = await apiFetch('/api/dashboard/summary');
    document.getElementById('statSubmissions').textContent = s.totalSubmissions;
    document.getElementById('statAssetAgreements').textContent = s.totalAssetAgreements || 0;
    document.getElementById('statQAChecklists').textContent = s.totalQAChecklists || 0;
    document.getElementById('statFlagged').textContent = s.flaggedItems;
    document.getElementById('statNotWorking').textContent = s.notWorkingItems;
    document.getElementById('statClassrooms').textContent = s.totalClassrooms;
    const techCard = document.getElementById('statTechnicianCard');
    if (currentUser && currentUser.role === 'admin') {
      document.getElementById('statTechnicians').textContent = s.totalTechnicians;
      // Coverage stat — requires admin-overview data
      try {
        const ov = await apiFetch('/api/dashboard/admin-overview');
        const pct = ov.classrooms_total > 0
          ? Math.round((ov.classrooms_checked_today / ov.classrooms_total) * 100)
          : 0;
        document.getElementById('statCoverage').textContent = `${pct}%`;
      } catch (err) {
        if (err.status === 401) { window.location.href = '/'; return; }
        console.warn('Admin overview unavailable:', err.message);
      }
    } else if (techCard) {
      techCard.style.display = 'none';
      const covCard = document.getElementById('statCoverageCard');
      if (covCard) covCard.style.display = 'none';
      // Unchecked classrooms for technicians
      try {
        const unchecked = await apiFetch('/api/dashboard/unchecked-classrooms');
        const alertEl = document.getElementById('uncheckedAlert');
        if (alertEl) {
          if (unchecked.length > 0) {
            const rows = unchecked.map((c) => {
              const lastChecked = c.last_checked ? `Last checked: ${esc(String(c.last_checked))}` : 'No prior submissions on record';
              return `
                <div style="display:flex;align-items:center;justify-content:space-between;
                            padding:0.65rem 1rem;border-bottom:1px solid var(--border)">
                  <div>
                    <span style="font-weight:600;font-size:1rem">${esc(c.name)}</span>
                    <div style="color:var(--text-muted,#64748b);font-size:0.8rem;margin-top:2px">${lastChecked}</div>
                  </div>
                  <a href="/checklist" class="btn btn-primary btn-sm" style="white-space:nowrap">
                    ✅ Check now
                  </a>
                </div>`;
            }).join('');
            alertEl.innerHTML = `
              <div class="card mb-4" style="border-left:4px solid #f59e0b">
                <div class="card-header" style="background:rgba(245,158,11,0.08)">
                  <span class="card-title">⚠️ Unchecked Classrooms Today</span>
                  <span style="background:#f59e0b;color:#fff;padding:2px 12px;border-radius:12px;
                               font-size:0.8rem;font-weight:600">${unchecked.length}</span>
                </div>
                ${rows}
              </div>`;
            alertEl.classList.remove('hidden');
          } else {
            alertEl.classList.add('hidden');
          }
        }
      } catch (err) {
        console.warn('Unchecked classrooms unavailable:', err.message);
      }
    }
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
    el.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
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
    el.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

// ─── Recent Asset Agreements & QA Checklists ────────────────────────────────
async function loadAssetAgreements() {
  const el = document.getElementById('assetAgreementsContainer');
  el.innerHTML = '<div class="spinner"></div>';
  try {
    const list = await apiFetch('/api/onboarding?limit=10');
    if (!list.length) {
      el.innerHTML = '<div class="empty-state"><p>No recent agreements.</p></div>';
      return;
    }
    el.innerHTML = list.map(item => `
      <div style="padding: 10px; border-bottom: 1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong>${esc(item.employee_name)}</strong>
          <br/><small style="color: var(--text-muted);">SN: ${esc(item.laptop_serial_number || 'N/A')}</small>
          <br/><small style="color: var(--text-muted);">Issued by ${esc(item.technician_name)} on ${item.submission_date}</small>
        </div>
        <a href="/api/onboarding/export?id=${item.id}" target="_blank" class="btn btn-secondary btn-sm" title="Download PDF">&#128196;</a>
      </div>
    `).join('');
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

async function loadQAChecklists() {
  const el = document.getElementById('qaChecklistsContainer');
  el.innerHTML = '<div class="spinner"></div>';
  try {
    const list = await apiFetch('/api/qa?limit=10');
    if (!list.length) {
      el.innerHTML = '<div class="empty-state"><p>No recent QA lists.</p></div>';
      return;
    }
    el.innerHTML = list.map(item => `
      <div style="padding: 10px; border-bottom: 1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong>${esc(item.username)}</strong>
          <br/><small style="color: var(--text-muted);">SN: ${esc(item.machine_serial || 'N/A')} | Ref: ${esc(item.call_ref || 'N/A')}</small>
          <br/><small style="color: var(--text-muted);">QAed by ${esc(item.technician_name)} on ${item.submission_date}</small>
        </div>
        <a href="/api/qa/export?id=${item.id}" target="_blank" class="btn btn-secondary btn-sm" title="Download PDF">&#128196;</a>
      </div>
    `).join('');
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

// ─── Today's Week-Ahead Schedule ─────────────────────────────────────────────
async function loadWeekAheadToday() {
  const el = document.getElementById('weekAheadContainer');
  if (!el) return;
  try {
    const events = await apiFetch('/api/week-ahead');
    const badge = document.getElementById('scheduleBadge');
    if (badge) {
      badge.textContent = events.length ? `${events.length} event${events.length !== 1 ? 's' : ''}` : '';
      badge.style.display = events.length ? '' : 'none';
    }
    if (!events.length) {
      el.innerHTML = '<div class="empty-state" style="padding:1rem"><div class="empty-icon">📅</div><p style="font-size:0.85rem">No events scheduled for today</p></div>';
      return;
    }
    el.innerHTML = `<div style="padding:0.5rem 1rem;display:flex;flex-direction:column;gap:0.5rem">
      ${events.map(e => {
        const itBadge = e.it_support_required
          ? `<span style="background:${e.it_support_required.toLowerCase().includes('required') ? 'var(--danger,#ef4444)' : 'var(--primary,#1A5FA8)'};color:#fff;padding:1px 6px;border-radius:6px;font-size:0.7rem">${esc(e.it_support_required)}</span>`
          : '';
        return `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="font-weight:700;color:var(--primary,#1A5FA8);min-width:100px">⏰ ${esc(e.time_range)}</span>
          <span style="font-weight:600">${esc(e.venue)}</span>
          <span style="flex:1;font-size:0.85rem">${esc(e.company_course)}</span>
          ${e.assigned_tech ? `<span style="font-size:0.8rem">🔧 ${esc(e.assigned_tech)}</span>` : ''}
          ${itBadge}
        </div>`;
      }).join('')}
    </div>`;
  } catch (err) {
    el.innerHTML = `<div class="empty-state" style="padding:1rem"><p style="font-size:0.85rem;color:var(--text-muted)">Schedule unavailable</p></div>`;
  }
}

// ─── Hybrid Classroom Setups ─────────────────────────────────────────────────
async function loadHybridSetups() {
  const el = document.getElementById('hybridSetupsList');
  if (!el) return;
  try {
    const setups = await apiFetch('/api/hybrid');
    renderHybridCard(setups);
    const badge = document.getElementById('hybridBadge');
    if (badge) {
      badge.textContent = setups.length ? `${setups.length} hybrid` : '';
      badge.style.display = setups.length ? '' : 'none';
    }
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger" style="margin:0.75rem">${esc(err.message)}</div>`;
  }
}

function renderHybridCard(setups) {
  const el = document.getElementById('hybridSetupsList');
  if (!el) return;
  if (!setups.length) {
    el.innerHTML = `<div class="empty-state" style="padding:1rem 1rem 0.5rem">
      <div class="empty-icon">🎥</div>
      <p style="font-size:0.85rem">No hybrid classrooms flagged for today. Use the form below to mark one.</p>
    </div>`;
    return;
  }
  el.innerHTML = `
    <div class="table-wrapper">
      <table style="font-size:0.85rem">
        <thead>
          <tr><th>Classroom</th><th>Set by</th><th>Time</th><th>Note</th><th></th></tr>
        </thead>
        <tbody>
          ${setups.map((s) => `
            <tr>
              <td><strong>${esc(s.classroom_name)}</strong></td>
              <td>${esc(s.set_by_name)}</td>
              <td style="white-space:nowrap">${new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
              <td>${esc(s.notes || '—')}</td>
              <td><button class="btn btn-secondary btn-sm" onclick="clearHybrid(${s.id})">✕ Clear</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function clearHybrid(id) {
  const errEl = document.getElementById('hybridError');
  if (errEl) errEl.classList.add('hidden');
  try {
    await apiFetch(`/api/hybrid/${id}`, { method: 'DELETE' });
    // Fetch hybrid data once and share between both consumers to avoid duplicate requests
    const hybrids = await apiFetch('/api/hybrid');
    const hybridSet = new Set(hybrids.map((h) => h.classroom_id));
    renderHybridCard(hybrids);
    const badge = document.getElementById('hybridBadge');
    if (badge) {
      badge.textContent = hybrids.length ? `${hybrids.length} hybrid` : '';
      badge.style.display = hybrids.length ? '' : 'none';
    }
    await loadClassroomStatus('todayProgressGrid', currentUser ? currentUser.id : null, hybridSet);
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
  }
}

// ─── Today's Classroom Completion Progress ────────────────────────────────────
let progressPollId = null;

async function loadTodayProgress() {
  let hybridSet;
  try {
    const hybrids = await apiFetch('/api/hybrid');
    hybridSet = new Set(hybrids.map((h) => h.classroom_id));
  } catch (_) {
    hybridSet = new Set();
  }
  await loadClassroomStatus('todayProgressGrid', currentUser ? currentUser.id : null, hybridSet);
}

// ─── Equipment Status Trends (Admin only) ─────────────────────────────────────
let trendsChartInst = null;
const TREND_STATUS_MAP = { working: 1, needs_repair: 0.5, not_working: 0 };
const TREND_COLORS = [
  '#4f46e5','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4',
  '#f97316','#ec4899','#84cc16','#14b8a6',
];

async function loadEquipmentTrends() {
  const el = document.getElementById('trendsContainer');
  if (!el) return;
  const crSel = document.getElementById('trendsClassroom');
  const classroomId = crSel ? crSel.value : '';
  if (!classroomId) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📈</div><p>Select a classroom above to view trends</p></div>';
    return;
  }
  el.innerHTML = '<div class="spinner"></div>';
  try {
    const data = await apiFetch(`/api/dashboard/equipment-trends?classroom_id=${classroomId}&days=14`);
    if (!data.datasets || !data.datasets.length) {
      el.innerHTML = '<div class="empty-state"><p>No equipment data for this classroom.</p></div>';
      return;
    }
    el.innerHTML = '<canvas id="trendsChart" style="height:250px"></canvas>';
    const ctx = document.getElementById('trendsChart').getContext('2d');
    if (trendsChartInst) trendsChartInst.destroy();
    trendsChartInst = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: data.datasets.map((ds, i) => ({
          label: ds.name,
          data: ds.data.map((s) => s === null ? null : TREND_STATUS_MAP[s] ?? null),
          borderColor: TREND_COLORS[i % TREND_COLORS.length],
          backgroundColor: 'transparent',
          tension: 0.3,
          spanGaps: true,
          pointRadius: 4,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            min: -0.1,
            max: 1.1,
            ticks: {
              callback: (v) => v === 1 ? '✅ Working' : v === 0.5 ? '⚠️ Repair' : v === 0 ? '❌ Down' : '',
              stepSize: 0.5,
            },
          },
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = ctx.raw;
                const label = v === 1 ? 'Working' : v === 0.5 ? 'Needs Repair' : v === 0 ? 'Not Working' : 'No data';
                return `${ctx.dataset.label}: ${label}`;
              },
            },
          },
        },
      },
    });
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

// ─── Admin Charts ─────────────────────────────────────────────────────────────
let dailyChartInst, statusChartInst, classroomsChartInst, techChartInst;

async function loadAdminCharts() {
  const chartSection = document.getElementById('adminCharts');
  // Only show for admins
  if (!currentUser || currentUser.role !== 'admin') {
    if (chartSection) chartSection.classList.add('hidden');
    return;
  }
  if (chartSection) chartSection.classList.remove('hidden');

  try {
    const data = await apiFetch('/api/dashboard/charts');
    
    // 1. Daily Operational Pulse (Checks vs Flags)
    const ctxDaily = document.getElementById('dailyActivityChart').getContext('2d');
    if (dailyChartInst) dailyChartInst.destroy();
    dailyChartInst = new Chart(ctxDaily, {
      type: 'bar',
      data: {
        labels: data.dailyActivity.labels,
        datasets: [
          {
            label: 'Classroom Checks',
            data: data.dailyActivity.checks,
            backgroundColor: 'rgba(79, 70, 229, 0.8)',
            borderRadius: 4
          },
          {
            label: 'Flagged Issues',
            data: data.dailyActivity.flags,
            type: 'line',
            borderColor: '#f59e0b',
            backgroundColor: 'transparent',
            tension: 0.4,
            borderWidth: 3,
            pointBackgroundColor: '#f59e0b'
          }
        ]
      },
      options: { 
        responsive: true, 
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, grid: { display: false } }
        }
      }
    });

    // 2. Equipment Health Mix
    const ctxStatus = document.getElementById('statusMixChart').getContext('2d');
    if (statusChartInst) statusChartInst.destroy();
    statusChartInst = new Chart(ctxStatus, {
      type: 'doughnut',
      data: {
        labels: data.statusMix.labels,
        datasets: [{
          data: data.statusMix.data,
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
          borderWidth: 0
        }]
      },
      options: { 
        responsive: true, 
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });

    // 3. High-Maintenance Classrooms (Top 5)
    const ctxRooms = document.getElementById('topClassroomsChart').getContext('2d');
    if (classroomsChartInst) classroomsChartInst.destroy();
    classroomsChartInst = new Chart(ctxRooms, {
      type: 'bar',
      data: {
        labels: data.topClassrooms.labels,
        datasets: [{
          label: 'Total Flags',
          data: data.topClassrooms.data,
          backgroundColor: 'rgba(239, 68, 68, 0.7)',
          borderRadius: 4
        }]
      },
      options: { 
        indexAxis: 'y',
        responsive: true, 
        maintainAspectRatio: false,
        scales: {
          x: { beginAtZero: true, grid: { display: false } }
        }
      }
    });

    // 4. Technician Performance
    const ctxTech = document.getElementById('techActivityChart').getContext('2d');
    if (techChartInst) techChartInst.destroy();
    techChartInst = new Chart(ctxTech, {
      type: 'bar',
      data: {
        labels: data.techActivity.labels,
        datasets: [{
          label: 'Submissions',
          data: data.techActivity.data,
          backgroundColor: 'rgba(16, 185, 129, 0.7)',
          borderRadius: 4
        }]
      },
      options: { 
        responsive: true, 
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true }
        },
        plugins: {
          tooltip: {
            callbacks: {
              title: (items) => data.techActivity.fullNames[items[0].dataIndex]
            }
          }
        }
      }
    });
  } catch (err) {
    console.error('Charts error:', err);
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
    alert(`Error: ${esc(err.message)}`);
  }
};

// ─── Mark Hybrid event ───────────────────────────────────────────────────────
document.getElementById('markHybridBtn')?.addEventListener('click', async () => {
  const errEl = document.getElementById('hybridError');
  if (errEl) errEl.classList.add('hidden');
  const classroom_id = document.getElementById('hybridClassroomSelect').value;
  const notes = document.getElementById('hybridNoteInput').value.trim();
  if (!classroom_id) {
    if (errEl) { errEl.textContent = 'Please select a classroom first.'; errEl.classList.remove('hidden'); }
    return;
  }
  try {
    await apiFetch('/api/hybrid', {
      method: 'POST',
      body: JSON.stringify({ classroom_id: Number(classroom_id), notes }),
    });
    document.getElementById('hybridNoteInput').value = '';
    document.getElementById('hybridClassroomSelect').value = '';
    await Promise.all([loadHybridSetups(), loadTodayProgress()]);
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
  }
});

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
  // Non-admins can only export their own data
  if (currentUser && currentUser.role !== 'admin') {
    params.set('technician_id', currentUser.id);
  } else if (te) {
    params.set('technician_id', te);
  }
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

    const hybridSel = document.getElementById('hybridClassroomSelect');
    if (hybridSel) {
      hybridSel.innerHTML = '<option value="">-- Select Classroom --</option>' +
        classrooms.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    }

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
  await loadAssetAgreements();
  await loadQAChecklists();
  const sd = document.getElementById('filterStartDate').value;
  if (sd) await loadIssues(sd);
  await loadAdminCharts();
});

// ─── Init ─────────────────────────────────────────────────────────────────────
(async function init() {
  currentUser = await initNav('/dashboard');
  if (!currentUser) return;

  if (currentUser.role === 'admin') {
    document.getElementById('adminCharts').classList.remove('hidden');
  } else {
    document.getElementById('techFilterGroup').classList.add('hidden');
    document.getElementById('techQuickActions').classList.remove('hidden');
  }

  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('filterStartDate').value = today;
  document.getElementById('filterEndDate').value = today;

  await Promise.all([
    loadStats(),
    // loadWeekAheadToday(), // hidden until Week Ahead upload format is finalised
    loadHybridSetups(),
    loadTodayProgress(),
    loadIssues(),
    loadSubmissions(),
    loadAssetAgreements(),
    loadQAChecklists(),
    loadAdminCharts(),
    populateFilterSelects(),
  ]);

  progressPollId = setInterval(async () => {
    await Promise.all([loadHybridSetups(), loadTodayProgress()]);
  }, 30_000);
  window.addEventListener('beforeunload', () => clearInterval(progressPollId));

  // Populate classroom selector for trends (admin only)
  if (currentUser && currentUser.role === 'admin') {
    const crSel = document.getElementById('trendsClassroom');
    if (crSel) {
      try {
        const classrooms = await apiFetch('/api/classrooms');
        crSel.innerHTML = '<option value="">-- Select classroom --</option>' +
          classrooms.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
        crSel.addEventListener('change', loadEquipmentTrends);
      } catch(_) {}
    }
    loadEquipmentTrends();
  }
})();

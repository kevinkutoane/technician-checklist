'use strict';

let currentUser = null;
let weekStart = null; // Date object for the Monday of the viewed week
let selectedDay = 0;  // 0=Mon, 1=Tue … 6=Sun
let weekEvents = [];  // cached events for the current week

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  dt.setDate(dt.getDate() - ((day + 6) % 7));
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function formatDateLabel(d) {
  return d.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── Week Navigation ─────────────────────────────────────────────────────────

function updateWeekLabel() {
  const end = addDays(weekStart, 6);
  const fmt = (d) => d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  document.getElementById('weekLabel').textContent =
    `${fmt(weekStart)} – ${fmt(end)} ${end.getFullYear()}`;
}

function updateDayTabs() {
  const today = dateStr(new Date());
  for (let i = 0; i < 7; i++) {
    const tabBtn = document.getElementById(`dayTab${i}`);
    const dayDate = addDays(weekStart, i);
    const isToday = dateStr(dayDate) === today;
    const dayEvents = weekEvents.filter(e => e.event_date === dateStr(dayDate));

    tabBtn.textContent = DAY_NAMES[i].slice(0, 3);
    if (dayEvents.length) tabBtn.textContent += ` (${dayEvents.length})`;
    if (isToday) tabBtn.textContent += ' •';

    tabBtn.classList.toggle('active', i === selectedDay);
    tabBtn.style.borderBottomColor = i === selectedDay ? 'var(--primary, #1A5FA8)' : 'transparent';
  }
}

// ─── Render Day Schedule ─────────────────────────────────────────────────────

function renderDaySchedule() {
  const el = document.getElementById('daySchedule');
  const dayDate = addDays(weekStart, selectedDay);
  const dayDateStr = dateStr(dayDate);
  const events = weekEvents.filter(e => e.event_date === dayDateStr);

  if (!events.length) {
    el.innerHTML = `
      <div class="empty-state" style="padding:2rem 1rem">
        <div class="empty-icon">📅</div>
        <p>No events scheduled for ${formatDateLabel(dayDate)}</p>
      </div>`;
    return;
  }

  el.innerHTML = `
    <p style="color:var(--text-muted);font-size:0.82rem;margin-bottom:1rem">
      ${formatDateLabel(dayDate)} — ${events.length} event${events.length !== 1 ? 's' : ''}
    </p>
    <div style="display:flex;flex-direction:column;gap:0.75rem">
      ${events.map(e => {
        const itBadge = e.it_support_required
          ? `<span style="background:${e.it_support_required.toLowerCase().includes('required') ? 'var(--danger,#ef4444)' : 'var(--primary,#1A5FA8)'};color:#fff;padding:2px 8px;border-radius:6px;font-size:0.72rem;font-weight:600">${esc(e.it_support_required)}</span>`
          : '';
        const paxInfo = (e.pax_campus || e.pax_zoom)
          ? `<span style="font-size:0.8rem;color:var(--text-muted)">👥 ${e.pax_campus} on campus${e.pax_zoom ? ` · ${e.pax_zoom} via Zoom` : ''}</span>`
          : '';

        return `<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
          <div style="background:var(--gray-100);padding:10px 14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-weight:700;font-size:0.95rem;color:var(--primary,#1A5FA8)">⏰ ${esc(e.time_range)}</span>
            <span style="font-weight:600">${esc(e.venue)}</span>
            ${itBadge}
          </div>
          <div style="padding:10px 14px">
            <div style="font-weight:600;margin-bottom:4px">${esc(e.company_course)}</div>
            ${e.lecturer ? `<div style="font-size:0.85rem;color:var(--text-muted)">🎓 ${esc(e.lecturer)}</div>` : ''}
            ${e.contact_person ? `<div style="font-size:0.85rem;color:var(--text-muted)">📞 ${esc(e.contact_person)}</div>` : ''}
            ${paxInfo ? `<div>${paxInfo}</div>` : ''}
            ${e.assigned_tech ? `<div style="font-size:0.85rem"><strong>🔧 Tech:</strong> ${esc(e.assigned_tech)}</div>` : ''}
            ${e.syndicates_other_venues ? `<div style="font-size:0.82rem;color:var(--text-muted)">📍 ${esc(e.syndicates_other_venues)}</div>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

// ─── Load Week Data ──────────────────────────────────────────────────────────

async function loadWeek() {
  const el = document.getElementById('daySchedule');
  el.innerHTML = '<div class="spinner"></div>';
  try {
    weekEvents = await apiFetch(`/api/week-ahead/week?start=${dateStr(weekStart)}`);
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
    return;
  }
  updateWeekLabel();
  updateDayTabs();
  renderDaySchedule();
}

// ─── Upload ──────────────────────────────────────────────────────────────────

function initUpload() {
  const fileInput = document.getElementById('weekAheadFileInput');
  const uploadBtn = document.getElementById('uploadBtn');
  const errEl = document.getElementById('uploadError');
  const successEl = document.getElementById('uploadSuccess');

  fileInput.addEventListener('change', () => {
    uploadBtn.disabled = !fileInput.files.length;
    errEl.classList.add('hidden');
    successEl.classList.add('hidden');
  });

  uploadBtn.addEventListener('click', async () => {
    if (!fileInput.files.length) return;
    errEl.classList.add('hidden');
    successEl.classList.add('hidden');
    uploadBtn.disabled = true;
    uploadBtn.textContent = '⏳ Uploading…';

    try {
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);

      const res = await fetch('/api/week-ahead/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      successEl.innerHTML = `
        <strong>✅ Uploaded successfully!</strong><br>
        <span style="font-size:0.85rem">${data.event_count} events parsed for
        ${data.week_start} to ${data.week_end}</span>`;
      successEl.classList.remove('hidden');
      fileInput.value = '';

      // Navigate to the uploaded week and refresh the schedule
      const uploadedDate = new Date(data.week_start + 'T00:00:00');
      weekStart = getMonday(uploadedDate);
      selectedDay = 0;
      await loadWeek();
      await loadUploadHistory();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = '📤 Upload';
    }
  });
}

// ─── Upload History ──────────────────────────────────────────────────────────

async function loadUploadHistory() {
  const el = document.getElementById('uploadHistoryList');
  if (!el) return;
  el.innerHTML = '<div class="spinner"></div>';
  try {
    const uploads = await apiFetch('/api/week-ahead/uploads');
    if (!uploads.length) {
      el.innerHTML = '<div class="empty-state" style="padding:1rem"><p>No uploads yet</p></div>';
      return;
    }
    el.innerHTML = `
      <div class="table-wrapper">
        <table style="font-size:0.85rem">
          <thead>
            <tr><th>File</th><th>Period</th><th>Events</th><th>Uploaded</th><th></th></tr>
          </thead>
          <tbody>
            ${uploads.map(u => `
              <tr>
                <td>${esc(u.filename)}</td>
                <td style="white-space:nowrap">${esc(u.week_start || '—')} → ${esc(u.week_end || '—')}</td>
                <td>${u.row_count}</td>
                <td style="white-space:nowrap">${new Date(u.created_at).toLocaleString()}</td>
                <td><button class="btn btn-secondary btn-sm" onclick="deleteUpload('${esc(u.id)}')">🗑️</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

window.deleteUpload = async function (batchId) {
  if (!confirm('Delete this upload and all its events?')) return;
  try {
    await apiFetch(`/api/week-ahead/${batchId}`, { method: 'DELETE' });
    await loadWeek();
    await loadUploadHistory();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
};

// ─── Day Tab Clicks ──────────────────────────────────────────────────────────

for (let i = 0; i < 7; i++) {
  document.getElementById(`dayTab${i}`).addEventListener('click', () => {
    selectedDay = i;
    updateDayTabs();
    renderDaySchedule();
  });
}

// ─── Week Navigation Buttons ─────────────────────────────────────────────────

document.getElementById('prevWeekBtn').addEventListener('click', () => {
  weekStart = addDays(weekStart, -7);
  selectedDay = 0;
  loadWeek();
});

document.getElementById('nextWeekBtn').addEventListener('click', () => {
  weekStart = addDays(weekStart, 7);
  selectedDay = 0;
  loadWeek();
});

document.getElementById('todayBtn').addEventListener('click', () => {
  const now = new Date();
  weekStart = getMonday(now);
  selectedDay = (now.getDay() + 6) % 7; // Mon=0 … Sun=6
  loadWeek();
});

document.getElementById('refreshUploadsBtn')?.addEventListener('click', loadUploadHistory);

// ─── Init ────────────────────────────────────────────────────────────────────

(async function init() {
  currentUser = await initNav('/week-ahead');
  if (!currentUser) return;

  // Show upload section for technicians only
  if (currentUser.role === 'technician') {
    document.getElementById('uploadSection').classList.remove('hidden');
    document.getElementById('uploadHistorySection').classList.remove('hidden');
    initUpload();
    loadUploadHistory();
  }

  // Set initial week to current week, default to today
  const now = new Date();
  weekStart = getMonday(now);
  selectedDay = (now.getDay() + 6) % 7;

  await loadWeek();
})();

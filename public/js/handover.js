'use strict';

// ─── Service definitions (matches routes/handover.js keys) ───────────────────
const SERVICES = [
  { key: 'pc_working',         label: 'Classroom PC Working?',                              hint: 'Faculty use their own laptop?' },
  { key: 'projector_working',  label: 'Projector working?',                                 hint: '' },
  { key: 'wifi_students',      label: 'Wi-Fi Connectivity (Students?)',                      hint: '' },
  { key: 'cables_working',     label: 'Cables (HDMI, VGA, AUX) working?',                   hint: '' },
  { key: 'microphones',        label: 'Faculty and desk Microphones',                        hint: '' },
  { key: 'faculty_mic_zoom',   label: 'Faculty Mic. working over Zoom / Teams?',             hint: '' },
  { key: 'room_mic_zoom',      label: 'Room Mic. Working over Zoom / Teams?',                hint: '' },
  { key: 'classroom_audio',    label: 'Classroom Audio',                                     hint: '' },
  { key: 'cameras_working',    label: 'Classroom Cameras Working?',                          hint: '' },
  { key: 'cameras_positioned', label: 'Cameras Positioned and working?',                     hint: '' },
  { key: 'zoom_teams',         label: 'Zoom / MS Teams Account & Session working?',          hint: '' },
  { key: 'contact_supplied',   label: 'Contact Number Supplied to Session Producer and faculty?', hint: '' },
];

let facSigPad, spSigPad, pmSigPad;

// ─── Render Services Table ────────────────────────────────────────────────────
function renderServicesTable() {
  const tbody = document.querySelector('#servicesTable tbody');
  tbody.innerHTML = SERVICES.map((svc) => `
    <tr>
      <td>
        <div style="font-weight:500;">${esc(svc.label)}</div>
        ${svc.hint ? `<div style="font-size:0.75rem;color:var(--text-muted);">${esc(svc.hint)}</div>` : ''}
      </td>
      <td style="text-align:center;">
        <input type="radio" name="${svc.key}" value="yes" style="width:1.1rem;height:1.1rem;cursor:pointer;" />
      </td>
      <td style="text-align:center;">
        <input type="radio" name="${svc.key}" value="no" style="width:1.1rem;height:1.1rem;cursor:pointer;" />
      </td>
      <td>
        <input type="text" class="form-control" id="${svc.key}_comments"
          placeholder="Comments…" style="font-size:0.8rem;padding:0.3rem 0.5rem;" />
      </td>
    </tr>
  `).join('');
}

// ─── Build Services Payload ───────────────────────────────────────────────────
function buildServicesPayload() {
  const obj = {};
  for (const svc of SERVICES) {
    const checked  = document.querySelector(`input[name="${svc.key}"]:checked`);
    const comments = (document.getElementById(`${svc.key}_comments`) || {}).value || '';
    obj[svc.key] = { ok: checked ? checked.value === 'yes' : null, comments: comments.trim() };
  }
  return obj;
}

// ─── Initialise Signature Pads ────────────────────────────────────────────────
function initSignaturePads() {
  const resizeCanvas = (canvas) => {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width  = canvas.offsetWidth  * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d').scale(ratio, ratio);
  };

  const facCanvas = document.getElementById('facultySigCanvas');
  const spCanvas  = document.getElementById('spSigCanvas');
  const pmCanvas  = document.getElementById('pmSigCanvas');

  [facCanvas, spCanvas, pmCanvas].forEach(resizeCanvas);

  facSigPad = new SignaturePad(facCanvas);
  spSigPad  = new SignaturePad(spCanvas);
  pmSigPad  = new SignaturePad(pmCanvas);

  document.getElementById('clearFacultySig').addEventListener('click', () => facSigPad.clear());
  document.getElementById('clearSpSig').addEventListener('click',      () => spSigPad.clear());
  document.getElementById('clearPmSig').addEventListener('click',      () => pmSigPad.clear());
}

// ─── Load Classrooms ──────────────────────────────────────────────────────────
async function loadClassrooms() {
  try {
    const classrooms = await apiFetch('/api/classrooms');
    const sel = document.getElementById('handoverClassroom');
    sel.innerHTML = '<option value="">-- Select Classroom --</option>' +
      classrooms.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  } catch (err) {
    console.error('Failed to load classrooms:', err.message);
  }
}

// ─── Render Handovers List ────────────────────────────────────────────────────
function renderHandovers(records) {
  const container = document.getElementById('handoversList');
  if (!records.length) {
    container.innerHTML = `<div class="empty-state" style="padding:1.5rem 1rem"><p>No handover records yet.</p></div>`;
    return;
  }
  container.innerHTML = `
    <div class="table-wrapper">
      <table style="font-size:0.85rem;">
        <thead>
          <tr>
            <th>Date</th>
            <th>Class Start</th>
            <th>Classroom</th>
            <th>Programme</th>
            <th>Technician</th>
          </tr>
        </thead>
        <tbody>
          ${records.map((r) => `
            <tr>
              <td>${esc(r.handover_date)}</td>
              <td>${esc(r.class_start_time || '—')}</td>
              <td>${esc(r.classroom_name || '—')}</td>
              <td>${esc(r.programme_name || '—')}</td>
              <td>${esc(r.technician_name)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ─── Load Handovers ───────────────────────────────────────────────────────────
async function loadHandovers() {
  const container = document.getElementById('handoversList');
  container.innerHTML = '<div class="spinner"></div>';
  try {
    const records = await apiFetch('/api/handover?limit=50');
    renderHandovers(records);
  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger" style="margin:1rem;">${esc(err.message || 'Failed to load records')}</div>`;
  }
}

// ─── Submit Handover ──────────────────────────────────────────────────────────
document.getElementById('submitHandoverBtn').addEventListener('click', async () => {
  const errEl     = document.getElementById('handoverError');
  const successEl = document.getElementById('handoverSuccess');
  errEl.classList.add('hidden');
  successEl.classList.add('hidden');

  const handover_date = document.getElementById('handoverDate').value;
  const classroom_id  = document.getElementById('handoverClassroom').value;

  if (!handover_date) {
    errEl.textContent = 'Date is required.';
    errEl.classList.remove('hidden');
    return;
  }
  if (!classroom_id) {
    errEl.textContent = 'Classroom is required.';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('submitHandoverBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const payload = {
      handover_date,
      classroom_id:           Number(classroom_id),
      checking_start_time:    document.getElementById('checkingStartTime').value,
      class_start_time:       document.getElementById('classStartTime').value,
      programme_name:         document.getElementById('programmeName').value.trim(),
      faculty_name:           document.getElementById('facultyName').value.trim(),
      session_producer_name:  document.getElementById('sessionProducerName').value.trim(),
      programme_manager_name: document.getElementById('programmeManagerName').value.trim(),
      services_data:          buildServicesPayload(),
      faculty_arrived:        document.getElementById('facultyArrived').value,
      faculty_comments:       document.getElementById('facultyComments').value.trim(),
      faculty_signature:      (facSigPad && !facSigPad.isEmpty()) ? facSigPad.toDataURL() : '',
      session_producer_arrived:   document.getElementById('spArrived').value,
      session_producer_comments:  document.getElementById('spComments').value.trim(),
      session_producer_signature: (spSigPad && !spSigPad.isEmpty()) ? spSigPad.toDataURL() : '',
      programme_manager_arrived:   document.getElementById('pmArrived').value,
      programme_manager_comments:  document.getElementById('pmComments').value.trim(),
      programme_manager_signature: (pmSigPad && !pmSigPad.isEmpty()) ? pmSigPad.toDataURL() : '',
      additional_comments: document.getElementById('additionalComments').value.trim(),
    };

    await apiFetch('/api/handover', { method: 'POST', body: JSON.stringify(payload) });

    const sel = document.getElementById('handoverClassroom');
    const classroomName = sel.options[sel.selectedIndex].text;
    successEl.textContent = `Handover form submitted for ${classroomName} on ${handover_date}.`;
    successEl.classList.remove('hidden');

    // Reset form and signatures
    document.getElementById('handoverForm').reset();
    if (facSigPad) facSigPad.clear();
    if (spSigPad)  spSigPad.clear();
    if (pmSigPad)  pmSigPad.clear();
    renderServicesTable(); // re-render to clear radio states
    setDefaults();

    await loadHandovers();
  } catch (err) {
    errEl.textContent = err.message || 'Failed to submit handover form.';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = '📋 Submit Handover Form';
  }
});

// ─── Refresh button ───────────────────────────────────────────────────────────
document.getElementById('refreshHandoversBtn').addEventListener('click', loadHandovers);

// ─── Set default date / time ─────────────────────────────────────────────────
function setDefaults() {
  document.getElementById('handoverDate').value         = new Date().toISOString().slice(0, 10);
  document.getElementById('checkingStartTime').value    = new Date().toTimeString().slice(0, 5);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
(async function init() {
  const user = await initNav('/handover');
  if (!user) return;

  document.getElementById('technicianName').value = user.full_name;
  renderServicesTable();
  setDefaults();
  await loadClassrooms();
  initSignaturePads();
  await loadHandovers();
})();

'use strict';

let currentUser = null;
let signaturePad = null;
let cameraStream = null;
let photo_data = '';

function initSignaturePad() {
  const canvas = document.getElementById('signatureCanvas');
  if (!canvas || typeof SignaturePad === 'undefined') return;

  signaturePad = new SignaturePad(canvas, {
    backgroundColor: 'rgba(255, 255, 255, 0)',
    penColor: '#1e1b4b',
  });

  // Resize canvas to fit container while preserving DPR
  function resizeCanvas() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width  = canvas.offsetWidth  * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d').scale(ratio, ratio);
    signaturePad.clear();
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  document.getElementById('clearSignatureBtn').addEventListener('click', () => {
    signaturePad.clear();
  });
}

// ─── Camera / Photo Logic ───────────────────────────────────────────────────
function showCameraState(state) {
  document.getElementById('cameraPrompt').classList.toggle('hidden', state !== 'prompt');
  document.getElementById('cameraLive').classList.toggle('hidden',   state !== 'live');
  document.getElementById('cameraPreview').classList.toggle('hidden', state !== 'preview');
}

function stopStream() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
}

window.addEventListener('beforeunload', stopStream);

function updatePhotoDownload() {
  const a = document.getElementById('downloadPhotoBtn');
  if (!a) return;
  const nameRaw = document.getElementById('employeeName').value.trim() || 'staff';
  a.download = nameRaw.replace(/\s+/g, '-').toLowerCase() + '-photo.png';
  a.href = photo_data;
}

function initCamera() {
  const openBtn    = document.getElementById('openCameraBtn');
  const uploadBtn  = document.getElementById('uploadPhotoBtn');
  const fileInput  = document.getElementById('photoFileInput');
  const captureBtn = document.getElementById('capturePhotoBtn');
  const cancelBtn  = document.getElementById('cancelCameraBtn');
  const retakeBtn  = document.getElementById('retakePhotoBtn');
  const video      = document.getElementById('cameraVideo');
  if (!openBtn) return;

  openBtn.addEventListener('click', async () => {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      video.srcObject = cameraStream;
      showCameraState('live');
    } catch (_) {
      // getUserMedia unavailable — fall through to file picker
      fileInput.click();
    }
  });

  uploadBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      photo_data = ev.target.result;
      document.getElementById('photoPreview').src = photo_data;
      updatePhotoDownload();
      showCameraState('preview');
    };
    reader.readAsDataURL(file);
  });

  captureBtn.addEventListener('click', () => {
    const canvas  = document.getElementById('photoCanvas');
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    photo_data = canvas.toDataURL('image/png');
    stopStream();
    document.getElementById('photoPreview').src = photo_data;
    updatePhotoDownload();
    showCameraState('preview');
  });

  cancelBtn.addEventListener('click', () => {
    stopStream();
    showCameraState('prompt');
  });

  retakeBtn.addEventListener('click', () => {
    photo_data = '';
    document.getElementById('photoPreview').src = '';
    fileInput.value = '';
    showCameraState('prompt');
  });

  document.getElementById('employeeName').addEventListener('input', () => {
    if (photo_data) updatePhotoDownload();
  });
}

// ─── Form Logic ─────────────────────────────────────────────────────────────
document.getElementById('submitBtn').addEventListener('click', async () => {
  const employee_name = document.getElementById('employeeName').value.trim();
  
  const errEl = document.getElementById('submitError');
  const successEl = document.getElementById('submitSuccess');
  
  errEl.classList.add('hidden');
  successEl.classList.add('hidden');

  if (!employee_name) {
    errEl.textContent = 'Employee name is required.';
    errEl.classList.remove('hidden');
    return;
  }

  // Capture signature data URL (empty string if pad is blank or unavailable)
  let signature_data = '';
  if (signaturePad && !signaturePad.isEmpty()) {
    signature_data = signaturePad.toDataURL('image/png');
  }

  const payload = {
    employee_name,
    laptop_serial_number: document.getElementById('laptopSerialNumber').value.trim(),
    sim_card_number: document.getElementById('simCardNumber').value.trim(),
    asset_tag: document.getElementById('assetTag').value.trim(),
    dongle: document.getElementById('dongle').checked,
    laptop_charger: document.getElementById('laptopCharger').checked,
    laptop_bag: document.getElementById('laptopBag').checked,
    mouse: document.getElementById('mouse').checked,
    monitor: document.getElementById('monitor').checked,
    keyboard: document.getElementById('keyboard').checked,
    signature_data,
    photo_data,
  };

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const result = await apiFetch('/api/onboarding', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    const downloadId = Number(result.id);
    successEl.innerHTML = `Asset Agreement saved successfully! &nbsp;<a href="/api/onboarding/export?id=${downloadId}" target="_blank" class="btn btn-sm btn-secondary" style="vertical-align:middle">&#128196; Download PDF</a>`;
    successEl.classList.remove('hidden');
    
    // Reset form, signature pad, and camera
    document.getElementById('assetAgreementForm').reset();
    if (signaturePad) signaturePad.clear();
    stopStream();
    photo_data = '';
    document.getElementById('photoPreview').src = '';
    showCameraState('prompt');
    
    await loadHistory();
  } catch (err) {
    errEl.textContent = err.message || 'Failed to save Asset Agreement.';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Asset Agreement';
  }
});

// ─── History Logic ──────────────────────────────────────────────────────────
async function loadHistory() {
  const container = document.getElementById('historyList');
  try {
    const list = await apiFetch('/api/onboarding?limit=5');
    if (!list.length) {
      container.innerHTML = '<div class="empty-state"><p>No recent agreements.</p></div>';
      return;
    }
    
    container.innerHTML = list.map(item => `
      <div class="history-item" style="padding: 10px; border-bottom: 1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong>${esc(item.employee_name)}</strong>
          <br/><small style="color: var(--text-muted);">SN: ${esc(item.laptop_serial_number || 'N/A')}</small>
          <br/><small style="color: var(--text-muted);">Issued by ${esc(item.technician_name)} on ${item.submission_date}</small>
        </div>
        <a href="/api/onboarding/export?id=${item.id}" target="_blank" class="btn btn-secondary btn-sm" title="Download PDF">&#128196;</a>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="alert alert-danger">Failed to load history</div>';
  }
}

// ─── Init ───────────────────────────────────────────────────────────────────
(async function init() {
  currentUser = await initNav('/onboarding');
  if (!currentUser) return;
  initSignaturePad();
  initCamera();
  await loadHistory();
})();

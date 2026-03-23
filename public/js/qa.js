'use strict';

let currentUser = null;

document.getElementById('submitBtn').addEventListener('click', async () => {
  const username = document.getElementById('qaUsername').value.trim();
  
  const errEl = document.getElementById('submitError');
  const successEl = document.getElementById('submitSuccess');
  
  errEl.classList.add('hidden');
  successEl.classList.add('hidden');

  if (!username) {
    errEl.textContent = 'Username is required.';
    errEl.classList.remove('hidden');
    return;
  }

  const toggles = [
    'backup_user_profile', 'backup_internet_favorites', 'backup_outlook_cache',
    'join_domain', 'windows_updates', 'drivers_3g', 'windows_defender', 'mimecast_mso',
    'bios_updated', 'vpn_setup', 'remove_local_admin', 'onedrive_home_dir',
    'mapped_drive', 'onedrive_default_save', 'nic_power_management',
    'staff_distribution_list', 'intranet_homepage', 'direct_shortcut',
    'rendezvous_shortcut', 'windows_activated', 'office_activated',
    'private_wifi', 'accpac_installed', 'test_vga', 'test_usb',
    'klite_codec', 'regional_settings', 'register_office_credentials'
  ];

  const payload = {
    username,
    machine_serial: document.getElementById('qaMachineSerial').value.trim(),
    call_ref: document.getElementById('qaCallRef').value.trim(),
    printers_installed: document.getElementById('printers').value.trim(),
    other_software: document.getElementById('otherSoftware').value.trim(),
  };

  toggles.forEach(id => {
    payload[id] = document.getElementById(id).checked;
  });

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const result = await apiFetch('/api/qa', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    const downloadId = Number(result.id);
    successEl.innerHTML = `QA Checklist saved successfully! &nbsp;<a href="/api/qa/export?id=${downloadId}" target="_blank" class="btn btn-sm btn-secondary" style="vertical-align:middle">&#128196; Download PDF</a>`;
    successEl.classList.remove('hidden');
    
    document.getElementById('qaForm').reset();
    window.scrollTo(0, 0);
    
    await loadHistory();
  } catch (err) {
    errEl.textContent = err.message || 'Failed to save QA Checklist.';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit QA Checklist';
  }
});

// ─── History Logic ──────────────────────────────────────────────────────────
async function loadHistory() {
  const container = document.getElementById('historyList');
  try {
    const list = await apiFetch('/api/qa?limit=5');
    if (!list.length) {
      container.innerHTML = '<div class="empty-state"><p>No recent QA lists.</p></div>';
      return;
    }
    
    container.innerHTML = list.map(item => `
      <div class="history-item" style="padding: 10px; border-bottom: 1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong>${esc(item.username)}</strong>
          <br/><small style="color: var(--text-muted);">SN: ${esc(item.machine_serial || 'N/A')} | Ref: ${esc(item.call_ref || 'N/A')}</small>
          <br/><small style="color: var(--text-muted);">QAed by ${esc(item.technician_name)} on ${item.submission_date}</small>
        </div>
        <a href="/api/qa/export?id=${item.id}" target="_blank" class="btn btn-secondary btn-sm" title="Download PDF">&#128196;</a>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="alert alert-danger">Failed to load history</div>';
  }
}

// ─── Init ───────────────────────────────────────────────────────────────────
(async function init() {
  currentUser = await initNav('/qa');
  if (!currentUser) return;
  await loadHistory();
})();

'use strict';

let currentView = 'outstanding'; // 'outstanding' | 'all'

// ─── Render Loans List ────────────────────────────────────────────────────────
function renderLoans(loans) {
  const container = document.getElementById('loansList');
  if (!loans.length) {
    const msg = currentView === 'outstanding'
      ? 'No outstanding loans — all items accounted for! ✅'
      : 'No loan records found.';
    container.innerHTML = `<div class="empty-state" style="padding:1.5rem 1rem"><p>${msg}</p></div>`;
    return;
  }

  container.innerHTML = loans.map(loan => {
    const isReturned = loan.returned === 1;
    const dateStr = loan.loan_date || '';
    const returnedStr = loan.returned_at
      ? new Date(loan.returned_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
      : '';
    const badge = isReturned
      ? `<span style="background:#d1fae5;color:#065f46;border-radius:4px;padding:2px 8px;font-size:0.72rem;font-weight:600;">✅ Returned</span>`
      : `<span style="background:#fef3c7;color:#92400e;border-radius:4px;padding:2px 8px;font-size:0.72rem;font-weight:600;">⏳ Outstanding</span>`;

    const returnBtn = !isReturned
      ? `<button class="btn btn-sm btn-primary" style="min-height:unset;padding:0.3rem 0.8rem;font-size:0.78rem;" data-loan-id="${loan.id}">✅ Mark Returned</button>`
      : `<span style="font-size:0.75rem;color:var(--text-muted)">Returned ${esc(returnedStr)}</span>`;

    return `
      <div class="history-item" style="padding:12px 14px;border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
              <strong style="font-size:0.9rem;">${esc(loan.borrower_name)}</strong>
              ${badge}
            </div>
            <div style="font-size:0.85rem;color:var(--text);margin-bottom:2px;">📦 ${esc(loan.item_description)}</div>
            ${loan.notes ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:2px;">📝 ${esc(loan.notes)}</div>` : ''}
            <div style="font-size:0.75rem;color:var(--text-muted);">Logged by ${esc(loan.logged_by_name)} on ${esc(dateStr)}</div>
          </div>
          <div style="flex-shrink:0;text-align:right;">
            ${returnBtn}
          </div>
        </div>
      </div>`;
  }).join('');

  // Attach return button listeners
  container.querySelectorAll('[data-loan-id]').forEach(btn => {
    btn.addEventListener('click', () => markReturned(Number(btn.dataset.loanId)));
  });
}

// ─── Load Loans ───────────────────────────────────────────────────────────────
async function loadLoans() {
  const container = document.getElementById('loansList');
  container.innerHTML = '<div class="spinner"></div>';
  try {
    const status = currentView === 'outstanding' ? 'outstanding' : 'all';
    const loans = await apiFetch(`/api/loans?status=${status}&limit=200`);
    renderLoans(loans);
  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger" style="margin:1rem">${esc(err.message || 'Failed to load loans')}</div>`;
  }
}

// ─── Mark Returned ────────────────────────────────────────────────────────────
async function markReturned(id) {
  try {
    await apiFetch(`/api/loans/${id}/return`, { method: 'PATCH' });
    await loadLoans();
  } catch (err) {
    alert(err.message || 'Failed to mark as returned');
  }
}

// ─── Submit Loan ──────────────────────────────────────────────────────────────
document.getElementById('submitLoanBtn').addEventListener('click', async () => {
  const borrower_name    = document.getElementById('borrowerName').value.trim();
  const item_description = document.getElementById('itemDescription').value.trim();
  const notes            = document.getElementById('loanNotes').value.trim();

  const errEl     = document.getElementById('loanError');
  const successEl = document.getElementById('loanSuccess');
  errEl.classList.add('hidden');
  successEl.classList.add('hidden');

  if (!borrower_name) {
    errEl.textContent = 'Borrower name is required.';
    errEl.classList.remove('hidden');
    return;
  }
  if (!item_description) {
    errEl.textContent = 'Item description is required.';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('submitLoanBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    await apiFetch('/api/loans', {
      method: 'POST',
      body: JSON.stringify({ borrower_name, item_description, notes }),
    });

    successEl.textContent = `Loan logged for ${borrower_name} — ${item_description}.`;
    successEl.classList.remove('hidden');
    document.getElementById('loanForm').reset();

    // Switch to outstanding view and refresh
    currentView = 'outstanding';
    document.getElementById('tabOutstanding').classList.add('active');
    document.getElementById('tabAll').classList.remove('active');
    await loadLoans();
  } catch (err) {
    errEl.textContent = err.message || 'Failed to log loan.';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = '📋 Log Loan';
  }
});

// ─── Tab Switch ───────────────────────────────────────────────────────────────
document.getElementById('tabOutstanding').addEventListener('click', async () => {
  currentView = 'outstanding';
  document.getElementById('tabOutstanding').classList.add('active');
  document.getElementById('tabAll').classList.remove('active');
  await loadLoans();
});

document.getElementById('tabAll').addEventListener('click', async () => {
  currentView = 'all';
  document.getElementById('tabAll').classList.add('active');
  document.getElementById('tabOutstanding').classList.remove('active');
  await loadLoans();
});

// ─── Init ─────────────────────────────────────────────────────────────────────
(async function init() {
  const user = await initNav('/loans');
  if (!user) return;
  await loadLoans();
})();

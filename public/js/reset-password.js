'use strict';

const params = new URLSearchParams(window.location.search);
const token = params.get('token');

const forgotView = document.getElementById('forgotView');
const resetView  = document.getElementById('resetView');

// Show the correct view based on whether a token is in the URL
if (token) {
  forgotView.classList.add('hidden');
  resetView.classList.remove('hidden');
}

// ── Forgot-password form ──────────────────────────────────────────────────────
document.getElementById('forgotForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const errEl  = document.getElementById('forgotError');
  const succEl = document.getElementById('forgotSuccess');
  const btn    = document.getElementById('forgotBtn');
  const identifier = document.getElementById('identifier').value.trim();

  errEl.classList.add('hidden');
  succEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Request failed');

    // Always show the neutral message (server never reveals whether address exists)
    succEl.textContent = data.message;
    succEl.classList.remove('hidden');
    document.getElementById('forgotForm').reset();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Reset Link';
  }
});

// ── Reset-password form ───────────────────────────────────────────────────────
document.getElementById('resetForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const errEl      = document.getElementById('resetError');
  const btn        = document.getElementById('resetBtn');
  const newPassword     = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  errEl.classList.add('hidden');

  if (newPassword !== confirmPassword) {
    errEl.textContent = 'Passwords do not match.';
    errEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Reset failed');

    // Redirect to login with a success notice
    window.location.href = '/?reset=success';
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Reset Password';
  }
});

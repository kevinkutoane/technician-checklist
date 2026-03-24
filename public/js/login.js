'use strict';

const form = document.getElementById('loginForm');
const errorEl = document.getElementById('loginError');
const successEl = document.getElementById('loginSuccess');
const loginBtn = document.getElementById('loginBtn');

// Show success notice if redirected here after a password reset
if (new URLSearchParams(window.location.search).get('reset') === 'success') {
  successEl.textContent = 'Password reset successfully. You can now log in with your new password.';
  successEl.classList.remove('hidden');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.classList.add('hidden');
  loginBtn.disabled = true;
  loginBtn.textContent = 'Signing in…';

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Login failed';
      errorEl.classList.remove('hidden');
      return;
    }

    if (data.role === 'admin') {
      window.location.href = '/admin';
    } else {
      window.location.href = '/checklist';
    }
  } catch {
    errorEl.textContent = 'Network error. Please try again.';
    errorEl.classList.remove('hidden');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign In';
  }
});

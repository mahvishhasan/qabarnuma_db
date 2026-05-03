const API = 'http://localhost:3000/api';

/* ── Active nav ─────────────────────────────────────────── */
(function setActive() {
  const p = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(a => {
    const ap = a.getAttribute('href').split('/').pop();
    a.classList.toggle('active', ap === p || (p === '' && ap === 'index.html'));
  });
})();

/* ── Toast ──────────────────────────────────────────────── */
let toastTimer;
function toast(msg, type = 'success') {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 3200);
}

/* ── Modal ──────────────────────────────────────────────── */
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

/* Click outside to close */
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});

/* ── Saving state for buttons ───────────────────────────── */
function setSaving(btnEl, saving) {
  if (!btnEl) return;
  if (saving) { btnEl.classList.add('saving'); btnEl.disabled = true; }
  else { btnEl.classList.remove('saving'); btnEl.disabled = false; }
}

/* ── API helpers ─────────────────────────────────────────── */
async function apiFetch(url, opts = {}) {
  const res = await fetch(`${API}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ── Clear form fields ───────────────────────────────────── */
function clearForm(selector) {
  document.querySelectorAll(`${selector} input, ${selector} textarea`).forEach(el => {
    if (el.type === 'checkbox') el.checked = false;
    else el.value = '';
  });
  document.querySelectorAll(`${selector} select`).forEach(el => el.selectedIndex = 0);
}

/* ── Status badge ────────────────────────────────────────── */
function statusBadge(status) {
  const map = {
    'Available':   'green',
    'Active':      'green',
    'Completed':   'green',
    'Approved':    'green',
    'Occupied':    'red',
    'Rejected':    'red',
    'Full':        'red',
    'Inactive':    'red',
    'Reserved':    'blue',
    'Scheduled':   'blue',
    'Converted':   'blue',
    'Pending':     'amber',
    'In Progress': 'amber',
    'Maintenance': 'gray',
    'Cancelled':   'gray',
    'Expired':     'gray',
  };
  const cls = map[status] || 'gray';
  return `<span class="badge badge-${cls}">${status}</span>`;
}

/* ── Date formatters ─────────────────────────────────────── */
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-PK', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/* ── Occupancy fill color ────────────────────────────────── */
function occColor(pct) {
  if (pct >= 85) return 'var(--red)';
  if (pct >= 60) return 'var(--amber)';
  return 'var(--green)';
}

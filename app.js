// Vinyl Scout Phase 1 — barebones frontend
// Gallery + search + delete. No photo upload, vision, or Discogs.
// version: 2

const DISPLAY_MODES = {
  list: 'list',
  grid: 'grid',
};

let allRecords = [];
let currentDisplay = DISPLAY_MODES.grid;

// ============================================================
// Toast notifications (success only — errors use #error-banner)
// ============================================================
const toast = (msg, ms = 1800) => {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('is-visible');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('is-visible'), ms);
};

// ============================================================
// Persistent error banner (Hard Rule #4 — errors must not auto-dismiss)
// ============================================================
function showError(msg) {
  const el = document.getElementById('error-banner');
  el.textContent = msg;
  el.hidden = false;
}

function clearError() {
  const el = document.getElementById('error-banner');
  el.textContent = '';
  el.hidden = true;
}

// ============================================================
// API helpers
// ============================================================
async function api(path, opts = {}) {
  const r = await fetch(path, {
    ...opts,
    credentials: 'same-origin',
    headers: {
      ...(opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    let msg = r.statusText;
    try { msg = JSON.parse(txt).error || msg; } catch {}
    throw new Error(msg);
  }
  const ct = r.headers.get('content-type') || '';
  return ct.includes('application/json') ? r.json() : r.text();
}

// ============================================================
// Load records
// ============================================================
async function loadRecords() {
  try {
    const data = await api('/api/records');
    allRecords = Array.isArray(data) ? data : [];
    renderCards();
  } catch (err) {
    console.error('Failed to load records:', err);
    allRecords = [];
    document.getElementById('empty-state').textContent = `Error loading records: ${err.message}`;
    showError(`Failed to load records: ${err.message}`);
  }
}

// ============================================================
// Delete record (single id, gated by confirm — Hard Rule #1)
// ============================================================
async function deleteRecord(id) {
  if (!confirm('Delete this record?')) return;

  try {
    await api(`/api/records/${id}`, { method: 'DELETE' });
    allRecords = allRecords.filter(r => r.id !== id);
    renderCards();
    clearError();
    toast('Record deleted');
  } catch (err) {
    showError(`Delete failed for ${id}: ${err.message}`);
  }
}

// ============================================================
// Render cards (gallery or list)
// ============================================================
function renderCards() {
  const stack = document.getElementById('card-stack');
  const filter = document.getElementById('filter-input').value.toLowerCase();

  if (!Array.isArray(allRecords)) {
    allRecords = [];
  }

  const filtered = allRecords.filter(r => {
    const searchable = `${r.artist} ${r.title} ${r.genre || ''} ${r.notes || ''}`.toLowerCase();
    return searchable.includes(filter);
  });

  document.getElementById('filter-count').textContent = filtered.length ? `${filtered.length}` : '';

  if (!filtered.length) {
    stack.innerHTML = `
      <div class="empty">
        <p class="empty__big">${allRecords.length === 0 ? 'No records yet' : 'No matches'}</p>
        ${allRecords.length === 0 ? '<p style="color: var(--ink-soft);">Visit <code>/seed.html</code> to add records via JSON</p>' : ''}
      </div>
    `;
    return;
  }

  stack.className = `stack ${currentDisplay === DISPLAY_MODES.grid ? 'is-grid' : 'is-list'}`;
  stack.innerHTML = filtered.map((record, idx) => `
    <article class="card" data-id="${record.id}">
      <div class="card__index">
        <span class="card__num">${idx + 1}</span>
      </div>
      <div class="card__photos">
        ${record.cover_url ? `<img src="${record.cover_url}" alt="${escapeHtml(record.artist)} — ${escapeHtml(record.title)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 2px;">` : '<div style="width: 100%; height: 100%; background: var(--rule); border-radius: 2px; display: flex; align-items: center; justify-content: center; color: var(--ink-faint); font-size: 12px;">No cover</div>'}
      </div>
      <div class="card__body">
        <h3 style="margin: 0 0 0.25rem 0; font-size: 15px; line-height: 1.3;">${escapeHtml(record.artist)}</h3>
        <p style="margin: 0 0 0.5rem 0; font-size: 14px; color: var(--ink-soft); line-height: 1.3;">${escapeHtml(record.title)}</p>
        <div style="display: flex; gap: 0.5rem; font-size: 12px; color: var(--ink-faint);">
          ${record.year ? `<span>${record.year}</span>` : ''}
          ${record.genre ? `<span>${escapeHtml(record.genre)}</span>` : ''}
        </div>
        ${record.notes ? `<p style="margin: 0.5rem 0 0 0; font-size: 12px; color: var(--ink-soft);">${escapeHtml(record.notes)}</p>` : ''}
      </div>
      <div class="card__actions">
        <button class="btn btn--ghost btn--sm" onclick="deleteRecord('${record.id}')">Delete</button>
      </div>
    </article>
  `).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Expose deleteRecord for inline onclick handlers in rendered cards
window.deleteRecord = deleteRecord;

// ============================================================
// Initialize
// ============================================================
(async () => {
  await loadRecords();

  const filterInput = document.getElementById('filter-input');
  if (filterInput) {
    filterInput.addEventListener('input', renderCards);
  }

  document.querySelectorAll('.view-toggle__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-toggle__btn').forEach(b => b.classList.remove('is-on'));
      btn.classList.add('is-on');
      currentDisplay = btn.dataset.display;
      renderCards();
    });
  });
})();

// Vinyl Scout Phase 1 — barebones frontend
// Gallery + search + delete. No photo upload, vision, or Discogs.
// version: 2

const DISPLAY_MODES = {
  list: 'list',
  grid: 'grid',
};

let allRecords = [];
let currentDisplay = DISPLAY_MODES.list;

// ============================================================
// Toast notifications
// ============================================================
const toast = (msg, ms = 1800) => {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('is-visible');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('is-visible'), ms);
};

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
  }
}

// ============================================================
// Delete record
// ============================================================
async function deleteRecord(id) {
  if (!confirm('Delete this record?')) return;

  try {
    await api(`/api/records/${id}`, { method: 'DELETE' });
    allRecords = allRecords.filter(r => r.id !== id);
    renderCards();
    toast('Record deleted');
  } catch (err) {
    toast(`Delete failed: ${err.message}`);
  }
}

// ============================================================
// Render cards (gallery or list)
// ============================================================
function renderCards() {
  const stack = document.getElementById('card-stack');
  const filter = document.getElementById('filter-input').value.toLowerCase();

  // Ensure allRecords is an array
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
  
  // LIST VIEW: text-only rows
  if (currentDisplay === DISPLAY_MODES.list) {
    stack.innerHTML = `
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tbody>
          ${filtered.map((record, idx) => `
            <tr data-id="${record.id}" style="border-bottom: 1px solid var(--rule); display: flex; justify-content: space-between; align-items: center; padding: 12px 0; gap: 1rem;">
              <td style="flex: 0 0 3rem; color: var(--ink-faint); font-size: 12px; text-align: right;">${idx + 1}</td>
              <td style="flex: 1; min-width: 0;">
                <div style="font-weight: 600; color: var(--ink);">${escapeHtml(record.artist)}</div>
                <div style="color: var(--ink-soft); font-size: 13px;">${escapeHtml(record.title)}</div>
              </td>
              <td style="flex: 0 0 12rem; color: var(--ink-faint); font-size: 13px; text-align: right;">
                ${record.year ? `${record.year}` : ''}
                ${record.genre ? `<br>${escapeHtml(record.genre)}` : ''}
              </td>
              <td style="flex: 0 0 auto;">
                <button class="btn btn--ghost btn--sm" onclick="deleteRecord('${record.id}')">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    return;
  }

  // GALLERY VIEW: cards with thumbnails
  stack.innerHTML = filtered.map((record, idx) => `
    <article class="card" data-id="${record.id}">
      <div class="card__index">
        <span class="card__num">${idx + 1}</span>
      </div>
      <div class="card__photos">
        ${record.cover_url ? `<img src="${record.cover_url}" alt="${record.artist} — ${record.title}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 2px;">` : '<div style="width: 100%; height: 100%; background: var(--rule); border-radius: 2px; display: flex; align-items: center; justify-content: center; color: var(--ink-faint); font-size: 12px;">No cover</div>'}
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

// ============================================================
// Event listeners
// ============================================================
// Initialize on page load
(async () => {
  // Load records
  await loadRecords();

  // Filter input
  const filterInput = document.getElementById('filter-input');
  if (filterInput) {
    filterInput.addEventListener('input', renderCards);
  }

  // View toggle
  document.querySelectorAll('.view-toggle__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-toggle__btn').forEach(b => b.classList.remove('is-on'));
      btn.classList.add('is-on');
      currentDisplay = btn.dataset.display;
      renderCards();
    });
  });

  // Hide logout button (no auth in Phase 1)
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.style.display = 'none';

  // Hide add bar (no photo upload in Phase 1)
  const addBar = document.querySelector('.add-bar');
  if (addBar) addBar.style.display = 'none';
})();

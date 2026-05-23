// Vinyl Scout Phase 1 + Phase 3 — Discogs pricing display
// Gallery + search + delete + live Discogs prices
// version: 11

const DISPLAY_MODES = {
  list: 'list',
  grid: 'grid',
};

let allRecords = [];
let currentDisplay = DISPLAY_MODES.list;

// ============================================================
// Pricing helpers
// ============================================================
function formatPrice(n) {
  if (n === null || n === undefined) return '—';
  return `$${Number(n).toFixed(2)}`;
}

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

  // Filter out records with missing artist (invalid data)
  const validRecords = filtered.filter(r => {
    const artist = (r.artist || '').trim();
    const title = (r.title || '').trim();
    return artist || title; // Keep if either artist OR title is present
  });

  document.getElementById('filter-count').textContent = validRecords.length ? `${validRecords.length}` : '';

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

  if (!validRecords.length) {
    stack.innerHTML = `
      <div class="empty">
        <p class="empty__big">${filtered.length ? 'No valid records' : 'No records yet'}</p>
        ${filtered.length === 0 ? '<p style="color: var(--ink-soft);">Visit <code>/seed.html</code> to add records via JSON</p>' : ''}
      </div>
    `;
    return;
  }

  // LIST VIEW: rows with thumbnails
  if (currentDisplay === DISPLAY_MODES.list) {
    stack.innerHTML = `
      <div style="width: 100%; font-size: 14px;">
        ${validRecords.map((record, idx) => `
          <div data-id="${record.id}" style="border-bottom: 1px solid var(--rule); display: flex; justify-content: space-between; align-items: center; padding: 8px 0; gap: 1rem;">
            <div style="flex: 0 0 3rem; color: var(--ink-faint); font-size: 12px; text-align: right;">${idx + 1}</div>
            <div style="flex: 0 0 45px; width: 45px; height: 45px; background: var(--bg-soft); border: 1px solid var(--rule); border-radius: 2px; overflow: hidden; display: flex; align-items: center; justify-content: center;">
              ${record.cover_url ? `<img src="${record.cover_url}" alt="" style="width: 100%; height: 100%; object-fit: cover;">` : '<div style="font-size: 10px; color: var(--ink-faint); text-align: center; padding: 4px;">No art</div>'}
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 600; color: var(--ink);">${escapeHtml(record.artist)}</div>
              <div style="color: var(--ink-soft); font-size: 13px;">${escapeHtml(record.title)}</div>
            </div>
            <div style="flex: 0 0 12rem; color: var(--ink-faint); font-size: 13px; text-align: right;">
              ${record.year ? `${record.year}` : ''}
              ${record.genre ? `<br>${escapeHtml(record.genre)}` : ''}
            </div>
            <div style="flex: 0 0 auto; text-align: right; font-size: 12px; color: var(--ink-faint); white-space: nowrap;">
              ${record.price_low && record.price_high ? `
                <div style="color: var(--ink-soft); font-weight: 500; margin-bottom: 2px;">
                  ${formatPrice(record.price_low)} — ${formatPrice(record.price_high)}
                </div>
              ` : record.price_low ? `
                <div style="color: var(--ink-soft);">${formatPrice(record.price_low)}</div>
              ` : ''}
              ${record.demand_ratio ? `<div style="font-size: 11px; color: var(--ink-faint);">D: ${record.demand_ratio}</div>` : ''}
            </div>
            <div style="flex: 0 0 auto;">
              <button class="btn btn--ghost btn--sm" onclick="deleteRecord('${record.id}')">Delete</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    return;
  }

  // GALLERY VIEW: cards with thumbnails
  stack.innerHTML = validRecords.map((record, idx) => `
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
        <div style="display: flex; gap: 0.5rem; font-size: 12px; color: var(--ink-faint); margin-bottom: 0.5rem;">
          ${record.year ? `<span>${record.year}</span>` : ''}
          ${record.genre ? `<span>${escapeHtml(record.genre)}</span>` : ''}
        </div>
        ${record.price_low || record.price_high || record.demand_ratio ? `
          <div style="border-top: 1px solid var(--rule); padding-top: 0.5rem; margin-top: 0.5rem; font-size: 12px;">
            ${record.price_low && record.price_high ? `<div style="color: var(--accent); font-weight: 600; margin-bottom: 0.25rem;">${formatPrice(record.price_low)} – ${formatPrice(record.price_high)}</div>` : ''}
            ${record.price_low && !record.price_high ? `<div style="color: var(--accent); font-weight: 600; margin-bottom: 0.25rem;">Floor: ${formatPrice(record.price_low)}</div>` : ''}
            ${record.demand_ratio ? `<div style="color: var(--ink-faint); font-size: 11px;">Demand: ${record.demand_ratio}</div>` : ''}
            ${record.num_for_sale ? `<div style="color: var(--ink-faint); font-size: 11px;">${record.num_for_sale} for sale</div>` : ''}
          </div>
        ` : ''}
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

  // INITIAL RENDER
  renderCards();
})();

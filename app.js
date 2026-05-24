// Vinyl Scout Phase 1 — barebones frontend
// Gallery + search + delete. No photo upload, vision, or Discogs.
// version: 3 — DELETE fixed via event delegation; no window-scope dependency

const DISPLAY_MODES = { list: 'list', grid: 'grid' };

let allRecords = [];
let currentDisplay = DISPLAY_MODES.list;

function toast(msg, ms = 1800) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('is-on');
  setTimeout(() => el.classList.remove('is-on'), ms);
}

function showError(msg) {
  const el = document.getElementById('error-banner');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

function clearError() {
  const el = document.getElementById('error-banner');
  if (!el) return;
  el.textContent = '';
  el.hidden = true;
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type':
cat > /Users/snesbitt/Downloads/vinyl-scout-deploy/app.js << 'APPJS_EOF'
// Vinyl Scout Phase 1 — barebones frontend
// Gallery + search + delete. No photo upload, vision, or Discogs.
// version: 3 — DELETE fixed via event delegation; no window-scope dependency

const DISPLAY_MODES = { list: 'list', grid: 'grid' };

let allRecords = [];
let currentDisplay = DISPLAY_MODES.list;

function toast(msg, ms = 1800) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('is-on');
  setTimeout(() => el.classList.remove('is-on'), ms);
}

function showError(msg) {
  const el = document.getElementById('error-banner');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

function clearError() {
  const el = document.getElementById('error-banner');
  if (!el) return;
  el.textContent = '';
  el.hidden = true;
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch {}
    throw new Error(`HTTP ${res.status}${detail ? ' — ' + detail : ''}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function loadRecords() {
  try {
    const data = await api('/api/records');
    allRecords = Array.isArray(data) ? data : [];
    clearError();
    renderCards();
  } catch (err) {
    console.error('Failed to load records:', err);
    allRecords = [];
    document.getElementById('empty-state').textContent =
      `Error loading records: ${err.message}`;
    showError(`Failed to load records: ${err.message}`);
  }
}

async function deleteRecord(id) {
  if (!id) {
    showError('Delete aborted: no id on this card.');
    return;
  }
  if (!confirm(`Delete this record?\n\n${id}`)) return;

  try {
    await api(`/api/records/${encodeURIComponent(id)}`, { method: 'DELETE' });
    allRecords = allRecords.filter(r => r.id !== id);
    renderCards();
    clearError();
    toast('Record deleted');
  } catch (err) {
    console.error('Delete failed:', err);
    showError(`Delete failed for ${id}: ${err.message}`);
  }
}

function escapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function renderCards() {
  const stack = document.getElementById('card-stack');
  const filterEl = document.getElementById('filter-input');
  const countEl = document.getElementById('filter-count');
  const filter = (filterEl?.value || '').toLowerCase().trim();

  if (!Array.isArray(allRecords)) allRecords = [];

  stack.classList.toggle('is-grid', currentDisplay === DISPLAY_MODES.grid);

  const visible = allRecords.filter(r => {
    if (!filter) return true;
    const hay = [r.artist, r.title, r.genre, r.year].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(filter);
  });

  if (countEl) countEl.textContent = String(visible.length);

  if (visible.length === 0) {
    stack.innerHTML = `
      <div class="empty" id="empty-state">
        <p class="empty__big">${allRecords.length === 0 ? 'No records yet.' : 'No matches.'}</p>
        ${allRecords.length === 0
          ? '<p>Add some via <a href="/seed.html">/seed.html</a>.</p>'
          : ''}
      </div>`;
    return;
  }

  const placeholderStyle = 'width:100%;height:100%;background:var(--rule);border-radius:2px;display:flex;align-items:center;justify-content:center;color:var(--ink-faint);font-size:12px;';
  const imgStyle = 'width:100%;height:100%;object-fit:cover;border-radius:2px;';

  stack.innerHTML = visible.map((record, idx) => {
    const id = escapeHtml(record.id);
    const artist = escapeHtml(record.artist);
    const title = escapeHtml(record.title);
    const meta = [record.year, record.genre].filter(Boolean).map(escapeHtml).join('  ');

    const coverHtml = record.cover_url
      ? `<img src="${escapeHtml(record.cover_url)}" alt="${artist} — ${title}" loading="lazy" style="${imgStyle}">`
      : `<div style="${placeholderStyle}">No cover</div>`;

    return `
      <article class="card" data-record-id="${id}">
        <div class="card__index"><span class="card__num">${idx + 1}</span></div>
        <div class="card__photos">${coverHtml}</div>
        <div class="card__body">
          <h3 style="margin:0 0 0.25rem 0;font-size:15px;line-height:1.3;">${artist}</h3>
          <p style="margin:0 0 0.5rem 0;color:var(--ink-soft);">${title}</p>
          ${meta ? `<p style="margin:0;font-size:12px;color:var(--ink-faint);">${meta}</p>` : ''}
        </div>
        <div class="card__actions">
          <button type="button" class="btn btn--ghost btn--sm js-delete" data-id="${id}">Delete</button>
        </div>
      </article>`;
  }).join('');
}

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
      const mode = btn.dataset.display;
      currentDisplay = mode === 'grid' ? DISPLAY_MODES.grid : DISPLAY_MODES.list;
      renderCards();
    });
  });

  const stack = document.getElementById('card-stack');
  if (stack) {
    stack.addEventListener('click', (e) => {
      const btn = e.target.closest('.js-delete');
      if (!btn) return;
      e.preventDefault();
      const id = btn.dataset.id;
      deleteRecord(id);
    });
  }
})();

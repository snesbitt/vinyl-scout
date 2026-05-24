// Vinyl Scout Phase 1 — barebones frontend
// version: 4

let allRecords = [];
let currentDisplay = 'list';

function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('is-on');
  setTimeout(function() { el.classList.remove('is-on'); }, 1800);
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

async function api(path, opts) {
  opts = opts || {};
  opts.headers = { 'Content-Type': 'application/json' };
  const res = await fetch(path, opts);
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch (e) {}
    throw new Error('HTTP ' + res.status + (detail ? ' — ' + detail : ''));
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
    const empty = document.getElementById('empty-state');
    if (empty) empty.textContent = 'Error loading records: ' + err.message;
    showError('Failed to load records: ' + err.message);
  }
}

async function deleteRecord(id) {
  if (!id) { showError('Delete aborted: no id on this card.'); return; }
  if (!confirm('Delete this record?\n\n' + id)) return;
  try {
    await api('/api/records/' + encodeURIComponent(id), { method: 'DELETE' });
    allRecords = allRecords.filter(function(r) { return r.id !== id; });
    renderCards();
    clearError();
    toast('Record deleted');
  } catch (err) {
    console.error('Delete failed:', err);
    showError('Delete failed for ' + id + ': ' + err.message);
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
  const filter = (filterEl && filterEl.value ? filterEl.value : '').toLowerCase().trim();

  if (!Array.isArray(allRecords)) allRecords = [];
  stack.classList.toggle('is-grid', currentDisplay === 'grid');

  const visible = allRecords.filter(function(r) {
    if (!filter) return true;
    const hay = [r.artist, r.title, r.genre, r.year].filter(Boolean).join(' ').toLowerCase();
    return hay.indexOf(filter) !== -1;
  });

  if (countEl) countEl.textContent = String(visible.length);

  if (visible.length === 0) {
    const msg = allRecords.length === 0 ? 'No records yet.' : 'No matches.';
    const sub = allRecords.length === 0 ? '<p>Add some via <a href="/seed.html">/seed.html</a>.</p>' : '';
    stack.innerHTML = '<div class="empty" id="empty-state"><p class="empty__big">' + msg + '</p>' + sub + '</div>';
    return;
  }

  // Group by genre. Genres sorted alphabetically; "Uncategorized" last.
  // Within each genre: sort by artist, then title.
  const groups = {};
  for (let i = 0; i < visible.length; i++) {
    const r = visible[i];
    const g = (r.genre && String(r.genre).trim()) || 'Uncategorized';
    if (!groups[g]) groups[g] = [];
    groups[g].push(r);
  }
  const genreNames = Object.keys(groups).sort(function(a, b) {
    if (a === 'Uncategorized' && b !== 'Uncategorized') return 1;
    if (b === 'Uncategorized' && a !== 'Uncategorized') return -1;
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });
  for (let g = 0; g < genreNames.length; g++) {
    groups[genreNames[g]].sort(function(x, y) {
      const ax = (x.artist || '').toLowerCase();
      const ay = (y.artist || '').toLowerCase();
      if (ax !== ay) return ax.localeCompare(ay);
      return (x.title || '').toLowerCase().localeCompare((y.title || '').toLowerCase());
    });
  }

  const ph = 'width:100%;height:100%;background:var(--rule);border-radius:2px;display:flex;align-items:center;justify-content:center;color:var(--ink-faint);font-size:12px;';
  const imgSt = 'width:100%;height:100%;object-fit:cover;border-radius:2px;';

  let html = '';
  let cardNum = 0;
  for (let g = 0; g < genreNames.length; g++) {
    const genreName = genreNames[g];
    const list = groups[genreName];
    html += '<h2 class="genre-heading">';
    html += '<span class="genre-heading__name">' + escapeHtml(genreName) + '</span>';
    html += '<span class="genre-heading__count">' + list.length + '</span>';
    html += '</h2>';
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      cardNum++;
      const id = escapeHtml(r.id);
      const artist = escapeHtml(r.artist);
      const title = escapeHtml(r.title);
      const metaParts = [];
      if (r.year) metaParts.push(escapeHtml(r.year));
      const meta = metaParts.join('  ');
      const cover = r.cover_url
        ? '<img src="' + escapeHtml(r.cover_url) + '" alt="' + artist + ' — ' + title + '" loading="lazy" style="' + imgSt + '">'
        : '<div style="' + ph + '">No cover</div>';
      html += '<article class="card" data-record-id="' + id + '">';
      html += '<div class="card__index"><span class="card__num">' + cardNum + '</span></div>';
      html += '<div class="card__photos">' + cover + '</div>';
      html += '<div class="card__body">';
      html += '<h3 style="margin:0 0 0.25rem 0;font-size:15px;line-height:1.3;">' + artist + '</h3>';
      html += '<p style="margin:0 0 0.5rem 0;color:var(--ink-soft);">' + title + '</p>';
      if (meta) html += '<p style="margin:0;font-size:12px;color:var(--ink-faint);">' + meta + '</p>';
      html += '</div>';
      html += '<div class="card__actions">';
      html += '<button type="button" class="btn btn--ghost btn--sm js-delete" data-id="' + id + '">Delete</button>';
      html += '</div>';
      html += '</article>';
    }
  }
  stack.innerHTML = html;
}

(async function() {
  await loadRecords();
  const filterInput = document.getElementById('filter-input');
  if (filterInput) filterInput.addEventListener('input', renderCards);
  const toggleBtns = document.querySelectorAll('.view-toggle__btn');
  toggleBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      toggleBtns.forEach(function(b) { b.classList.remove('is-on'); });
      btn.classList.add('is-on');
      currentDisplay = btn.dataset.display === 'grid' ? 'grid' : 'list';
      renderCards();
    });
  });
  const stack = document.getElementById('card-stack');
  if (stack) {
    stack.addEventListener('click', function(e) {
      const btn = e.target.closest('.js-delete');
      if (!btn) return;
      e.preventDefault();
      deleteRecord(btn.dataset.id);
    });
  }
})();

// Vinyl Scout Phase 1 — barebones frontend
// version: 5
// v5: tighter UI — flat alpha sort, no genre headers, no card chrome,
//     no delete button (use /audit.html for destructive ops).

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

  // Flat alphabetical: artist, then title.
  visible.sort(function(a, b) {
    const ax = (a.artist || '').toLowerCase();
    const bx = (b.artist || '').toLowerCase();
    if (ax !== bx) return ax.localeCompare(bx);
    return (a.title || '').toLowerCase().localeCompare((b.title || '').toLowerCase());
  });

  let html = '';
  for (let i = 0; i < visible.length; i++) {
    const r = visible[i];
    const id = escapeHtml(r.id);
    const artist = escapeHtml(r.artist);
    const title = escapeHtml(r.title);
    const year = r.year ? escapeHtml(r.year) : '';
    const genre = r.genre ? escapeHtml(r.genre) : '';

    const cover = r.cover_url
      ? '<img src="' + escapeHtml(r.cover_url) + '" alt="" loading="lazy">'
      : '<div class="row__nocover">no cover</div>';

    html += '<article class="row" data-record-id="' + id + '">';
    html +=   '<div class="row__cover">' + cover + '</div>';
    html +=   '<div class="row__name">';
    html +=     '<span class="row__artist">' + artist + '</span>';
    html +=     '<span class="row__title">' + title + '</span>';
    html +=   '</div>';
    html +=   '<div class="row__year">' + year + '</div>';
    html +=   '<div class="row__genre">' + genre + '</div>';
    html += '</article>';
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
})();

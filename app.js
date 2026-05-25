// Vinyl Scout — app.js
// version: 10
// Editorial. List = text only. Gallery = thumb grid. Genre chips.
// Click any record (list row or gallery tile) -> opens a detail modal for that album.
// ESC / × / backdrop / browser-back all close. URL hash (#rec_<id>) deep-links.
// No destructive ops on this page — those live on /audit.html.

(function () {
  'use strict';

  var allRecords = [];
  var currentView = 'list';
  var currentGenre = null;
  var currentSearch = '';
  var detailReturnFocus = null;   // element to return focus to on close
  var detailOpen = false;
  var suppressHashHandler = false; // avoid loops when we set hash ourselves

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }
  function escapeAttr(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function showError(msg) {
    var el = $('error-banner');
    el.textContent = msg;
    el.hidden = false;
  }
  function clearError() {
    var el = $('error-banner');
    el.textContent = '';
    el.hidden = true;
  }

  function normalizeGenre(g) {
    if (!g) return '';
    return String(g).toLowerCase().trim();
  }
  function genreLabel(g) {
    if (!g) return '—';
    return g.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  async function load() {
    try {
      var res = await fetch('/api/records?bust=' + Date.now());
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      allRecords = Array.isArray(data) ? data : [];
      clearError();
      renderChips();
      render();
      // If the page loaded with #rec_xxx, open that detail now that data is in.
      maybeOpenFromHash();
    } catch (err) {
      showError('Failed to load: ' + err.message);
      $('main').innerHTML = '<div class="empty">Failed to load. Check banner above.</div>';
    }
  }

  function filtered() {
    var q = currentSearch.toLowerCase().trim();
    var out = allRecords.filter(function (r) {
      if (currentGenre !== null && normalizeGenre(r.genre) !== currentGenre) return false;
      if (q) {
        var hay = [r.artist, r.title, r.genre, r.year]
          .filter(Boolean).join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    out.sort(function (a, b) {
      var ax = (a.artist || '').toLowerCase();
      var bx = (b.artist || '').toLowerCase();
      if (ax !== bx) return ax.localeCompare(bx);
      return (a.title || '').toLowerCase().localeCompare((b.title || '').toLowerCase());
    });
    return out;
  }

  function renderChips() {
    var counts = new Map();
    for (var i = 0; i < allRecords.length; i++) {
      var g = normalizeGenre(allRecords[i].genre);
      if (!g) continue;
      counts.set(g, (counts.get(g) || 0) + 1);
    }
    var entries = Array.from(counts.entries()).sort(function (a, b) {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });

    var html = ''
      + '<button type="button" class="chip' + (currentGenre === null ? ' is-on' : '') + '" '
      +   'data-g="" aria-pressed="' + (currentGenre === null ? 'true' : 'false') + '">'
      +   'All <span class="chip__n">' + allRecords.length + '</span>'
      + '</button>';
    for (var j = 0; j < entries.length; j++) {
      var key = entries[j][0];
      var n = entries[j][1];
      var on = currentGenre === key;
      html += ''
        + '<button type="button" class="chip' + (on ? ' is-on' : '') + '" '
        +   'data-g="' + escapeAttr(key) + '" '
        +   'aria-pressed="' + (on ? 'true' : 'false') + '">'
        +   escapeHtml(genreLabel(key))
        +   ' <span class="chip__n">' + n + '</span>'
        + '</button>';
    }
    $('chips').innerHTML = html;
  }

  function render() {
    document.body.dataset.view = currentView;

    var records = filtered();
    var total = allRecords.length;
    $('count').textContent = (records.length === total)
      ? total + (total === 1 ? ' record' : ' records')
      : records.length + ' of ' + total;

    var main = $('main');
    if (records.length === 0) {
      main.className = currentView;
      main.innerHTML = '<div class="empty">No matches.</div>';
      return;
    }

    if (currentView === 'list') {
      main.className = 'list';
      main.innerHTML = records.map(function (r) {
        var label = (r.artist || 'Unknown') + ' — ' + (r.title || 'Untitled');
        return ''
          + '<button type="button" class="row" '
          +   'data-id="' + escapeAttr(r.id) + '" '
          +   'aria-label="' + escapeAttr(label) + '. Open details.">'
          +   '<span class="row__artist">' + escapeHtml(r.artist || '—') + '</span>'
          +   '<span class="row__title">'  + escapeHtml(r.title  || '—') + '</span>'
          +   '<span class="row__year">'   + (r.year != null ? r.year : '') + '</span>'
          +   '<span class="row__genre">'  + escapeHtml(r.genre || '') + '</span>'
          + '</button>';
      }).join('');
    } else {
      main.className = 'gallery';
      main.innerHTML = records.map(function (r) {
        var initial = (r.artist || '?').trim().charAt(0).toUpperCase() || '?';
        var cover = r.cover_url
          ? '<img src="' + escapeAttr(r.cover_url) + '" alt="" loading="lazy">'
          : '<div class="tile__nocover" aria-hidden="true">' + escapeHtml(initial) + '</div>';
        var metaParts = [];
        if (r.year != null) metaParts.push(r.year);
        if (r.genre) metaParts.push(r.genre);
        var meta = metaParts.length
          ? '<div class="tile__meta">' + escapeHtml(metaParts.join(' · ')) + '</div>'
          : '';
        var label = (r.artist || 'Unknown') + ' — ' + (r.title || 'Untitled');
        return ''
          + '<button type="button" class="tile" '
          +   'data-id="' + escapeAttr(r.id) + '" '
          +   'aria-label="' + escapeAttr(label) + '. Open details.">'
          +   '<span class="tile__cover">' + cover + '</span>'
          +   '<span class="tile__text">'
          +     '<span class="tile__artist">' + escapeHtml(r.artist || '—') + '</span>'
          +     '<span class="tile__title">'  + escapeHtml(r.title  || '—') + '</span>'
          +     meta
          +   '</span>'
          + '</button>';
      }).join('');
    }
  }

  function setView(v) {
    if (v !== 'list' && v !== 'gallery') return;
    currentView = v;
    var listBtn = $('view-list');
    var galBtn = $('view-gallery');
    listBtn.classList.toggle('is-on', v === 'list');
    galBtn.classList.toggle('is-on',  v === 'gallery');
    listBtn.setAttribute('aria-pressed', v === 'list' ? 'true' : 'false');
    galBtn.setAttribute('aria-pressed',  v === 'gallery' ? 'true' : 'false');
    render();
  }

  // --- Detail modal ---

  function openDetail(id, triggerEl) {
    var r = allRecords.find(function (x) { return x.id === id; });
    if (!r) return;

    var inner = $('detail-inner');
    var initial = (r.artist || '?').trim().charAt(0).toUpperCase() || '?';
    var cover = r.cover_url
      ? '<img class="detail__img" src="' + escapeAttr(r.cover_url) + '" alt="">'
      : '<div class="detail__nocover" aria-hidden="true">' + escapeHtml(initial) + '</div>';

    var metaParts = [];
    if (r.year != null) metaParts.push(escapeHtml(r.year));
    if (r.genre) metaParts.push(escapeHtml(r.genre));
    var meta = metaParts.length
      ? '<p class="detail__meta">' + metaParts.join(' &middot; ') + '</p>'
      : '';

    var notes = (r.notes && String(r.notes).trim())
      ? '<p class="detail__notes">' + escapeHtml(r.notes) + '</p>'
      : '';

    inner.innerHTML = ''
      + '<div class="detail__cover">' + cover + '</div>'
      + '<div class="detail__info">'
      +   '<p class="detail__artist">' + escapeHtml(r.artist || 'Unknown') + '</p>'
      +   '<h2 class="detail__title" id="detail-title">' + escapeHtml(r.title || 'Untitled') + '</h2>'
      +   meta
      +   notes
      + '</div>';

    detailReturnFocus = triggerEl || document.activeElement;

    var modal = $('detail');
    modal.hidden = false;
    document.body.classList.add('has-detail');
    detailOpen = true;

    // Defer focus until after paint so screen readers pick up the dialog correctly
    requestAnimationFrame(function () {
      try { $('detail-close').focus({ preventScroll: true }); }
      catch (e) { $('detail-close').focus(); }
    });

    // Update URL hash (deep-linkable). Use replaceState so we don't create
    // a new history entry per click but DO update the URL.
    if (location.hash !== '#' + id) {
      suppressHashHandler = true;
      try { history.replaceState(null, '', '#' + id); } catch (e) {}
      setTimeout(function () { suppressHashHandler = false; }, 0);
    }
  }

  function closeDetail() {
    if (!detailOpen) return;
    var modal = $('detail');
    modal.hidden = true;
    document.body.classList.remove('has-detail');
    detailOpen = false;

    if (detailReturnFocus && document.body.contains(detailReturnFocus)) {
      try { detailReturnFocus.focus({ preventScroll: true }); }
      catch (e) { try { detailReturnFocus.focus(); } catch (e2) {} }
    }
    detailReturnFocus = null;

    if (location.hash) {
      suppressHashHandler = true;
      try {
        history.replaceState(null, '',
          location.pathname + location.search);
      } catch (e) {}
      setTimeout(function () { suppressHashHandler = false; }, 0);
    }
  }

  function maybeOpenFromHash() {
    var raw = location.hash.replace(/^#/, '');
    if (!raw) return;
    if (!allRecords.length) return;
    var r = allRecords.find(function (x) { return x.id === raw; });
    if (r) openDetail(r.id, null);
  }

  // --- Wiring ---

  document.addEventListener('DOMContentLoaded', function () {
    $('search').addEventListener('input', function (e) {
      currentSearch = e.target.value;
      render();
    });

    $('chips').addEventListener('click', function (e) {
      var chip = e.target.closest && e.target.closest('.chip');
      if (!chip) return;
      var g = chip.dataset.g || '';
      currentGenre = g === '' ? null : g;
      renderChips();
      render();
    });

    $('view-list').addEventListener('click',    function () { setView('list'); });
    $('view-gallery').addEventListener('click', function () { setView('gallery'); });

    // Open detail when any row or tile is clicked (delegated).
    $('main').addEventListener('click', function (e) {
      var trigger = e.target.closest && e.target.closest('.row, .tile');
      if (!trigger) return;
      var id = trigger.dataset.id;
      if (id) openDetail(id, trigger);
    });

    // Close handlers
    $('detail-close').addEventListener('click', closeDetail);
    $('detail').addEventListener('click', function (e) {
      // Backdrop click (anywhere outside the panel that has data-close="1")
      if (e.target && e.target.getAttribute && e.target.getAttribute('data-close') === '1') {
        closeDetail();
      }
    });

    // ESC closes modal
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && detailOpen) {
        e.preventDefault();
        closeDetail();
      }
    });

    // Back/forward + manual hash changes
    window.addEventListener('hashchange', function () {
      if (suppressHashHandler) return;
      if (!location.hash) {
        if (detailOpen) closeDetail();
      } else {
        maybeOpenFromHash();
      }
    });

    load();
  });
})();

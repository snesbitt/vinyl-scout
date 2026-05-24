// Vinyl Scout — app.js
// version: 7
// Editorial. List = text only. Gallery = thumb grid. Genre chips.
// New: row/tile are <button>s; clicking cross-navigates between views with scroll+flash.
// No destructive ops on this page — those live on /audit.html.

(function () {
  'use strict';

  var allRecords = [];
  var currentView = 'list';
  var currentGenre = null;
  var currentSearch = '';

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
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
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
    var label;
    if (records.length === total) {
      label = total + (total === 1 ? ' record' : ' records');
    } else {
      label = records.length + ' of ' + total;
    }
    $('count').textContent = label;

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
          +   'aria-label="' + escapeAttr(label) + '. Show in gallery.">'
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
          +   'aria-label="' + escapeAttr(label) + '. Show in list.">'
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

  // Cross-view: click row → gallery@id, click tile → list@id. Scroll + flash + focus.
  function crossNav(id, toView) {
    if (!id) return;
    setView(toView);
    // After render, find the corresponding element and scroll/flash.
    requestAnimationFrame(function () {
      var sel = (toView === 'gallery' ? '.tile' : '.row') + '[data-id="' + cssEscape(id) + '"]';
      var target = $('main').querySelector(sel);
      if (!target) return;
      try {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (e) {
        target.scrollIntoView();
      }
      target.classList.add('is-flash');
      // Move keyboard focus to the new element without re-scrolling.
      try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
      setTimeout(function () { target.classList.remove('is-flash'); }, 1400);
    });
  }

  function cssEscape(s) {
    // Record IDs are rec_<hex> so simple, but escape just in case.
    if (window.CSS && window.CSS.escape) return window.CSS.escape(s);
    return String(s).replace(/["\\]/g, '\\$&');
  }

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

    // Delegated cross-view click on main
    $('main').addEventListener('click', function (e) {
      var row = e.target.closest && e.target.closest('.row');
      if (row) { crossNav(row.dataset.id, 'gallery'); return; }
      var tile = e.target.closest && e.target.closest('.tile');
      if (tile) { crossNav(tile.dataset.id, 'list'); return; }
    });

    load();
  });
})();

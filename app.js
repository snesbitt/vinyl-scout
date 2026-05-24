// Vinyl Scout — app.js
// version: 6
// Editorial redesign. List = text only. Gallery = thumb grid. Genre chips for browsing.
// No destructive ops on this page — those live on /audit.html.

(function () {
  'use strict';

  var allRecords = [];
  var currentView = 'list';    // 'list' | 'gallery'
  var currentGenre = null;     // null = all
  var currentSearch = '';

  // --- DOM helpers ---

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
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

  // --- Data ---

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

  // --- Filter + sort ---

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

  // --- Chips ---

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
      + '<button type="button" class="chip' + (currentGenre === null ? ' is-on' : '') + '" data-g="">'
      +   'All <span class="chip__n">' + allRecords.length + '</span>'
      + '</button>';

    for (var j = 0; j < entries.length; j++) {
      var key = entries[j][0];
      var n = entries[j][1];
      var on = currentGenre === key;
      html += ''
        + '<button type="button" class="chip' + (on ? ' is-on' : '') + '" data-g="' + escapeHtml(key) + '">'
        +   escapeHtml(genreLabel(key))
        +   ' <span class="chip__n">' + n + '</span>'
        + '</button>';
    }

    $('chips').innerHTML = html;
  }

  // --- Render ---

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
        return ''
          + '<div class="row">'
          +   '<div class="row__artist">' + escapeHtml(r.artist || '—') + '</div>'
          +   '<div class="row__title">'  + escapeHtml(r.title  || '—') + '</div>'
          +   '<div class="row__year">'   + (r.year != null ? r.year : '') + '</div>'
          +   '<div class="row__genre">'  + escapeHtml(r.genre || '') + '</div>'
          + '</div>';
      }).join('');
    } else {
      main.className = 'gallery';
      main.innerHTML = records.map(function (r) {
        var initial = (r.artist || '?').trim().charAt(0).toUpperCase();
        var cover = r.cover_url
          ? '<img src="' + escapeHtml(r.cover_url) + '" alt="" loading="lazy">'
          : '<div class="tile__nocover">' + escapeHtml(initial) + '</div>';
        var metaParts = [];
        if (r.year != null) metaParts.push(r.year);
        if (r.genre) metaParts.push(r.genre);
        var meta = metaParts.length
          ? '<div class="tile__meta">' + escapeHtml(metaParts.join(' · ')) + '</div>'
          : '';
        return ''
          + '<div class="tile">'
          +   '<div class="tile__cover">' + cover + '</div>'
          +   '<div class="tile__text">'
          +     '<div class="tile__artist">' + escapeHtml(r.artist || '—') + '</div>'
          +     '<div class="tile__title">'  + escapeHtml(r.title  || '—') + '</div>'
          +     meta
          +   '</div>'
          + '</div>';
      }).join('');
    }
  }

  // --- Wiring ---

  function setView(v) {
    currentView = v;
    var listBtn = $('view-list');
    var galBtn = $('view-gallery');
    listBtn.classList.toggle('is-on', v === 'list');
    galBtn.classList.toggle('is-on',  v === 'gallery');
    listBtn.setAttribute('aria-pressed', v === 'list' ? 'true' : 'false');
    galBtn.setAttribute('aria-pressed',  v === 'gallery' ? 'true' : 'false');
    render();
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

    load();
  });
})();

// Vinyl Scout — app.js
// version: 13
// v13: Goldmine grades are spelled out in the detail modal ("Very Good"
// instead of a "VG" pill + Legend link). Storage value stays the short code.

(function () {
  'use strict';

  var allRecords = [];
  var currentView = 'gallery';   // v11: default to gallery
  var currentGenre = null;
  var currentSearch = '';
  var detailReturnFocus = null;
  var detailOpen = false;
  var suppressHashHandler = false;

  // Goldmine grades — see /about.html for full legend.
  var GRADES = ['M', 'NM', 'VG+', 'VG', 'G+', 'G', 'F', 'P'];
  var CONDITION_NAMES = {
    'M':   'Mint',
    'NM':  'Near Mint',
    'VG+': 'Very Good Plus',
    'VG':  'Very Good',
    'G+':  'Good Plus',
    'G':   'Good',
    'F':   'Fair',
    'P':   'Poor'
  };
  function normalizeCondition(c) {
    if (!c) return 'VG';
    var s = String(c).trim().toUpperCase();
    return GRADES.indexOf(s) !== -1 ? s : 'VG';
  }
  function conditionLabel(code) {
    return CONDITION_NAMES[code] || code;
  }

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

  function formatPrice(amount, currency) {
    if (amount == null || isNaN(amount)) return null;
    var cur = currency || 'USD';
    var symbol = cur === 'EUR' ? '€' : '$';
    var n = Number(amount);
    return symbol + n.toFixed(2);
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

  function buildPricingBlock(r) {
    var lo  = formatPrice(r.price_low,        r.price_currency);
    var hi  = formatPrice(r.price_high,       r.price_currency);
    var ls  = formatPrice(r.price_last_sold,  r.price_currency);
    var cnt = (r.copies_available != null && !isNaN(r.copies_available))
              ? Number(r.copies_available) : null;
    var updated = r.price_updated_at ? new Date(r.price_updated_at) : null;

    var hasAny = (lo != null || hi != null || ls != null || cnt != null);

    var dataHtml;
    if (hasAny) {
      var rangeStr = (lo || hi)
        ? escapeHtml((lo || '—') + ' – ' + (hi || '—'))
        : '—';
      dataHtml = ''
        + '<dl class="detail__prices">'
        +   '<dt>Range</dt><dd>' + rangeStr + '</dd>'
        +   (cnt != null ? '<dt>Copies for sale</dt><dd>' + cnt + '</dd>' : '')
        + '</dl>'
        + (updated && !isNaN(updated.getTime())
            ? '<p class="detail__prices-stamp">Updated ' + escapeHtml(updated.toISOString().slice(0, 10)) + '</p>'
            : '');
    } else {
      dataHtml = '<p class="detail__prices-empty">No market data yet.</p>';
    }

    return ''
      + '<section class="detail__pricing" aria-label="Pricing">'
      +   '<div class="detail__pricing-head">'
      +     '<h3 class="detail__h3">Market</h3>'
      +     '<button type="button" class="detail__pricing-refresh js-pricing-refresh" data-id="' + escapeAttr(r.id) + '">'
      +       (hasAny ? 'Refresh from Discogs' : 'Fetch from Discogs')
      +     '</button>'
      +   '</div>'
      +   '<div class="detail__pricing-body" id="detail-pricing-body">' + dataHtml + '</div>'
      + '</section>';
  }

  async function refreshPricing(id, btn) {
    var body = document.getElementById('detail-pricing-body');
    var origBtnText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Fetching…';
    if (body) {
      body.innerHTML = '<p class="detail__prices-empty">Looking up on Discogs… (a few seconds)</p>';
    }

    try {
      var res = await fetch('/api/discogs-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: id })
      });
      var payload;
      try { payload = await res.json(); }
      catch (_) { payload = { error: 'HTTP ' + res.status }; }

      if (!res.ok) {
        var msg = (payload && payload.error) || ('HTTP ' + res.status);
        if (body) {
          body.innerHTML = '<p class="detail__prices-error">' + escapeHtml(msg) + '</p>';
        }
        btn.disabled = false;
        btn.textContent = 'Retry';
        return;
      }

      // Update the in-memory record and re-render the modal so the new
      // values appear immediately. Closes + reopens to refresh the DOM
      // cleanly without bespoke patching logic.
      var updated = payload.record;
      if (updated && updated.id) {
        var idx = allRecords.findIndex(function (x) { return x.id === updated.id; });
        if (idx >= 0) allRecords[idx] = updated;
      }
      var match = payload.discogs_match;
      closeDetail();
      openDetail(id, null);
      if (match) {
        // Faint hint of which release we matched, in the just-rebuilt body.
        var freshBody = document.getElementById('detail-pricing-body');
        if (freshBody) {
          var hint = document.createElement('p');
          hint.className = 'detail__prices-match';
          hint.textContent = 'Matched: ' + match;
          freshBody.appendChild(hint);
        }
      }
    } catch (err) {
      if (body) {
        body.innerHTML = '<p class="detail__prices-error">Network error: ' + escapeHtml(err.message) + '</p>';
      }
      btn.disabled = false;
      btn.textContent = origBtnText;
    }
  }

  function openDetail(id, triggerEl) {
    var r = allRecords.find(function (x) { return x.id === id; });
    if (!r) return;

    var inner = $('detail-inner');
    var initial = (r.artist || '?').trim().charAt(0).toUpperCase() || '?';
    var cover = r.cover_url
      ? '<img class="detail__img" src="' + escapeAttr(r.cover_url) + '" alt="">'
      : '<div class="detail__nocover" aria-hidden="true">' + escapeHtml(initial) + '</div>';

    var condition = normalizeCondition(r.condition);
    var conditionText = conditionLabel(condition);

    // Combined meta line: "Very Good · 1976 · Reggae / Roots"
    var metaParts = [escapeHtml(conditionText)];
    if (r.year != null) metaParts.push(escapeHtml(r.year));
    if (r.genre) metaParts.push(escapeHtml(r.genre));
    var meta = '<p class="detail__meta">' + metaParts.join(' &middot; ') + '</p>';

    var notes = (r.notes && String(r.notes).trim())
      ? '<p class="detail__notes">' + escapeHtml(r.notes) + '</p>'
      : '';

    var pricing = buildPricingBlock(r);

    inner.innerHTML = ''
      + '<div class="detail__cover">' + cover + '</div>'
      + '<div class="detail__info">'
      +   '<p class="detail__artist">' + escapeHtml(r.artist || 'Unknown') + '</p>'
      +   '<h2 class="detail__title" id="detail-title">' + escapeHtml(r.title || 'Untitled') + '</h2>'
      +   meta
      +   pricing
      +   notes
      + '</div>';

    detailReturnFocus = triggerEl || document.activeElement;

    var modal = $('detail');
    modal.hidden = false;
    document.body.classList.add('has-detail');
    detailOpen = true;

    requestAnimationFrame(function () {
      try { $('detail-close').focus({ preventScroll: true }); }
      catch (e) { $('detail-close').focus(); }
    });

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

    $('main').addEventListener('click', function (e) {
      var trigger = e.target.closest && e.target.closest('.row, .tile');
      if (!trigger) return;
      var id = trigger.dataset.id;
      if (id) openDetail(id, trigger);
    });

    $('detail-close').addEventListener('click', closeDetail);
    $('detail').addEventListener('click', function (e) {
      var refreshBtn = e.target.closest && e.target.closest('.js-pricing-refresh');
      if (refreshBtn) {
        var id = refreshBtn.dataset.id;
        if (id) refreshPricing(id, refreshBtn);
        return;
      }
      if (e.target && e.target.getAttribute && e.target.getAttribute('data-close') === '1') {
        closeDetail();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && detailOpen) {
        e.preventDefault();
        closeDetail();
      }
    });

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

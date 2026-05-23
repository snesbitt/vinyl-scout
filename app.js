// Vinyl Scout Phase 1 + Phase 3 — Gallery with hardcoded high-res artwork
// Instant, visual, zero loading times
// version: 17

// HARDCODED COVER_MAP: All album artwork (Wikipedia, high-res)
// No external API calls, instant display
const COVER_MAP = {
  'rec_moby_play': 'https://upload.wikimedia.org/wikipedia/en/0/0a/Moby_-_Play_cover.jpg',
  'rec_fleetwood_rumours': 'https://upload.wikimedia.org/wikipedia/en/f/fa/Rumours_-_Fleetwood_Mac.jpg',
  'rec_steely_aja': 'https://upload.wikimedia.org/wikipedia/en/0/02/Steely_Dan_-_Aja.jpg',
  'rec_nina_simone': 'https://upload.wikimedia.org/wikipedia/en/e/eb/Nina_Simone_-_Little_Girl_Blue_1958.jpg',
  'rec_portishead_dummy': 'https://upload.wikimedia.org/wikipedia/en/a/a3/Portishead_Dummy.png',
  'rec_cure_disintegration': 'https://upload.wikimedia.org/wikipedia/en/d/d2/Disintegration_-_The_Cure.jpg',
  'rec_cure_wish': 'https://upload.wikimedia.org/wikipedia/en/9/9a/The_Cure_-_Wish.jpg',
  'rec_aretha_franklin': 'https://upload.wikimedia.org/wikipedia/en/c/c2/Aretha_Franklin_-_I_Never_Loved_a_Man.jpg',
  'rec_harry_belafonte': 'https://upload.wikimedia.org/wikipedia/en/9/97/Calypso_Harry_Belafonte.jpg',
  'rec_sade': 'https://upload.wikimedia.org/wikipedia/en/d/d8/Sade_Diamond_Life_album_cover.jpg',
  'rec_b52s': 'https://upload.wikimedia.org/wikipedia/en/f/f9/The_B52s_debut_album_cover.jpg',
  'rec_eurythmics': 'https://upload.wikimedia.org/wikipedia/en/0/0c/Sweet_Dreams_%28Are_Made_of_This%29_-_Eurythmics.jpg',
  'rec_donald_fagen': 'https://upload.wikimedia.org/wikipedia/en/3/3a/Donald_Fagen_-_The_Nightfly.jpg',
  'rec_buena_vista': 'https://upload.wikimedia.org/wikipedia/en/8/8c/Buenavista_Social_Club_album_cover.jpg',
  'rec_diana_ross': 'https://upload.wikimedia.org/wikipedia/en/a/a9/Diana_Ross_Baby_It%27s_Me.jpg',
  'rec_culture': 'https://upload.wikimedia.org/wikipedia/en/9/97/Two_Sevens_Clash.jpg',
  'rec_clash': 'https://upload.wikimedia.org/wikipedia/en/a/ae/The_Clash_album_cover.jpg',
  'rec_cocteau_twins': 'https://upload.wikimedia.org/wikipedia/en/0/04/Heaven_or_Las_Vegas.jpg',
  'rec_st_germain': 'https://upload.wikimedia.org/wikipedia/en/1/16/Tourist_album_cover.jpg',
  'rec_kraftwerk_autobahn': 'https://upload.wikimedia.org/wikipedia/en/c/c9/Kraftwerk_Autobahn_album_cover.jpg',
  'rec_kraftwerk_tdf': 'https://upload.wikimedia.org/wikipedia/en/9/9f/Kraftwerk_Tour_de_France_album_cover.jpg',
  'rec_kruder_dorfmeister_1': 'https://upload.wikimedia.org/wikipedia/en/7/79/Kruder%26Dorfmeister_TheKDSessions.jpg',
  'rec_madonna': 'https://upload.wikimedia.org/wikipedia/en/b/ba/Madonna_Like_a_Virgin.jpg',
  'rec_nightmares_wax': 'https://upload.wikimedia.org/wikipedia/en/f/f3/Cartagena_Nightmares_on_Wax.jpg',
  'rec_talking_heads': 'https://upload.wikimedia.org/wikipedia/en/0/0f/Talking_Heads_Remain_in_Light.jpg',
  'rec_donna_summer': 'https://upload.wikimedia.org/wikipedia/en/a/a0/Donna_Summer_Bad_Girls.jpg',
  'rec_smiths': 'https://upload.wikimedia.org/wikipedia/en/5/5e/The_Queen_Is_Dead.jpg',
  'rec_dre_chronic': 'https://upload.wikimedia.org/wikipedia/en/f/f9/The_Chronic.jpg',
  'rec_peter_gabriel': 'https://upload.wikimedia.org/wikipedia/en/a/ac/Peter_Gabriel_So.jpg',
  'rec_air_moon_safari': 'https://upload.wikimedia.org/wikipedia/en/8/8e/Moon_Safari.jpg',
  'rec_michael_mcdonald': 'https://upload.wikimedia.org/wikipedia/en/a/a5/Michael_McDonald_If_That%27s_What_It_Takes.jpg',
  'rec_fleetwood_mac_rumours_2': 'https://upload.wikimedia.org/wikipedia/en/0/08/Fleetwood_Mac_Eponymous.jpg',
  'rec_kd_lang': 'https://upload.wikimedia.org/wikipedia/en/e/e1/Ingenue_KD_Lang.jpg',
  'rec_grace_jones': 'https://upload.wikimedia.org/wikipedia/en/3/38/Grace_Jones_Living_My_Life.jpg',
  'rec_bryan_ferry': 'https://upload.wikimedia.org/wikipedia/en/9/92/Bryan_Ferry_These_Foolish_Things.jpg',
  'rec_joy_division': 'https://upload.wikimedia.org/wikipedia/en/4/46/Closer_Joy_Division_Album.jpg',
  'rec_crosby_stills_nash': 'https://upload.wikimedia.org/wikipedia/en/6/6d/Crosby%2C_Stills_%26_Nash_%28album%29.jpg',
  'rec_selecter': 'https://upload.wikimedia.org/wikipedia/en/4/46/The_Selecter_Too_Much_Pressure.jpg',
  'rec_steel_pulse': 'https://upload.wikimedia.org/wikipedia/en/a/ac/Handsworth_Revolution_album.jpg',
  'rec_bob_marley_1': 'https://upload.wikimedia.org/wikipedia/en/e/ec/Bob_Marley_-_Legend.jpg',
  'rec_bob_marley_2': 'https://upload.wikimedia.org/wikipedia/en/3/39/Kaya_%28album%29.jpg',
  'rec_bob_marley_3': 'https://upload.wikimedia.org/wikipedia/en/6/67/Bob_Marley_Exodus.jpg',
  'rec_bob_marley_4': 'https://upload.wikimedia.org/wikipedia/en/7/71/Rastaman_Vibration.jpg',
  'rec_pitch_black': 'https://upload.wikimedia.org/wikipedia/en/4/49/Pitch_Black_album_cover.jpg',
  'rec_scientist_1': 'https://upload.wikimedia.org/wikipedia/en/c/cc/The_Scientist_Album_1981.jpg',
  'rec_scientist_2': 'https://upload.wikimedia.org/wikipedia/en/0/0c/The_Scientist_Wins_Grammy.jpg',
  'rec_cal_tjader': 'https://upload.wikimedia.org/wikipedia/en/5/53/Cal_Tjader_Latino.jpg',
  'rec_al_dimeola': 'https://upload.wikimedia.org/wikipedia/en/8/8c/Al_Di_Meola_Elegant_Gypsy.jpg',
  'rec_tania_maria': 'https://upload.wikimedia.org/wikipedia/en/b/b9/Tania_Maria_album_1981.jpg',
  'rec_ramsey_lewis': 'https://upload.wikimedia.org/wikipedia/en/7/70/The_In_Crowd_Ramsey_Lewis.jpg',
  'rec_oliver_nelson': 'https://upload.wikimedia.org/wikipedia/en/6/6e/Oliver_Nelson_Blues_Abstract_Truth.jpg',
  'rec_burning_spear': 'https://upload.wikimedia.org/wikipedia/en/e/ec/Marcus_Garvey_Burning_Spear.jpg',
  'rec_cesaria_evora': 'https://upload.wikimedia.org/wikipedia/en/f/fe/CesariaEvora_MarAzul.jpg',
  'rec_billie_holiday': 'https://upload.wikimedia.org/wikipedia/en/3/31/Billie_Holiday_Lady_in_Satin.jpg',
  'rec_sidney_bechet': 'https://upload.wikimedia.org/wikipedia/en/9/92/Sidney_Bechet_album.jpg',
  'rec_grant_green': 'https://upload.wikimedia.org/wikipedia/en/4/44/Grant_Green_Idle_Moments.jpg',
  'rec_dave_brubeck': 'https://upload.wikimedia.org/wikipedia/en/d/d7/DaveBrubeck_TimeOut.jpg',
  'rec_benny_goodman': 'https://upload.wikimedia.org/wikipedia/en/7/7a/Benny_Goodman_Quartet.jpg',
  'rec_duke_ellington': 'https://upload.wikimedia.org/wikipedia/en/2/2a/DukeEllington_SuchSweetThunder.jpg',
  'rec_chick_corea': 'https://upload.wikimedia.org/wikipedia/en/e/ec/Chick_Corea_Elektric_Band.jpg',
  'rec_desmond_dekker': 'https://upload.wikimedia.org/wikipedia/en/b/be/Desmond_Dekker_007_Shantytown.jpg',
  'rec_augustus_pablo': 'https://upload.wikimedia.org/wikipedia/en/7/7c/Augustus_Pablo_East_of_the_Dub.jpg',
  'rec_rolling_stones': 'https://upload.wikimedia.org/wikipedia/en/0/0e/The_Rolling_Stones_Beggars_Banquet.jpg',
  'rec_thievery_corp_1': 'https://upload.wikimedia.org/wikipedia/en/a/ae/Thievery_Corporation_Mirrors.jpg',
  'rec_thievery_corp_2': 'https://upload.wikimedia.org/wikipedia/en/f/f2/Thievery_Corporation_OSB.jpg',
  'rec_tosca': 'https://upload.wikimedia.org/wikipedia/en/c/c5/Tosca_Pork_Soaked.jpg',
  'rec_vladimir_horowitz_1': 'https://upload.wikimedia.org/wikipedia/en/d/dc/Vladimir_Horowitz_Last_Recordings.jpg',
  'rec_vladimir_horowitz_2': 'https://upload.wikimedia.org/wikipedia/en/8/8f/Vladimir_Horowitz_Carnegie.jpg',
  'rec_joan_sutherland': 'https://upload.wikimedia.org/wikipedia/en/c/cf/Joan_Sutherland_album.jpg',
  'rec_ravi_shankar_1': 'https://upload.wikimedia.org/wikipedia/en/5/54/Ravi_Shankar_In_New_York.jpg',
  'rec_ravi_shankar_2': 'https://upload.wikimedia.org/wikipedia/en/0/06/Ravi_Shankar_1962.jpg',
  'rec_boney_m': 'https://upload.wikimedia.org/wikipedia/en/5/59/Boney_M_Night_Flight_to_Venus.jpg',
  'rec_easy_star_radiodread': 'https://upload.wikimedia.org/wikipedia/en/3/30/Easy_Star_All-Stars_Radiodread.jpg',
  'rec_easy_star_dubside': 'https://upload.wikimedia.org/wikipedia/en/6/61/Easy_Star_All-Stars_Dub_Side.jpg',
  'rec_mozart_requiem': 'https://upload.wikimedia.org/wikipedia/en/2/2c/Mozart_Requiem.jpg',
  'rec_maria_callas': 'https://upload.wikimedia.org/wikipedia/en/a/ac/Maria_Callas_La_Traviata.jpg',
  'rec_swingle_singers': 'https://upload.wikimedia.org/wikipedia/en/8/8f/The_Swingle_Singers_1964.jpg',
  'rec_bach_goldberg': 'https://upload.wikimedia.org/wikipedia/en/1/1f/Bach_Goldberg_Variations.jpg',
  'rec_beethoven': 'https://upload.wikimedia.org/wikipedia/en/6/63/Beethoven_Symphony_9.jpg',
  'rec_jimmy_smith': 'https://upload.wikimedia.org/wikipedia/en/c/cb/Jimmy_Smith_Home_Cookin.jpg',
  'rec_django_reinhardt': 'https://upload.wikimedia.org/wikipedia/en/4/41/Django_Reinhardt_Best.jpg',
  'rec_moby_play_2': 'https://upload.wikimedia.org/wikipedia/en/4/47/Moby_Animal_Rights.jpg',
  'rec_oscar_peterson': 'https://upload.wikimedia.org/wikipedia/en/5/50/Oscar_Peterson_Live_Russia.jpg',
  'rec_max_richter': 'https://upload.wikimedia.org/wikipedia/en/7/78/Max_Richter_Four_Seasons.jpg',
  'rec_john_lee_hooker': 'https://upload.wikimedia.org/wikipedia/en/8/8a/John_Lee_Hooker_Ultimate.jpg',
  'rec_cure_boys_boys': 'https://upload.wikimedia.org/wikipedia/en/c/c0/The_Cure_Boys_Boys_Boys.jpg',
  'rec_veronica_electronica': 'https://upload.wikimedia.org/wikipedia/en/d/d1/Veronica_Electronica.jpg',
  'rec_kruder_dorfmeister_2': 'https://upload.wikimedia.org/wikipedia/en/1/1c/Kruder_Dorfmeister_G_Strophe.jpg',
  'rec_scott_joplin': 'https://upload.wikimedia.org/wikipedia/en/f/f4/Scott_Joplin_Rags.jpg',
  'rec_rob_garza': 'https://upload.wikimedia.org/wikipedia/en/a/ad/Rob_Garza_Citlali.jpg',
};

const DISPLAY_MODES = {
  list: 'list',
  grid: 'grid',
};

let allRecords = [];
let currentDisplay = DISPLAY_MODES.list;

// ============================================================
// Pricing helpers
// ============================================================
function formatPrice(n, currency = 'USD') {
  if (n === null || n === undefined) return '—';
  const symbol = currency === 'EUR' ? '€' : '$';
  return `${symbol}${Number(n).toFixed(2)}`;
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
            <div style="flex: 0 0 45px; width: 45px; height: 45px; background: var(--bg-soft); border: 1px solid var(--rule); border-radius: 2px; overflow: hidden; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <img src="${COVER_MAP[record.id] || '/api/covers/' + record.id + '/image'}" alt="" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'"><div style="font-size: 9px; color: var(--ink-faint); text-align: center; padding: 2px; display: none;">—</div>
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
                  ${formatPrice(record.price_low, record.price_currency)} — ${formatPrice(record.price_high, record.price_currency)}
                </div>
              ` : record.price_low ? `
                <div style="color: var(--ink-soft);">${formatPrice(record.price_low, record.price_currency)}</div>
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
        ${record.cover_url ? `<img src="${record.cover_url}" alt="${record.artist} — ${record.title}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 2px;">` : `<img src="${COVER_MAP[record.id] || 'https://via.placeholder.com/300?text=' + encodeURIComponent(record.artist)}" alt="${record.artist} — ${record.title}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 2px;">`}
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
            ${record.price_low && record.price_high ? `<div style="color: var(--accent); font-weight: 600; margin-bottom: 0.25rem;">${formatPrice(record.price_low, record.price_currency)} – ${formatPrice(record.price_high, record.price_currency)}</div>` : ''}
            ${record.price_low && !record.price_high ? `<div style="color: var(--accent); font-weight: 600; margin-bottom: 0.25rem;">Floor: ${formatPrice(record.price_low, record.price_currency)}</div>` : ''}
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

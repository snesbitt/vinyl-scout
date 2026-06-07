// netlify/functions/discogs-lookup.mjs
// version: 5
// Phase 2 — Discogs lookup for pressing accuracy.
// v2: added catno (catalog-number) search path.
// v3: generic `id` param searches BOTH catno AND barcode fields and merges.
// v4: added `release_id` path + format-based ranking.
// v5: FIXES — (a) only send non-empty search params (empty q made Discogs ignore
//     artist/title and return wrong-artist junk); (b) RELEVANCE-first ranking
//     (drop/sink candidates that don't match the searched artist+title, vinyl
//     only breaks ties); (c) release_id rejects non-release URLs (search-page
//     links no longer fetch a random release). Free-text `q` search supported.
//
// PURE READ. This function queries the Discogs search API and returns
// candidate releases. It NEVER touches the Netlify Blobs "records" store
// and NEVER writes anything. Accepting a candidate is a separate, explicit
// action handled client-side by POSTing to /api/records (single upsert).
//
// Not gated by the edit secret: this is a pure read of public Discogs data
// that exposes none of the catalog and writes nothing. Leaving it ungated
// means it needs no new env var and no match against records.mjs. The only
// exposure is that a visitor who finds the unadvertised URL could consume the
// Discogs token's (generous, free) rate limit. If that ever matters, add a
// secret gate later once the existing secret's env-var/header names are known.
// The token itself lives ONLY in a server-side env var, never in a URL or HTML.
//
// Env var expected:
//   DISCOGS_TOKEN  — Discogs personal access token (server-side only)

export const config = { path: "/api/discogs/lookup" };

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

export default async (req) => {
  // Read-only endpoint: only GET is allowed.
  if (req.method !== "GET") {
    return json({ error: "Method not allowed — lookup is read-only" }, 405);
  }

  const token = process.env.DISCOGS_TOKEN;
  if (!token) {
    return json({ error: "DISCOGS_TOKEN is not set on the server" }, 500);
  }

  const url = new URL(req.url);
  const artist = (url.searchParams.get("artist") || "").trim();
  const title = (url.searchParams.get("title") || "").trim();
  // `id` is a generic identifier off the sleeve — could be a catalog number
  // OR a barcode. We don't make Susan know which; we search both Discogs fields.
  // `catno` is still accepted for backward-compat and maps into the same path.
  const id = (url.searchParams.get("id") || url.searchParams.get("catno") || "").trim();
  // `release_id` must be an ACTUAL release reference, not any stray number.
  // Accept: a bare all-digit string, OR a URL/text containing /release/<digits>.
  // A search-page URL (discogs.com/search?...) has NO /release/ and is NOT a
  // bare number, so it is correctly rejected instead of fetching a wrong release.
  const releaseRaw = (url.searchParams.get("release_id") || "").trim();
  let releaseId = "";
  let releaseBad = false;
  if (releaseRaw) {
    const fromUrl = releaseRaw.match(/\/release\/(\d+)/);
    if (fromUrl) {
      releaseId = fromUrl[1];
    } else if (/^\d+$/.test(releaseRaw)) {
      releaseId = releaseRaw;            // a clean bare ID
    } else {
      releaseBad = true;                 // text given but no usable release ref
    }
  }
  const q = (url.searchParams.get("q") || "").trim();

  if (releaseBad) {
    return json({ error: "That doesn't look like a Discogs release. Paste a release ID (just the number) or a release URL ending in /release/NNNN — a search-results link won't work." }, 400);
  }
  if (!artist && !title && !id && !releaseId && !q) {
    return json({ error: "Provide at least one of: artist, title, id, release_id, q" }, 400);
  }

  // Helper: run one Discogs release search from a params object, return mapped candidates.
  async function searchDiscogs(paramsObj) {
    const search = new URLSearchParams();
    search.set("type", "release");
    for (const [k, v] of Object.entries(paramsObj)) {
      if (v) search.set(k, v);
    }
    search.set("per_page", "10");
    const discogsUrl = "https://api.discogs.com/database/search?" + search.toString();
    const res = await fetch(discogsUrl, {
      headers: {
        "Authorization": "Discogs token=" + token,
        "User-Agent": "VinylScout/1.0 +https://vinylscout.org",
      },
    });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json()).message || ""; } catch (e) {}
      const err = new Error("Discogs returned HTTP " + res.status + (detail ? " — " + detail : ""));
      err.upstream = true;
      throw err;
    }
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    return results.map((r) => ({
      discogs_release_id: typeof r.id === "number" ? r.id : null,
      display_title: r.title || null,
      year: r.year ? parseInt(r.year, 10) || null : null,
      label: Array.isArray(r.label) && r.label.length ? r.label[0] : null,
      catalog_no: r.catno || null,
      country: r.country || null,
      format: Array.isArray(r.format) && r.format.length ? r.format.join(", ") : null,
      thumb: r.thumb || null,
    }));
  }

  // Helper: fetch ONE release by its Discogs release ID. Different endpoint and
  // a different response shape than search — map it to the same candidate shape.
  async function fetchRelease(rid) {
    const relUrl = "https://api.discogs.com/releases/" + encodeURIComponent(rid);
    const res = await fetch(relUrl, {
      headers: {
        "Authorization": "Discogs token=" + token,
        "User-Agent": "VinylScout/1.0 +https://vinylscout.org",
      },
    });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json()).message || ""; } catch (e) {}
      const err = new Error("Discogs returned HTTP " + res.status + (detail ? " — " + detail : ""));
      err.upstream = true;
      throw err;
    }
    const r = await res.json();
    const labelObj = Array.isArray(r.labels) && r.labels.length ? r.labels[0] : null;
    const artistName = Array.isArray(r.artists) && r.artists.length ? r.artists[0].name : "";
    const display = (artistName ? artistName + " - " : "") + (r.title || "");
    const formatStr = Array.isArray(r.formats) && r.formats.length
      ? r.formats.map((f) => [f.name].concat(f.descriptions || []).filter(Boolean).join(", ")).join(" / ")
      : null;
    return [{
      discogs_release_id: typeof r.id === "number" ? r.id : null,
      display_title: display || (r.title || null),
      year: r.year ? parseInt(r.year, 10) || null : null,
      label: labelObj ? labelObj.name : null,
      catalog_no: labelObj ? labelObj.catno : null,
      country: r.country || null,
      format: formatStr,
      thumb: (Array.isArray(r.images) && r.images.length && r.images[0].uri150) ? r.images[0].uri150 : null,
    }];
  }

  // Rank candidates: RELEVANCE first (does it actually match what was searched?),
  // then vinyl-first as a tie-breaker among genuine matches. This stops a
  // wrong-artist vinyl record (e.g. a random EP) from floating to the top.
  // `want` is { artist, title } when known (artist+title search), else null.
  function rankCandidates(list, want) {
    function norm(s) {
      return (s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    }
    function tokens(s) { return norm(s).split(" ").filter(Boolean); }

    var wantArtistTok = want ? tokens(want.artist) : [];
    var wantTitleTok = want ? tokens(want.title) : [];

    function formatTier(c) {
      var f = (c.format || "").toLowerCase();
      if (/vinyl|lp|7"|10"|12"/.test(f)) return 0;            // vinyl best
      if (/cd|cassette|dvd|sacd/.test(f)) return 2;
      if (/file|digital|flac|mp3|streaming/.test(f)) return 3; // digital worst
      return 1;
    }

    // Relevance score: fraction of wanted artist+title tokens present in the
    // candidate's display title. Higher is better. 1.0 = every token present.
    function relevance(c) {
      if (!want) return 1; // free-text/number search: trust Discogs' own order
      var hay = norm(c.display_title);
      var all = wantArtistTok.concat(wantTitleTok);
      if (!all.length) return 1;
      var hit = 0;
      for (var i = 0; i < all.length; i++) {
        if (hay.indexOf(all[i]) !== -1) hit++;
      }
      return hit / all.length;
    }

    return list
      .map(function (c, i) { return { c: c, i: i, rel: relevance(c), ft: formatTier(c) }; })
      // Drop candidates that match almost nothing of a known artist+title (junk).
      .filter(function (x) { return !want || x.rel >= 0.34; })
      // Sort: higher relevance first; then vinyl-first; then Discogs' own order.
      .sort(function (a, b) {
        if (b.rel !== a.rel) return b.rel - a.rel;
        if (a.ft !== b.ft) return a.ft - b.ft;
        return a.i - b.i;
      })
      .map(function (x) { return x.c; });
  }

  // Decide which searches to run.
  // - release_id: fetch exactly one release, no list, no ranking needed.
  // - identifier (id): query BOTH catno and barcode, merge — the number on a
  //   sleeve can be either, and Discogs files them in separate fields.
  // - otherwise: an artist/title/q search, ranked vinyl-first.
  let candidates;
  try {
    if (releaseId) {
      candidates = await fetchRelease(releaseId);
    } else if (id) {
      const [byCatno, byBarcode] = await Promise.all([
        searchDiscogs({ catno: id }),
        searchDiscogs({ barcode: id }),
      ]);
      // Merge, deduping by release id (catno matches first, then any new barcode ones).
      const seen = new Set();
      candidates = [];
      for (const c of byCatno.concat(byBarcode)) {
        const key = c.discogs_release_id;
        if (key == null) { candidates.push(c); continue; }
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(c);
      }
    } else {
      // Build params with ONLY non-empty fields. Sending an empty q alongside
      // artist/release_title made Discogs ignore the structured fields and return
      // junk (the Pete Moss bug). want=relevance target when artist+title given.
      var params = {};
      var want = null;
      if (q) {
        params.q = q;                       // free-text search; trust Discogs order
      } else {
        if (artist) params.artist = artist;
        if (title) params.release_title = title;
        want = { artist: artist, title: title };
      }
      candidates = rankCandidates(await searchDiscogs(params), want);
    }
  } catch (err) {
    if (err.upstream) return json({ error: err.message }, 502);
    return json({ error: "Could not reach Discogs: " + err.message }, 502);
  }

  return json({ candidates }, 200);
};

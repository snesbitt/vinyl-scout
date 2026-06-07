// netlify/functions/discogs-lookup.mjs
// version: 4
// Phase 2 — Discogs lookup for pressing accuracy.
// v2: added catno (catalog-number) search path.
// v3: generic `id` param searches BOTH catno AND barcode fields and merges.
// v4: added `release_id` path (fetch one exact release, no list) + vinyl-first
//     ranking of artist+title results (LP/Vinyl up, CD/digital down).
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
  // `release_id` is the unambiguous Discogs release ID — fetches exactly one.
  // Accept a bare number or anything containing /release/<digits> (a pasted URL);
  // we extract the digits client-side, but also defensively parse here.
  const releaseRaw = (url.searchParams.get("release_id") || "").trim();
  const releaseMatch = releaseRaw.match(/(\d{2,})/);
  const releaseId = releaseMatch ? releaseMatch[1] : "";
  const q = (url.searchParams.get("q") || "").trim();

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

  // Rank candidates vinyl-first: LP / Vinyl float up, CD / digital / file sink.
  // Stable within a tier (preserves Discogs' own relevance order).
  function rankVinylFirst(list) {
    function tier(c) {
      const f = (c.format || "").toLowerCase();
      if (/vinyl|lp|7"|10"|12"/.test(f)) return 0;            // vinyl first
      if (/cd|cassette|dvd|sacd/.test(f)) return 2;           // physical non-vinyl
      if (/file|digital|flac|mp3|streaming/.test(f)) return 3; // digital last
      return 1;                                                // unknown/other
    }
    return list
      .map((c, i) => ({ c: c, i: i, t: tier(c) }))
      .sort((a, b) => (a.t - b.t) || (a.i - b.i))
      .map((x) => x.c);
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
      candidates = rankVinylFirst(await searchDiscogs({
        artist: artist,
        release_title: title,
        q: q,
      }));
    }
  } catch (err) {
    if (err.upstream) return json({ error: err.message }, 502);
    return json({ error: "Could not reach Discogs: " + err.message }, 502);
  }

  return json({ candidates }, 200);
};

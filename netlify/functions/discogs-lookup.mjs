// netlify/functions/discogs-lookup.mjs
// version: 3
// Phase 2 — Discogs lookup for pressing accuracy.
// v2: added catno (catalog-number) search path.
// v3: generic `id` param searches BOTH catno AND barcode fields and merges —
//     a number on a sleeve can be either, and Discogs files them separately.
//     `catno` param still accepted (maps to the same dual search).
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
  const q = (url.searchParams.get("q") || "").trim();

  if (!artist && !title && !id && !q) {
    return json({ error: "Provide at least one of: artist, title, id, q" }, 400);
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

  // Decide which searches to run.
  // - identifier (id): query BOTH catno and barcode, merge — the number on a
  //   sleeve can be either, and Discogs files them in separate fields.
  // - otherwise: a single artist/title/q search as before.
  let candidates;
  try {
    if (id) {
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
      candidates = await searchDiscogs({
        artist: artist,
        release_title: title,
        q: q,
      });
    }
  } catch (err) {
    if (err.upstream) return json({ error: err.message }, 502);
    return json({ error: "Could not reach Discogs: " + err.message }, 502);
  }

  return json({ candidates }, 200);
};

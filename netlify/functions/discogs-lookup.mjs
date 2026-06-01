// netlify/functions/discogs-lookup.mjs
// version: 1
// Phase 2 — Discogs lookup for pressing accuracy.
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
  const q = (url.searchParams.get("q") || "").trim();

  if (!artist && !title && !q) {
    return json({ error: "Provide at least one of: artist, title, q" }, 400);
  }

  // Build the Discogs search query (releases only).
  const search = new URLSearchParams();
  search.set("type", "release");
  if (artist) search.set("artist", artist);
  if (title) search.set("release_title", title);
  if (q) search.set("q", q);
  search.set("per_page", "10");

  const discogsUrl = "https://api.discogs.com/database/search?" + search.toString();

  let res;
  try {
    res = await fetch(discogsUrl, {
      headers: {
        // Token via header, not in the URL.
        "Authorization": "Discogs token=" + token,
        // Discogs requires a descriptive User-Agent.
        "User-Agent": "VinylScout/1.0 +https://vinylscout.org",
      },
    });
  } catch (err) {
    return json({ error: "Could not reach Discogs: " + err.message }, 502);
  }

  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).message || ""; } catch (e) {}
    return json({ error: "Discogs returned HTTP " + res.status + (detail ? " — " + detail : "") }, 502);
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    return json({ error: "Could not parse Discogs response: " + err.message }, 502);
  }

  const results = Array.isArray(data.results) ? data.results : [];

  // Map to a slim candidate shape that mirrors our 5 additive fields,
  // plus a thumbnail + display title to help Susan pick the right pressing.
  const candidates = results.map((r) => ({
    discogs_release_id: typeof r.id === "number" ? r.id : null,
    display_title: r.title || null,                 // usually "Artist - Album"
    year: r.year ? parseInt(r.year, 10) || null : null,
    label: Array.isArray(r.label) && r.label.length ? r.label[0] : null,
    catalog_no: r.catno || null,
    country: r.country || null,
    format: Array.isArray(r.format) && r.format.length ? r.format.join(", ") : null,
    thumb: r.thumb || null,
  }));

  return json({ candidates }, 200);
};

// netlify/functions/spotify-preview.mjs
// version: 2
// Phase 4 — Audio preview. Given an artist + album title, finds the most
// popular track on that album via Spotify's search API and returns its
// preview clip (when Spotify makes one available for this app).
//
// PURE READ. Never touches the Netlify Blobs "records" store, never writes
// anything. Not gated by the edit secret — same reasoning as
// discogs-lookup.mjs: this exposes no catalog data and writes nothing.
//
// Graceful degradation: if SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are not
// set, or Spotify has no preview for the matched track (Spotify has
// restricted preview_url availability for many API apps since late 2024 —
// this can happen even for a correctly matched, popular track), this returns
// a normal 200 with available:false + a reason. That is not treated as an
// error — it's an expected, non-fatal outcome the frontend shows quietly,
// the same way "no market data yet" is shown in the Market section.
//
// Env vars expected:
//   SPOTIFY_CLIENT_ID      — Spotify app client ID (server-side only)
//   SPOTIFY_CLIENT_SECRET  — Spotify app client secret (server-side only)

export const config = { path: "/api/spotify/preview" };

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

// In-memory app-token cache. Best-effort only — scoped to one warm function
// instance, never persisted, never written to the records store. A cold
// start just fetches a fresh token; that's fine at this traffic volume.
let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getAppToken(clientId, clientSecret) {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAt) return cachedToken;

  const basic = Buffer.from(clientId + ":" + clientSecret).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + basic,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(function () { return ""; });
    console.error("Spotify token request failed", res.status, bodyText.slice(0, 500));
    const err = new Error("Spotify auth returned HTTP " + res.status + (bodyText ? " — " + bodyText.slice(0, 200) : ""));
    err.upstream = true;
    throw err;
  }
  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExpiresAt = now + Math.max(0, (data.expires_in || 3600) - 60) * 1000;
  return cachedToken;
}

export default async (req) => {
  if (req.method !== "GET") {
    return json({ error: "Method not allowed — preview is read-only" }, 405);
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    // Not configured yet — not an error. Susan sets these in the Netlify UI.
    return json({ available: false, reason: "not_configured" }, 200);
  }

  const url = new URL(req.url);
  const artist = (url.searchParams.get("artist") || "").trim();
  const title = (url.searchParams.get("title") || "").trim();
  if (!artist || !title) {
    return json({ error: "Provide both artist and title" }, 400);
  }

  let token;
  try {
    token = await getAppToken(clientId, clientSecret);
  } catch (err) {
    return json({ error: "Could not authenticate with Spotify: " + err.message }, 502);
  }

  // Track search returns full Track objects, which carry `popularity` and
  // `preview_url` directly — no second album->tracks round trip is needed
  // just to rank candidates by popularity.
  const q = 'artist:"' + artist.replace(/"/g, "") + '" album:"' + title.replace(/"/g, "") + '"';
  const search = new URLSearchParams();
  search.set("q", q);
  search.set("type", "track");
  search.set("limit", "50");

  let data;
  try {
    const res = await fetch("https://api.spotify.com/v1/search?" + search.toString(), {
      headers: { "Authorization": "Bearer " + token },
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(function () { return ""; });
      console.error("Spotify search failed", res.status, bodyText.slice(0, 500));
      const err = new Error("Spotify search returned HTTP " + res.status + (bodyText ? " — " + bodyText.slice(0, 200) : ""));
      err.upstream = true;
      throw err;
    }
    data = await res.json();
  } catch (err) {
    return json({ error: "Could not reach Spotify: " + err.message }, 502);
  }

  const tracks = (data && data.tracks && Array.isArray(data.tracks.items)) ? data.tracks.items : [];
  if (!tracks.length) {
    return json({ available: false, reason: "no_match" }, 200);
  }

  // Most popular track on the matched album (not random) — the one explicit
  // product requirement for this feature.
  tracks.sort(function (a, b) { return (b.popularity || 0) - (a.popularity || 0); });
  const best = tracks[0];
  const artists = Array.isArray(best.artists) ? best.artists.map(function (a) { return a.name; }).join(", ") : null;
  const spotifyUrl = (best.external_urls && best.external_urls.spotify) || null;

  if (!best.preview_url) {
    return json({
      available: false,
      reason: "no_preview",
      track: { name: best.name || null, artists: artists, spotify_url: spotifyUrl },
    }, 200);
  }

  return json({
    available: true,
    reason: null,
    track: {
      name: best.name || null,
      artists: artists,
      preview_url: best.preview_url,
      spotify_url: spotifyUrl,
      popularity: (typeof best.popularity === "number") ? best.popularity : null,
    },
  }, 200);
};

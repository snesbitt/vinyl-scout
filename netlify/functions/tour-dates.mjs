// netlify/functions/tour-dates.mjs
// version: 3
// Phase 11 — Concert Radar real feed test (SeatGeek first; Ticketmaster later,
// per Susan's 2026-08-03 call to start with SeatGeek since Ticketmaster's own
// developer signup was slow).
//
// v2: v1 used a free-text `q=<artist>` search on /events, combined with
// lat/lon/range. Live-tested against ?artist=Rolling%20Stones and it matched
// "Unauthorized Rolling Stones" — a tribute act at a small San Leandro venue —
// because `q` searches loosely across performer/venue/title text and doesn't
// distinguish a tribute band from the real one. Same wrong-match class of bug
// as the audio-preview matching saga (see CLAUDE.md): never trust a loose
// text match without verifying the actual matched entity. Fixed by resolving
// the artist to a real SeatGeek performer FIRST (via /performers?q=, filtered
// to an exact normalized-name match — a tribute act's performer name doesn't
// equal the real artist's), then querying /events scoped to that performer's
// exact slug. If no exact performer match is found, returns an empty list
// rather than falling back to a loose text search.
//
// v3: live-tested "Kruder & Dorfmeister" (real Fox Theater Oakland Oct 2026
// date confirmed by Susan) and got zero results — TWO compounding bugs:
// (a) v2's norm() only stripped a LEADING "the ", and never unified "&" vs
// "and", so "Kruder & Dorfmeister" (query) vs however SeatGeek's own
// performer record spells it never produced an exact string match; (b) v2
// had no fallback at all once the exact-match check failed — a real,
// lower-profile act with no exact hit just silently returned nothing, which
// is worse than the wrong-match bug it was fixed to avoid, not better. v3
// fixes both: norm() now unifies "&"/"and", strips "the" anywhere (not just
// leading), and a bumped per_page (20, from 10) gives less-mainstream acts
// more room to appear in the performer search at all. A guarded fallback
// tier now runs if no exact match: candidates must contain EVERY normalized
// token of the query as a substring of their own normalized name (so a
// partial/reordered name still counts) AND must not contain an obvious
// tribute/cover-act keyword (tribute, unauthorized, cover, salute, "as
// performed by", homage) — this is what a real act's performer record does
// NOT trip and a copy act's almost always does. `meta.match_tier` reports
// which path found the result ("exact" | "fuzzy" | null) so this stays
// auditable instead of a silent guess.
//
// PURE READ. This function queries the SeatGeek Platform API and returns
// upcoming events near a hardcoded home location, scoped to one artist. It
// NEVER touches the Netlify Blobs "records"/"wishlist" stores and NEVER
// writes anything.
//
// Not gated by the edit secret: same rationale as discogs-lookup.mjs — this
// is a pure read of public event data, exposes nothing from the catalog, and
// writes nothing. The only exposure is rate-limit consumption on SeatGeek's
// free tier if someone finds the URL; add a gate later if that ever matters.
//
// Home location is hardcoded to Berkeley, CA per Susan's explicit 2026-08-03
// choice for the concert-radar.html mock — when this moves beyond a first
// feed test, this constant should become the one place that decision lives
// (see CLAUDE.md's "Concert Radar" section: "HOME_LOCATION should move
// [into the real matching function], not stay in a static page").
//
// Env vars expected:
//   SEATGEEK_CLIENT_ID      — SeatGeek Platform API client_id (required).
//                             Must be scoped to "Functions" (or "All scopes")
//                             in Netlify's env var UI — "Builds, Runtime"
//                             alone is NOT enough for a serverless function
//                             to read it at request time (bit us on first
//                             deploy, 2026-08-03).
//   SEATGEEK_CLIENT_SECRET  — optional; SeatGeek's own docs say client_secret
//                             is optional for read-only calls like /events,
//                             so this function tries client_id alone first
//                             and only adds the secret if present.

export const config = { path: "/api/tour-dates" };

// Home location: Berkeley, CA. Range wide enough to cover the Bay Area venues
// already used in concert-radar.html's sample data (SF, Oakland, Santa Clara).
const HOME_LAT = 37.8715;
const HOME_LON = -122.273;
const DEFAULT_RANGE = "60mi";

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

export default async (req) => {
  // Read-only endpoint: only GET is allowed.
  if (req.method !== "GET") {
    return json({ error: "Method not allowed — tour-dates is read-only" }, 405);
  }

  const clientId = process.env.SEATGEEK_CLIENT_ID;
  if (!clientId) {
    return json({ error: "SEATGEEK_CLIENT_ID is not set on the server" }, 500);
  }
  const clientSecret = process.env.SEATGEEK_CLIENT_SECRET || "";

  const url = new URL(req.url);
  const artist = (url.searchParams.get("artist") || "").trim();
  const range = (url.searchParams.get("range") || DEFAULT_RANGE).trim();

  if (!artist) {
    return json({ error: "Provide an artist name, e.g. ?artist=Kraftwerk" }, 400);
  }

  function authParams() {
    const p = new URLSearchParams();
    p.set("client_id", clientId);
    if (clientSecret) p.set("client_secret", clientSecret);
    return p;
  }

  async function seatGeekGet(path, params) {
    const full = "https://api.seatgeek.com/2/" + path + "?" + params.toString();
    const res = await fetch(full);
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json()).message || ""; } catch (e) {}
      const err = new Error("SeatGeek returned HTTP " + res.status + (detail ? " — " + detail : ""));
      err.upstream = true;
      throw err;
    }
    return res.json();
  }

  // Normalize for comparison: lowercase, unify "&"/"and", drop punctuation,
  // strip standalone "the" ANYWHERE (not just a leading one), collapse
  // whitespace. Makes "Kruder & Dorfmeister" == "Kruder and Dorfmeister" and
  // "The Rolling Stones" == "Rolling Stones" regardless of which form
  // SeatGeek's own performer record happens to use.
  function norm(s) {
    return (s || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\bthe\b/g, " ")
      .replace(/\band\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  var TRIBUTE_WORDS = /\b(tribute|unauthorized|unauthorised|cover band|coverband|salute|as performed by|homage|allstars)\b/;

  let performer = null;
  let matchTier = null;
  let events = [];
  try {
    // Step 1: resolve the real performer by name. Try an EXACT normalized
    // match first — this alone is what excludes tribute/cover acts (e.g.
    // "Unauthorized Rolling Stones") whose name merely contains the searched
    // artist as a substring. per_page bumped to 20 so a lower-profile act
    // (lower SeatGeek `score`) has more room to appear in results at all.
    const perfParams = authParams();
    perfParams.set("q", artist);
    perfParams.set("per_page", "20");
    perfParams.set("sort", "score.desc");
    const perfData = await seatGeekGet("performers", perfParams);
    const performers = Array.isArray(perfData.performers) ? perfData.performers : [];
    const wantNorm = norm(artist);
    const wantTokens = wantNorm.split(" ").filter(Boolean);

    performer = performers.find((p) => norm(p.name) === wantNorm) || null;
    if (performer) {
      matchTier = "exact";
    } else if (wantTokens.length) {
      // Step 1b: guarded fallback. Every query token must appear in the
      // candidate's normalized name (catches real formatting drift, e.g. a
      // stray middle initial or "&" left unexpanded somewhere), AND the
      // candidate must not read as a tribute/cover act. First survivor wins
      // since SeatGeek already sorted by score.desc.
      performer = performers.find((p) => {
        var n = norm(p.name);
        if (TRIBUTE_WORDS.test((p.name || "").toLowerCase())) return false;
        return wantTokens.every((t) => n.indexOf(t) !== -1);
      }) || null;
      if (performer) matchTier = "fuzzy";
    }

    // Step 2: only query events if we found a genuine performer match.
    if (performer && performer.slug) {
      const evParams = authParams();
      evParams.set("performers.slug", performer.slug);
      evParams.set("lat", String(HOME_LAT));
      evParams.set("lon", String(HOME_LON));
      evParams.set("range", range);
      evParams.set("sort", "datetime_utc.asc");
      evParams.set("per_page", "10");
      const evData = await seatGeekGet("events", evParams);
      events = Array.isArray(evData.events) ? evData.events : [];
    }
  } catch (err) {
    if (err.upstream) return json({ error: err.message }, 502);
    return json({ error: "Could not reach SeatGeek: " + err.message }, 502);
  }

  const shows = events.map((e) => {
    const venue = e.venue || {};
    const stats = e.stats || {};
    const primaryPerformer = Array.isArray(e.performers) && e.performers.length
      ? (e.performers.find((p) => p.primary) || e.performers[0])
      : null;
    let dateLabel = null;
    if (e.datetime_local) {
      const d = new Date(e.datetime_local);
      if (!isNaN(d.getTime())) {
        dateLabel = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
      }
    }
    return {
      id: "seatgeek-" + (e.id != null ? e.id : ""),
      artist: primaryPerformer ? primaryPerformer.name : artist,
      title: e.title || e.short_title || null,
      venue: venue.name || null,
      city: venue.city ? (venue.state ? venue.city + ", " + venue.state : venue.city) : null,
      date: e.datetime_local ? e.datetime_local.slice(0, 10) : null,
      dateLabel: dateLabel,
      source: "SeatGeek",
      priceLow: typeof stats.lowest_price === "number" ? stats.lowest_price : null,
      priceHigh: typeof stats.highest_price === "number" ? stats.highest_price : null,
      url: e.url || null,
    };
  });

  return json({
    shows,
    meta: {
      query: artist,
      matched_performer: performer ? performer.name : null,
      matched_slug: performer ? performer.slug : null,
      match_tier: matchTier,
      lat: HOME_LAT,
      lon: HOME_LON,
      range,
    },
  }, 200);
};

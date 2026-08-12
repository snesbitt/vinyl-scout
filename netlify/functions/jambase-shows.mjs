// netlify/functions/jambase-shows.mjs
// version: 1 (draft, staged 2026-08-12 — see "NOT YET LIVE-VERIFIED" note
// below before this ships)
//
// Phase 11/12 — Concert Radar, third feed. Susan signed up for JamBase
// Data's new self-serve platform (data.jambase.com) after Ticketmaster's
// developer signup stalled (see venue-shows.mjs's and CLAUDE.md's
// 2026-08-04 notes) and Bandsintown/Songkick's APIs turned out to be
// partnership-only or closed to new applicants. JamBase's free "Developer"
// tier is genuinely permanent (not just a trial): 1,000 calls/month,
// 3,600/hr, non-commercial use only, 6-month future event window. Verified
// directly against JamBase's own API reference (query parameter table +
// the Concert schema) on 2026-08-12 — not guessed from an older, unrelated
// JamBase v1 API a couple of outdated third-party client libraries still
// target (jambase_api on PyPI, node-jambase on npm — both point at
// www.jambase.com/jb-api/v1/, a different, legacy product; do not copy
// their endpoint shapes here).
//
// DESIGN CHOICE — one geo sweep, not one call per artist: tour-dates.mjs
// (SeatGeek) resolves and queries one artist at a time, which is fine on
// SeatGeek's much higher free-tier ceiling but would burn through JamBase's
// 1,000/month budget fast against Susan's full catalog+wishlist+watching
// artist list (150+ distinct names). Instead this function makes ONE
// request per invocation — every upcoming concert within DEFAULT_RANGE_MI
// of home — the same shape venue-shows.mjs already uses (a fixed source,
// filtered down to relevant artists by the CALLER, not by this function).
// concert-radar.html's existing artistIsRelevant()/normalizeArtistKey()
// filter (added v18.5 for venue-shows.mjs) should be reused against this
// endpoint's output too rather than duplicated — see the TODO at the
// bottom of this file for the concert-radar.html/scheduled-sweep.mjs wiring
// this still needs, deliberately NOT done in this same pass.
//
// Response shape matches tour-dates.mjs's `shows[]` exactly (id, artist,
// title, venue, city, date, dateLabel, source, priceLow, priceHigh, url) —
// so wiring this into the existing merge logic later needs no schema
// translation, same reasoning venue-shows.mjs's header comment gives for
// matching the same shape.
//
// *** NOT YET LIVE-VERIFIED — read before deploying or committing ***
// Everything in this file is built directly from JamBase's own published
// API reference (query parameters + the "Concert" response schema,
// screenshotted directly off data.jambase.com/api/reference by Susan,
// 2026-08-12) — not guessed. But two things specifically have NOT been
// confirmed against a real live response, because this session has no
// network path to data.jambase.com (sandboxed; same restriction documented
// elsewhere in this repo) and no device-bridge/browser access this pass:
//   1. The exact Authorization header format. JamBase's docs describe
//      "Bearer token (API key) in the Authorization header," which is what
//      this file sends (`Authorization: Bearer <key>`) — the standard
//      form, but not clicked-through and confirmed on the "Authentication"
//      doc page specifically.
//   2. The top-level response envelope — i.e. is the events array at
//      `body.events`, `body.data`, or something else, and what the
//      pagination object is actually called/shaped. The schema sidebar
//      listed a `Pagination` schema but its expanded fields weren't
//      captured. `parseEnvelope()` below tries a few plausible keys
//      defensively and reports `meta.envelope_key_used` so a real test
//      call makes this obvious immediately rather than silently returning
//      an empty list forever if the real key is something else.
// Before this goes anywhere near production: run one real request (once
// device-bridge/browser access is available), diff the real response
// against `scripts/test-jambase-shows.mjs`'s fixture, and fix whatever
// doesn't match — the fixture was built field-by-field from the schema
// screenshots, not from a live call, so treat it as a well-informed guess
// at shape, not ground truth.
//
// PURE READ. Never touches the Netlify Blobs "records"/"wishlist"/
// "watching" stores and never writes anything. Not gated by the edit
// secret — same rationale as tour-dates.mjs and venue-shows.mjs.
//
// Env vars expected:
//   JAMBASE_API_KEY — JamBase Data v3 API key from
//                     data.jambase.com/account/api-keys. Server-side only,
//                     set in Netlify's env var UI (never on a CLI, never
//                     committed) — same handling discipline as
//                     SEATGEEK_CLIENT_ID/DISCOGS_TOKEN. Required; without
//                     it this function returns a 500, same pattern
//                     tour-dates.mjs uses for a missing SEATGEEK_CLIENT_ID.

export const config = { path: "/api/jambase-shows" };

const JAMBASE_BASE = "https://data.jambase.com/v3";

// Same home location + default radius as tour-dates.mjs's HOME_LAT/HOME_LON/
// DEFAULT_RANGE ("60mi") — kept as separate constants here rather than a
// shared import, same one-small-file-per-endpoint convention this repo
// already uses for e.g. TRIBUTE_WORDS between tour-dates.mjs and
// venue-shows.mjs (see venue-shows.mjs's own comment on why).
const HOME_LAT = 37.8715;
const HOME_LON = -122.273;
const DEFAULT_RADIUS_MI = 60;

// Same tribute/cover-act blocklist as tour-dates.mjs and venue-shows.mjs.
// JamBase's catalog is broad enough to plausibly index a tribute act under
// a near-identical name to the real one — this is defense in depth even
// though the caller-side artistIsRelevant() exact-name filter (see design
// note above) is the primary protection once this is wired into
// concert-radar.html.
const TRIBUTE_WORDS = /\b(tribute|unauthorized|unauthorised|cover band|coverband|salute|as performed by|homage|allstars|the music of|a celebration of|celebrating the music)\b/i;

export function isTribute(text) {
  return TRIBUTE_WORDS.test(text || "");
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function dateLabelFromIso(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

// See the file-header "NOT YET LIVE-VERIFIED" note (point 2) — tries the
// most likely envelope shapes in order and reports which one actually hit,
// so a wrong guess is loud (empty shows + meta.envelope_key_used: null)
// rather than silent.
export function parseEnvelope(body) {
  if (Array.isArray(body)) return { events: body, envelopeKey: "(bare array)" };
  if (Array.isArray(body.events)) return { events: body.events, envelopeKey: "events" };
  if (Array.isArray(body.data)) return { events: body.data, envelopeKey: "data" };
  if (Array.isArray(body.results)) return { events: body.results, envelopeKey: "results" };
  return { events: [], envelopeKey: null };
}

// A Concert object's `performer` array (schema: MusicGroup[], required)
// carries per-event fields (x-isHeadliner, x-performanceRank) describing
// each performer's role in THIS event. Prefer the explicit headliner; fall
// back to the first-listed performer (schema doesn't guarantee rank order,
// but it's the best available signal without one).
export function primaryPerformerName(performers) {
  if (!Array.isArray(performers) || !performers.length) return null;
  const headliner = performers.find((p) => p && p["x-isHeadliner"] === true);
  const chosen = headliner || performers[0];
  return (chosen && chosen.name) || null;
}

// offers[] (schema: Offer[]) each carry their own priceSpecification and a
// `category` distinguishing primary/secondary ticket links — no live
// example of what `category` actually contains was captured, so this just
// takes the first offer with a usable url/price rather than filtering on
// `category`'s value. Revisit once a real response shows real category
// strings.
export function firstUsableOffer(offers) {
  if (!Array.isArray(offers)) return null;
  return offers.find((o) => o && (o.url || (o.priceSpecification && typeof o.priceSpecification.price === "number"))) || null;
}

export function addressCityState(address) {
  if (!address) return null;
  const city = address.addressLocality || null;
  // addressRegion is documented as an `object`, not a plain string — exact
  // sub-shape not confirmed live. Defensively try a couple of plausible
  // shapes rather than assume; falls back to city-only if none match.
  let region = null;
  if (address.addressRegion) {
    if (typeof address.addressRegion === "string") region = address.addressRegion;
    else region = address.addressRegion.name || address.addressRegion.identifier || null;
  }
  if (!city) return null;
  return region ? city + ", " + region : city;
}

export default async (req) => {
  if (req.method !== "GET") {
    return json({ error: "Method not allowed — jambase-shows is read-only" }, 405);
  }

  const apiKey = process.env.JAMBASE_API_KEY;
  if (!apiKey) {
    return json({ error: "JAMBASE_API_KEY is not set on the server" }, 500);
  }

  const url = new URL(req.url);
  const latParam = parseFloat(url.searchParams.get("lat"));
  const lonParam = parseFloat(url.searchParams.get("lon"));
  const hasLatLon = isFinite(latParam) && isFinite(lonParam);
  const lat = hasLatLon ? latParam : HOME_LAT;
  const lon = hasLatLon ? lonParam : HOME_LON;
  const radiusParam = parseFloat(url.searchParams.get("radius"));
  const radius = isFinite(radiusParam) && radiusParam > 0 ? radiusParam : DEFAULT_RADIUS_MI;
  const perPageParam = parseInt(url.searchParams.get("perPage"), 10);
  const perPage = Number.isInteger(perPageParam) && perPageParam > 0 ? Math.min(perPageParam, 200) : 100;

  const params = new URLSearchParams();
  params.set("geoLatitude", String(lat));
  params.set("geoLongitude", String(lon));
  params.set("geoRadiusAmount", String(radius));
  params.set("geoRadiusUnits", "miles");
  params.set("eventType", "concert"); // exclude festivals — different schema shape, out of scope for this pass
  params.set("perPage", String(perPage));
  params.set("sort", "eventDate"); // ascending, oldest first — documented default, set explicitly for clarity
  // eventDateFrom deliberately omitted — documented to default to "current
  // date" when blank, which is exactly what a forward-looking sweep wants.

  let body;
  let httpStatus;
  try {
    const res = await fetch(JAMBASE_BASE + "/events?" + params.toString(), {
      headers: {
        Authorization: "Bearer " + apiKey,
        Accept: "application/json",
      },
    });
    httpStatus = res.status;
    if (!res.ok) {
      let detail = "";
      try { detail = JSON.stringify(await res.json()); } catch (e) {}
      return json({ error: "JamBase returned HTTP " + res.status + (detail ? " — " + detail : "") }, 502);
    }
    body = await res.json();
  } catch (err) {
    return json({ error: "Could not reach JamBase: " + err.message }, 502);
  }

  const { events: rawEvents, envelopeKey } = parseEnvelope(body || {});

  const shows = rawEvents
    .filter((e) => e && e.eventStatus !== "cancelled")
    .filter((e) => !isTribute((e.name || "") + " " + (e["x-customTitle"] || "")))
    .map((e) => {
      const location = e.location || {};
      const offer = firstUsableOffer(e.offers);
      const priceSpec = offer && offer.priceSpecification;
      const isoDate = e.startDate ? String(e.startDate).slice(0, 10) : null;
      return {
        id: "jambase-" + (e.identifier || ""),
        artist: primaryPerformerName(e.performer) || null,
        title: e["x-customTitle"] || e.name || null,
        venue: location.name || null,
        city: addressCityState(location.address),
        date: isoDate,
        dateLabel: dateLabelFromIso(e.startDate),
        source: "JamBase",
        priceLow: priceSpec ? (typeof priceSpec.minPrice === "number" ? priceSpec.minPrice : (typeof priceSpec.price === "number" ? priceSpec.price : null)) : null,
        priceHigh: priceSpec ? (typeof priceSpec.maxPrice === "number" ? priceSpec.maxPrice : (typeof priceSpec.price === "number" ? priceSpec.price : null)) : null,
        url: (offer && offer.url) || e.url || null,
      };
    })
    // Drop anything with neither a real title nor a real artist name — a
    // parse-shape mismatch (see envelope note above) should surface as an
    // empty, honest list rather than a list full of null-artist cards, same
    // "no silent failures" lesson venue-shows.mjs's v2 already learned the
    // hard way (its 2026-08-04 v16.1 poisoned-cache incident).
    .filter((s) => s.title || s.artist);

  return json({
    shows,
    meta: {
      lat,
      lon,
      radius_mi: radius,
      per_page: perPage,
      http_status: httpStatus,
      envelope_key_used: envelopeKey,
      raw_event_count: rawEvents.length,
      returned_count: shows.length,
    },
  }, 200);
};

// TODO (not done in this pass — flagged, not guessed at):
//   1. Live-verify against a real request once device-bridge/browser access
//      is available (see file-header note). Fix parseEnvelope/
//      addressCityState/firstUsableOffer's field guesses against the real
//      response before this ever gets wired into concert-radar.html.
//   2. Once verified, wire into concert-radar.html's sweepCatalog() and
//      scheduled-sweep.mjs the same way venue-shows.mjs's output already
//      is: fetch in parallel with the existing two sources, run the
//      existing artistIsRelevant()/normalizeArtistKey() filter (v18.5)
//      against Susan's full catalog+wishlist+watching artist list before
//      merging into Coming Soon, and dedupe by id same as today.
//   3. Check JamBase's "Attribution" doc page (seen in the reference
//      sidebar, not yet opened) — the free tier likely requires visible
//      attribution when displaying their data publicly; add whatever's
//      required to concert-radar.html's footer/credit line, same spirit as
//      this repo's existing Deezer/YouTube "via {Provider}" credit pattern
//      in app.js's buildAudioBlock().
//   4. If `pagination`/`x-jamBaseMetroId`-style truncation ever matters at
//      Susan's actual Bay Area event volume, add real pagination — v1
//      deliberately fetches one page only (perPage capped at 200) and
//      reports raw_event_count/returned_count in meta so under-coverage is
//      visible rather than silently truncated, per this repo's "no silent
//      caps" discipline, but doesn't loop pages yet.

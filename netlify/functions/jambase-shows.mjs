// netlify/functions/jambase-shows.mjs
// version: 1 (draft, staged 2026-08-12 — see "NOT YET LIVE-VERIFIED" note
// below before this ships)
//
// v1 correction, same day: the base URL was originally guessed as
// "https://data.jambase.com/v3" from JamBase's prose docs. A real curl
// from Susan's own Terminal against that URL came back HTTP 200 but with
// content-type: text/html — the marketing site's own SSR catch-all route,
// not the API. Pulled the real OpenAPI spec directly from
// https://data.jambase.com/openapi.json (a static JSON file, unlike the
// JS-rendered reference pages — reachable via WebFetch) and confirmed the
// authoritative "servers" entry: "https://api.data.jambase.com/v3" (note
// the "api." subdomain). Fixed below. The same spec confirmed the other
// two open questions from the original note: auth is exactly
// `Authorization: Bearer <key>` (securitySchemes: type "http", scheme
// "bearer") and the response envelope is `{ success, pagination, events:
// [...], request }` — "events" was already parseEnvelope()'s first-tried
// key, so no parsing-logic change was needed there, just the URL.
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
// *** NOT YET LIVE-VERIFIED WITH REAL DATA — read before deploying ***
// The base URL, auth header format, and response envelope key are now all
// confirmed against JamBase's authoritative OpenAPI spec (see the v1
// correction note above) — no longer guesses. What's still NOT confirmed
// is the exact field-level content of a REAL event object: things like
// whether `addressRegion` really comes back as a plain string or a
// `{name: "CA"}`-shaped object in practice (the spec documents it as
// "object" but every worked example in the docs showed a bare string —
// `addressCityState()` below handles both defensively), whether `offers`
// is ever empty for a real free/TBA-priced show, and whether
// `performer[].x-isHeadliner` is reliably present or often missing. This
// session still has no network path to api.data.jambase.com to make that
// one real test call (this sandbox's outbound network is allowlisted to a
// small set of hosts and that isn't one of them — same restriction
// documented elsewhere in this repo). `scripts/test-jambase-shows.mjs`'s
// fixture was built field-by-field from the real OpenAPI schema, which is
// a much stronger basis than the original screenshot-based guess, but it's
// still not an actual captured response. Before this goes anywhere near
// production: run one real request — either from Susan's own Terminal
// (`curl https://api.data.jambase.com/v3/events?geoLatitude=37.8715&geoLongitude=-122.273&geoRadiusAmount=60&geoRadiusUnits=miles&eventType=concert&perPage=3&sort=eventDate -H "Authorization: Bearer <real key>"`)
// or once device-bridge/browser access is available — and diff the real
// response against the fixture, fixing whatever doesn't match.
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

const JAMBASE_BASE = "https://api.data.jambase.com/v3";

// Same home location + default radius as tour-dates.mjs's HOME_LAT/HOME_LON/
// DEFAULT_RANGE ("60mi") — kept as separate constants here rather than a
// shared import, same one-small-file-per-endpoint convention this repo
// already uses for e.g. TRIBUTE_WORDS between tour-dates.mjs and
// venue-shows.mjs (see venue-shows.mjs's own comment on why).
const HOME_LAT = 37.8715;
const HOME_LON = -122.273;

// LIVE-VERIFIED 2026-08-12: geoRadiusAmount is broken on this account's
// Developer-tier key — every value tried (60, 25, 10, 1) failed identically
// with "The geoRadiusAmount N miles is too high. Please use a max of  miles."
// (JamBase's own error message has a template bug — the actual max is never
// filled in). Confirmed this isn't a units/scale issue by testing multiple
// orders of magnitude. Worth reporting to JamBase support at some point, but
// not blocking: omitting geoRadiusAmount/geoRadiusUnits entirely and sending
// only geoLatitude/geoLongitude works and returns real, correctly-scoped
// results — every event in a real 3-result test sample was genuinely in the
// Bay Area (San Francisco, Sonoma), with `x-jamBaseMetroId: 4` shared across
// all of them, suggesting JamBase resolves a bare lat/lon to its containing
// metro area automatically when no radius is given. That's arguably a better
// fit for "Bay Area" scoping than an arbitrary mile radius anyway, so this
// isn't really a workaround — it's the actual code path now. DO NOT re-add
// geoRadiusAmount without re-testing; this may be an account-level bug that
// gets fixed later, but as of this date it always fails.
const MAX_PAGES = 25; // see fetchAllEvents()'s own comment for the reasoning

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
  // LIVE-VERIFIED 2026-08-12: real category values are "ticketingLinkPrimary"
  // / "ticketingLinkSecondary" (not the generic "primary"/"secondary" this
  // was originally guessed as). Prefer the explicit primary link; fall back
  // to the first offer with a usable url/price if no primary is flagged
  // (real responses so far always list primary first anyway, so this is
  // belt-and-suspenders, not a behavior change from before).
  const primary = offers.find((o) => o && o.category === "ticketingLinkPrimary" && o.url);
  if (primary) return primary;
  return offers.find((o) => o && (o.url || (o.priceSpecification && typeof o.priceSpecification.price === "number"))) || null;
}

export function addressCityState(address) {
  if (!address) return null;
  const city = address.addressLocality || null;
  // LIVE-VERIFIED 2026-08-12: a real response shows addressRegion as
  // {"@type":"State","alternateName":"CA","identifier":"US-CA","name":
  // "California"} — an object, confirmed. Prefer alternateName (the 2-letter
  // code, "CA") over the full name ("California") to match this repo's
  // existing "City, CA" convention (venue-shows.mjs, tour-dates.mjs) rather
  // than "City, California". String fallback kept for safety since it's
  // cheap and costs nothing if a future response ever sends a bare string.
  let region = null;
  if (address.addressRegion) {
    if (typeof address.addressRegion === "string") region = address.addressRegion;
    else region = address.addressRegion.alternateName || address.addressRegion.name || address.addressRegion.identifier || null;
  }
  if (!city) return null;
  return region ? city + ", " + region : city;
}

// Fetches every page of the metro-scoped event list, up to MAX_PAGES.
// LIVE-VERIFIED 2026-08-12: a real unfiltered Bay Area sweep returned
// `pagination.totalItems: 2038` across `totalPages: 680` at perPage=3 —
// i.e. a single page badly undercounts. At perPage=100 that's ~21 pages for
// a full sweep. MAX_PAGES=25 covers that with headroom and is still cheap
// against the free tier's budget (1,000 calls/month, 3,600/hr) IF this only
// runs from the weekly scheduled-sweep.mjs job, not on every live page
// visit — ~21 calls/week is ~84/month, comfortably inside budget. This is
// exactly why `allPages` defaults to false below: a live/interactive caller
// (if one is ever wired up) gets one fast page by default; only an explicit
// `?allPages=true` — which scheduled-sweep.mjs's future wiring should pass —
// pays the 21-call cost of a full sweep.
async function fetchAllEvents(apiKey, lat, lon, perPage, allPages) {
  const events = [];
  let page = 1;
  let totalPages = 1;
  let httpStatus = null;
  let envelopeKey = null;

  while (page <= totalPages && page <= MAX_PAGES) {
    const params = new URLSearchParams();
    params.set("geoLatitude", String(lat));
    params.set("geoLongitude", String(lon));
    // geoRadiusAmount/geoRadiusUnits deliberately omitted — see the
    // MAX_PAGES/geoRadiusAmount comment above this function for why.
    params.set("eventType", "concert"); // exclude festivals — different schema shape, out of scope for this pass
    params.set("perPage", String(perPage));
    params.set("sort", "eventDate"); // ascending, oldest first — documented default, set explicitly for clarity
    params.set("page", String(page));
    // eventDateFrom deliberately omitted — documented to default to "current
    // date" when blank, which is exactly what a forward-looking sweep wants.

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
      throw new Error("JamBase returned HTTP " + res.status + (detail ? " — " + detail : "") + " on page " + page);
    }
    const body = await res.json();
    const parsed = parseEnvelope(body || {});
    envelopeKey = parsed.envelopeKey;
    events.push.apply(events, parsed.events);

    if (!allPages) break; // fast path: caller only wants page 1
    if (body && body.pagination && typeof body.pagination.totalPages === "number") {
      totalPages = body.pagination.totalPages;
    } else {
      break; // no pagination info in the response — stop rather than loop forever
    }
    page++;
  }

  return { events, pagesFetched: page > totalPages ? totalPages : Math.min(page, MAX_PAGES), totalPages, httpStatus, envelopeKey };
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
  const perPageParam = parseInt(url.searchParams.get("perPage"), 10);
  const perPage = Number.isInteger(perPageParam) && perPageParam > 0 ? Math.min(perPageParam, 100) : 100;
  const allPages = url.searchParams.get("allPages") === "true" || url.searchParams.get("allPages") === "1";

  let rawEvents, envelopeKey, httpStatus, pagesFetched, totalPages;
  try {
    const result = await fetchAllEvents(apiKey, lat, lon, perPage, allPages);
    rawEvents = result.events;
    envelopeKey = result.envelopeKey;
    httpStatus = result.httpStatus;
    pagesFetched = result.pagesFetched;
    totalPages = result.totalPages;
  } catch (err) {
    return json({ error: "Could not reach JamBase: " + err.message }, 502);
  }

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
      per_page: perPage,
      all_pages: allPages,
      pages_fetched: pagesFetched,
      total_pages: totalPages,
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

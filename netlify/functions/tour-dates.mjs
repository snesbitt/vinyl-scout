// netlify/functions/tour-dates.mjs
// version: 1
// Phase 11 — Concert Radar real feed test (SeatGeek first; Ticketmaster later,
// per Susan's 2026-08-03 call to start with SeatGeek since Ticketmaster's own
// developer signup was slow).
//
// PURE READ. This function queries the SeatGeek Platform API and returns
// upcoming events near a hardcoded home location, optionally scoped to one
// artist. It NEVER touches the Netlify Blobs "records"/"wishlist" stores and
// NEVER writes anything.
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
//   SEATGEEK_CLIENT_ID      — SeatGeek Platform API client_id (required)
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

  const search = new URLSearchParams();
  search.set("client_id", clientId);
  if (clientSecret) search.set("client_secret", clientSecret);
  // Free-text `q` search across performer/venue/title — avoids having to
  // guess SeatGeek's internal performer slug (e.g. "The Rolling Stones" is
  // slugged "rolling-stones", not "the-rolling-stones"). All SeatGeek
  // arguments combine, so q + lat/lon + range narrows to "this artist, near
  // Berkeley" in one call.
  search.set("q", artist);
  search.set("lat", String(HOME_LAT));
  search.set("lon", String(HOME_LON));
  search.set("range", range);
  search.set("sort", "datetime_utc.asc");
  search.set("per_page", "10");

  const seatGeekUrl = "https://api.seatgeek.com/2/events?" + search.toString();

  let data;
  try {
    const res = await fetch(seatGeekUrl);
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json()).message || ""; } catch (e) {}
      const err = new Error("SeatGeek returned HTTP " + res.status + (detail ? " — " + detail : ""));
      err.upstream = true;
      throw err;
    }
    data = await res.json();
  } catch (err) {
    if (err.upstream) return json({ error: err.message }, 502);
    return json({ error: "Could not reach SeatGeek: " + err.message }, 502);
  }

  const events = Array.isArray(data.events) ? data.events : [];

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

  return json({ shows, meta: { query: artist, lat: HOME_LAT, lon: HOME_LON, range } }, 200);
};

// netlify/functions/venue-shows.mjs
// version: 1
// Phase 12 — Venue-based coverage, added 2026-08-04 alongside Concert Radar's
// manual-add fallback. tour-dates.mjs sweeps SeatGeek/Ticketmaster by ARTIST
// name — this function instead scrapes a hand-picked list of Bay Area venues
// Susan actually goes to, directly from each venue's own public event page.
// It's the other half of closing the gap the 2026-08-04 CLAUDE.md note
// described: SeatGeek has zero events for real box-office-only shows like
// Black Uhuru's. This function is what actually catches those.
//
// Concretely validated during this feature's own build (2026-08-04): this
// scrape found a SECOND, previously-unknown Black Uhuru date — Sep 13, 2026
// at Sweetwater Music Hall, Mill Valley — distinct from the Freight &
// Salvage date already logged. Neither SeatGeek nor Ticketmaster surfaces
// either one. That's the concrete proof this approach earns its keep.
//
// PURE READ. Fetches each configured venue's own public event-listing page
// via a plain server-side GET (same request a browser's first page load
// makes) and parses whatever HTML that response already contains — no
// JavaScript execution happens here, Netlify Functions don't have a DOM.
// Never touches Netlify Blobs, never writes anything.
//
// IMPORTANT — every venue below was individually verified on 2026-08-04 by
// fetching the live page and confirming a known real show's name was
// present in the RAW response text (not just visible in a rendered
// browser). Two of the venues Susan asked to include — Ashkenaz and The
// New Parish — were tested and FAILED that check: both render their show
// calendars via client-side JS/AJAX widgets, so a plain server-side fetch
// sees an empty shell with no show data at all. They are deliberately left
// OUT of VENUES below rather than silently returning nothing for them —
// see the EXCLUDED_VENUES note at the bottom of this file. Before adding
// any new venue, verify the same way: fetch the live URL with no JS engine
// involved and confirm a real, current show name is actually in the
// response text.
//
// Five distinct site platforms are scraped here, each with its own parser:
//   - Cornerstone (Berkeley): clean schema.org Event JSON-LD. Most robust.
//   - Another Planet Entertainment's own listing page: schema.org microdata
//     embedded in WordPress markup. ONE fetch covers SIX venues at once —
//     Fox Theater (Oakland), Greek Theatre (Berkeley), Bill Graham Civic
//     Auditorium (SF), The Castro (SF), Bimbo's 365 Club (SF), and The
//     Independent (SF) — since APE promotes all of them through one site.
//     Only the first results page is fetched (roughly the next 1-2 weeks of
//     shows) — see the note in parseApe() before assuming this is
//     exhaustive.
//   - Freight & Salvage (Berkeley): WordPress theme markup, no JSON-LD.
//   - Sweetwater Music Hall (Mill Valley): the "RHP Events Calendar"
//     WordPress plugin's markup.
//   - Great American Music Hall (SF) and The Chapel (SF): both run the
//     SAME "See Tickets" embedded calendar widget — one parser, two
//     venues, verified via matching HTML structure.
//   - UC Theatre (Berkeley): a Webflow site built on the Opendate venue
//     platform; class names are Webflow's auto-generated ones (fragile —
//     will break silently if UC Theatre ever redesigns via Webflow's
//     visual editor, since nothing about those class names is semantic).
//
// Every parser is wrapped in try/catch so one venue's markup changing
// doesn't take down the others — a per-venue failure shows up in
// meta.venues[].error instead of silently vanishing from the results,
// per this project's "no silent failures" rule. A stale/failing venue
// here won't throw an error page at Susan; it'll just quietly return
// fewer shows and log why in meta — check meta if the numbers look low.
//
// Not gated by the edit secret: same rationale as tour-dates.mjs — pure
// read of public event data, no catalog/wishlist exposure, no writes.
//
// Env vars: none required.

export const config = { path: "/api/venue-shows" };

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

// Same tribute/cover-act blocklist as tour-dates.mjs (kept as a literal
// copy rather than a shared module — two small files felt easier to keep
// correct than one shared import for a project this size). If this list
// changes in one file, change it in the other too.
var TRIBUTE_WORDS = /\b(tribute|unauthorized|unauthorised|cover band|coverband|salute|as performed by|homage|allstars|the music of|a celebration of|celebrating the music)\b/i;

function isTribute(text) {
  return TRIBUTE_WORDS.test(text || "");
}

// Several venues' titles arrive HTML-entity-encoded (WordPress themes are
// the usual culprit) — Sweetwater's were even DOUBLE-encoded
// ("&amp;#8211;" instead of "&#8211;"), verified live 2026-08-04, hence
// running both decode passes twice.
var ENTITY_MAP = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
function decodeEntitiesOnce(s) {
  return (s || "")
    .replace(/&#(\d+);/g, function (_, code) { return String.fromCharCode(parseInt(code, 10)); })
    .replace(/&#x([0-9a-f]+);/gi, function (_, hex) { return String.fromCharCode(parseInt(hex, 16)); })
    .replace(/&(amp|quot|apos|lt|gt|nbsp);/g, function (_, name) { return ENTITY_MAP[name]; });
}
function decodeEntities(s) {
  return decodeEntitiesOnce(decodeEntitiesOnce(s));
}

function stripOrdinal(s) {
  return (s || "").replace(/(\d+)(st|nd|rd|th)\b/i, "$1");
}

// Best-effort "text -> ISO yyyy-mm-dd" using JS's own Date parser, which
// handles most of the human-readable formats these sites use ("Jul 09,
// 2026", "Thursday, Sep 10th 2026" once the ordinal suffix is stripped,
// full ISO strings, etc). Returns null rather than throwing on anything it
// can't parse — a show with an unparseable date is dropped rather than
// shown with a wrong one.
function toIsoDate(s) {
  if (!s) return null;
  var cleaned = stripOrdinal(s);
  // Only the calendar date matters here — strip any trailing time-of-day
  // BEFORE parsing. Keeping a time like "7:00pm" in the string and letting
  // Date/toISOString round-trip it through UTC can land on the WRONG
  // calendar day for an evening show (verified live against Another
  // Planet Entertainment's own date format, 2026-08-04: "August 5, 2026
  // 7:00pm" parsed as local time and re-read in UTC came back as Aug 6).
  // A bare "Month Day, Year" string carries no such risk.
  cleaned = cleaned.replace(/\s+\d{1,2}:\d{2}\s*(am|pm)?\s*$/i, "");
  var d = new Date(cleaned);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

var MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// For sites that print a date with no year (e.g. UC Theatre's "Aug" / "28"
// split across two elements): assume the current year, unless that would
// land more than a week in the past, in which case assume next year. A
// venue calendar only ever lists upcoming shows, so a "past" date almost
// always means the year rolled over.
function inferDateNoYear(monthAbbr, day) {
  var m = MONTHS[(monthAbbr || "").toLowerCase().slice(0, 3)];
  var dayNum = parseInt(day, 10);
  if (m == null || !dayNum) return null;
  var now = new Date();
  var y = now.getUTCFullYear();
  var d = new Date(Date.UTC(y, m, dayNum));
  var cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (d < cutoff) d = new Date(Date.UTC(y + 1, m, dayNum));
  return d.toISOString().slice(0, 10);
}

function dateLabelFromIso(iso) {
  if (!iso) return null;
  var d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

async function fetchText(url) {
  var res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; VinylScoutConcertRadar/1.0)" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.text();
}

// --- Parser 1: Cornerstone (Berkeley) — schema.org Event JSON-LD --------
function parseCornerstone(html) {
  var out = [];
  var re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  var m;
  while ((m = re.exec(html))) {
    var block;
    try { block = JSON.parse(m[1]); } catch (e) { continue; }
    var items = Array.isArray(block) ? block : (block["@graph"] || [block]);
    items.forEach(function (it) {
      if (!it || it["@type"] !== "Event") return;
      var loc = it.location || {};
      var offers = Array.isArray(it.offers) ? it.offers[0] : it.offers;
      out.push({
        title: it.name || null,
        date: toIsoDate(it.startDate),
        venue: loc.name || "Cornerstone",
        city: "Berkeley, CA",
        url: (offers && offers.url) || it.url || null,
      });
    });
  }
  return out;
}

// --- Parser 2: Another Planet Entertainment listing — covers 6 venues ---
// APE's own listing page also includes venues they merely co-promote at
// (Levi's Stadium, Golden Gate Park festivals, Channel 24 in Sacramento,
// The Bellwether in LA, Rickshaw Stop...) — only the six venues APE
// actually operates/exclusively promotes in the Bay Area are kept here.
var APE_BAY_AREA_VENUES = ["fox theater", "greek theatre", "bill graham civic auditorium", "the castro", "bimbo's 365 club", "the independent"];

function parseApe(html) {
  var out = [];
  var re = /<div class="date-show" itemprop="startDate" content="([^"]+)">[\s\S]{0,400}?<a title="[^"]*" aria-label="[^"]*" href="(https:\/\/apeconcerts\.com\/events\/[^"]+)">[\s\S]{0,50}?(?:<h4 class="topline">([^<]*)<\/h4>)?[\s\S]{0,300}?<h2 class="show-title" itemprop="name">([^<]+)<\/h2>(?:[\s\S]{0,200}?<h3 class="support">([\s\S]{0,200}?)<\/h3>)?[\s\S]{0,600}?<span class="venue-location-name" itemprop="name">([^<]+)<\/span>[\s\S]{0,200}?<span id="city" itemprop="addressLocality">([^<]+)<\/span>/g;
  var m;
  while ((m = re.exec(html))) {
    var venue = (m[6] || "").trim();
    if (APE_BAY_AREA_VENUES.indexOf(venue.toLowerCase()) === -1) continue;
    var artist = (m[4] || "").trim();
    var tour = (m[3] || "").trim();
    var support = (m[5] || "").replace(/<br\s*\/?>/gi, ", ").trim();
    var title = tour || artist;
    out.push({
      title: title,
      artist: artist,
      support: support || null,
      date: toIsoDate(m[1]),
      venue: venue,
      city: (m[7] || "").replace(/,$/, "").trim() + ", CA",
      url: m[2],
    });
  }
  return out;
}

// --- Parser 3: Freight & Salvage (Berkeley) — WP theme markup -----------
function parseFreight(html) {
  var out = [];
  var re = /<h2 class="event-name"><a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a><\/h2>[\s\S]{0,300}?<span class="dates">([^<]+)<\/span>/g;
  var m;
  while ((m = re.exec(html))) {
    out.push({
      title: (m[2] || "").trim(),
      date: toIsoDate(m[3]),
      venue: "Freight & Salvage",
      city: "Berkeley, CA",
      url: m[1],
    });
  }
  return out;
}

// --- Parser 4: Sweetwater Music Hall (Mill Valley) — RHP Events plugin --
function parseSweetwater(html) {
  var out = [];
  var re = /<div id="eventDate"[^>]*>\s*([^<]+)<\/div>[\s\S]{0,2000}?<a id\s*=\s*"eventTitle" class="url" href="([^"]+)" title="([^"]+)" rel="bookmark">/g;
  var m;
  while ((m = re.exec(html))) {
    out.push({
      title: (m[3] || "").trim(),
      date: toIsoDate(m[1]),
      venue: "Sweetwater Music Hall",
      city: "Mill Valley, CA",
      url: m[2],
    });
  }
  return out;
}

// --- Parser 5: Great American Music Hall + The Chapel — See Tickets -----
// Both venues embed the identical "seetickets-calendar" widget (confirmed
// by matching HTML class names on both sites, 2026-08-04) — one parser,
// venue name passed in per call. The widget prints one
// "<month> <year>" header per calendar-month table, then a grid of <td>
// cells each holding a bare day number and zero or more event blocks — so
// this walks the HTML in document order, tracking "current month/year"
// as it crosses each header, and "current day" as it crosses each
// date-number cell.
function parseSeeTickets(html, venueName, city) {
  var out = [];
  var monthRe = /<span class="bold">([A-Za-z]+)<\/span>\s*(\d{4})/g;
  var months = [];
  var mm;
  while ((mm = monthRe.exec(html))) {
    months.push({ index: mm.index, month: mm[1], year: mm[2] });
  }
  if (!months.length) return out;

  var cellRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
  var cm;
  var monthPtr = 0;
  while ((cm = cellRe.exec(html))) {
    while (monthPtr + 1 < months.length && months[monthPtr + 1].index < cm.index) monthPtr++;
    var cur = months[monthPtr];
    if (cur.index > cm.index) continue; // cell appeared before any month header — skip
    var cell = cm[1];
    var dayMatch = cell.match(/date-number">(\d+)</);
    if (!dayMatch) continue;
    var isoDay = toIsoDate(cur.month + " " + dayMatch[1] + ", " + cur.year);
    // The wrapping class differs by venue — Great American Music Hall uses
    // "event-title seetickets-calendar-event-title", The Chapel uses
    // "title seetickets-calendar-event-title" (verified live, 2026-08-04)
    // — so match on the shared "seetickets-calendar-event-title" class
    // alone rather than the exact full class string.
    var evRe = /<div class="[^"]*seetickets-calendar-event-title[^"]*">\s*<p[^>]*>\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
    var em;
    while ((em = evRe.exec(cell))) {
      out.push({
        title: (em[2] || "").trim(),
        date: isoDay,
        venue: venueName,
        city: city,
        url: em[1],
      });
    }
  }
  return out;
}

// --- Parser 6: UC Theatre (Berkeley) — Webflow/Opendate template --------
function parseUcTheatre(html) {
  var out = [];
  var re = /<h1 class="heading-2">([A-Za-z]+)<\/h1><h1 class="heading-3">(\d+)<\/h1>[\s\S]{0,1500}?<h1 class="heading-9 name-listing">([^<]+)<\/h1>/g;
  var m;
  while ((m = re.exec(html))) {
    out.push({
      title: (m[3] || "").trim(),
      date: inferDateNoYear(m[1], m[2]),
      venue: "The UC Theatre",
      city: "Berkeley, CA",
      // UC Theatre's ticket links sit in a separate <a> a little further
      // up the same card than this regex captures cleanly — link to the
      // venue's own events page rather than guess at a fragile match.
      url: "https://www.theuctheatre.org/events",
    });
  }
  return out;
}

var VENUES = [
  { key: "cornerstone", label: "Cornerstone", url: "https://cornerstoneberkeley.com/events", parse: parseCornerstone },
  { key: "ape", label: "Another Planet Entertainment (Fox, Greek, Bill Graham Civic, Castro, Bimbo's, Independent)", url: "https://apeconcerts.com/event-listing/", parse: parseApe },
  { key: "freight", label: "Freight & Salvage", url: "https://thefreight.org/shows/", parse: parseFreight },
  { key: "sweetwater", label: "Sweetwater Music Hall", url: "https://sweetwatermusichall.org/events/", parse: parseSweetwater },
  { key: "gamh", label: "Great American Music Hall", url: "https://gamh.com/calendar/", parse: function (html) { return parseSeeTickets(html, "Great American Music Hall", "San Francisco, CA"); } },
  { key: "chapel", label: "The Chapel", url: "https://thechapelsf.com/calendar/", parse: function (html) { return parseSeeTickets(html, "The Chapel", "San Francisco, CA"); } },
  { key: "uctheatre", label: "The UC Theatre", url: "https://www.theuctheatre.org/events", parse: parseUcTheatre },
];

// EXCLUDED_VENUES — Susan asked for these too, but as of 2026-08-04 neither
// can be scraped by a plain server-side fetch: both render their show
// calendars via client-side JS/AJAX after the initial page load, so the
// raw HTML response (all a Netlify function ever sees) contains no show
// data at all. Confirmed by fetching each live URL and checking a real,
// currently-listed show's name against the raw response text — absent in
// both cases even though the same show is clearly visible in a browser.
//   - Ashkenaz (Berkeley) — ashkenaz.com/full-calendar
//   - The New Parish (Oakland) — thenewparish.com/calendar/ (an empty
//     lazy-loaded iframe with no src in the initial HTML)
// Left out rather than silently returning zero shows for them. Revisiting
// either would mean finding the actual JSON/XHR endpoint each site's
// widget calls client-side (worth a follow-up look at each site's network
// requests in a real browser) rather than scraping the page shell.

export default async (req) => {
  if (req.method !== "GET") {
    return json({ error: "Method not allowed — venue-shows is read-only" }, 405);
  }

  var results = await Promise.all(
    VENUES.map(async function (v) {
      try {
        var html = await fetchText(v.url);
        var todayIso = new Date().toISOString().slice(0, 10);
        var shows = v.parse(html) || [];
        shows = shows
          .map(function (s) { return Object.assign({}, s, { title: decodeEntities(s.title), artist: s.artist ? decodeEntities(s.artist) : s.artist }); })
          .filter(function (s) { return s.date && s.date >= todayIso && s.title && !isTribute(s.title) && !isTribute(s.artist || ""); });
        shows.forEach(function (s) { s.dateLabel = dateLabelFromIso(s.date); });
        return { key: v.key, label: v.label, sourceUrl: v.url, count: shows.length, error: null, shows: shows };
      } catch (err) {
        return { key: v.key, label: v.label, sourceUrl: v.url, count: 0, error: String(err && err.message || err), shows: [] };
      }
    })
  );

  var allShows = [];
  results.forEach(function (r) {
    r.shows.forEach(function (s, i) {
      allShows.push({
        id: "venue-" + r.key + "-" + i + "-" + (s.date || "unknown"),
        artist: s.artist || null,
        title: s.title,
        venue: s.venue,
        city: s.city,
        date: s.date,
        dateLabel: s.dateLabel,
        source: "Venue: " + r.label.split(" (")[0],
        priceLow: null,
        priceHigh: null,
        url: s.url,
      });
    });
  });

  allShows.sort(function (a, b) { return (a.date || "").localeCompare(b.date || ""); });

  return json({
    shows: allShows,
    meta: {
      venues: results.map(function (r) { return { key: r.key, label: r.label, sourceUrl: r.sourceUrl, count: r.count, error: r.error }; }),
      excluded: [
        { key: "ashkenaz", label: "Ashkenaz", reason: "calendar renders via client-side JS; no show data in raw HTML" },
        { key: "newparish", label: "The New Parish", reason: "calendar loads via a lazy iframe with no data in raw HTML" },
      ],
    },
  }, 200);
};

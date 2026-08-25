#!/usr/bin/env node
// scripts/concert-radar-health-check.mjs
// version: 1
//
// GitHub Actions-native replacement for the "Vinyl Scout — Concert Radar
// feed health check" Claude scheduled task, following the exact migration
// pattern already proven by scripts/backup-catalog.mjs (2026-08-09) and
// scripts/scheduled-sweep.mjs (2026-08-14) — see
// claude/weekend-netlify-github-cost-plan-2026-08-08.md (in the "Travel
// Intelligence Agent" Claude project) for the original rationale for
// moving weekly jobs off things that need a human's device online.
//
// WHY THIS EXISTS: the Claude scheduled task version of this check was
// confirmed broken three consecutive weeks running (2026-08-10, 08-13,
// 08-17 — see claude/concert-radar-health-check-*.md in the "Personal
// Vinyl Collection" Claude project) — not intermittently, categorically.
// A cloud-fired Claude scheduled task never has a connected desktop, so it
// can never reach Claude-in-Chrome or the device bridge, which both the
// live-data reads (steps 1/2/2.5 of that task) AND any repair commit
// (step 3) depended on. GitHub Actions runners have real, unrestricted
// outbound network access and, via the workflow's own built-in
// GITHUB_TOKEN, real (scoped) write access to this repo — neither
// depends on any human's computer being on. This script is the whole
// check-and-repair job, ported to run there instead.
//
// WHAT THIS SCRIPT DOES (mirrors the old task's steps 1, 2, 2.5, 3a, 3b):
//   1. Fetches the live /api/venue-shows and inspects meta.venues[] for
//      each of the 7 scraped venue entries. A non-null `error` is then
//      CLASSIFIED (see classifyVenueFailure): an `HTTP <status>` or a
//      transport error means the request never returned a page, which is
//      not a parser fault and is reported without any repair attempt or
//      proposed change; anything else is a parser fault and goes to the
//      repair path below. count:0 with no error is flagged as
//      a warning (ambiguous — could be a genuinely quiet week) but is NOT
//      auto-repaired, since guessing at a fix for something that hasn't
//      actually failed risks breaking a parser that still works.
//   2. Checks the Black Uhuru / Sweetwater Music Hall canary specifically
//      via its "Venue: Sweetwater Music Hall" SOURCED entry (not the
//      MANUAL_SHOWS fallback entry of the same show, which would mask a
//      real parser failure) — this is the exact real bug
//      netlify/functions/venue-shows.mjs's own v3 changelog entry flags as
//      still open and asks this check to look into.
//   3. Spot-checks GET /api/tour-dates?artist=Fleetwood%20Mac (SeatGeek
//      side) for a non-500 response.
//   4. (2.5) Fetches /api/catalog-cache and checks its `at` timestamp is
//      no more than ~9 days old — confirms scheduled-sweep.mjs's Netlify
//      Scheduled Function is actually firing weekly.
//   5. (3a) For any venue with a real error: fetches that venue's live
//      page fresh, sends the current parser function's source + the fresh
//      HTML to the Claude API asking for a corrected parser, splices the
//      response in, runs `node --check`, and functionally verifies the
//      patched parser against the SAME freshly-fetched HTML (extracts
//      shows, requires at least one, requires every extracted show to
//      have a non-empty title and a real future date). Only a
//      high-confidence, functionally-verified patch is kept.
//   6. (3b) If the patch can't be generated or doesn't verify, the venue
//      is disabled instead — its `parse` function is replaced with one
//      that throws a clear diagnostic error immediately, so the failure
//      shows up loudly in meta.venues[].error (per this repo's "no silent
//      failures" rule) instead of quietly returning 0 shows forever.
//   7. Either way, bumps venue-shows.mjs's `// version: N` changelog and
//      appends a dated section to CLAUDE.md, describing exactly what
//      changed and why (same discipline every other functional change in
//      this repo follows).
//   8. Writes GITHUB_OUTPUT values so the workflow file can open a PR
//      (never push straight to main) when anything changed — code changes
//      here are a different risk class than the pure-data writes
//      backup-catalog.mjs/scheduled-sweep.mjs do straight to main; this
//      follows the "hybrid gating convention" scheduled-sweep.yml's own
//      comment already calls for but nothing in this repo had actually
//      implemented yet.
//
// HONEST LIMITATION: the patch-verification step here confirms a parser
// extracts SOMETHING plausible from the CURRENT live HTML — it cannot
// confirm the extracted show titles/dates are semantically correct the
// way a human spot-checking against the venue's own page can. Treat an
// auto-repair PR as "ready for a 60-second human sanity check," not
// "guaranteed correct" — same spirit as this repo's other best-effort,
// flagged-not-claimed-certain fixes (see CLAUDE.md's 2026-08-04 mobile
// copyright note for precedent on that phrasing).
//
// Secrets needed (set in GitHub repo Settings → Secrets and variables →
// Actions): ANTHROPIC_API_KEY, used ONLY to request a parser patch when a
// venue is genuinely broken — never sent any data beyond the one broken
// venue's own public HTML and its own existing (already-public, already
// in this repo) parser source. No other new secrets. GITHUB_TOKEN is the
// workflow's own built-in token, same as every other Actions-native
// script in this repo.
//
// Fails loudly (non-zero exit) when something is broken that this script
// could NOT resolve on its own (a venue got disabled, catalog-cache is
// stale, or the SeatGeek spot-check failed) — so it shows up red in the
// Actions tab. A clean bill of health, OR a fully-verified auto-repair
// that's ready as a PR, both exit 0 — the PR itself (or the job summary)
// is the visible signal in those cases, not a red X.

import { readFile, writeFile, appendFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SITE_URL = (process.env.SITE_URL || 'https://vinylscout.org').replace(/\/$/, '');
const VENUE_FILE = 'netlify/functions/venue-shows.mjs';
const CLAUDE_MD = 'CLAUDE.md';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-5-20251101';
const CATALOG_CACHE_MAX_AGE_DAYS = 9;
const CANARY = { venueLabel: 'Sweetwater Music Hall', artist: 'Black Uhuru', expectedDate: '2026-09-13' };
const SPOT_CHECK_ARTIST = 'Fleetwood Mac';

// Venue key -> the actual function name that produces its results. gamh
// and chapel deliberately share parseSeeTickets (verified-identical widget,
// see venue-shows.mjs's own comment) — repairing either one means patching
// the SAME shared function, so both must be re-verified together whenever
// either is touched, or a "fix" for one could quietly regress the other.
const VENUE_FUNCTION = {
  cornerstone: 'parseCornerstone',
  ape: 'parseApe',
  freight: 'parseFreight',
  sweetwater: 'parseSweetwater',
  gamh: 'parseSeeTickets',
  chapel: 'parseSeeTickets',
  uctheatre: 'parseUcTheatre',
};

const today = () => new Date().toISOString().slice(0, 10);

function log(...args) {
  console.log('[concert-radar-health-check]', ...args);
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VinylScoutHealthCheck/1.0)' } });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch (e) { /* leave null, caller checks res.ok */ }
  return { ok: res.ok, status: res.status, body, raw: text };
}

// --- Step 1/2: venue-shows meta + canary ------------------------------

// Not every non-null `error` in meta.venues[] is a parser fault, and treating
// them alike is how this script produced a confidently wrong diagnosis two
// weeks running (2026-08-19 and 08-24, branches concert-radar-autofix/1 and
// /2, both proposing to disable Freight & Salvage for "HTML structure
// changed").
//
// venue-shows.mjs's fetchText() throws exactly `HTTP <status>` when a request
// comes back non-2xx, and lets fetch()'s own transport errors through
// untouched. In both cases NO HTML EVER ARRIVED, so there is nothing a parser
// could have got wrong and nothing an LLM can repair by looking at markup it
// does not have. Freight & Salvage is the live example: verified 2026-08-25,
// it returns HTTP 403 to the function while thefreight.org/shows/ loads fine
// in a browser with shows listed. The venue is up, its markup is fine, and its
// server is refusing this caller.
//
// A parser fault, by contrast, is any error thrown from inside a parse
// function after HTML did arrive, and those are what the repair path exists
// for.
//
// The `HTTP \d{3}` test is anchored deliberately. fetchText() throws that
// exact string and nothing else, while a parser could legitimately mention
// "HTTP" inside a longer message, so an unanchored match would misfile real
// parser faults as unreachable and quietly stop repairing them.
function classifyVenueFailure(error) {
  const msg = String(error == null ? '' : error);
  if (/^HTTP \d{3}$/.test(msg.trim())) return 'unreachable';
  if (/\b(fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|ETIMEDOUT|socket hang up|network|aborted|certificate|TLS|SSL)\b/i.test(msg)) {
    return 'unreachable';
  }
  return 'parser';
}

async function checkVenueShows() {
  const { ok, status, body } = await fetchJson(SITE_URL + '/api/venue-shows');
  if (!ok || !body || !Array.isArray(body.meta?.venues)) {
    throw new Error('GET /api/venue-shows unusable (HTTP ' + status + ', ' + (body ? 'malformed body' : 'no JSON body') + ') — cannot proceed with venue diagnosis this run');
  }

  const failed = body.meta.venues.filter((v) => v.error);
  const unreachable = failed.filter((v) => classifyVenueFailure(v.error) === 'unreachable');
  const broken = failed.filter((v) => classifyVenueFailure(v.error) === 'parser');
  const suspicious = body.meta.venues.filter((v) => !v.error && v.count === 0);

  const canaryShow = (body.shows || []).find(
    (s) => s.venue === CANARY.venueLabel &&
      (s.artist || '').toLowerCase().includes(CANARY.artist.toLowerCase()) &&
      typeof s.source === 'string' && s.source.startsWith('Venue: ')
  );
  const canaryOk = !!canaryShow && canaryShow.date === CANARY.expectedDate;

  return { allVenues: body.meta.venues, broken, unreachable, suspicious, canaryOk, canaryShow: canaryShow || null };
}

// --- Step 3: SeatGeek spot check ---------------------------------------

async function checkSeatGeekSpotCheck() {
  const url = SITE_URL + '/api/tour-dates?artist=' + encodeURIComponent(SPOT_CHECK_ARTIST);
  const { ok, status } = await fetchJson(url);
  return { ok, status };
}

// --- Step 2.5: catalog-cache freshness ----------------------------------

async function checkCatalogCacheFreshness() {
  const { ok, status, body } = await fetchJson(SITE_URL + '/api/catalog-cache');
  if (!ok || !body) return { ok: false, status, at: null, ageDays: null };
  const at = body.at || null;
  if (!at) return { ok: false, status, at: null, ageDays: null };
  const ageMs = Date.now() - new Date(at).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return { ok: ageDays <= CATALOG_CACHE_MAX_AGE_DAYS, status, at, ageDays };
}

// --- Function extraction / splicing on venue-shows.mjs ------------------

function extractFunction(source, fnName) {
  const startRe = new RegExp('^(async function|function) ' + fnName + '\\(', 'm');
  const startMatch = startRe.exec(source);
  if (!startMatch) throw new Error('extractFunction: could not find start of ' + fnName);
  const startIdx = startMatch.index;
  const openBraceIdx = source.indexOf('{', startIdx);
  if (openBraceIdx === -1) throw new Error('extractFunction: no opening brace for ' + fnName);

  // Walk braces from the opening one to find this function's real end —
  // more robust than "next bare-} line", since parseApe's own giant regex
  // literal contains many same-line {…} pairs but no bare-brace LINES
  // before the real end either way; walking depth handles both safely.
  let depth = 0;
  let i = openBraceIdx;
  for (; i < source.length; i++) {
    const c = source[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error('extractFunction: unbalanced braces for ' + fnName);
  const endIdx = i + 1;
  return { start: startIdx, end: endIdx, code: source.slice(startIdx, endIdx) };
}

function replaceFunction(source, fnName, newCode) {
  const loc = extractFunction(source, fnName);
  return source.slice(0, loc.start) + newCode.trim() + source.slice(loc.end);
}

// Shared helpers every parser depends on (toIsoDate, decodeEntities, etc).
// Extracted from the live file rather than hand-copied, so this stays in
// sync automatically if the helpers themselves ever change.
function extractHelperBlock(source) {
  const startMarker = 'var TRIBUTE_WORDS';
  const endMarker = '// --- Parser 1:';
  const startIdx = source.indexOf(startMarker);
  const endIdx = source.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error('extractHelperBlock: could not locate helper block markers — file structure changed more than expected');
  }
  return source.slice(startIdx, endIdx);
}

function disableVenueLine(source, key, reason) {
  const lineRe = new RegExp('^(\\s*\\{ key: "' + key + '".*?parse: )(.*)(\\},?)\\s*$', 'm');
  if (!lineRe.test(source)) throw new Error('disableVenueLine: could not locate VENUES entry for key ' + key);
  const throwFn = 'function (html) { throw new Error(' + JSON.stringify(reason) + '); }';
  return source.replace(lineRe, '$1' + throwFn + ' $3');
}

function bumpVersion(source, changelogNote, date) {
  const versionRe = /^\/\/ version: (\d+)$/m;
  const m = versionRe.exec(source);
  if (!m) throw new Error('bumpVersion: no "// version: N" line found');
  const oldVersion = parseInt(m[1], 10);
  const newVersion = oldVersion + 1;
  const wrapped = wrapComment('// v' + newVersion + ' (' + date + '): ' + changelogNote, 78);
  return source.replace(versionRe, '// version: ' + newVersion + '\n' + wrapped) ;
}

function wrapComment(text, width) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) {
      lines.push(line.trim());
      line = w;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (line) lines.push(line.trim());
  return lines.map((l) => '// ' + l).join('\n');
}

// --- Verification: run a patched/extracted parser against fresh HTML ---

async function verifyParserAgainstHtml(helperBlock, functionCode, fnName, html, callExpr) {
  const dir = await mkdtemp(path.join(tmpdir(), 'cr-health-'));
  const modPath = path.join(dir, 'candidate.mjs');
  const source = helperBlock + '\n\n' + functionCode + '\n\nexport default async function run(html) {\n  return (' + callExpr + ');\n}\n';
  await writeFile(modPath, source, 'utf-8');

  // Syntax check first — cheap, and gives a clearer error than a failed
  // dynamic import would.
  execFileSync(process.execPath, ['--check', modPath], { stdio: 'pipe' });

  const mod = await import('file://' + modPath + '?t=' + Date.now());
  const shows = await mod.default(html);

  if (!Array.isArray(shows)) throw new Error('verify: parser did not return an array');
  if (shows.length === 0) throw new Error('verify: parser returned zero shows against live HTML — not confident this is fixed');

  const todayIso = today();
  for (const s of shows) {
    if (!s || typeof s.title !== 'string' || !s.title.trim()) throw new Error('verify: a returned show has no title');
    if (!s.date || s.date < todayIso) throw new Error('verify: a returned show has no valid future date (' + JSON.stringify(s.date) + ')');
  }
  return shows;
}

// --- Claude API call: propose a parser fix ------------------------------

async function proposeParserFix({ venueLabel, venueKey, fnName, currentCode, freshHtml }) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set — cannot attempt an automated repair; venue will be disabled instead');
  }

  // Venue pages can be large; cap what's sent to keep this affordable and
  // within context, same tradeoff every other truncation in this repo
  // makes explicitly rather than silently (see "No silent caps" discipline
  // this project's automations already follow elsewhere).
  const MAX_HTML_CHARS = 180000;
  const htmlForPrompt = freshHtml.length > MAX_HTML_CHARS
    ? freshHtml.slice(0, MAX_HTML_CHARS) + '\n<!-- TRUNCATED: ' + (freshHtml.length - MAX_HTML_CHARS) + ' more chars -->'
    : freshHtml;

  const system = [
    'You are fixing exactly one JavaScript parser function in a Netlify Function ',
    'that scrapes a Bay Area concert venue\'s own public event-listing page. The ',
    'venue\'s HTML structure changed and the existing regex-based parser no ',
    'longer matches. You are given the current function source and a fresh copy ',
    'of the venue\'s live HTML. Return a corrected version of the SAME function ',
    '— same name, same signature, same call sites depend on its exact current ',
    'behavior otherwise (return shape: an array of objects; consult the current ',
    'code for the exact shape other parsers in this file use — typically ',
    '{ title, date, venue, city, url } as ISO-ish inputs the caller normalizes ',
    'further). Use only information actually present in the provided HTML — do ',
    'not invent selectors or guess at structure you cannot see. If you cannot ',
    'find enough signal in the HTML to write a confident fix, set confidence to ',
    '"low" and explain why in notes rather than guessing.',
  ].join('');

  const userContent = [
    'Venue: ' + venueLabel + ' (key: ' + venueKey + ')\n\n',
    'Current function source:\n```js\n' + currentCode + '\n```\n\n',
    'Fresh live HTML from this venue\'s event-listing page:\n```html\n' + htmlForPrompt + '\n```\n',
  ].join('');

  const tool = {
    name: 'propose_parser_fix',
    description: 'Return the corrected parser function.',
    input_schema: {
      type: 'object',
      properties: {
        functionCode: { type: 'string', description: 'Complete replacement source for the function, from its signature line through its closing brace, nothing else.' },
        confidence: { type: 'string', enum: ['high', 'low'] },
        notes: { type: 'string', description: '1-3 sentences: what changed in the HTML and why this fix addresses it.' },
      },
      required: ['functionCode', 'confidence', 'notes'],
    },
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: userContent }],
      tools: [tool],
      tool_choice: { type: 'tool', name: 'propose_parser_fix' },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error('Anthropic API call failed: HTTP ' + res.status + ' — ' + errText.slice(0, 500));
  }
  const data = await res.json();
  const toolUse = (data.content || []).find((b) => b.type === 'tool_use' && b.name === 'propose_parser_fix');
  if (!toolUse) throw new Error('Anthropic API response had no propose_parser_fix tool call');
  return toolUse.input;
}

// --- Main ----------------------------------------------------------------

async function main() {
  const findings = { date: today(), venueShows: null, seatGeek: null, catalogCache: null, repairs: [], disabled: [] };
  let exitCode = 0;

  log('Checking ' + SITE_URL + '/api/venue-shows ...');
  try {
    findings.venueShows = await checkVenueShows();
  } catch (err) {
    findings.venueShowsError = err.message;
    exitCode = 1;
  }

  log('Spot-checking SeatGeek via /api/tour-dates?artist=' + SPOT_CHECK_ARTIST + ' ...');
  try {
    findings.seatGeek = await checkSeatGeekSpotCheck();
    if (!findings.seatGeek.ok) exitCode = 1;
  } catch (err) {
    findings.seatGeek = { ok: false, error: err.message };
    exitCode = 1;
  }

  log('Checking /api/catalog-cache freshness ...');
  try {
    findings.catalogCache = await checkCatalogCacheFreshness();
    if (!findings.catalogCache.ok) exitCode = 1;
  } catch (err) {
    findings.catalogCache = { ok: false, error: err.message };
    exitCode = 1;
  }

  let source = null;
  let changed = false;
  const changeSummaryLines = [];

  // Unreachable venues are a real problem and a human should see them, so the
  // run still goes red. What they are NOT is patchable: no HTML arrived, so
  // there is nothing to diagnose in the parser and nothing to send the repair
  // path. Deliberately no PR either. venue-shows.mjs already surfaces the true
  // cause in meta.venues[].error ("HTTP 403"), and disabling the venue would
  // REPLACE that accurate message with a fabricated one about markup changing.
  // Leaving it alone keeps the honest error visible.
  if (findings.venueShows && findings.venueShows.unreachable.length > 0) {
    for (const v of findings.venueShows.unreachable) {
      log('Unreachable: ' + v.label + ' (' + v.error + ') — the request never returned a page, so this is not a parser fault. No repair attempted, no change proposed.');
    }
    exitCode = 1;
  }

  if (findings.venueShows && findings.venueShows.broken.length > 0) {
    source = await readFile(VENUE_FILE, 'utf-8');
    let helperBlock;
    try {
      helperBlock = extractHelperBlock(source);
    } catch (err) {
      // If even the helper block can't be located, the file has changed
      // structurally enough that automated patching isn't safe at all —
      // fall through to disabling every broken venue below.
      helperBlock = null;
      log('WARNING: could not extract helper block — ' + err.message);
    }

    // Group by function name so gamh/chapel (shared parseSeeTickets) are
    // only patched once, then BOTH re-verified together.
    const byFunction = new Map();
    for (const v of findings.venueShows.broken) {
      const fnName = VENUE_FUNCTION[v.key];
      if (!fnName) { log('WARNING: no known function for venue key ' + v.key + ', skipping'); continue; }
      if (!byFunction.has(fnName)) byFunction.set(fnName, []);
      byFunction.get(fnName).push(v);
    }

    for (const [fnName, venues] of byFunction) {
      const primary = venues[0];
      log('Broken: ' + venues.map((v) => v.label).join(', ') + ' (function ' + fnName + ', error: ' + primary.error + ')');

      let repaired = false;
      try {
        if (!helperBlock) throw new Error('helper block unavailable, cannot verify a patch');

        const currentCode = extractFunction(source, fnName).code;
        const freshHtmlRes = await fetch(primary.sourceUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VinylScoutHealthCheck/1.0)' } });
        if (!freshHtmlRes.ok) throw new Error('could not re-fetch ' + primary.sourceUrl + ': HTTP ' + freshHtmlRes.status);
        const freshHtml = await freshHtmlRes.text();

        const proposal = await proposeParserFix({
          venueLabel: venues.map((v) => v.label).join(' / '),
          venueKey: venues.map((v) => v.key).join(','),
          fnName,
          currentCode,
          freshHtml,
        });

        if (proposal.confidence !== 'high') {
          throw new Error('model returned low confidence: ' + proposal.notes);
        }

        // Every venue sharing this function must independently verify
        // against ITS OWN fresh HTML, not just the one that triggered this.
        for (const v of venues) {
          const html = v.key === primary.key ? freshHtml : await (await fetch(v.sourceUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VinylScoutHealthCheck/1.0)' } })).text();
          const callExpr = fnName === 'parseSeeTickets'
            ? 'parseSeeTickets(html, ' + JSON.stringify(v.label) + ', ' + JSON.stringify(venues[0].city || '') + ')'
            : fnName + '(html)';
          await verifyParserAgainstHtml(helperBlock, proposal.functionCode, fnName, html, callExpr);
        }

        source = replaceFunction(source, fnName, proposal.functionCode);
        const note = venues.map((v) => v.label).join('/') + ' HTML structure changed; ' + proposal.notes;
        source = bumpVersion(source, note, findings.date);
        changed = true;
        repaired = true;
        findings.repairs.push({ function: fnName, venues: venues.map((v) => v.label), notes: proposal.notes });
        changeSummaryLines.push('- Repaired `' + fnName + '` (' + venues.map((v) => v.label).join(', ') + '): ' + proposal.notes);
      } catch (err) {
        log('Could not confidently repair ' + fnName + ': ' + err.message);
      }

      if (!repaired) {
        for (const v of venues) {
          const reason = 'Disabled by Concert Radar health check (' + findings.date + '): ' +
            v.label + ' HTML structure changed and an automated fix could not be confidently verified. ' +
            'Needs a live session to diagnose — see CLAUDE.md changelog for this date.';
          source = disableVenueLine(source, v.key, reason);
          findings.disabled.push({ key: v.key, label: v.label });
          changeSummaryLines.push('- Disabled `' + v.key + '` (' + v.label + '): automated repair not confident enough, needs a human look.');
        }
        source = bumpVersion(source, venues.map((v) => v.label).join('/') + ' disabled — broken parser, automated repair not confident enough, needs manual follow-up.', findings.date);
        changed = true;
        exitCode = 1;
      }
    }
  }

  if (changed && source) {
    await writeFile(VENUE_FILE, source, 'utf-8');
    execFileSync(process.execPath, ['--check', VENUE_FILE], { stdio: 'pipe' });
    log(VENUE_FILE + ' updated and syntax-checked.');

    try {
      const claudeMd = await readFile(CLAUDE_MD, 'utf-8');
      const section = '\n## ' + findings.date + ' — Concert Radar health check (automated, GitHub Actions)\n\n' +
        'Weekly `scripts/concert-radar-health-check.mjs` run found and acted on the ' +
        'following in `netlify/functions/venue-shows.mjs`:\n\n' +
        changeSummaryLines.join('\n') + '\n\n' +
        'See this PR for the full diff and verification evidence. Repaired parsers ' +
        'were functionally verified against the live HTML that triggered this run ' +
        '(non-empty results, valid future dates) but not semantically reviewed by a ' +
        'human yet — worth a quick sanity check against the venue\'s own page.\n';
      await writeFile(CLAUDE_MD, claudeMd.trimEnd() + '\n' + section, 'utf-8');
      log('CLAUDE.md changelog updated.');
    } catch (err) {
      log('WARNING: could not update CLAUDE.md — ' + err.message + ' (venue-shows.mjs change still applies)');
    }
  }

  // --- Report -------------------------------------------------------------

  const lines = [];
  lines.push('# Concert Radar health check — ' + findings.date + ' (GitHub Actions)');
  lines.push('');
  if (findings.venueShows) {
    lines.push('## Venues');
    for (const v of findings.venueShows.allVenues) {
      const state = v.error
        ? (classifyVenueFailure(v.error) === 'unreachable'
            ? 'UNREACHABLE (' + v.error + ') — request never returned a page; not a parser fault'
            : 'BROKEN (' + v.error + ')')
        : (v.count === 0 ? 'suspicious (0 shows, no error)' : 'healthy (' + v.count + ' shows)');
      lines.push('- ' + v.label + ': ' + state);
    }
    lines.push('');
    lines.push('Black Uhuru / Sweetwater canary (expected ' + CANARY.expectedDate + '): ' + (findings.venueShows.canaryOk ? 'OK' : 'MISSING or wrong date'));
  } else {
    lines.push('## Venues');
    lines.push('Could not check: ' + findings.venueShowsError);
  }
  lines.push('');
  lines.push('## SeatGeek spot check (Fleetwood Mac)');
  lines.push(findings.seatGeek && findings.seatGeek.ok ? 'OK' : 'FAILED — ' + JSON.stringify(findings.seatGeek));
  lines.push('');
  lines.push('## catalog-cache freshness');
  if (findings.catalogCache) {
    lines.push(findings.catalogCache.ok
      ? 'OK — at ' + findings.catalogCache.at + ' (' + findings.catalogCache.ageDays.toFixed(1) + ' days old)'
      : 'STALE or missing — ' + JSON.stringify(findings.catalogCache) + ' (check scheduled-sweep.mjs in the Netlify dashboard)');
  }
  lines.push('');
  if (findings.repairs.length) {
    lines.push('## Repairs applied (verified)');
    for (const r of findings.repairs) lines.push('- ' + r.function + ' (' + r.venues.join(', ') + '): ' + r.notes);
    lines.push('');
  }
  if (findings.venueShows && findings.venueShows.unreachable.length) {
    lines.push('## Venues unreachable (needs a human, but NOT a parser fix)');
    for (const v of findings.venueShows.unreachable) {
      lines.push('- ' + v.label + ' (`' + v.key + '`): ' + v.error + ' from ' + v.sourceUrl);
    }
    lines.push('');
    lines.push('These returned no page at all, so no parser change was attempted and none is proposed. ' +
      'Check whether the venue is blocking this caller (the scraper sends a self-identifying bot User-Agent) ' +
      'or has moved the page, before assuming anything is wrong with the parser.');
    lines.push('');
  }
  if (findings.disabled.length) {
    lines.push('## Venues disabled (needs human follow-up)');
    for (const d of findings.disabled) lines.push('- ' + d.label + ' (`' + d.key + '`)');
    lines.push('');
  }

  const report = lines.join('\n');
  console.log('\n' + report + '\n');

  const ghStepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (ghStepSummary) await appendFile(ghStepSummary, report + '\n', 'utf-8');

  const ghOutput = process.env.GITHUB_OUTPUT;
  if (ghOutput) {
    const prTitle = findings.repairs.length && !findings.disabled.length
      ? 'Concert Radar: auto-repair ' + findings.repairs.map((r) => r.function).join(', ')
      : findings.disabled.length
        ? 'Concert Radar: disable ' + findings.disabled.map((d) => d.key).join(', ') + ' (needs manual fix)'
        : 'Concert Radar: venue-shows.mjs update';
    const prBodyPath = path.join(tmpdir(), 'cr-pr-body.md');
    await writeFile(prBodyPath, report, 'utf-8');
    await appendFile(ghOutput, [
      'changed=' + (changed ? 'true' : 'false'),
      'pr_title=' + prTitle,
      'pr_body_path=' + prBodyPath,
      'commit_message=' + prTitle.replace(/\n/g, ' '),
    ].join('\n') + '\n', 'utf-8');
  }

  process.exit(exitCode);
}

// Exported for scripts/test-concert-radar-health-check.mjs — pure text/logic
// helpers are unit-tested directly against the real venue-shows.mjs source
// (no network needed for these). main() only runs when this file is
// executed directly, not when imported for tests.
export {
  extractFunction, extractHelperBlock, replaceFunction, disableVenueLine,
  bumpVersion, wrapComment, verifyParserAgainstHtml, checkVenueShows,
  classifyVenueFailure,
  checkSeatGeekSpotCheck, checkCatalogCacheFreshness, VENUE_FUNCTION, CANARY,
};

if (import.meta.url === 'file://' + process.argv[1]) {
  main().catch((err) => {
    console.error('concert-radar-health-check.mjs failed:', err);
    process.exit(1);
  });
}

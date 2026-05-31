# Vinyl Scout — Project Charter

**Version:** 3.2 · **Last revised:** 2026-05-30

**Changelog**
- **v3.2 (2026-05-30)** — Added `POST /api/save-cover` (X-Edit-Key gated). New cover uploads via `/audit.html` now write JPEG/PNG to `covers/<recordId>.<ext>` in the GitHub repo and store the relative path in `cover_url`. Existing CDN and `data:` covers untouched in Phase A; one-time migration script in Phase B will re-host them.
- **v3.1 (2026-05-28)** — Migrated `/api/backup` from `?key=` query param to an `X-Backup-Key` request header. Bad-auth status is now 401 (was 403). Charter Rule 8 (secrets in headers, not URLs) now applies to backup as well as records.
- **v3 (2026-05-28)** — Added SEO suppression (noindex meta + `X-Robots-Tag` header + `robots.txt`) and write-protection (`X-Edit-Key` header gates `POST`/`DELETE`; `GET` stays public). "Shipped in Phase 1" now reflects what's actually live (audit page, backups, `/about.html`). Added an Endpoints section covering all five production endpoints. Synced catalog state (now 94 records) and seeding workflow (plain-text input per v17, not JSON paste). Filled out record schema with the full Statistics fields parsed from the release-page scrape. Clarified that manual backup triggers create one commit each.
- _(pre-v3)_ Charter content was snapshotted alongside `app.js` v19; not explicitly versioned. v3 is the first explicitly-versioned charter.

---

## Identity

**Vinyl Scout** is Susan's personal vinyl record cataloging app. Lives at vinylscout.org on Netlify. Susan has ~80 LPs; the catalog currently holds **94 records** in condition-tracking + pricing-scaffolding phase. She works primarily from mobile (iPhone, Safari).

The site is **publicly viewable but not advertised** — excluded from search engines (noindex meta + `X-Robots-Tag` response header + disallow-all `robots.txt`). Anyone with the URL can view the gallery; only someone holding the shared edit secret can write.

Aesthetic: editorial / record-shop / library catalog card.
- Fraunces italic display serif · IBM Plex Sans body · IBM Plex Mono for catalog numbers
- Cream `#f1ebdc` ground · ink `#1c2018` text · vinyl-red `#b53026` accent · gold `#a8801c` for metadata
- Subtle paper-noise radial gradients
- No emoji in UI chrome (the brand mark ⦿ is the only exception)

Public exec-friendly setup page lives at `/about.html` and is linked from the masthead nav on every page.

---

## Phase 1 — COMPLETE: barebones cataloging via vision

**The whole thing in one sentence**: A static site that displays Susan's vinyl collection, with new records added by Claude looking at photos Susan uploads in chat.

### Shipped in Phase 1

- One persistent record store (Netlify Blobs, store name: `records`)
- `GET /api/records` — strictly read-only, **public**
- `POST /api/records` — upsert by ID only, **requires the edit secret**
- `DELETE /api/records/:id` — single ID only, no bulk variant, **requires the edit secret**
- Public collection at `/` — list + gallery, genre chips, search, detail modal
- `/seed.html` — plain-text "Artist - Title per line" input (v17). The page generates record IDs itself and POSTs one record at a time. Writes use the edit secret.
- `/audit.html` — inline edit of artist/title/year/genre/condition, single-record delete (confirm-gated), per-record cover upload (browser-compressed to a data URL). Writes use the edit secret.
- `/about.html` — exec-friendly setup page + Goldmine grading legend, linked from the masthead.
- **Nightly + on-demand git backups** of the entire records store to `backups/YYYY-MM-DD.json` (scheduled `0 9 * * *` UTC + manual `GET /api/backup?key=…`). Pure read of the store; never mutates.
- **SEO suppression** — `noindex` meta on every page, `X-Robots-Tag: noindex, nofollow, noarchive` response header, disallow-all `robots.txt`.
- **Write-protection** — shared edit secret (`EDIT_SECRET` Netlify env var) required on every `POST`/`DELETE`. Sent as an `X-Edit-Key` request header (never in the URL). Entered by Susan in the page UI on first write per browser session and held in `sessionStorage`. Never committed to the repo or embedded in served HTML.

### Phase 1 record fields (pre-Phase-3)

`id`, `artist`, `title`, `year`, `genre`, `cover_url`, `notes`, `created_at`. See the full current schema below.

---

## Phase 3 — ACTIVE: condition tracking + pricing scaffolding

Susan moved Phase 3 from parked to active on May 24, 2026. The shipped scope of this phase carries condition tracking end-to-end and lays in the schema and UI for marketplace pricing.

### In scope (this phase)

- **Condition field** — `condition` string on every record, Goldmine grade. Default `VG`. Editable on `/audit.html` via a dropdown next to year/genre.
- **Condition display** — shows as a small pill in the detail modal, with a "Legend" link to `/about.html#grading`.
- **Pricing schema** — optional fields populated when a record is refreshed from Discogs: `price_low`, `price_median`, `price_high`, `price_last_sold` (string date or null), `copies_available`, `have_count`, `want_count`, `rating_avg`, `rating_count`, `price_currency` (ISO code), `price_updated_at`, `discogs_release_id`. Stored alongside other fields, preserved by the existing upsert merge pattern.
- **Pricing display (when present)** — detail modal renders a "Market" block with Range (or Cheapest, when only the low side is known), Median, Last sold date, Copies for sale, and a Community line showing `N have · N want`. The block hides cleanly when no pricing fields are present.
- **Exec-friendly `/about.html`** — single-page setup description, Goldmine legend with multipliers, roadmap, linked from masthead nav on every page.
- **PROJECT.md updated in repo** — charter ships with the code.

### Sub-phase 3.1 — SHIPPED (v12 – v18, May 2026): live Discogs market data

On-demand market data per record. UI: a "Refresh from Discogs" button in the detail modal. One record per click, never bulk, never automatic.

**Server endpoint.** `POST /api/discogs-pricing` (`netlify/functions/discogs-pricing.mjs`). Takes `{ recordId }`, looks up the record in the records store, searches Discogs by `artist + title` (filtered to format=Vinyl), then runs two requests in parallel: the documented `marketplace/stats/:release_id` API for the current cheapest listing + copies for sale, AND a fetch of the public release page (`https://www.discogs.com/release/:release_id`) which it tag-strips and regex-parses for the Statistics block (Have, Want, Avg Rating, Ratings, Last Sold, Low, Median, High). Combines both, upserts the result back into the same record, returns the updated record plus a `scrape_debug` object describing what the parser found.

**Why the scrape.** Discogs's documented API does not expose historical sales data (low/median/high/last-sold) on any endpoint — there is an open feature request on their forum asking for exactly this. The data is, however, in the static HTML of every release page (not JS-injected), so a server-side fetch with a proper User-Agent works. The earlier `/marketplace/price_suggestions` endpoint (used v12–v17) returned per-condition asking-price suggestions instead of historical sales, silently empty for many releases — that path was removed in v18.

**Environment variable.** `DISCOGS_TOKEN` — a Discogs personal access token created at <https://www.discogs.com/settings/developers>, set on Netlify under Site Settings → Environment Variables. Required for the API half (search + marketplace stats). The scrape half uses no auth (release pages are public) but sends the same User-Agent. If the token is absent the endpoint returns a clear 503 with setup instructions; nothing crashes.

**Fields populated.**

- `price_low` ← `marketplace/stats.lowest_price.value` (with scrape's `Low:` as fallback if API didn't have one)
- `copies_available` ← `marketplace/stats.num_for_sale`
- `price_median`, `price_high` ← parsed from the release-page Statistics block (sales history)
- `price_last_sold` ← string date from the Statistics block (e.g. `"Apr 23, 2026"`), or `null` if the release shows "Never"
- `have_count`, `want_count`, `rating_avg`, `rating_count` ← parsed from the Statistics block
- `price_currency` ← detected from the price symbol (€ → EUR, $ → USD, £ → GBP)
- `price_updated_at` ← ISO timestamp of the fetch
- `discogs_release_id` ← release ID of the matched pressing, cached so future refreshes skip the search

**Fallback behavior.** If the scrape fails (HTTP 403/429, network error, or layout change that breaks the parser), the function falls back to the API-only data and reports the failure in `scrape_debug.status = 'rejected'`. The front-end logs the debug payload to the browser console on every Refresh, so we can see why a record is missing fields without opening any tools.

**Release matching limitation.** First-result match. Good for popular records, imperfect for obscure pressings, reissues, or generic titles. Phase 3.2 would add a "pick the right pressing" UI on `/audit.html`. For now, Susan can re-search by tweaking artist/title on `/audit.html`.

**v15 auth fix (preserved).** v13 and v14 authenticated to Discogs via query string only (`?token=…`). That works for `/database/search` but fails intermittently on `/marketplace/*` endpoints — confirmed via the Discogs forum and reading the source of the joalla Python client, which sends the token via *both* the Authorization header (`Discogs token=…`) and the query string. v15 onwards does the same, and calls `/oauth/identity` first as a preflight so when auth fails we know whether it's the token itself or just one endpoint. Netlify env-var changes do not reach a running function until the next deploy.

---

## Phase 2 — DEFERRED: pressing-accurate metadata from Discogs

Originally listed as the next phase after barebones cataloging. Deferred because condition + pricing was more useful to Susan first. When Phase 2 returns, it would add: label, catalog number, country, pressing year (vs. release year), and format details, all sourced from Discogs releases.

## Phase 4 — PARKED: listing & selling helpers

Generate listing copy, suggested ask price (using condition multiplier × `price_low`), and a one-tap export to Discogs/eBay listing templates. Far-future.

When asked about a parked feature, say "that's Phase N, parked" and stop.

---

## Endpoints (deployed)

- `GET  /api/records` — public; returns all records as a JSON array.
- `POST /api/records` — edit-secret required; upserts one record by `id`.
- `DELETE /api/records/:id` — edit-secret required; deletes one record by `id`.
- `POST /api/discogs-pricing` — public; takes `{ recordId }`, fetches Discogs API + scrapes the release page, upserts the result back. On-demand only, one record per click (see Phase 3.1).
- `GET  /api/backup` — **`X-Backup-Key` header required**; reads the store, commits `backups/YYYY-MM-DD.json` to the repo; pure read of the store. Scheduled equivalent runs nightly at 09:00 UTC. **Each trigger produces one commit**; same-day path is overwritten in place via the GitHub contents API, so multiple commits per day with the same filename is normal and expected (one per manual trigger + one scheduled).
- `POST /api/save-cover` — **`X-Edit-Key` header required**; writes one cover file to `covers/<recordId>.<ext>` in the repo via the GitHub contents API. Pure write of the covers folder; never touches the records store.

---

## Hard Rules — NON-NEGOTIABLE

### 1. The catalog is sacred

The previous version lost 29 records to a dedup race condition. That cannot happen again. The catalog now has **nightly + on-demand git backups** (real restore path) and **a write-gate** on `POST`/`DELETE` (random visitors can view but not mutate). Both are defense in depth; the rules below still hold.

- **No bulk-delete code paths.** Ever. No function may call delete on more than one record per invocation.
- **No auto-dedup.** Banned from the codebase. If duplicates appear, they appear. Susan deletes them manually one at a time.
- **No background mutation.** List/read endpoints — including `/api/backup` — are pure reads. They cannot write to the records store under any circumstance.
- **All writes are upserts by ID.** Never "replace all records with this array."
- **Single-record delete only**, gated by a UI `confirm()` dialog.
- **Pricing refresh is on-demand only.** No cron, no polling, no batch refresh. One record, one button, one fetch.

### 2. Scope is sacred

If a feature wasn't explicitly requested in this charter or in a current ask, don't build it. When tempted to add a "nice to have," ask first.

### 3. Deploys are versioned

Every code change bumps the cache-bust version in `/app.js?v=N` and `/style.css?v=N`. The current `N` is documented at the top of `app.js` in a `// version: N` comment. Currently at **v=19**. `/seed.html` and `/audit.html` carry their own internal `// version: N` for their inline scripts.

### 4. No silent failures

Every error path renders a visible, persistent error in the UI with the actual error text. No `setTimeout(hideError, …)` cleanup that swallows diagnostics. Mobile has no console. A rejected write (wrong/missing edit secret) must surface a clear, visible message — not fail quietly.

### 5. Honesty over confidence

If a release ID, identification, or fact is uncertain, say so. Don't fabricate confidence Susan can't verify.

### 6. Diagnose before patching

When Susan reports a failure, first `curl` the deployed file or read the source on disk to confirm what's actually live. Don't guess from memory.

### 7. No heredocs with JS template literals

Shell heredocs with backticks, `${…}`, or `onerror=` get mangled by zsh. Use `python3 << 'PYEOF'` with `r"""…"""` for full-file writes; `sed -i ''` for single-line edits. Verify after with `wc -l`, `grep`, `node --check`.

### 8. Secrets travel in headers, never in URLs

The edit secret is sent as `X-Edit-Key`. Never as a query parameter. Never committed to the repo. Never embedded in served HTML. Held only in the user's `sessionStorage` for the duration of a browser session.

---

## Record schema (current — Phase 1 + Phase 3 additions)

```jsonc
{
  "id":                 "rec_<8-byte-hex>",
  "artist":             "string (required)",
  "title":              "string (required)",
  "year":               "number 1900-2100 | null",
  "genre":              "string | null",
  "cover_url":          "string | null   (URL, or data: URL from audit-page upload)",
  "notes":              "string (default \"\")",
  "created_at":         "ISO timestamp",

  "condition":          "'M' | 'NM' | 'VG+' | 'VG' | 'G+' | 'G' | 'F' | 'P' (default 'VG')",
  /* Note: condition is STORED as the short code but DISPLAYED with the spelled
     name ('Very Good', 'Near Mint', etc.) in both /audit.html and the detail
     modal. See conditionLabel() in app.js / CONDITION_NAMES in audit.html. */

  "discogs_release_id": "number | null   (cached after first pricing fetch)",
  "price_low":          "number | null   (cheapest live listing; scrape fallback)",
  "price_median":       "number | null   (release-page Statistics block sales history)",
  "price_high":         "number | null   (release-page Statistics block sales history)",
  "price_last_sold":    "string | null   (e.g. 'Apr 23, 2026'; null when shown 'Never')",
  "copies_available":   "number | null   (marketplace/stats.num_for_sale)",
  "have_count":         "number | null   (from Statistics block)",
  "want_count":         "number | null   (from Statistics block)",
  "rating_avg":         "number | null   (from Statistics block)",
  "rating_count":       "number | null   (from Statistics block)",
  "price_currency":     "'USD' | 'EUR' | 'GBP' | null   (detected from price symbol)",
  "price_updated_at":   "ISO timestamp | null"
}
```

The pricing fields are all nullable and absent on records that haven't been refreshed yet. The frontend renders the Market block on every detail view; if no pricing has been fetched it shows "No market data yet" plus a "Fetch from Discogs" button. Schema additions are additive — old records are never rewritten on read.

---

## Goldmine grading

| Grade | Meaning | Multiplier |
|------:|---------|-----------:|
| M     | Mint, sealed, never played                    | x1.20 |
| NM    | Near Mint, plays flawlessly, reference grade  | x1.10 |
| VG+   | Very Good Plus, light wear                    | x0.85 |
| **VG** | **Very Good, visible wear, light surface noise. Default.** | **x0.65** |
| G+    | Good Plus, audible pops and crackle           | x0.45 |
| G     | Good, heavy wear, distracts during play       | x0.30 |
| F     | Fair, barely playable                         | x0.15 |
| P     | Poor, wall art only                           | x0.05 |

Formula for suggested ask price (Phase 4):

```
ask = price_low * multiplier(condition)
```

---

## QA discipline — required for every iteration

Before delivering ANY code change, Claude runs this checklist explicitly in the response:

### Pre-flight (state these upfront)
- [ ] One-sentence scope of the change
- [ ] Files that will be modified (by name)
- [ ] Confirmed in-scope for the current phase (or asked Susan if not)

### Code-level
- [ ] Every modified file passes `node --check` (or equivalent syntax check)
- [ ] No `deleteRecord`, `.delete(`, bulk-delete, or dedup logic added anywhere outside `/audit.html`'s single-record gated delete
- [ ] No new function mutates storage from a read endpoint
- [ ] No background mutation, no polling, no auto-refresh
- [ ] Cache-bust version bumped on `/app.js` and `/style.css` in every page that loads them
- [ ] Cross-file references verified: imports resolve, CSS classes match selectors, frontend API paths match backend `export const config = { path }`
- [ ] Secrets are sent as headers, never in URLs; never committed to the repo or baked into served HTML
- [ ] Dead code removed (unused functions, abandoned imports)
- [ ] No `setTimeout` patterns that hide errors

### Post-flight (the message Susan receives)
- [ ] **What changed** — one paragraph, plain language
- [ ] **Files touched** — bulleted list by name
- [ ] **How to deploy** — exact steps
- [ ] **How to verify it works** — specific test
- [ ] **How to roll back** — what to undo if it breaks
- [ ] **New cache-bust version** — e.g., "now at v=11"

If ANY item is in doubt, stop and ask Susan before proceeding.

---

## Working agreement

- **Susan moves fast** — take initiative on design and minor UX, but never on scope additions.
- **Mobile-first** — every layout checked at 375px viewport before shipping. Tap targets >=44px. Inputs >=16px font (no iOS zoom).
- **Diagnose, then fix.** When Susan reports a failure, read the code, trace the path, report the actual cause. Only ship a fix after the diagnosis is confirmed.
- **Brevity** — explanations are a paragraph, not an essay. Don't re-explain programming.
- **Ask one clear question, not three speculative ones** when uncertain.
- **Build to spec** — if it's not in this document, it's not in scope.

---

## Catalog seeding workflow

1. Susan photographs albums in groups of 3-6 per shot.
2. Susan uploads photos to chat.
3. Claude (in chat) looks at each photo and identifies each cover, producing one record per line in `Artist - Title` form (en-dash, em-dash, or hyphen-with-spaces separator).
4. Susan visits `/seed.html`, pastes the lines, and taps **Add Records**. The page generates record IDs itself and POSTs one record at a time to `/api/records` (writes use the edit secret).
5. Susan reviews the collection in `/`, sets condition + year + genre + cover per record in `/audit.html`.

(The earlier JSON-paste flow was replaced in v17 by plain-text input. The page parses lines, constructs the record JSON internally, and submits single-record upserts.)

No automation between chat and the site. Chat -> text -> paste -> add. Every link in this chain is auditable by Susan.

---

## Glossary

- **Record**: One row in the catalog. One physical LP.
- **Records store**: The Netlify Blobs store named `records`. One JSON blob per record.
- **Seed**: A chat-generated list of `Artist - Title` lines Susan pastes into `/seed.html`.
- **Audit page**: `/audit.html` - the hand-edit UI (inline edit, single delete, cover upload).
- **Edit secret**: The shared passphrase stored as `EDIT_SECRET` in Netlify production env. Required on `POST` and `DELETE`; sent as `X-Edit-Key` header. Entered by Susan in the page UI per browser session.
- **Backup**: A JSON snapshot of all records committed to `backups/YYYY-MM-DD.json` in the repo, nightly at 09:00 UTC and on demand via `GET /api/backup` (X-Backup-Key header required). Each trigger produces one commit; same-day path is overwritten in place via the GitHub contents API, so multiple commits per day is normal.
- **Cover file**: A JPEG or PNG stored at `covers/<recordId>.<ext>` in the repo, written by `POST /api/save-cover`. Served as a same-origin static asset at `https://vinylscout.org/covers/<id>.<ext>`.
- **Goldmine grade**: One of the 8 conditions listed above. Default `VG`.
- **Phase 1**: Barebones cataloging via vision. Complete.
- **Phase 3**: Condition tracking + pricing scaffolding. Complete in v11. Display refined in v13 (spelled-out grade names).
- **Phase 3.1**: Live Discogs market data. Shipped v12; auth fix v13-v15; UI polish v16; plain-text seed v17; release-page scrape for full Statistics block v18.
- **Phase 3.2**: "Pick the right pressing" UI for ambiguous Discogs matches. Not started.
- **Phase 2, Phase 4**: Deferred / parked. Don't start.
- **Catalog**: Susan's full collection. Currently 94 records after May 2026 rebuild.

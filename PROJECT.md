# Vinyl Scout — Project Charter

**Version:** 8 · **Last revised:** 2026-06-30

**Changelog**
- **v8 (2026-06-30)** — Reconciled after reseed: updated Identity to reflect 92 live records; added `/audit.html` to Phase 1 In scope (expansion); updated Record schema to include enrichment fields (Discogs ID, pricing, rating, community); fixed Glossary catalog count (92, not 93). All contradictions resolved.
- **v7 (2026-06-16)** — Backup state after initial 92-record clean restore.
- **v1 (2026-05-21)** — Phase 1 reset after May 2026 data-loss incident.

---

## Identity

**Vinyl Scout** is Susan's personal vinyl record cataloging app. Lives at vinylscout.org on Netlify. Susan has 92 LPs in the catalog (live as of June 30, 2026). She works primarily from mobile (iPhone, Safari).

The site is **publicly viewable but not advertised**: it's excluded from search engines (noindex), and the only people who edit it are those who hold the edit secret. It is not a private/login-walled site — anyone with the URL can view the gallery.

Aesthetic: editorial / record-shop / library catalog card.
- Fraunces italic display serif · IBM Plex Sans body · IBM Plex Mono for catalog numbers
- Cream `#f1ebdc` ground · ink `#1c2018` text · vinyl-red `#b53026` accent · gold `#a8801c` for metadata
- Subtle paper-noise radial gradients
- No emoji in UI chrome (the camera 📷 icon is the only exception)

---

## Phase 1 — Current scope: barebones cataloging via vision + hand-edit UI

**The whole thing in one sentence**: A static site that displays Susan's vinyl collection, with new records added by Claude looking at photos Susan uploads in chat, plus an audit page for hand-edits — protected so only Susan can write.

### In scope

- One persistent record store (Netlify Blobs, store name: `records`)
- One read endpoint (`GET /api/records`) — strictly read-only, **public**
- One write endpoint (`POST /api/records`) — upsert by ID only, **requires the edit secret**
- One delete endpoint (`DELETE /api/records/:id`) — single ID only, no bulk variant, **requires the edit secret**
- Backup endpoint (`GET /api/backup?key=…`) — reads the whole store and commits a JSON snapshot to `backups/YYYY-MM-DD.json` in the repo. **Pure read of the store; never mutates it.** A scheduled function performs the same backup nightly.
- One static page (`/`) showing the collection as a gallery
- One static page (`/seed.html`) where Claude-generated JSON gets pasted in to bulk-add (writes use the edit secret)
- One static page (`/audit.html`) for hand-edits: inline edit of artist/title/year/genre, single-record delete (confirm-gated), and per-record cover upload (browser-compressed to a data URL). Uses only the existing `/api/records` endpoint (writes use the edit secret). **This was explicitly requested by Susan — a sanctioned expansion, not creep.**
- **SEO suppression** — `noindex` on every page (meta tag + `X-Robots-Tag` header) and a disallow-all `robots.txt`, so the site doesn't surface in search results.
- **Write-protection** — `POST` and `DELETE` reject any request without the correct edit secret (sent as a request header, never in the URL). `GET /api/records` stays public so the gallery loads for anyone. The secret is entered by Susan in the page UI and held in the browser session; it is never committed to the repo or embedded in served HTML.
- Record fields: `id`, `artist`, `title`, `year` (optional), `genre` (optional), `cover_url` (optional), `notes` (optional), `created_at`; enrichment fields: `discogs_release_id` (optional), `price_low` / `price_high` / `price_median` / `price_currency` / `price_last_sold` / `price_updated_at` (optional), `copies_available` (optional), `have_count` / `want_count` / `rating_avg` / `rating_count` (optional)

### OUT of scope for Phase 1 (do not build, do not "just add it while we're here")

- ❌ Discogs API of any kind (search, sync, restore, lookup) — data scraped only, not API calls
- ❌ OCR / Tesseract
- ❌ Grading / Goldmine pricing / marketplace
- ❌ User accounts / per-user login / third-party auth (the write-gate is a single shared secret, nothing more)
- ❌ Dedup of any kind (banned — see Hard Rules)
- ❌ Background enrichment / auto-backfill
- ❌ Triage views (Inbox / Accepted / Passed)
- ❌ "Nice to have" features Susan didn't ask for

### Parked for future phases — do not start

- Phase 2: Discogs lookup for pressing accuracy (enrichment data fetch)
- Phase 3: Wishlist feature (Spotify integration + manual cherry-pick)
- Phase 4: Marketplace & selling (out of scope indefinitely)

When asked about a parked feature, say "that's Phase N, parked" and stop.

---

## Hard Rules — NON-NEGOTIABLE

### 1. The catalog is sacred

The previous version lost 29 records to a dedup race condition, with no restore path. The catalog now has **nightly + on-demand git backups** (`backups/YYYY-MM-DD.json`), so there is finally a real restore path — but the rules below still hold as defense in depth. A backup is a safety net, not a license to be careless.

- **No bulk-delete code paths.** Ever. No function may call delete on more than one record per invocation.
- **No auto-dedup.** Banned from the codebase. If duplicates appear, they appear. Susan deletes them manually one at a time.
- **No background mutation.** List/read endpoints — including `/api/backup` — are pure reads. They cannot write to the records store under any circumstance.
- **All writes are upserts by ID.** Never "replace all records with this array."
- **Single-record delete only**, gated by a UI `confirm()` dialog.

### 2. Scope is sacred

If a feature wasn't explicitly requested in this charter or in a current ask, don't build it. When tempted to add a "nice to have," ask first.

### 3. Deploys are versioned

Every code change bumps the cache-bust version in `/app.js?v=N` and `/style.css?v=N`. The current `N` is documented at the top of `app.js` in a `// version: N` comment. `/audit.html` carries its own internal `// version: N` for its inline script.

### 4. No silent failures

Every error path renders a visible, persistent error in the UI with the actual error text. No `setTimeout(hideError, …)` cleanup that swallows diagnostics. Mobile has no console. A rejected write (wrong/missing edit secret) must surface a clear, visible message — not fail quietly.

### 5. Honesty over confidence

If a release ID, identification, or fact is uncertain, say so. Don't fabricate confidence Susan can't verify.

---

## QA discipline — required for every iteration

Before delivering ANY code change, Claude runs this checklist explicitly in the response:

### Pre-flight (state these upfront)
- [ ] One-sentence scope of the change
- [ ] Files that will be modified (by name)
- [ ] Confirmed in-scope for Phase 1 (or asked Susan if not)

### Code-level
- [ ] Every modified file passes `node --check` (or equivalent syntax check)
- [ ] No `deleteRecord`, `.delete(`, bulk-delete, or dedup logic added anywhere
- [ ] No new function mutates storage from a read endpoint
- [ ] Cache-bust version bumped in `index.html`, `seed.html`, and `audit.html` (if script changed)
- [ ] Cross-file references verified: imports resolve, CSS classes match selectors, frontend API paths match backend `export const config = { path }`
- [ ] Secrets are sent as headers, never in URLs; never committed to the repo or baked into served HTML
- [ ] Dead code removed (unused functions, abandoned imports)
- [ ] No `setTimeout` patterns that hide errors

### Post-flight (the message Susan receives)
- [ ] **What changed** — one paragraph, plain language
- [ ] **Files touched** — bulleted list by name
- [ ] **How to deploy** — exact steps
- [ ] **How to verify it works** — specific test (e.g., "snap a photo of 3 albums, expect modal with 3 rows")
- [ ] **How to roll back** — what to undo if it breaks
- [ ] **New cache-bust version** — e.g., "now at v=9"

If ANY item is in doubt, stop and ask Susan before proceeding.

---

## Working agreement

- **Susan moves fast** — take initiative on design and minor UX, but never on scope additions.
- **Mobile-first** — every layout checked at 375px viewport before shipping. Tap targets ≥44px. Inputs ≥16px font (no iOS zoom).
- **Diagnose, then fix.** When Susan reports a failure, read the code, trace the path, report the actual cause. Only ship a fix after the diagnosis is confirmed.
- **Brevity** — explanations are a paragraph, not an essay. Don't re-explain programming.
- **Ask one clear question, not three speculative ones** when uncertain.
- **Build to spec** — if it's not in this document, it's not in scope.

---

## Record schema (Phase 1, locked + Phase 2 enrichment fields)

```json
{
  "id": "rec_<8-byte-hex>",
  "artist": "string",
  "title": "string",
  "year": null | number,
  "genre": null | "string",
  "cover_url": null | "string",
  "notes": "",
  "created_at": "ISO timestamp",
  "discogs_release_id": null | number,
  "price_low": null | number,
  "price_high": null | number,
  "price_median": null | number,
  "price_currency": null | "string",
  "price_last_sold": null | "string",
  "price_updated_at": null | "ISO timestamp",
  "copies_available": null | number,
  "have_count": null | number,
  "want_count": null | number,
  "rating_avg": null | number,
  "rating_count": null | number
}
```

Base fields locked. Enrichment fields (Discogs ID, pricing, community stats) are optional and populated incrementally. If Phase 2 adds more fields, they are added via additive migration, never replacing existing ones.

---

## Catalog seeding & editing workflow (Phase 1)

**Seeding (new records):**
1. Susan photographs albums in groups of 3–6 per shot
2. Susan uploads photos to chat
3. Claude (in chat) looks at each photo, identifies each cover, produces a JSON array of record objects
4. Susan visits `/seed.html`, pastes the JSON, taps "Add" (writes use the edit secret)
5. Each record is upserted by its `id` (Claude generates unique IDs)
6. Susan reviews the collection in `/`

**Editing (existing records):** Susan uses `/audit.html` — inline-edit text fields, delete a row (one at a time, confirm-gated), or tap a cover to upload replacement artwork.

No automation between chat and the site. Chat → JSON → paste → add. Every link in this chain is auditable by Susan.

---

## Endpoints (deployed)

- `GET  /api/records` — public; returns all records as a JSON array
- `POST /api/records` — edit-secret required; upsert one record by `id`
- `DELETE /api/records/:id` — edit-secret required; delete one record by `id`
- `GET  /api/backup?key=…` — reads the store, commits `backups/YYYY-MM-DD.json` to the repo; pure read of the store. Scheduled function runs the same nightly.

---

## Glossary

- **Record**: One row in the catalog. One physical LP.
- **Records store**: The Netlify Blobs store named `records`. One JSON blob per record.
- **Seed**: A chat-generated JSON array Susan pastes into `/seed.html` to bulk-add.
- **Audit page**: `/audit.html` — the hand-edit UI (inline edit, single delete, cover upload).
- **Edit secret**: A single shared passphrase that gates `POST`/`DELETE`. Entered by Susan in the page UI, sent as a request header, validated server-side against an env var. Reads do not require it.
- **Backup**: A JSON snapshot of all records committed to `backups/YYYY-MM-DD.json` in the repo, nightly and on demand.
- **Phase 1**: This phase. Vision-identified records, audit page for hand-edits.
- **Phase 2**: Discogs enrichment (pressing data, pricing, ratings, community stats).
- **Phase 3**: Wishlist feature (Spotify integration + manual cherry-pick).
- **Catalog**: Susan's full collection. Reset empty after May 2026; now 92 records live as of June 30, 2026.

# Vinyl Scout — Project Charter

**Version:** 5 · **Last revised:** 2026-06-01

**Changelog**
- **v5 (2026-06-01)** — **Phase 2 shipped and live** (`/api/discogs/lookup` + `/audit.html` v10 deployed; `DISCOGS_TOKEN` set in Netlify; endpoint confirmed returning real candidates). Reconciled two drifts found while reading the live `audit.html`: (a) added the live **`condition`** field (Goldmine grade short-code, default `VG`) to the schema; (b) corrected the cover mechanism — audit-page uploads POST to **`/api/save-cover`** which returns a hosted `cover_url`, NOT a `data:` URL as v3 stated. The lookup endpoint is intentionally **ungated** (pure read of public Discogs data; needs only `DISCOGS_TOKEN`).
- **v4 (2026-06-01)** — Unparked **Phase 2 (Discogs lookup for pressing accuracy)** as an owner decision. Scoped as a manual, per-record, propose-and-confirm lookup: a pure-read lookup endpoint returns Discogs candidates; accepting a pressing writes via the existing single-upsert path. Five additive optional fields (`discogs_release_id`, `label`, `catalog_no`, `country`, `format`). No auto-sync, no background enrichment. Discogs token handled server-side like the edit secret.
- **v3 (2026-06-01)** — Adopted the cover-art source policy: Apple Music primary, Wikipedia Special:FilePath fallback, audit-page data-URL upload as the durable backstop. Dropped Cover Art Archive as a primary source after it link-rotted on Portishead *Dummy*. Catalog at 93 records (duplicates cleared, flagged records resolved).
- **v2 (2026-05-28)** — Reconciled the charter with what's actually deployed: added `/audit.html` (inline edit / delete / cover-upload) and git backups to Phase 1 scope; documented the `/api/backup` endpoints; updated catalog state (~91 records, covers applied). Adopted two new Phase 1 items: SEO suppression (noindex) and write-protection (shared edit secret on `POST`/`DELETE`). Added this version header.
- **v1 (2026-05-21)** — Phase 1 reset after the May 2026 data-loss incident.

---

## Identity

**Vinyl Scout** is Susan's personal vinyl record cataloging app. Lives at vinylscout.org on Netlify. Susan has ~75 LPs; the catalog currently holds 93 records (real seeding done, duplicates cleared and flagged titles resolved). She works primarily from mobile (iPhone, Safari).

The site is **publicly viewable but not advertised**: it's excluded from search engines (noindex), and the only people who edit it are those who hold the edit secret. It is not a private/login-walled site — anyone with the URL can view the gallery.

Aesthetic: editorial / record-shop / library catalog card.
- Fraunces italic display serif · IBM Plex Sans body · IBM Plex Mono for catalog numbers
- Cream `#f1ebdc` ground · ink `#1c2018` text · vinyl-red `#b53026` accent · gold `#a8801c` for metadata
- Subtle paper-noise radial gradients
- No emoji in UI chrome (the camera 📷 icon is the only exception)

---

## Phase 1 — Current scope: barebones cataloging via vision

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
- Record fields: `id`, `artist`, `title`, `year` (optional), `genre` (optional), `cover_url` (optional), `notes` (optional), `created_at`

### OUT of scope for Phase 1 (do not build, do not "just add it while we're here")

- ❌ Discogs API of any kind (search, sync, pricing, restore, lookup)
- ❌ OCR / Tesseract
- ❌ Grading / Goldmine pricing / marketplace
- ❌ User accounts / per-user login / third-party auth (the write-gate is a single shared secret, nothing more)
- ❌ Dedup of any kind (banned — see Hard Rules)
- ❌ Background enrichment / auto-backfill
- ❌ Triage views (Inbox / Accepted / Passed)
- ❌ "Nice to have" features Susan didn't ask for

### Parked for future phases — do not start

- Phase 3: Pricing & marketplace
- Phase 4: Listing & selling

(Phase 2 was unparked in v4 — see the Phase 2 section below.) When asked about a still-parked feature, say "that's Phase N, parked" and stop.

---

## Phase 2 — Discogs lookup for pressing accuracy (SHIPPED 2026-06-01)

**The whole thing in one sentence**: From `/audit.html`, Susan triggers a per-record Discogs lookup, reviews candidate pressings, and accepts the right one into that single record — manual, opt-in, propose-and-confirm.

### Model (locked)

- **Manual, per-record, propose-and-confirm.** Susan taps "look up pressing" on one record. The system searches Discogs for that artist/title and returns candidate releases. Susan picks the right pressing. Only the fields she accepts are written, to that one record.
- It **never reaches out on its own** and **never touches a record Susan didn't action.**

### In scope

- One lookup endpoint (e.g. `GET /api/discogs/lookup`) — queries Discogs, returns candidate releases as JSON. **Pure read; it cannot write to the records store** (same rule as `/api/backup`).
- Audit-page UI: a per-row "look up pressing" affordance, a candidate-picker, and an explicit accept action.
- Accepting a pressing writes via the **existing** `POST /api/records` single-upsert path. No new mutation surface.
- Five new optional, nullable fields via **additive migration** (existing fields never touched): `discogs_release_id`, `label`, `catalog_no`, `country`, `format`. `catalog_no` renders in IBM Plex Mono.
- Discogs API token stored in a Netlify env var, used **server-side only**, never committed or sent to the browser — handled exactly like the edit secret.

### OUT of scope for Phase 2

- ❌ Auto-sync / background enrichment / auto-backfill of any kind — every Discogs call is one Susan triggers.
- ❌ Bulk lookup or "look up everything" — one record per invocation.
- ❌ Writing from the lookup endpoint — it is a pure read.
- ❌ Pricing / marketplace / grading (that is Phase 3, still parked).

### Prerequisite (Susan's action, not a code blocker)

- A Discogs personal access token (Discogs → Settings → Developers). Added to Netlify env vars before the lookup endpoint can work.

---

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
- [ ] Cache-bust version bumped in `index.html` and `seed.html` (and `audit.html` if its script changed)
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

## Record schema (Phase 1, locked)

```json
{
  "id": "rec_<8-byte-hex>",
  "artist": "string",
  "title": "string",
  "year": null | number,
  "genre": null | "string",
  "cover_url": null | "string",
  "condition": "VG",
  "notes": "",
  "created_at": "ISO timestamp"
}
```

`condition` is a Goldmine grade **short code** stored on the record (one of `M, NM, VG+, VG, G+, G, F, P`), default `VG`, set via the audit page's grade dropdown and displayed as its spelled-out name. (Recording a grade is benign cataloging; the parked Phase 3 item is using grades as *pricing multipliers*, which is still not built.)

No other Phase 1 fields. `cover_url` may hold either an external URL (e.g. an Apple Music / Cover Art Archive image) or a `data:` URL produced by the audit page's browser-side compression.

**Phase 2 additive fields (all optional, nullable; added by additive migration, never replacing Phase 1 fields):**

```json
{
  "discogs_release_id": null | number,
  "label": null | "string",
  "catalog_no": null | "string",
  "country": null | "string",
  "format": null | "string"
}
```

---

## Cover-art source policy (Phase 1)

Covers are resolved most-durable-wins. Cover Art Archive is no longer a primary source — it link-rotted on Portishead *Dummy* (May 2026).

1. **Default (seed JSON):** Apple Music artwork — `https://is1-ssl.mzstatic.com/.../600x600bb.jpg`. Proven reliable; this is what the 13-cover batch used.
2. **External fallback (gaps only):** Wikipedia `Special:FilePath/<exact filename>?width=500`. Use only when Apple has nothing. Requires the exact file name; covers may be non-free / lower-res and a rename or deletion can still break the link.
3. **Durable backstop (anything that matters or breaks):** upload the sleeve on `/audit.html`. The browser compresses it, then POSTs the bytes to **`/api/save-cover`**, which stores the image server-side and returns a hosted `cover_url` written onto the record. (Earlier charter versions described this as a `data:` URL stored inline — that was wrong; the real mechanism is the `/api/save-cover` endpoint.) No reliance on a third-party image host, so external link rot can't recur. Default to this for Ellington '65 and any future broken cover.

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
- `GET  /api/discogs/lookup` *(Phase 2)* — queries Discogs for candidate pressings; returns JSON candidates. Pure read; never writes to the records store. Uses the Discogs token from a server-side env var.
- `POST /api/save-cover` — edit-secret required; accepts `{recordId, contentType, dataBase64}`, stores the image server-side, returns `{cover_url}` (a hosted URL the caller then writes onto the record via `POST /api/records`).

---

## Glossary

- **Record**: One row in the catalog. One physical LP.
- **Records store**: The Netlify Blobs store named `records`. One JSON blob per record.
- **Seed**: A chat-generated JSON array Susan pastes into `/seed.html` to bulk-add.
- **Audit page**: `/audit.html` — the hand-edit UI (inline edit, single delete, cover upload).
- **Edit secret**: A single shared passphrase that gates `POST`/`DELETE`. Entered by Susan in the page UI, sent as a request header, validated server-side against an env var. Reads do not require it.
- **Backup**: A JSON snapshot of all records committed to `backups/YYYY-MM-DD.json` in the repo, nightly and on demand.
- **Phase 1**: This phase. Vision-identified records, no third parties.
- **Catalog**: Susan's full collection. Reset empty after May 2026; now 93 records.

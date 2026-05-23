# Vinyl Scout — Project Charter

## Identity

**Vinyl Scout** is Susan's personal vinyl record cataloging app. Lives at vinylscout.org on Netlify. Susan has ~75 LPs and is in manual catalog-building phase. She works primarily from mobile (iPhone, Safari).

Aesthetic: editorial / record-shop / library catalog card.
- Fraunces italic display serif · IBM Plex Sans body · IBM Plex Mono for catalog numbers
- Cream `#f1ebdc` ground · ink `#1c2018` text · vinyl-red `#b53026` accent · gold `#a8801c` for metadata
- Subtle paper-noise radial gradients
- No emoji in UI chrome (the camera 📷 icon is the only exception)

---

## Phase 1 — Current scope: barebones cataloging via vision

**The whole thing in one sentence**: A static site that displays Susan's vinyl collection, with new records added by Claude looking at photos Susan uploads in chat.

### In scope

- One persistent record store (Netlify Blobs, store name: `records`)
- One read endpoint (`GET /api/records`) — strictly read-only
- One write endpoint (`POST /api/records` or `PUT /api/records/:id`) — upsert by ID only
- One delete endpoint (`DELETE /api/records/:id`) — single ID only, no bulk variant
- One static page (`/`) showing the collection as a gallery
- One static page (`/seed.html`) where Claude-generated JSON gets pasted in to bulk-add
- Record fields: `id`, `artist`, `title`, `year` (optional), `genre` (optional), `cover_url` (optional), `notes` (optional), `created_at`

### OUT of scope for Phase 1 (do not build, do not "just add it while we're here")

- ❌ Discogs API of any kind (search, sync, pricing, restore, lookup)
- ❌ OCR / Tesseract
- ❌ Grading / Goldmine pricing / marketplace
- ❌ Auth (site is public)
- ❌ Dedup of any kind (banned — see Hard Rules)
- ❌ Background enrichment / auto-backfill
- ❌ Edit-in-place / inline editing UI
- ❌ Multiple views (Inbox / Accepted / Passed)
- ❌ "Nice to have" features Susan didn't ask for

### Parked for future phases — do not start

- Phase 2: Discogs lookup for pressing accuracy
- Phase 3: Pricing & marketplace
- Phase 4: Listing & selling

When asked about a parked feature, say "that's Phase N, parked" and stop.

---

## Hard Rules — NON-NEGOTIABLE

### 1. The catalog is sacred

The previous version lost 29 records to a dedup race condition. That cannot happen again. Therefore:

- **No bulk-delete code paths.** Ever. No function may call delete on more than one record per invocation.
- **No auto-dedup.** Banned from the codebase. If duplicates appear, they appear. Susan deletes them manually one at a time.
- **No background mutation.** List/read endpoints are pure reads. They cannot write to storage under any circumstance.
- **All writes are upserts by ID.** Never "replace all records with this array."
- **Single-record delete only**, gated by a UI `confirm()` dialog.

### 2. Scope is sacred

If a feature wasn't explicitly requested in this charter or in a current ask, don't build it. When tempted to add a "nice to have," ask first.

### 3. Deploys are versioned

Every code change bumps the cache-bust version in `/app.js?v=N` and `/style.css?v=N`. The current `N` is documented at the top of `app.js` in a `// version: N` comment.

### 4. No silent failures

Every error path renders a visible, persistent error in the UI with the actual error text. No `setTimeout(hideError, …)` cleanup that swallows diagnostics. Mobile has no console.

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
- [ ] Cache-bust version bumped in `index.html` and `seed.html`
- [ ] Cross-file references verified: imports resolve, CSS classes match selectors, frontend API paths match backend `export const config = { path }`
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
  "notes": "",
  "created_at": "ISO timestamp"
}
```

No other fields. If Phase 2 adds Discogs enrichment, fields are added via additive migration, never replacing existing ones.

---

## Catalog seeding workflow (Phase 1)

1. Susan photographs albums in groups of 3–6 per shot
2. Susan uploads photos to chat
3. Claude (in chat) looks at each photo, identifies each cover, produces a JSON array of record objects
4. Susan visits `/seed.html`, pastes the JSON, taps "Add"
5. Each record is upserted by its `id` (Claude generates unique IDs)
6. Susan reviews the collection in `/`

No automation between chat and the site. Chat → JSON → paste → add. Every link in this chain is auditable by Susan.

---

## Glossary

- **Record**: One row in the catalog. One physical LP.
- **Records store**: The Netlify Blobs store named `records`. One JSON blob per record.
- **Seed**: A chat-generated JSON array Susan pastes into `/seed.html` to bulk-add.
- **Phase 1**: This phase. Vision-identified records, no third parties.
- **Catalog**: Susan's full collection. Started empty after May 2026 data loss.

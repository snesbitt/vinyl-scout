# Vinyl Scout — Project Charter

*Charter v1.1 — updated 2026-05-23 with lessons from Phase 1 POC*

## Identity

**Vinyl Scout** is Susan's personal vinyl record cataloging app. Lives at vinylscout.org on Netlify. Susan has ~75 LPs and is in manual catalog-building phase. She works on both mobile (iPhone, Safari) and desktop (Chrome).

**Deployment**: GitHub repo `snesbitt/vinyl-scout` → `git push origin main` → Netlify auto-deploys main branch in ~30-60 seconds. Local repo at `/Users/snesbitt/Downloads/vinyl-scout-deploy`.

Aesthetic: editorial / record-shop / library catalog card.
- Fraunces italic display serif · IBM Plex Sans body · IBM Plex Mono for catalog numbers
- Cream `#f1ebdc` ground · ink `#1c2018` text · vinyl-red `#b53026` accent · gold `#a8801c` for metadata
- Subtle paper-noise radial gradients
- No emoji in UI chrome (the camera 📷 icon is the only exception)

---

## Phase 1 — Current scope: barebones cataloging via vision

**The whole thing in one sentence**: A static site that displays Susan's vinyl collection, with new records added by Claude looking at photos Susan uploads in chat.

**STATUS: POC complete (2026-05-23). 5 test records live, DELETE works end-to-end, ready for real catalog seeding.**

### In scope

- One persistent record store (Netlify Blobs, store name: `records`)
- One read endpoint (`GET /api/records`) — strictly read-only
- One write endpoint (`POST /api/records`) — upsert by ID only
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

Every code change bumps the cache-bust version in `/app.js?v=N` and `/style.css?v=N`. The current `N` is documented at the top of `app.js` in a `// version: N` comment. **Current production version: 3.**

### 4. No silent failures

Every error path renders a visible, persistent error in the UI with the actual error text. No `setTimeout(hideError, …)` cleanup that swallows diagnostics. Mobile has no console.

### 5. Honesty over confidence

If a release ID, identification, or fact is uncertain, say so. Don't fabricate confidence Susan can't verify.

### 6. Diagnose before patching *(new — 2026-05-23)*

When Susan reports "it's broken", the FIRST step is always to read the actual state of the deployed system — never go straight to patching from suspicion. Concretely:
- For server bugs: `curl -sv https://vinylscout.org/api/records 2>&1 | tail -40`
- For client bugs: `curl -s https://vinylscout.org/app.js | sed -n '30,50p'` (or whatever range matches the reported error line)
- For deploy state: `git log --oneline -5` to see what's actually on main

Spending 5 seconds to curl beats 30 minutes of rewriting code that wasn't the problem. This rule is in here because we violated it heavily on 2026-05-23.

### 7. No heredocs with JS template literals *(new — 2026-05-23)*

zsh corrupts `cat << 'EOF'` heredocs when the JS payload contains backticks, `${...}`, or `onerror="..."` attributes. The corruption embeds the literal heredoc wrapper line INTO the file as actual JavaScript, causing a `SyntaxError: Invalid regular expression flags` that's nearly invisible in chat (you have to curl the deployed file to see it). Rules:

- **For full-file writes**: use `python3 << 'PYEOF'` with `print(r'''...''')` (raw triple-quoted Python string). Survives any JS payload.
- **For one-line edits**: use `sed -i ''` with `|` as the delimiter (avoids escaping `/` in paths).
- **Always verify after writing**: `wc -l file`, `grep -n "cat >\|EOF\|PYEOF" file` (should be empty), `node --check file`.

---

## QA discipline — required for every iteration

Before delivering ANY code change, Claude runs this checklist explicitly in the response:

### Pre-flight (state these upfront)
- [ ] One-sentence scope of the change
- [ ] Files that will be modified (by name)
- [ ] Confirmed in-scope for Phase 1 (or asked Susan if not)
- [ ] **(new) Read the live deployed state first — curl the relevant endpoint or file**

### Code-level
- [ ] Every modified file passes `node --check` (or equivalent syntax check)
- [ ] No `deleteRecord`, `.delete(`, bulk-delete, or dedup logic added anywhere
- [ ] No new function mutates storage from a read endpoint
- [ ] Cache-bust version bumped in `index.html` and `seed.html`
- [ ] Cross-file references verified: imports resolve, CSS classes match selectors, frontend API paths match backend `export const config = { path }`
- [ ] Dead code removed (unused functions, abandoned imports)
- [ ] No `setTimeout` patterns that hide errors
- [ ] **(new) After writing files: `grep -n "cat >\|EOF\|PYEOF"` returns nothing**

### Deploy verification *(new — 2026-05-23)*
- [ ] `git status` confirms expected files are staged
- [ ] `git diff` shown to Susan if change is non-trivial — she eyeballs before commit
- [ ] `git push origin main` actually executed (not just `git commit` — push too)
- [ ] Wait ~30-60s for Netlify build
- [ ] `curl -s https://vinylscout.org/<changed-file>` shows the new content (catches "I forgot to push" and "Netlify build failed silently")

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
- **Never put credentials in chat.** If Susan accidentally pastes a token, tell her immediately to revoke it.

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

### Cover URL strategy *(working notes — 2026-05-23)*

MusicBrainz Cover Art Archive (`https://coverartarchive.org/release/<MBID>/front-500`) works reliably for major-label modern releases (verified rendering: Portishead Dummy, Fleetwood Mac Rumours, Steely Dan Aja). It is UNRELIABLE for older or smaller-label releases — server returns an image to curl/web_fetch but the browser fails to render (likely hotlink protection or CORS). Known gaps from POC: Nina Simone "Little Girl Blue" (1958 Bethlehem), Moby "Play". Next session priority: evaluate Wikipedia `Special:FilePath` URLs as a more reliable fallback. Until then, `cover_url: null` is acceptable for any record where the URL doesn't visibly render in-browser. **Better to leave null than to ship a broken-image placeholder.**

---

## Deployed system inventory *(as of 2026-05-23)*

| File | Purpose | Notes |
|------|---------|-------|
| `index.html` | Gallery page | Loads `/app.js?v=3` and `/style.css?v=3` |
| `seed.html` | JSON-paste bulk-add UI | No auto-redirect on partial failure |
| `app.js` | Frontend module | ~158 lines. Event-delegated DELETE on `#card-stack`. No `window.deleteRecord` global. |
| `style.css` | All styling | Cream/ink/red/gold palette, library-card layout |
| `netlify/functions/records.mjs` | Single function for GET/POST/DELETE | Uses `new URL(req.url).pathname` (NOT `req.path` — that's undefined in v2). Path config: `/api/records/:id?` |
| `PROJECT.md` | This charter | Canonical scope + rules document |
| `README.md` | Pointer to charter | One paragraph |

**Endpoints**:
- `GET /api/records` → returns `[{record}, ...]` (all records, no filtering)
- `POST /api/records` with `{id, ...}` body → upserts by id
- `DELETE /api/records/:id` → deletes single record by id (400 if id missing or literal `"records"`)

**Netlify Blobs store**: name `records`, global scope (NOT deploy-scoped). One JSON blob per record, keyed by record id.

---

## Glossary

- **Record**: One row in the catalog. One physical LP.
- **Records store**: The Netlify Blobs store named `records`. One JSON blob per record.
- **Seed**: A chat-generated JSON array Susan pastes into `/seed.html` to bulk-add.
- **Phase 1**: This phase. Vision-identified records, no third parties.
- **Catalog**: Susan's full collection. Started empty after May 2026 data loss.
- **POC**: Proof of concept — completed 2026-05-23 with 5 test records.

---

## Changelog

- **v1.1 (2026-05-23)** — Phase 1 POC complete. Added Hard Rules 6 (Diagnose before patching) and 7 (No heredocs with JS template literals). Added Deploy Verification section to QA checklist. Added Cover URL strategy notes. Added Deployed system inventory table. Pinned current production cache-bust version at v=3.
- **v1.0 (2026-05-21)** — Initial charter after data-loss incident and Phase 3 scope-creep reset.


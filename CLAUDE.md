# CLAUDE.md — Vinyl Scout

Operating guide for agents working in this repo. **`PROJECT.md` is the charter
and the source of truth** for scope, hard rules, the record schema, and the QA
checklist. This file is the *how it runs* layer; when the two disagree about
scope, `PROJECT.md` wins. Read both before changing anything.

## What this is

Vinyl Scout (vinylscout.org) is Susan's single-user vinyl catalog: a **no-build
static site** on Netlify with a handful of Netlify Functions over one Netlify
Blobs store. Publicly viewable, `noindex`, writes gated by a shared secret.
Susan works mostly from an iPhone in Safari — mobile-first, always.

## Repo layout

    index.html         Gallery + detail modal (loads app.js, style.css)
    seed.html          Paste Claude-generated JSON to bulk-add (writes gated)
    audit.html         Hand-edit: inline edit, single delete, cover upload
    wishlist.html      Hunt list — add/delete are UNGATED (no edit secret, see below)
    guide.html         User-facing how-to guide
    about/roadmap.html Static info pages
    app.js             Frontend (vanilla IIFE). Cache-bust: // version: N
    style.css          Styles. Cache-bust via ?v=N in <link>
    netlify.toml       publish=".", functions dir, security headers, ignore cmd
    netlify/functions/ One file per endpoint; path set by export const config
      records.mjs        /api/records/:id?   GET public · POST/DELETE gated
      save-cover.mjs     /api/save-cover     POST gated · commits covers/<id>
      backup-http.mjs    /api/backup         GET  gated (manual backup)
      backup.mjs         scheduled 09:00 UTC nightly backup (not HTTP-reachable)
      discogs-lookup.mjs /api/discogs/lookup GET ungated · pure read
      discogs-pricing.mjs/api/discogs-pricing POST · writes record · scrapes
      wishlist.mjs       /api/wishlist/:id?  GET public · POST/DELETE UNGATED (see below)
      spotify-preview.mjs/api/spotify/preview GET ungated · pure read (audio preview)
    netlify/lib/run-backup.mjs  Shared backup logic (pure read → git commit)
    covers/            Album art committed by save-cover
    backups/           Daily JSON snapshots committed by run-backup
    scripts/           netlify-ignore.sh (deploy gate) + smoke.mjs + helpers
    PROJECT.md         The charter (scope, hard rules, schema, QA checklist)

## How it deploys

- Push to `main` → Netlify auto-deploys. No build step (static publish=".").
- `scripts/netlify-ignore.sh` (wired as `[build] ignore`) **skips** a deploy
  when only docs/dev files changed (*.md, scripts/, backups/, .gitignore).
  Touching *.html/*.js/*.css/covers/netlify/** triggers a real deploy.
- Functions bundle with esbuild. Each function declares its own route via
  `export const config = { path: ... }` — there are no redirects in toml.

## Locked conventions (do not break — see PROJECT.md "Hard Rules")

- **Catalog is sacred.** No bulk-delete, no dedup, no background mutation.
  All writes are single-record upserts by `id`. Read endpoints never write.
- **Secrets travel in headers, never in URLs** and are never committed or baked
  into served HTML. Validated server-side against env vars; gates fail closed.
  **Exception: `/api/wishlist` POST/DELETE are deliberately ungated** (no
  X-Edit-Key check) — removed 2026-07-11 at Susan's explicit request, because
  typing the edit passphrase on mobile every session wasn't practical for a
  page she uses casually. This is scoped to the wishlist store only; the
  catalog (`/api/records`) and covers (`/api/save-cover`) remain fully gated.
  Don't "fix" the wishlist gate back in without asking Susan first.
- **Versioned deploys.** Every functional change bumps the cache-bust `?v=N`
  in index.html/seed.html (and audit.html if its inline script changed) and the
  `// version: N` comment at the top of app.js / the changed function.
- **No silent failures.** Every error path shows visible, persistent error text
  (mobile has no console). No setTimeout-hides-error patterns.
- **Mobile-first.** Check 375px viewport; tap targets ≥44px; inputs ≥16px font.

## Environment variables (set in the Netlify web UI — never on a CLI)

| Var            | Used by                          | Purpose                                    | Required for           |
|----------------|----------------------------------|--------------------------------------------|------------------------|
| EDIT_SECRET    | records.mjs, save-cover.mjs      | Gates POST/DELETE writes (X-Edit-Key)      | All writes / covers    |
| BACKUP_SECRET  | backup-http.mjs                  | Gates manual GET /api/backup (X-Backup-Key)| Manual backup          |
| DISCOGS_TOKEN  | discogs-lookup, discogs-pricing  | Discogs auth, server-side only             | Pressing/market lookup |
| GITHUB_TOKEN   | save-cover, run-backup           | Commits covers + backups via GitHub API    | Covers + backups       |
| GITHUB_REPO    | save-cover, run-backup           | Target repo (default snesbitt/vinyl-scout) | optional               |
| GITHUB_BRANCH  | save-cover, run-backup           | Target branch (default main)               | optional               |
| SPOTIFY_CLIENT_ID     | spotify-preview.mjs       | Spotify client-credentials auth            | Audio preview          |
| SPOTIFY_CLIENT_SECRET | spotify-preview.mjs       | Spotify client-credentials auth            | Audio preview          |

Secrets are managed by Susan in the Netlify UI. Agents never echo, log, or pass
a token value on a command line or in a commit.

## Definition of done

A change is done only when **all** of these hold:

1. **Syntax:** `npm run check` passes (node --check on every function/lib file).
2. **Charter QA checklist** (PROJECT.md → "QA discipline") is satisfied:
   no bulk-delete/dedup added, read endpoints still pure, cache-bust bumped,
   cross-file refs verified, secrets in headers only.
3. **Smoke:** after the deploy goes green, `npm run smoke` passes against the
   live site (asserts the gallery loads, /api/records returns records, write
   endpoints reject unauthenticated writes, security/noindex headers present).
   **Build-green ≠ healthy** — the smoke test is what proves healthy.
4. Susan has the post-flight summary (what changed, files, deploy steps, how to
   verify, how to roll back, new ?v=N).

## Charter drift to be aware of

**Local clones drift from `origin/main` here** — several automations (a
weekly Discogs/Spotify/Amazon-cart sync, a daily health watchdog) commit
straight to GitHub via the API, outside of Susan's local `git` workflow. A
local clone that hasn't pulled in a while can be many commits behind without
any local changes to show for it. **Before starting local work or handing
Susan a `git push` recipe, check `git fetch && git status` (or diff HEAD
against `origin/main`) for divergence** — don't assume a stale local base is
current. (This bit a 2026-07-11 session: a local clone ~9 days behind picked
up the Phase 3 Wishlist build, the weekly scout automation, and `guide.html`
only when the divergence was noticed and manually reconciled file-by-file.)

Phase 4 (Audio Preview, `spotify-preview.mjs` + the detail-modal Play button)
was built at Susan's explicit request, ahead of the phase queue — Wishlist,
which was actually next in line, is Phase 3 and shipped earlier (2026-07-04).
Audio preview currently covers the collection detail modal only; wishlist
playback was mentioned in the original roadmap sketch but is not yet built.
`PROJECT.md` documents both as their own phases. When in doubt about what's
actually live vs. what a phase label says, read the repo (or ask Susan)
rather than trusting a "parked"/"planned" status by itself.

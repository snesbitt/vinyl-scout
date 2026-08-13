# Vinyl Scout

Susan's personal vinyl record cataloging app. Single-user, hosted on Netlify at vinylscout.org.

## Scope

Catalog (Phase 1), Discogs enrichment (Phase 2), wishlist (Phase 3), audio preview (Phase 4), and concert radar (Phase 11) are all live. See `PROJECT.md` for the canonical charter, hard rules, and what is and is not in scope. `PROJECT.md` is the source of truth. This README isn't.

## Deploy

Push to `main`; Netlify auto-deploys. As of 2026-08-13, GitHub Actions also runs its own deploy job on every push to `main` (`.github/workflows/test.yml`'s `deploy` job, gated on tests passing) — both currently fire on the same push until Netlify's own "auto publishing" is turned off in its site settings. See `CLAUDE.md`'s 2026-08-13 "GitHub Actions Phase 1" entry for the full migration plan.

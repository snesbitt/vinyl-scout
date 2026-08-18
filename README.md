# Vinyl Scout

Susan's personal vinyl record cataloging app. Single-user, hosted on Netlify at vinylscout.org.

## Scope

All eleven roadmap phases are live: catalog, Discogs enrichment, wishlist, audio preview, reliability work, the editorial pass, iOS home-screen launch, the wishlist edit-key gate, wishlist sorting, the Travel Intelligence hand-off, and concert radar. `PROJECT.md` is the canonical charter: hard rules, and what is and isn't in scope. It's the source of truth. This README isn't.

## Deploy

Push to `main` and Netlify auto-deploys. Since 2026-08-13, GitHub Actions runs its own deploy job on every push to `main` as well (`.github/workflows/test.yml`'s `deploy` job, gated on tests passing). Both fire on the same push until Netlify's own "auto publishing" is turned off in its site settings. See `CLAUDE.md`'s 2026-08-13 "GitHub Actions Phase 1" entry for the migration plan.

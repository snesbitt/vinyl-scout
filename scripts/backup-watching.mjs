#!/usr/bin/env node
// scripts/backup-watching.mjs
// version: 2
//
// GitHub Actions-native replacement for netlify/functions/backup-watching.mjs
// + netlify/lib/run-watching-backup.mjs, added as part of the same
// Netlify-to-GitHub cost/reliability migration scripts/backup-catalog.mjs
// started (see that file's own header, and CLAUDE.md's 2026-08-09 "later"
// entry — the original architecture-review recommendation lived in
// claude/weekend-netlify-github-cost-plan-2026-08-08.md, in the "Travel
// Intelligence Agent" Claude project).
//
// Same shape as backup-catalog.mjs, same reasoning: this script has no
// Netlify Blobs execution context (Actions runs outside Netlify entirely),
// so it cannot call getStore('watching') directly the way
// run-watching-backup.mjs does. Instead it reads the exact same data
// through the site's own public, unauthenticated GET endpoint —
// https://vinylscout.org/api/watching — which already filters out the
// `_meta_seed_v16_done` sentinel record server-side (see watching.mjs's own
// GET handler), so this script doesn't need to reimplement that filtering
// the way run-watching-backup.mjs's isSentinel() does for its direct
// Blobs read. Needs ZERO new secrets: no Netlify API token, nothing beyond
// the workflow's own built-in GITHUB_TOKEN (used only for `git commit`/
// `push`, handled by the workflow file itself, not by this script).
//
// Deliberately does NOT treat a zero-item result as an error the way
// backup-catalog.mjs does for an empty catalog — the Watching list is a
// small, casually-curated set (Susan has cleared it before, e.g. the
// 2026-08-09 deletions of Black Uhuru/Burning Spear/Ziggy Marley), so an
// empty list is a plausible real state, not a signal something's broken.
//
// HARD RULES respected, same as run-watching-backup.mjs:
//   - Pure read of the live site's public API. Never mutates anything.
//   - One direction: site -> snapshot file. Restore is manual, and any
//     future restore must check watching-state.json's `deleted` list
//     before re-adding anything (see watching.mjs v2 / CLAUDE.md's
//     2026-08-09 entry) — this script does not attempt a restore path.
//   - No deletions of old backups.
//   - Fails loudly (non-zero exit) on a bad fetch or non-array response,
//     so a broken run shows up red in the Actions tab instead of silently
//     writing a wrong/empty-looking snapshot that could be mistaken for
//     real data loss.
//
// v2 (2026-09-14): retry the fetch instead of failing on the first hiccup.
// This job had failed intermittently (3 of 32 scheduled runs, ~9%) with no
// code change in between — the live site's own function/Blobs read has
// occasional cold-start or transient-error hiccups (documented elsewhere in
// this repo, e.g. the wishlist's own ~2.5s Blobs-propagation-delay note),
// and a single unlucky request used to fail the whole run. A pure GET with
// no side effects is safe to retry, so it now tries up to 3 times with a
// short backoff before giving up — still fails loudly (see main().catch
// below) if every attempt fails, so a genuinely broken endpoint still shows
// up red in the Actions tab rather than being silently swallowed.

const SITE_URL = process.env.BACKUP_SITE_URL || 'https://vinylscout.org';
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWatchingList() {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(SITE_URL + '/api/watching');
      if (!res.ok) {
        throw new Error('GET /api/watching failed: HTTP ' + res.status);
      }
      const items = await res.json();
      if (!Array.isArray(items)) {
        throw new Error('GET /api/watching did not return an array (got ' + typeof items + ')');
      }
      if (attempt > 1) {
        console.log('backup-watching.mjs: succeeded on attempt ' + attempt + ' of ' + MAX_ATTEMPTS);
      }
      return items;
    } catch (err) {
      lastErr = err;
      console.error('backup-watching.mjs: attempt ' + attempt + ' of ' + MAX_ATTEMPTS + ' failed: ' + err.message);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }
  throw lastErr;
}

async function main() {
  const items = await fetchWatchingList();

  items.sort((a, b) => (a.id || '').localeCompare(b.id || ''));

  const startedAt = new Date().toISOString();
  const today = startedAt.slice(0, 10);
  const snapshot = {
    snapshot_at: startedAt,
    item_count: items.length,
    items: items,
    source: 'github-actions', // distinguishes these snapshots from the older Netlify-scheduled ones, in case both ever coexist during the migration window
  };

  const fs = await import('node:fs/promises');
  const path = 'backups/watching/' + today + '.json';
  await fs.writeFile(path, JSON.stringify(snapshot, null, 2) + '\n', 'utf-8');

  console.log('backup-watching.mjs: wrote ' + path + ' (' + items.length + ' items)');

  // Emit a value the workflow's next step can pick up via GITHUB_OUTPUT,
  // so the workflow can skip the commit entirely if nothing changed
  // (git diff will be empty on a day the watching list genuinely didn't
  // change).
  const ghOutput = process.env.GITHUB_OUTPUT;
  if (ghOutput) {
    await fs.appendFile(ghOutput, 'backup_path=' + path + '\nitem_count=' + items.length + '\n', 'utf-8');
  }
}

main().catch((err) => {
  console.error('backup-watching.mjs failed:', err.message);
  process.exit(1);
});

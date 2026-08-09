#!/usr/bin/env node
// scripts/backup-catalog.mjs
// version: 1
//
// GitHub Actions-native replacement for netlify/functions/backup.mjs +
// netlify/lib/run-backup.mjs, added 2026-08-09 per
// claude/weekend-netlify-github-cost-plan-2026-08-08.md (in the "Travel
// Intelligence Agent" Claude project): move the daily catalog backup off
// Netlify compute entirely, onto a plain script run by GitHub Actions.
//
// Key difference from the Netlify version: this script has no Netlify
// Blobs execution context (Actions runs outside Netlify entirely), so it
// cannot call getStore('records') directly. Instead it reads the exact
// same data through the site's own public, unauthenticated GET endpoint —
// https://vinylscout.org/api/records — the same pattern scheduled-sweep.mjs
// already uses server-to-server against its own site's public API. This
// needs ZERO new secrets: no Netlify API token, nothing beyond the
// workflow's own built-in GITHUB_TOKEN (used only for `git commit`/`push`,
// handled by the workflow file itself, not by this script).
//
// This script does NOT write to GitHub itself via the Contents API the way
// run-backup.mjs does (that was necessary from inside a Netlify Function,
// which has no local git checkout to commit against). Running inside
// Actions, the repo is already checked out locally — this script just
// writes the file to disk; the workflow's own steps do `git add`/`commit`/
// `push` afterward. Simpler, and removes the GITHUB_TOKEN-as-Netlify-env-var
// dependency for this one job (other functions, e.g. wishlist.mjs's
// recordDeletion, still need that PAT for their own reasons — unrelated,
// not removed by this change).
//
// HARD RULES respected, same as run-backup.mjs:
//   - Pure read of the live site's public API. Never mutates anything.
//   - One direction: site -> snapshot file. Restore is manual.
//   - No deletions of old backups.
//   - Fails loudly (non-zero exit) on a bad fetch or empty response, so a
//     broken run shows up red in the Actions tab instead of silently
//     writing an empty/wrong snapshot over a good one.

const SITE_URL = process.env.BACKUP_SITE_URL || 'https://vinylscout.org';

async function main() {
  const res = await fetch(SITE_URL + '/api/records');
  if (!res.ok) {
    throw new Error('GET /api/records failed: HTTP ' + res.status);
  }
  const records = await res.json();
  if (!Array.isArray(records)) {
    throw new Error('GET /api/records did not return an array (got ' + typeof records + ')');
  }
  if (records.length === 0) {
    // A genuinely empty catalog is not plausible for this site; treat as a
    // signal something upstream is broken rather than writing an empty
    // snapshot that would silently look like a real, catastrophic loss to
    // anyone reading backups/ later.
    throw new Error('GET /api/records returned zero records — refusing to write an empty snapshot; investigate before retrying');
  }

  records.sort((a, b) => (a.id || '').localeCompare(b.id || ''));

  const startedAt = new Date().toISOString();
  const today = startedAt.slice(0, 10);
  const snapshot = {
    snapshot_at: startedAt,
    record_count: records.length,
    records: records,
    source: 'github-actions', // distinguishes these snapshots from the older Netlify-scheduled ones, in case both ever coexist during the migration window
  };

  const fs = await import('node:fs/promises');
  const path = 'backups/' + today + '.json';
  await fs.writeFile(path, JSON.stringify(snapshot, null, 2) + '\n', 'utf-8');

  console.log('backup-catalog.mjs: wrote ' + path + ' (' + records.length + ' records)');

  // Emit a value the workflow's next step can pick up via GITHUB_OUTPUT,
  // so the workflow can skip the commit entirely if nothing changed
  // (git diff will be empty on a day the catalog genuinely didn't change).
  const ghOutput = process.env.GITHUB_OUTPUT;
  if (ghOutput) {
    await fs.appendFile(ghOutput, 'backup_path=' + path + '\nrecord_count=' + records.length + '\n', 'utf-8');
  }
}

main().catch((err) => {
  console.error('backup-catalog.mjs failed:', err.message);
  process.exit(1);
});

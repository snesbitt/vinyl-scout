// Vinyl Scout — Watching-store backup logic
// version: 1
//
// Added 2026-08-09 after a data-loss incident: individual artists in the
// `watching` Blobs store (Ziggy Marley, Black Uhuru, Burning Spear) were
// removed via real DELETE calls during a live-verification/testing pass
// that hit production instead of synthetic test data. The `watching` store
// had zero backup coverage before this — unlike `records`, which has had
// `run-backup.mjs` committing daily snapshots since 2026-05-28. This is the
// same pattern, pointed at the `watching` store instead.
//
// Reads every non-sentinel item from the `watching` Blobs store and commits
// a JSON snapshot to backups/watching/YYYY-MM-DD.json in the GitHub repo.
//
// HARD RULES respected (same as run-backup.mjs):
//   - Pure read of the store. Never mutates.
//   - One direction: store -> snapshot. Restore is manual.
//   - No deletions of old backups.

import { getStore } from '@netlify/blobs';

function isSentinel(id) {
  return typeof id === 'string' && id.indexOf('_meta_') === 0;
}

export async function runWatchingBackup() {
  const startedAt = new Date().toISOString();

  const store = getStore('watching');
  const { blobs } = await store.list();
  const items = [];
  for (const { key } of blobs) {
    if (isSentinel(key)) continue;
    const raw = await store.get(key);
    if (!raw) continue;
    try { items.push(JSON.parse(raw)); }
    catch (e) { console.warn('watching-backup: skipped malformed', key, e.message); }
  }
  items.sort((a, b) => (a.id || '').localeCompare(b.id || ''));

  const today = startedAt.slice(0, 10);
  const snapshot = {
    snapshot_at: startedAt,
    item_count: items.length,
    items: items,
  };
  const text = JSON.stringify(snapshot, null, 2);
  const path = `backups/watching/${today}.json`;

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || 'snesbitt/vinyl-scout';
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token) throw new Error('GITHUB_TOKEN not configured');

  const ghHeaders = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'vinyl-scout-watching-backup',
  };

  let existingSha = null;
  const checkRes = await fetch(
    `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`,
    { headers: ghHeaders }
  );
  if (checkRes.ok) {
    const existing = await checkRes.json();
    existingSha = existing.sha;
  }

  const body = {
    message: `watching-backup: ${today} (${items.length} items)`,
    content: Buffer.from(text, 'utf-8').toString('base64'),
    branch: branch,
  };
  if (existingSha) body.sha = existingSha;

  const putRes = await fetch(
    `https://api.github.com/repos/${repo}/contents/${path}`,
    {
      method: 'PUT',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!putRes.ok) {
    const detail = await putRes.text();
    throw new Error(`GitHub commit failed: ${putRes.status} ${detail}`);
  }

  const result = await putRes.json();
  const commitSha = result.commit && result.commit.sha ? result.commit.sha : null;
  console.log(`watching-backup: ${path} (${items.length} items) ${commitSha ? commitSha.slice(0, 7) : '?'}`);

  return {
    ok: true,
    path,
    item_count: items.length,
    commit_sha: commitSha,
    overwrote: !!existingSha,
  };
}

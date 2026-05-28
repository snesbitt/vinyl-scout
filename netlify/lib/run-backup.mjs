// Vinyl Scout — shared backup logic
// version: 1
//
// Reads every record from the `records` Blobs store and commits a JSON
// snapshot to backups/YYYY-MM-DD.json in the GitHub repo.
//
// HARD RULES respected:
//   - Pure read of the store. Never mutates.
//   - One direction: store -> snapshot. Restore is manual.
//   - No deletions of old backups.

import { getStore } from '@netlify/blobs';

export async function runBackup() {
  const startedAt = new Date().toISOString();

  const store = getStore('records');
  const { blobs } = await store.list();
  const records = [];
  for (const { key } of blobs) {
    const raw = await store.get(key);
    if (!raw) continue;
    try { records.push(JSON.parse(raw)); }
    catch (e) { console.warn('backup: skipped malformed', key, e.message); }
  }
  records.sort((a, b) => (a.id || '').localeCompare(b.id || ''));

  const today = startedAt.slice(0, 10);
  const snapshot = {
    snapshot_at: startedAt,
    record_count: records.length,
    records: records,
  };
  const text = JSON.stringify(snapshot, null, 2);
  const path = `backups/${today}.json`;

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || 'snesbitt/vinyl-scout';
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token) throw new Error('GITHUB_TOKEN not configured');

  const ghHeaders = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'vinyl-scout-backup',
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
    message: `backup: ${today} (${records.length} records)`,
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
  console.log(`backup: ${path} (${records.length} records) ${commitSha ? commitSha.slice(0, 7) : '?'}`);

  return {
    ok: true,
    path,
    record_count: records.length,
    commit_sha: commitSha,
    overwrote: !!existingSha,
  };
}

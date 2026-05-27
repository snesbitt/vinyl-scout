// Vinyl Scout — nightly catalog backup to GitHub
// version: 1
//
// Scheduled function. Reads all records from the `records` Blobs store and
// commits a JSON snapshot to backups/YYYY-MM-DD.json in the repo.
//
// HARD RULES respected:
//   - Pure read of the store. Never mutates.
//   - One direction: store -> snapshot. Restore is manual (paste backup JSON into /seed.html).
//   - No deletions of old backups. Files accumulate forever.
//
// Required Netlify env vars:
//   GITHUB_TOKEN  — fine-grained PAT with Contents:Read+Write on snesbitt/vinyl-scout
//   BACKUP_SECRET — any random string; required to manually trigger via /api/backup?key=...
// Optional:
//   GITHUB_REPO   — defaults to snesbitt/vinyl-scout
//   GITHUB_BRANCH — defaults to main

import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  const startedAt = new Date().toISOString();
  const isScheduled = !!(context && context.scheduledTime);

  // Gate manual HTTP hits behind a shared secret.
  // Scheduled invocations bypass via context.scheduledTime.
  if (!isScheduled) {
    const url = new URL(req.url);
    const key = url.searchParams.get('key');
    const expected = process.env.BACKUP_SECRET;
    if (!expected || key !== expected) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // 1. Read every record from the store. Pure read.
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

  // 2. Build the snapshot.
  const today = startedAt.slice(0, 10); // YYYY-MM-DD (UTC)
  const snapshot = {
    snapshot_at: startedAt,
    record_count: records.length,
    records: records,
  };
  const text = JSON.stringify(snapshot, null, 2);
  const path = `backups/${today}.json`;

  // 3. Commit to GitHub via Contents API.
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || 'snesbitt/vinyl-scout';
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token) {
    console.error('backup: GITHUB_TOKEN not set');
    return new Response(JSON.stringify({ error: 'GITHUB_TOKEN not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const ghHeaders = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'vinyl-scout-backup',
  };

  // If today's file already exists, fetch its sha so we can overwrite.
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
    console.error('backup: GitHub PUT failed', putRes.status, detail);
    return new Response(JSON.stringify({
      error: 'GitHub commit failed', status: putRes.status, detail,
    }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  const result = await putRes.json();
  const commitSha = result.commit && result.commit.sha ? result.commit.sha.slice(0, 7) : '?';
  console.log(`backup: ${path} — ${records.length} records — ${commitSha}`);

  return new Response(JSON.stringify({
    ok: true,
    path,
    record_count: records.length,
    commit_sha: result.commit ? result.commit.sha : null,
    overwrote: !!existingSha,
    triggered_by: isScheduled ? 'schedule' : 'manual',
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const config = {
  schedule: '0 9 * * *',  // daily at 09:00 UTC (02:00 PT during DST, 01:00 PT otherwise)
  path: '/api/backup',
};

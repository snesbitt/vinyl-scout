// Vinyl Scout - manual backup trigger
// version: 2
//
// HTTP at /api/backup. Requires X-Backup-Key header matching BACKUP_SECRET.
// Logic lives in ../lib/run-backup.mjs.
//
// v2 (2026-05-28): migrated auth from ?key= query param to X-Backup-Key
// header. Charter Rule 8: secrets travel in headers, never in URLs.
// Status code on bad auth is now 401 (was 403) for consistency with
// /api/records.

import { runBackup } from '../lib/run-backup.mjs';

export default async (req, context) => {
  const provided = req.headers.get('x-backup-key');
  const expected = process.env.BACKUP_SECRET;
  if (!expected || !provided || provided !== expected) {
    return new Response(
      JSON.stringify({ error: 'unauthorized - missing or wrong X-Backup-Key header' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const result = await runBackup();
    return new Response(JSON.stringify({ ...result, triggered_by: 'manual' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('backup (http) failed:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = {
  path: '/api/backup',
};

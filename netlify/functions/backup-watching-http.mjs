// Vinyl Scout - manual backup trigger for the Watching store
// version: 1
//
// HTTP at /api/backup-watching. Requires X-Backup-Key header matching the
// same BACKUP_SECRET already used by /api/backup (records). Logic lives in
// ../lib/run-watching-backup.mjs.

import { runWatchingBackup } from '../lib/run-watching-backup.mjs';

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
    const result = await runWatchingBackup();
    return new Response(JSON.stringify({ ...result, triggered_by: 'manual' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('backup-watching (http) failed:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = {
  path: '/api/backup-watching',
};

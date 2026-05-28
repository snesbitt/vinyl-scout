// Vinyl Scout — manual backup trigger
// version: 1
//
// HTTP at /api/backup. Requires ?key=BACKUP_SECRET.
// Logic lives in ../lib/run-backup.mjs

import { runBackup } from '../lib/run-backup.mjs';

export default async (req, context) => {
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  const expected = process.env.BACKUP_SECRET;
  if (!expected || key !== expected) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
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

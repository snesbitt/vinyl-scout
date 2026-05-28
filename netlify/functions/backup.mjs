// Vinyl Scout — scheduled nightly backup
// version: 2
//
// Pure scheduled trigger. NOT HTTP-reachable. Daily at 09:00 UTC.
// Logic lives in ../lib/run-backup.mjs

import { runBackup } from '../lib/run-backup.mjs';

export default async (req, context) => {
  try {
    const result = await runBackup();
    return new Response(JSON.stringify({ ...result, triggered_by: 'schedule' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('backup (scheduled) failed:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = {
  schedule: '0 9 * * *',
};

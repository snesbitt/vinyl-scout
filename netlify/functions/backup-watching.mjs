// Vinyl Scout — scheduled nightly backup of the Watching store
// version: 1
//
// Pure scheduled trigger. NOT HTTP-reachable. Daily at 09:05 UTC (offset 5
// minutes from the records backup at 09:00 so they don't race on the same
// GitHub API rate-limit window). Logic lives in ../lib/run-watching-backup.mjs

import { runWatchingBackup } from '../lib/run-watching-backup.mjs';

export default async (req, context) => {
  try {
    const result = await runWatchingBackup();
    return new Response(JSON.stringify({ ...result, triggered_by: 'schedule' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('backup-watching (scheduled) failed:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = {
  schedule: '5 9 * * *',
};

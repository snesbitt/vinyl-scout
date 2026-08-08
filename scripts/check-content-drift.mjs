#!/usr/bin/env node
// Content-drift check for Vinyl Scout, same idea as Streaming Scout's
// scripts/check-content-drift.mjs (2026-08-08): about.html's "N records
// tracked" stat tile is a hand-typed number that should always equal the
// real size of the catalog. The daily scheduled backup.mjs function already
// commits a full catalog snapshot to git (backups/YYYY-MM-DD.json, complete
// with a record_count field) — this check reads the latest one and fails
// loudly if about.html has drifted from it.
//
// Deliberately NOT checking the "collection value" stat tile (currently
// "≈€2,232") the same way: that number is explicitly approximate ("≈") and
// tracks live market prices that refresh weekly (see the "Mon weekly price
// refresh" stat tile on the same page) — it will legitimately drift by a
// few euros between refreshes even with zero catalog changes. A strict
// equality check on that figure would fail on totally normal weeks and
// train everyone to ignore this script's real failures. If a future session
// wants to check it, the right shape is a wide tolerance band, not equality
// — worth a separate, explicit decision, not bundled in here.
//
// Add a new check here whenever a future session catches a new instance of
// "the page said X but the data said Y" by hand, so it stops needing to be
// caught by hand.

import { readFileSync, readdirSync } from "node:fs";

let failures = [];

// Check 1: "N records tracked" matches the latest committed backup snapshot.
{
  const backupFiles = readdirSync("backups")
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort(); // YYYY-MM-DD filenames sort chronologically as plain strings

  if (backupFiles.length === 0) {
    failures.push(
      "backups/: no dated snapshot files found at all (backup.mjs may have stopped running, or this check's glob pattern is stale).",
    );
  } else {
    const latestFile = backupFiles[backupFiles.length - 1];
    const backup = JSON.parse(readFileSync(`backups/${latestFile}`, "utf8"));
    const declaredCount = backup.record_count;
    const actualCount = Array.isArray(backup.records) ? backup.records.length : null;

    if (actualCount === null) {
      failures.push(
        `backups/${latestFile}: no "records" array found (backup format may have changed; update this check).`,
      );
    } else if (declaredCount !== actualCount) {
      // The backup file disagreeing with itself is a bug in backup.mjs, not
      // in about.html — worth surfacing distinctly so it's not misread as a
      // content-drift issue on the About page.
      failures.push(
        `backups/${latestFile}: its own record_count (${declaredCount}) doesn't match its records array length (${actualCount}). This is a backup.mjs bug, not an about.html drift issue.`,
      );
    } else {
      const about = readFileSync("about.html", "utf8");
      const statMatch = about.match(
        /<span class="stat-tile__num">(\d+)<\/span><span class="stat-tile__label">records tracked<\/span>/,
      );

      if (!statMatch) {
        failures.push(
          'about.html: could not find the "records tracked" stat tile at all (markup may have changed; update this check\'s regex).',
        );
      } else {
        const shownCount = Number(statMatch[1]);
        if (shownCount !== actualCount) {
          failures.push(
            `about.html says "${shownCount} records tracked" but the latest backup (backups/${latestFile}) has ${actualCount} records. ` +
              `Update about.html's stat tile, or this check, whichever is actually stale.`,
          );
        }
      }
    }
  }
}

if (failures.length) {
  console.error("Content drift check FAILED:\n");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
} else {
  console.log(
    "Content drift check passed: about.html's records-tracked count matches the latest catalog backup.",
  );
}

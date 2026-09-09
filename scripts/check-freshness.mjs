#!/usr/bin/env node
// Automation-freshness check: is the machinery that keeps this repo's data
// current actually running? Written 2026-09-09, the day the daily portfolio
// freshness sweep (0 11 * * *) discovered it had been specified to run
// `npm run check:freshness` in this repo for weeks while no such script
// existed — and, the same morning, that the Sunday Concert Radar sweep had
// silently missed 2026-09-06, leaving data/catalog-cache.json 10 days old.
// check-content-drift.mjs watches whether the *pages* agree with the *data*;
// nothing in the repo watched whether the data itself was still arriving.
//
// Read-only, zero dependencies, no network. Prints [STALE] findings (an
// automation is not doing its job — urgent) and [REVIEW] findings (worth a
// look before it becomes one). Exits 1 only on [STALE].
//
// Deliberately NOT wired into `npm test`: these checks fail on the calendar,
// not on the code, so putting them in CI would redden unrelated pushes. The
// daily scheduled sweep runs this directly; run it by hand any time with
// `npm run check:freshness`.

import { readFileSync, readdirSync } from "node:fs";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();
const stale = [];
const review = [];

// Age in whole days of a YYYY-MM-DD date string, measured at UTC midnight so
// a backup committed late in the evening doesn't read a day older than it is.
function ageDays(isoDate) {
  return Math.floor((now - Date.parse(isoDate + "T00:00:00Z")) / DAY_MS);
}

function latestDatedFile(dir) {
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort(); // YYYY-MM-DD sorts chronologically as plain strings
  return files.length ? files[files.length - 1] : null;
}

// Check 1: the nightly catalog backup (.github/workflows/backup-catalog.yml)
// landed within the last 2 days. This is the backup both data-loss recoveries
// depended on; if it stops, everything else here is running without a net.
{
  const latest = latestDatedFile("backups");
  if (!latest) {
    stale.push(
      "backups/: no dated catalog snapshot at all. backup-catalog.yml has either never run or its output stopped landing — check the workflow's runs on GitHub before anything else.",
    );
  } else {
    const age = ageDays(latest.slice(0, 10));
    if (age > 2) {
      stale.push(
        `backups/${latest} is ${age} days old — the nightly backup-catalog.yml job has missed at least ${age - 1} night(s). Review that workflow's Actions log; do not fix anything until the log says why.`,
      );
    }
  }
}

// Check 2: the nightly watching-list backup (backup-watching.yml), same
// contract as the catalog backup.
{
  const latest = latestDatedFile("backups/watching");
  if (!latest) {
    stale.push(
      "backups/watching/: no dated snapshot at all. backup-watching.yml has either never run or its output stopped landing — check the workflow's runs on GitHub.",
    );
  } else {
    const age = ageDays(latest.slice(0, 10));
    if (age > 2) {
      stale.push(
        `backups/watching/${latest} is ${age} days old — the nightly backup-watching.yml job has missed at least ${age - 1} night(s). Review that workflow's Actions log first.`,
      );
    }
  }
}

// Check 3: the Sunday Concert Radar sweep (scheduled-sweep.yml) is still
// committing data/catalog-cache.json. concert-radar-health-check.mjs already
// watches this from the live side with a 9-day threshold; this is the same
// threshold read from the repo side, so a missed Sunday is caught by the
// daily sweep instead of waiting for the Monday health check. Weekly cadence
// means up to ~7 days old is normal; 8-9 days means the last Sunday is in
// doubt; past 9 days a Sunday has definitely been missed.
{
  const cache = JSON.parse(readFileSync("data/catalog-cache.json", "utf8"));
  if (typeof cache.at !== "number") {
    stale.push(
      "data/catalog-cache.json has no numeric `at` timestamp — the sweep output format changed; update this check and concert-radar-health-check.mjs together.",
    );
  } else {
    const age = Math.floor((now - cache.at) / DAY_MS);
    if (age > 9) {
      stale.push(
        `data/catalog-cache.json is ${age} days old (written ${new Date(cache.at).toISOString().slice(0, 10)}) — the Sunday scheduled-sweep.yml job has missed at least one week. Review its Actions log; a manual workflow re-run catches it up once the cause is known.`,
      );
    } else if (age > 7) {
      review.push(
        `data/catalog-cache.json is ${age} days old — last Sunday's scheduled-sweep.yml run hasn't landed yet. Worth a look at the Actions page if it's still missing tomorrow.`,
      );
    }
  }
}

for (const f of review) console.log("[REVIEW] " + f);
for (const f of stale) console.log("[STALE] " + f);

if (stale.length) {
  console.error(`\nFreshness check FAILED: ${stale.length} automation(s) not doing their job.`);
  process.exit(1);
}
console.log(
  `Freshness check passed: nightly catalog and watching backups current, Concert Radar weekly cache within its window${review.length ? ` (${review.length} item(s) to review above)` : ""}.`,
);

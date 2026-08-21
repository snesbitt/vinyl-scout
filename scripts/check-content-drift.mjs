#!/usr/bin/env node
// Content-drift check for Vinyl Scout, same idea as Streaming Scout's
// scripts/check-content-drift.mjs (2026-08-08): about.html's "N records
// tracked" stat tile is a hand-typed number that should always equal the
// real size of the catalog. The daily scheduled backup.mjs function already
// commits a full catalog snapshot to git (backups/YYYY-MM-DD.json, complete
// with a record_count field) — this check reads the latest one and fails
// loudly if about.html has drifted from it.
//
// 2026-08-21: this header used to say the "collection value" tile was
// deliberately NOT checked, on the reasoning that it's approximate ("≈"),
// tracks weekly-refreshing market prices, and would fail on normal weeks.
// That call was reversed today, with the explicit decision it asked for.
// What it didn't anticipate is the failure mode that actually happened:
// three different hand-typed values across two pages (≈€2,232, "about
// €2,230", and €2,234 inside an SVG label) against a real total of
// €2,219.77. All three are under 1% off, so every one of them would have
// sailed through the "wide tolerance band" that comment recommended. The
// figures weren't noisy, they were quietly stale — right once, never
// revisited. Check 2 below therefore uses a narrow absolute band (±€10),
// and the trade-off is stated there rather than hidden.
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

// Check 2: every collection-value figure on about.html and guide.html matches
// what the newest backup actually adds up to.
//
// The value rule is app.js's own, from collectionValue() (see the "Soft
// collection value" comment there): per record, prefer price_median, fall
// back to price_low, skip the record if neither is a number, and group by
// price_currency so amounts in different currencies are never added
// together. This check reimplements that rule rather than importing it,
// because app.js is browser code with no module exports — if collectionValue()
// ever changes, change it here too.
//
// TOLERANCE: ±€10 against the unrounded total. That is under half a percent
// of the current ~€2,200, which is wide enough to absorb rounding style
// (a page saying "about €2,220" for €2,219.77) and a genuinely small price
// move, and narrow enough to catch the real failure mode, which is a figure
// that was correct months ago. A percentage band can't do both: the three
// wrong figures this check was written for were all within 1%. The cost is
// that a real price refresh moving the total by more than €10 fails this
// check until someone edits the number on both pages. That is the intended
// cost — it is one line per page, and it is the only thing that keeps the
// number honest.
//
// WHICH FIGURES COUNT: any euro amount of four digits or more (€1,000+),
// anywhere in the file, SVG <text> nodes included — the €2,234 that started
// this lived inside one. Single records are nowhere near that: the dearest
// in the catalog is €147.89, and the highest price_high on any record is
// €300. If a page ever needs to print a four-figure euro amount that isn't
// the collection total, this heuristic needs rethinking, not widening.
const VALUE_TOLERANCE_EUR = 10;
{
  const backupFiles = readdirSync("backups")
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();

  if (backupFiles.length > 0) {
    const latestFile = backupFiles[backupFiles.length - 1];
    const backup = JSON.parse(readFileSync(`backups/${latestFile}`, "utf8"));
    const records = Array.isArray(backup.records) ? backup.records : [];

    const byCurrency = {};
    for (const r of records) {
      const amount =
        r.price_median != null && !isNaN(r.price_median)
          ? Number(r.price_median)
          : r.price_low != null && !isNaN(r.price_low)
            ? Number(r.price_low)
            : null;
      if (amount == null) continue;
      const currency = r.price_currency || "USD"; // app.js's own default
      byCurrency[currency] = (byCurrency[currency] || 0) + amount;
    }

    const currencies = Object.keys(byCurrency);
    if (currencies.length !== 1 || currencies[0] !== "EUR") {
      // Both pages print a single euro figure. The moment the catalog holds
      // more than one currency that stops being a true summary, and this
      // check can no longer say what the pages should read.
      failures.push(
        `backups/${latestFile}: priced records are no longer all in EUR (found ${currencies.join(", ") || "none"}). ` +
          "about.html and guide.html both print one euro total; decide how they should read now, and update this check.",
      );
    } else {
      const totalEur = byCurrency.EUR;
      const expected = Math.round(totalEur);

      for (const page of ["about.html", "guide.html"]) {
        const html = readFileSync(page, "utf8");
        const found = [...html.matchAll(/€\s?(\d{1,3}(?:,\d{3})+|\d{4,})/g)];

        if (found.length === 0) {
          failures.push(
            `${page}: no collection-value figure found at all (expected at least one €${expected.toLocaleString("en-US")}). ` +
              "If the figure was deliberately removed, remove this page from Check 2's list too.",
          );
          continue;
        }

        for (const m of found) {
          const shown = Number(m[1].replace(/,/g, ""));
          if (Math.abs(shown - totalEur) > VALUE_TOLERANCE_EUR) {
            failures.push(
              `${page} says "€${m[1]}" but the newest backup (backups/${latestFile}) adds up to €${totalEur.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ` +
                `(price_median, falling back to price_low). Change it to €${expected.toLocaleString("en-US")}. ` +
                "Check every copy on the page, SVG <text> labels included — there is usually more than one.",
            );
          }
        }
      }
    }
  }
}

// Check 3: about.html's charter version matches PROJECT.md's current version.
// about.html's kicker names the charter it is describing; PROJECT.md is the
// charter. They drifted five versions apart before anyone noticed.
{
  const project = readFileSync("PROJECT.md", "utf8");
  const projectVersion = project.match(/^\*\*Version:\*\*\s*(\d+)/m);

  if (!projectVersion) {
    failures.push(
      'PROJECT.md: could not find its "**Version:** N" line (format may have changed; update this check).',
    );
  } else {
    const about = readFileSync("about.html", "utf8");
    const aboutVersion = about.match(/v(\d+)\s+charter/);

    if (!aboutVersion) {
      failures.push(
        'about.html: could not find its "vN charter" kicker (markup may have changed; update this check).',
      );
    } else if (aboutVersion[1] !== projectVersion[1]) {
      failures.push(
        `about.html says "v${aboutVersion[1]} charter" but PROJECT.md is at v${projectVersion[1]}. ` +
          `Update about.html's kicker to "v${projectVersion[1]} charter".`,
      );
    }
  }
}

// Check 4: every day-of-week the pages claim for a scheduled job matches the
// cron that actually runs it.
//
// The pages named a "daily health check" for a job that runs Mondays only,
// and a Monday sweep for a job that runs Sundays. Both were true once. Each
// claim below names the workflow it is a claim ABOUT, so moving a cron fails
// here rather than silently making a sentence wrong. A phrase that no longer
// appears also fails: if a rewrite drops the wording, this list needs
// updating deliberately, not quietly losing coverage.
{
  const DAY_NAMES = [
    "Sunday", "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday",
  ];

  function cronsFor(workflowFile) {
    const yml = readFileSync(`.github/workflows/${workflowFile}`, "utf8");
    return [...yml.matchAll(/-\s*cron:\s*["']([^"']+)["']/g)].map((m) => m[1]);
  }

  function dayOf(cron) {
    const dow = cron.trim().split(/\s+/)[4];
    if (dow === "*") return "every day";
    if (/^[0-6]$/.test(dow)) return DAY_NAMES[Number(dow)];
    return `an unrecognised day-of-week field ("${dow}")`;
  }

  const CADENCE_CLAIMS = [
    // Concert Radar health check — .github/workflows/concert-radar-health-check.yml
    { page: "guide.html", phrase: "runs every Monday morning", workflow: "concert-radar-health-check.yml", claims: "Monday" },
    { page: "guide.html", phrase: "Monday health check, in Actions", workflow: "concert-radar-health-check.yml", claims: "Monday" },
    { page: "guide.html", phrase: "the Monday health check", workflow: "concert-radar-health-check.yml", claims: "Monday" },
    { page: "guide.html", phrase: "backup · sweep · Monday check", workflow: "concert-radar-health-check.yml", claims: "Monday" },
    { page: "about.html", phrase: "A Monday health check", workflow: "concert-radar-health-check.yml", claims: "Monday" },
    // Catalog sweep — .github/workflows/scheduled-sweep.yml
    { page: "guide.html", phrase: "the Sunday sweep", workflow: "scheduled-sweep.yml", claims: "Sunday" },
    { page: "about.html", phrase: "the Sunday sweep", workflow: "scheduled-sweep.yml", claims: "Sunday" },
    // Backups — .github/workflows/backup-catalog.yml, backup-watching.yml
    { page: "guide.html", phrase: "nightly catalog and watching-list backups", workflow: "backup-catalog.yml", claims: "every day" },
    { page: "guide.html", phrase: "nightly catalog and watching-list backups", workflow: "backup-watching.yml", claims: "every day" },
    { page: "about.html", phrase: "Nightly catalog and watching backups", workflow: "backup-catalog.yml", claims: "every day" },
    { page: "about.html", phrase: "Nightly catalog and watching backups", workflow: "backup-watching.yml", claims: "every day" },
    { page: "about.html", phrase: "A nightly job commits the whole", workflow: "backup-catalog.yml", claims: "every day" },
  ];

  // Phrases are matched against whitespace-collapsed source: these pages wrap
  // their prose at ~72 columns, so a sentence fragment worth checking almost
  // always has a newline and indentation somewhere in the middle of it.
  const flatten = (text) => text.replace(/\s+/g, " ");
  const pageCache = {};
  for (const claim of CADENCE_CLAIMS) {
    if (!pageCache[claim.page]) pageCache[claim.page] = flatten(readFileSync(claim.page, "utf8"));

    if (!pageCache[claim.page].includes(flatten(claim.phrase))) {
      failures.push(
        `${claim.page}: the cadence claim "${claim.phrase}" is gone. ` +
          "If it was reworded, update Check 4's CADENCE_CLAIMS list to the new wording so the claim stays checked.",
      );
      continue;
    }

    const crons = cronsFor(claim.workflow);
    if (crons.length === 0) {
      failures.push(
        `.github/workflows/${claim.workflow}: no cron schedule found, but ${claim.page} still says "${claim.phrase}". ` +
          "Either the job stopped running on a schedule or the page needs to stop claiming it does.",
      );
      continue;
    }

    const actual = crons.map(dayOf);
    if (!actual.includes(claim.claims)) {
      failures.push(
        `${claim.page} says "${claim.phrase}" (i.e. ${claim.claims}), but .github/workflows/${claim.workflow} runs ${actual.join(" and ")} ` +
          `(cron ${crons.map((c) => `"${c}"`).join(", ")}). Fix the page, or this claim, whichever is stale.`,
      );
    }
  }

  // The weekly price refresh is the one job with no repo artifact: it lives
  // in Susan's own Claude scheduled tasks, and both pages say so ("lives
  // outside the repository", "the one job still run by a Claude scheduled
  // task"). If a Discogs refresh ever lands in a workflow, those sentences
  // become wrong, and nothing else here would notice.
  for (const workflowFile of readdirSync(".github/workflows").filter((f) => /\.ya?ml$/.test(f))) {
    const yml = readFileSync(`.github/workflows/${workflowFile}`, "utf8");
    if (/discogs/i.test(yml)) {
      failures.push(
        `.github/workflows/${workflowFile} mentions Discogs, so the price pull may now run in Actions. ` +
          "guide.html and about.html both describe it as the one job living outside this repo, in a Claude scheduled task — recheck both.",
      );
    }
  }
}

if (failures.length) {
  console.error("Content drift check FAILED:\n");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
} else {
  console.log(
    "Content drift check passed: records-tracked count, collection value on both pages, " +
      "about.html's charter version, and every documented job cadence all match the repo.",
  );
}

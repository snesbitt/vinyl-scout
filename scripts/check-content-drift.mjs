#!/usr/bin/env node
// Content-drift check for Vinyl Scout, same idea as Streaming Scout's
// scripts/check-content-drift.mjs (2026-08-08): about.html's "N records
// tracked" stat tile is a hand-typed number that should always equal the
// real size of the catalog. The nightly GitHub Actions backup
// (.github/workflows/backup-catalog.yml, scripts/backup-catalog.mjs —
// retired off the old Netlify-scheduled backup.mjs 2026-08-26, bdd16c0)
// already commits a full catalog snapshot to git (backups/YYYY-MM-DD.json,
// complete with a record_count field) — this check reads the latest one and
// fails loudly if about.html has drifted from it.
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
//
// 2026-10-24: the hand-typed record count and collection value were the most
// common cause of a red Tests run, because the catalog changes every day and
// the pages did not. about.html and guide.html now fill those figures from
// /api/records in the browser, so Checks 1 and 2 changed purpose. Check 2 no
// longer compares a typed number with the backup. It runs each page's own
// live-figures script against the newest backup and fails if the rendered
// figures differ from an independent calculation, and it fails if a
// hand-typed count or four-figure dollar amount comes back.
//
// Add a new check here whenever a future session catches a new instance of
// "the page said X but the data said Y" by hand, so it stops needing to be
// caught by hand.

import { readFileSync, readdirSync } from "node:fs";
import { runInNewContext } from "node:vm";

let failures = [];

// Check 1: the newest backup snapshot exists and agrees with itself. It is
// the reference that Check 2 measures the live figures against.
let latest = null; // { file, records } for the newest consistent backup
{
  const backupFiles = readdirSync("backups")
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort(); // YYYY-MM-DD filenames sort chronologically as plain strings

  if (backupFiles.length === 0) {
    failures.push(
      "backups/: no dated snapshot files found at all (the nightly backup-catalog.yml Actions job may have stopped running, or this check's glob pattern is stale).",
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
      // The backup file disagreeing with itself is a bug in
      // scripts/backup-catalog.mjs, not in the pages.
      failures.push(
        `backups/${latestFile}: its own record_count (${declaredCount}) doesn't match its records array length (${actualCount}). This is a scripts/backup-catalog.mjs bug, not a page drift issue.`,
      );
    } else {
      latest = { file: latestFile, records: backup.records };
    }
  }
}

// Check 2: the catalog figures on about.html and guide.html are live, not
// hand-typed, and the live script renders the right numbers.
//
// Each page marks its figures with data-live="<key>" elements and fills them
// from /api/records in an inline <script id="live-figures">. The text inside
// an element is only the no-JavaScript fallback, so it is never compared with
// the data. This check does three things per page:
//   1. every required data-live hook is present;
//   2. the page's own script, run against the newest backup with a fake
//      fetch and a fake document, renders exactly what an independent
//      calculation gives (app.js collectionValue()'s rule over USD records:
//      price_median, falling back to price_low, skipping records with
//      neither, a record with no currency counting as USD);
//   3. no hand-typed catalog size ("97 records") or four-figure dollar amount
//      is left in the prose. Comments, scripts and elements marked
//      data-example (a real past incident shown as an example) are excluded.
// If the value rule in app.js changes, change it here and in both scripts.
const LIVE_HOOKS = {
  "about.html": ["records", "value-approx"],
  "guide.html": ["records", "low", "median", "value", "usd-count"],
};
const UNFILLED = "(fallback text)";
const usdText = (n) => "$" + Math.round(n).toLocaleString("en-US");

if (latest) {
  const exp = { low: 0, median: 0, usdCount: 0, usdTotal: 0 };
  for (const r of latest.records) {
    const hasMed = r.price_median != null && !isNaN(r.price_median);
    const hasLow = r.price_low != null && !isNaN(r.price_low);
    if (hasLow) exp.low++;
    if (hasMed) exp.median++;
    const amount = hasMed ? Number(r.price_median) : hasLow ? Number(r.price_low) : null;
    if (amount == null) continue;
    if ((r.price_currency || "USD") !== "USD") continue;
    exp.usdCount++;
    exp.usdTotal += amount;
  }
  const expectedText = {
    records: String(latest.records.length),
    low: String(exp.low),
    median: String(exp.median),
    "usd-count": String(exp.usdCount),
    value: usdText(exp.usdTotal),
    "value-approx": "≈ " + usdText(exp.usdTotal),
  };

  if (exp.usdCount === 0) {
    failures.push(
      `backups/${latest.file}: no record is priced in USD, so the live collection value would read $0. Decide how the pages should read, then update the live-figures scripts and this check.`,
    );
  }

  for (const [page, hooks] of Object.entries(LIVE_HOOKS)) {
    const html = readFileSync(page, "utf8");

    for (const key of hooks) {
      if (!html.includes(`data-live="${key}"`)) {
        failures.push(
          `${page}: no data-live="${key}" element found (the figure may have been hand-typed again; make it a live element, or remove it from LIVE_HOOKS in this check).`,
        );
      }
    }

    const scriptMatch = html.match(/<script id="live-figures">([\s\S]*?)<\/script>/);
    if (!scriptMatch) {
      failures.push(`${page}: no <script id="live-figures"> block found, so nothing fills the live figures.`);
    } else {
      const elements = [...html.matchAll(/data-live="([^"]+)"/g)].map((m) => ({
        key: m[1],
        textContent: UNFILLED,
        getAttribute: (name) => (name === "data-live" ? m[1] : null),
      }));
      let ran = true;
      try {
        runInNewContext(scriptMatch[1], {
          fetch: async () => ({ ok: true, json: async () => latest.records }),
          document: { querySelectorAll: () => elements },
          Math,
          Number,
          String,
          isNaN,
          Array,
        });
        await new Promise((resolve) => setTimeout(resolve, 0)); // let the promise chain finish
      } catch (e) {
        ran = false;
        failures.push(`${page}: the live-figures script threw: ${e.message}`);
      }
      if (ran) {
        for (const el of elements) {
          if (el.textContent === UNFILLED) {
            failures.push(
              `${page}: data-live="${el.key}" was not filled by the script (unknown key, or the script did not run).`,
            );
          } else if (el.textContent !== expectedText[el.key]) {
            failures.push(
              `${page}: data-live="${el.key}" rendered "${el.textContent}" but the newest backup (backups/${latest.file}) gives "${expectedText[el.key]}". The page script's rule has drifted from app.js collectionValue().`,
            );
          }
        }
      }
    }

    const prose = html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<span data-live="[^"]+">[^<]*<\/span>/g, "")
      .replace(/<text[^>]*data-example[^>]*>[^<]*<\/text>/g, ""); // marked historical examples
    for (const m of prose.matchAll(/\b\d{2,3}\s+records\b/g)) {
      failures.push(
        `${page}: "${m[0]}" looks like a hand-typed catalog size. Use a data-live="records" element so it stays true.`,
      );
    }
    for (const m of prose.matchAll(/\$\s?(?:\d{1,3}(?:,\d{3})+|\d{4,})/g)) {
      failures.push(
        `${page}: "${m[0]}" looks like a hand-typed collection value. Use a data-live="value" element so it stays true.`,
      );
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

// Check 5: every backtick-wrapped `something.mjs` filename in PROJECT.md's
// and CLAUDE.md's CURRENT-REFERENCE prose (not their dated changelog/journal
// entries) must still exist under netlify/functions/, netlify/lib/, or
// scripts/. Written after PROJECT.md's own /api/catalog-cache entry and
// CLAUDE.md's repo-layout table both kept describing a deleted
// netlify/functions/scheduled-sweep.mjs as still live for days after it was
// actually deleted (2026-08-25) — the same failure mode Check 4 already
// guards against for cron cadence claims, applied here to file existence.
//
// SCOPING, stated rather than left implicit (same discipline as Check 2's
// tolerance-band note above): a blind scan of the WHOLE of either file would
// fail constantly, and for the wrong reason. Both files are full of
// accurate historical narration that mentions a file BECAUSE it was just
// deleted or renamed as the whole point of that dated entry (e.g. CLAUDE.md's
// 2026-08-26 entry saying `backup.mjs` was retired) — flagging those would
// be crying wolf on correct history, and a check that cries wolf gets
// ignored inside a month. So: CLAUDE.md's dated entries (headings starting
// "## YYYY-MM-DD") are excluded from this check; only its undated
// "how this repo currently is" sections (Repo layout, Weekly automation,
// etc.) are scanned. PROJECT.md's Changelog (the dated "- **vNN
// (YYYY-MM-DD)**" bullet list right under the title) is excluded the same
// way; everything from "## Identity" onward — the actual charter body — is
// scanned.
{
  const CODE_DIRS = ["netlify/functions", "netlify/lib", "scripts"];

  function existsInCodeDirs(filename) {
    for (const dir of CODE_DIRS) {
      try {
        if (readdirSync(dir).includes(filename)) return true;
      } catch (e) {
        /* dir doesn't exist in this checkout — treat as not found there */
      }
    }
    return false;
  }

  // Matches both a bare `foo.mjs` and a `some/path/foo.mjs`-style relative
  // path inside backticks (this repo uses both forms) — either way, only
  // the trailing filename is checked, since that's what has to resolve
  // under one of CODE_DIRS regardless of which directory the doc named.
  function extractMjsMentions(text) {
    const matches = [...text.matchAll(/`(?:[A-Za-z0-9_.\-]+\/)*([A-Za-z0-9_\-]+\.mjs)`/g)];
    return matches.map((m) => m[1]);
  }

  // --- CLAUDE.md: keep only its undated ("current reference") sections ---
  const claudeMd = readFileSync("CLAUDE.md", "utf8");
  const claudeParts = claudeMd.split(/^(## .+)$/m); // [pre, heading, body, heading, body, ...]
  let claudeCurrentText = claudeParts[0];
  for (let i = 1; i < claudeParts.length; i += 2) {
    const heading = claudeParts[i];
    const body = claudeParts[i + 1] || "";
    if (/^## \d{4}-\d{2}-\d{2}/.test(heading)) continue; // dated journal entry — skip
    claudeCurrentText += heading + body;
  }

  // --- PROJECT.md: drop the dated Changelog bullet list, keep the rest ---
  const projectMd = readFileSync("PROJECT.md", "utf8");
  const identityIdx = projectMd.indexOf("\n## Identity");
  const projectCurrentText = identityIdx === -1 ? projectMd : projectMd.slice(identityIdx);
  if (identityIdx === -1) {
    failures.push(
      'PROJECT.md: could not find the "## Identity" heading this check uses to skip past the dated Changelog list (markup may have changed; update this check\'s split point).',
    );
  }

  const mentions = [
    ...extractMjsMentions(claudeCurrentText).map((file) => ({ file, doc: "CLAUDE.md" })),
    ...extractMjsMentions(projectCurrentText).map((file) => ({ file, doc: "PROJECT.md" })),
  ];

  const seen = new Set();
  for (const { file, doc } of mentions) {
    const key = doc + ":" + file;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!existsInCodeDirs(file)) {
      failures.push(
        `${doc} references \`${file}\` in its current-reference prose (outside any dated changelog/journal entry), but no file by that name exists under netlify/functions/, netlify/lib/, or scripts/. ` +
          "Either the file was deleted and this doc line is stale, or it was renamed/moved and this doc needs the new name.",
      );
    }
  }
}

// Check 6: the number of venues the pages claim Concert Radar scrapes matches
// the VENUES array in netlify/functions/venue-shows.mjs.
//
// Flagged as missing on 2026-09-01, when Freight & Salvage moved from VENUES to
// EXCLUDED_VENUES (an IP-level block, not a parser fault) and the count went
// from seven to six. guide.html and roadmap.html were updated in that pass.
// about.html was not: it still said "Seven hand-picked Bay Area venues" on
// 2026-09-14, two weeks later, and this check found it on its first run. That
// is the entire argument for writing the assertion at the moment the number
// changes rather than noting that somebody should.
//
// Counts the array rather than trusting a constant, so moving a venue in or out
// of EXCLUDED_VENUES is enough to make the pages wrong here, loudly.
{
  const src = readFileSync("netlify/functions/venue-shows.mjs", "utf8");
  const start = src.indexOf("var VENUES = [");
  const end = start === -1 ? -1 : src.indexOf("\n];", start);
  if (start === -1 || end === -1) {
    failures.push(
      'netlify/functions/venue-shows.mjs: could not locate the `var VENUES = [ ... ];` block. ' +
        "It was renamed or reformatted; update this check rather than deleting it.",
    );
  } else {
    const block = src.slice(start, end);
    const realCount = (block.match(/^\s*\{\s*key:/gm) || []).length;

    const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    // "six hand-picked Bay Area venue calendars", "seven venue feeds", "6 venues".
    const CLAIM = /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b([^.<]{0,45}?)\bvenue/gi;

    if (realCount === 0) {
      failures.push(
        "netlify/functions/venue-shows.mjs: found the VENUES block but parsed 0 entries from it. " +
          "The entry shape changed, so this check would pass vacuously against any claim at all.",
      );
    }

    for (const page of ["about.html", "guide.html", "roadmap.html"]) {
      let html;
      try {
        html = readFileSync(page, "utf8");
      } catch {
        continue;
      }
      for (const m of html.matchAll(CLAIM)) {
        const raw = m[1].toLowerCase();
        const claimed = WORDS[raw] ?? Number(raw);
        if (!Number.isFinite(claimed)) continue;
        // Skip anything that is plainly about something other than the scrape
        // itself, so an unrelated "three venues in one night" line can't fail
        // the build.
        if (!/hand-picked|scrape|calendar|feed|venue[s]? ,|venues,/i.test(m[0])) continue;
        if (claimed !== realCount) {
          failures.push(
            `${page} claims "${m[0].trim().replace(/\s+/g, " ")}" but venue-shows.mjs's VENUES array ` +
              `holds ${realCount} actively scraped venue(s). Update the page, or this check if the ` +
              "array moved.",
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
    "Content drift check passed: records-tracked count, collection value on both pages, " +
      "about.html's charter version, every documented job cadence, and every referenced " +
      ".mjs filename in PROJECT.md/CLAUDE.md's current-reference prose all match the repo.",
  );
}

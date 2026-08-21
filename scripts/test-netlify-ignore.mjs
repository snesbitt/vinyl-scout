#!/usr/bin/env node
// scripts/test-netlify-ignore.mjs
//
// Regression suite for scripts/netlify-ignore.sh, added 2026-08-19 alongside
// the catalog-cache cutover.
//
// WHY THIS EXISTS. netlify/functions/catalog-cache.mjs v2 statically imports
// data/catalog-cache.json, so that file is now input to a function bundle and
// refreshing it REQUIRES a deploy. Under the old Blobs-backed version it did
// not. .github/workflows/scheduled-sweep.yml commits that one file and nothing
// else every Sunday, so if data/ is not on the ignore script's watched list,
// the weekly push matches nothing, the deploy is skipped, and
// /api/catalog-cache serves whatever JSON was bundled at the last unrelated
// deploy. Nothing goes red. The sweep runs, the commit lands, the served cache
// silently freezes, and the only alarm is the 9-day freshness check in
// concert-radar-health-check.mjs, which would blame the sweep rather than the
// skipped deploy.
//
// That is a slow, quiet, misattributed failure, which is exactly the kind
// worth a test. Reading the script and satisfying yourself that "data" appears
// in the path list is not the same as proving the ignore contract holds, so
// this runs the real script against a real throwaway git repo and asserts on
// its actual exit codes.
//
// Netlify's ignore-command contract, inverted from the usual convention:
//   exit 0    => SKIP the deploy
//   exit != 0 => RUN the deploy
//
// Run: node scripts/test-netlify-ignore.mjs

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const scriptSrc = path.join(repoRoot, 'scripts', 'netlify-ignore.sh');

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    passed += 1;
    console.log('  ok   ' + label);
  } else {
    failed += 1;
    console.error(`  FAIL ${label} (expected exit ${expected}, got ${actual})`);
  }
}

const work = mkdtempSync(path.join(tmpdir(), 'netlify-ignore-test-'));
const git = (...args) => execFileSync('git', args, { cwd: work, stdio: 'pipe' }).toString().trim();

try {
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');

  // A baseline tree with one file in every category the script reasons about.
  mkdirSync(path.join(work, 'scripts'), { recursive: true });
  mkdirSync(path.join(work, 'data'), { recursive: true });
  mkdirSync(path.join(work, 'backups'), { recursive: true });
  mkdirSync(path.join(work, 'netlify', 'functions'), { recursive: true });
  copyFileSync(scriptSrc, path.join(work, 'scripts', 'netlify-ignore.sh'));
  writeFileSync(path.join(work, 'index.html'), '<!doctype html>\n');
  writeFileSync(path.join(work, 'README.md'), 'readme\n');
  writeFileSync(path.join(work, 'data', 'catalog-cache.json'), '{"shows":[],"at":1}\n');
  writeFileSync(path.join(work, 'backups', 'snap.json'), '{}\n');
  writeFileSync(path.join(work, 'netlify', 'functions', 'x.mjs'), 'export default 1;\n');
  git('add', '-A');
  git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');

  // Runs the REAL script the way Netlify runs it, and returns its exit code.
  function ignoreExitAfter(mutate, message) {
    mutate();
    git('add', '-A');
    git('commit', '-qm', message);
    const head = git('rev-parse', 'HEAD');
    const r = spawnSync('bash', ['scripts/netlify-ignore.sh'], {
      cwd: work,
      env: { ...process.env, CACHED_COMMIT_REF: base, COMMIT_REF: head },
      encoding: 'utf-8',
    });
    git('reset', '-q', '--hard', base);
    return r.status;
  }

  console.log('=== must BUILD (exit != 0) ===');

  // The regression this file was written for.
  check(
    'a sweep-only commit (data/catalog-cache.json) triggers a deploy',
    ignoreExitAfter(
      () => writeFileSync(path.join(work, 'data', 'catalog-cache.json'), '{"shows":[1],"at":2}\n'),
      'sweep',
    ),
    1,
  );
  check(
    'a Function change triggers a deploy',
    ignoreExitAfter(
      () => writeFileSync(path.join(work, 'netlify', 'functions', 'x.mjs'), 'export default 2;\n'),
      'fn',
    ),
    1,
  );
  check(
    'a page change triggers a deploy',
    ignoreExitAfter(() => writeFileSync(path.join(work, 'index.html'), '<!doctype html><p>\n'), 'page'),
    1,
  );

  console.log('=== must SKIP (exit 0) ===');

  check(
    'a docs-only commit skips the deploy',
    ignoreExitAfter(() => writeFileSync(path.join(work, 'README.md'), 'readme 2\n'), 'docs'),
    0,
  );
  check(
    'a backups-only commit skips the deploy',
    ignoreExitAfter(() => writeFileSync(path.join(work, 'backups', 'snap.json'), '{"a":1}\n'), 'backup'),
    0,
  );

  console.log('=== first build / cleared cache ===');
  {
    const r = spawnSync('bash', ['scripts/netlify-ignore.sh'], {
      cwd: work,
      env: { ...process.env, CACHED_COMMIT_REF: '', COMMIT_REF: base },
      encoding: 'utf-8',
    });
    check('no cached commit ref builds rather than skipping', r.status, 1);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

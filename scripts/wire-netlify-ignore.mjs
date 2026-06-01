#!/usr/bin/env node
// scripts/wire-netlify-ignore.mjs
// Idempotently add `ignore = "bash scripts/netlify-ignore.sh"` under the [build]
// table in netlify.toml. Never clobbers an existing, different ignore value.
// Writes a .bak before changing anything, and prints the resulting [build] block.

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';

const FILE = 'netlify.toml';
const IGNORE_CMD = 'bash scripts/netlify-ignore.sh';

if (!existsSync(FILE)) {
  console.error(`✗ ${FILE} not found in ${process.cwd()}. Run this from the repo root.`);
  process.exit(2);
}

const original = readFileSync(FILE, 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
const lines = original.split(/\r?\n/);

const isHeader = (l) => /^\s*\[/.test(l);
const isBuildHeader = (l) => /^\s*\[build\]\s*(#.*)?$/.test(l);

if (original.includes(IGNORE_CMD)) {
  console.log('✓ netlify.toml already references scripts/netlify-ignore.sh. Nothing to do.');
  printBuildBlock(lines);
  process.exit(0);
}

const buildIdx = lines.findIndex(isBuildHeader);

function indentFor(startIdx, endIdx) {
  for (let i = startIdx + 1; i < endIdx; i++) {
    const m = lines[i].match(/^(\s+)\S/);
    if (m && !/^\s*[#\[]/.test(lines[i])) return m[1];
    if (/\S/.test(lines[i]) && !/^\s*#/.test(lines[i])) return '';
  }
  return '';
}

let out;

if (buildIdx === -1) {
  const trimmed = [...lines];
  while (trimmed.length && trimmed[trimmed.length - 1] === '') trimmed.pop();
  out = [...trimmed, '', '[build]', `ignore = "${IGNORE_CMD}"`];
  console.log('• No [build] table found; appended a new one.');
} else {
  let end = lines.length;
  for (let i = buildIdx + 1; i < lines.length; i++) {
    if (isHeader(lines[i])) { end = i; break; }
  }
  const existing = lines
    .slice(buildIdx + 1, end)
    .find((l) => /^\s*ignore\s*=/.test(l));
  if (existing) {
    console.error('✗ [build] already defines a different ignore command:');
    console.error(`    ${existing.trim()}`);
    console.error('  Netlify honors only one ignore command. Resolve this by hand so we don\'t');
    console.error('  silently override your existing setting.');
    process.exit(3);
  }
  const indent = indentFor(buildIdx, end);
  const ignoreLine = `${indent}ignore = "${IGNORE_CMD}"`;
  out = [...lines.slice(0, buildIdx + 1), ignoreLine, ...lines.slice(buildIdx + 1)];
  console.log('• Added ignore key under the existing [build] table.');
}

copyFileSync(FILE, FILE + '.bak');
writeFileSync(FILE, out.join(eol));
console.log(`✓ Wrote ${FILE} (backup saved to ${FILE}.bak).`);
printBuildBlock(out);

function printBuildBlock(ls) {
  const b = ls.findIndex(isBuildHeader);
  if (b === -1) return;
  let e = ls.length;
  for (let i = b + 1; i < ls.length; i++) {
    if (isHeader(ls[i])) { e = i; break; }
  }
  const block = ls.slice(b, e);
  while (block.length && block[block.length - 1] === '') block.pop();
  console.log('\n----- resulting [build] block -----');
  console.log(block.join('\n'));
  console.log('-----------------------------------');
}

#!/usr/bin/env node
// Verifies every store-metadata text file fits its store's character limit.
// Run: node scripts/check-store-metadata.js   (exits non-zero on any violation)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'store-metadata');

// [file, limit] — limits are the stores' documented maxima.
const LIMITS = [
  ['apple/name.txt', 30],
  ['apple/subtitle.txt', 30],
  ['apple/promotional_text.txt', 170],
  ['apple/keywords.txt', 100],
  ['apple/description.txt', 4000],
  ['apple/release_notes.txt', 4000],
  ['apple/review_notes.txt', 4000],
  ['google/title.txt', 30],
  ['google/short_description.txt', 80],
  ['google/full_description.txt', 4000],
  ['google/release_notes.txt', 500],
];

let failed = false;
for (const [rel, limit] of LIMITS) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    console.error(`MISSING  ${rel}`);
    failed = true;
    continue;
  }
  // Stores count the pasted text; trim the trailing newline the file adds.
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');
  const len = [...text].length; // code points, matching how ASC counts
  const ok = len <= limit;
  if (!ok) failed = true;
  console.log(`${ok ? 'OK  ' : 'OVER'}  ${rel.padEnd(32)} ${String(len).padStart(4)} / ${limit}`);
}
process.exit(failed ? 1 : 0);

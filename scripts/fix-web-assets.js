// Post-process the Expo web export so it works on static hosts (Netlify, etc.).
//
// Expo emits font/asset files under `dist/assets/node_modules/...`. Netlify (and
// some other hosts) automatically EXCLUDE any directory named `node_modules`
// from a deploy, so every custom font 404s — icons render as tofu rectangles and
// text silently falls back to the system font. We rename that folder to
// `assets/vendor` and rewrite the references the bundle uses.
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const FROM = 'assets/node_modules';
const TO = 'assets/vendor';

if (!fs.existsSync(DIST)) {
  console.error('No dist/ folder — run `expo export --platform web` first.');
  process.exit(1);
}

// 1) Rename the physical folder.
const fromDir = path.join(DIST, 'assets', 'node_modules');
const toDir = path.join(DIST, 'assets', 'vendor');
if (fs.existsSync(fromDir)) {
  if (fs.existsSync(toDir)) fs.rmSync(toDir, { recursive: true, force: true });
  fs.renameSync(fromDir, toDir);
}

// 2) Rewrite every reference to the old path in the build's text files.
let rewritten = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(p);
    } else if (/\.(js|html|json|css|map)$/.test(entry.name)) {
      const buf = fs.readFileSync(p, 'utf8');
      if (buf.includes(FROM)) {
        fs.writeFileSync(p, buf.split(FROM).join(TO));
        rewritten++;
      }
    }
  }
}
walk(DIST);

console.log(`fix-web-assets: ${FROM} -> ${TO} (folder renamed, ${rewritten} file(s) rewritten)`);

#!/usr/bin/env node
// Regenerates chord sheet HTML from src/*.txt.
// editor.html is the single source of truth — no logic is duplicated here.
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const editorSrc = fs.readFileSync(path.join(__dirname, 'editor.html'), 'utf8');

// Extract the shared script section (everything before the browser-only wiring guard).
const scriptMatch = editorSrc.match(/<script>([\s\S]+?)\/\* ── BROWSER WIRING/);
if (!scriptMatch) { console.error('Could not find shared script block in editor.html'); process.exit(1); }

// Run it in a vm context. Function declarations become context properties;
// const/let variables are captured via closure by those functions.
const ctx = vm.createContext({ encodeURIComponent });
vm.runInContext(
  scriptMatch[1] + 'var _x = { parseChordTxt, exportHtml, slugify };',
  ctx
);
const { parseChordTxt, exportHtml, slugify } = ctx._x;

// Find all instrument dirs that have a src/ subfolder.
const root = __dirname;
const srcDirs = fs.readdirSync(root)
  .filter(d => fs.statSync(path.join(root, d)).isDirectory() && d !== '.git')
  .filter(d => fs.existsSync(path.join(root, d, 'src')));

let generated = 0, removed = 0;

for (const dir of srcDirs) {
  const outDir = path.join(root, dir);
  const srcDir = path.join(outDir, 'src');

  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith('.html')) {
      fs.unlinkSync(path.join(outDir, f));
      console.log(`Removed ${dir}/${f}`);
      removed++;
    }
  }

  for (const f of fs.readdirSync(srcDir).filter(f => f.endsWith('.txt'))) {
    const text = fs.readFileSync(path.join(srcDir, f), 'utf8');
    const song = parseChordTxt(text);
    if (!song) { console.warn(`Skipping ${f}: could not parse`); continue; }
    const slug = slugify(song.meta.title) || f.replace(/\.txt$/, '');
    const outPath = path.join(outDir, slug + '.html');
    fs.writeFileSync(outPath, exportHtml(song), 'utf8');
    console.log(`Generated ${dir}/${slug}.html`);
    generated++;
  }
}

console.log(`\nDone: removed ${removed}, generated ${generated}`);

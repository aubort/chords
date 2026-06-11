#!/usr/bin/env node
// Regenerates ukulele/*.html from ukulele/src/*.txt using SHEET_TEMPLATE.
const fs = require('fs');
const path = require('path');

// Read editor.html once — all shared data (chords, template) is extracted from it.
const editorSrc = fs.readFileSync(path.join(__dirname, 'editor.html'), 'utf8');

const CHORD_RE = /^[A-G][#b]?(m|maj|min|dim|aug|sus|add)?[0-9]*(\/[A-G][#b]?)?$/;
const BAR_RE = /^(\||x\d+|%|N\.C\.)$/i;

const ukeMatch = editorSrc.match(/const UKE_CHORDS = (\{[\s\S]*?\});/);
if (!ukeMatch) { console.error('Could not extract UKE_CHORDS from editor.html'); process.exit(1); }
const UKE_CHORDS = eval('(' + ukeMatch[1] + ')');

function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function escAttr(s){return esc(s).replace(/"/g,"&quot;");}
function slugify(t){return String(t).trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");}

function parseChords(str) {
  const tokens = [], re = /(\S+)/g; let m;
  while ((m = re.exec(str)) !== null) tokens.push({ name:m[1], col:m.index });
  return tokens;
}

function buildChordStr(tokens, minLen) {
  if (!tokens.length) return "";
  const maxCol = Math.max(...tokens.map(t => t.col + t.name.length));
  const arr = new Array(Math.max(maxCol, minLen||0)).fill(" ");
  tokens.forEach(t => { for (let i=0;i<t.name.length;i++) arr[t.col+i]=t.name[i]; });
  return arr.join("");
}

function isChordLine(line) {
  const toks = line.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return false;
  let hasChord = false;
  for (const t of toks) {
    if (CHORD_RE.test(t)) { hasChord = true; continue; }
    if (BAR_RE.test(t)) continue;
    return false;
  }
  return hasChord;
}

function parseChordTxt(text) {
  const lines = text.replace(/\r\n?/g,"\n").split("\n");
  let i = 0;
  const meta = {};
  while (i < lines.length) {
    const l = lines[i];
    if (l.trim() === "" || /^\[/.test(l.trim())) break;
    const m = l.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) break;
    meta[m[1].toLowerCase()] = m[2].trim();
    i++;
  }
  if (!meta.title || !meta.artist) return null;
  const sections = [];
  let cur = null;
  while (i < lines.length) {
    const raw = lines[i].replace(/\s+$/,"");
    const trimmed = raw.trim();
    if (trimmed === "") { i++; continue; }
    const sm = trimmed.match(/^\[(.+)\]$/);
    if (sm) { cur = { name:sm[1].trim(), lines:[] }; sections.push(cur); i++; continue; }
    if (!cur) { cur = { name:"", lines:[] }; sections.push(cur); }
    if (isChordLine(raw)) {
      const next = lines[i+1];
      const nextTrim = next === undefined ? "" : next.replace(/\s+$/,"").trim();
      const nextIsLyric = next !== undefined && nextTrim !== "" && !/^\[.+\]$/.test(nextTrim) && !isChordLine(next);
      if (nextIsLyric) {
        cur.lines.push({ type:"line", tokens:parseChords(raw), lyrics:next.replace(/\s+$/,"") });
        i += 2;
      } else {
        cur.lines.push({ type:"chords-only", chords:raw, lyrics:"" });
        i++;
      }
    } else {
      cur.lines.push({ type:"line", tokens:[], lyrics:raw });
      i++;
    }
  }
  return sections.length ? { meta, sections } : null;
}

const STRING_X = [8,20,32,44], STRING_NAMES = ["G","C","E","A"];

function chordsUsed(s) {
  const seen = [];
  s.sections.forEach(sec => sec.lines.forEach(line => {
    const toks = line.type === "chords-only" ? parseChords(line.chords) : line.tokens;
    toks.forEach(t => { if (CHORD_RE.test(t.name) && !seen.includes(t.name)) seen.push(t.name); });
  }));
  return seen;
}

function diagramSvg(name) {
  let frets = UKE_CHORDS[name];
  if (!frets && name.includes("/")) frets = UKE_CHORDS[name.split("/")[0]];
  let s = '<svg width="48" height="58" viewBox="0 0 52 62">';
  s += '<line x1="8" y1="10" x2="44" y2="10" stroke="#333" stroke-width="3"/>';
  STRING_X.forEach(x => { s += '<line x1="'+x+'" y1="10" x2="'+x+'" y2="58" stroke="#555" stroke-width="1"/>'; });
  [22,34,46,58].forEach(y => { s += '<line x1="8" y1="'+y+'" x2="44" y2="'+y+'" stroke="#ccc" stroke-width=".8"/>'; });
  STRING_X.forEach((x,i) => { s += '<text x="'+x+'" y="7" text-anchor="middle" font-size="5" fill="#aaa">'+STRING_NAMES[i]+'</text>'; });
  if (frets) {
    STRING_X.forEach((x,i) => { if (frets[i]===0) s += '<text x="'+x+'" y="8" text-anchor="middle" font-size="7" fill="#888">o</text>'; });
    STRING_X.forEach((x,i) => { if (frets[i]>0) s += '<circle cx="'+x+'" cy="'+(10+12*frets[i])+'" r="4.5" fill="#555"/>'; });
  } else {
    s += '<text x="26" y="38" text-anchor="middle" font-size="16" fill="#bbb">?</text>';
  }
  s += '</svg>';
  return { svg:s, frets: frets ? frets.join(" ") : "?" };
}

const tmplMatch = editorSrc.match(/const SHEET_TEMPLATE = `([\s\S]*?)`;[\s\n]*function applyTemplate/);
if (!tmplMatch) { console.error('Could not extract SHEET_TEMPLATE from editor.html'); process.exit(1); }
// The template uses <\/script> to avoid closing the outer <script> tag in editor.html;
// unescape it for standalone output files.
const SHEET_TEMPLATE = tmplMatch[1].replace('<\\/script>', '</script>');

function applyTemplate(tmpl, vars) {
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_, k) => k in vars ? vars[k] : '');
}

function exportHtml(s) {
  const m = s.meta;
  const sheetHtml = s.sections.map(sec => {
    const linesHtml = sec.lines.map(line => {
      if (line.type === "chords-only")
        return '<div class="line"><span class="chords-only">'+esc(line.chords)+'</span></div>';
      const cs = buildChordStr(line.tokens, line.lyrics.length);
      return '<div class="line"><span class="chords">'+esc(cs)+'</span><span class="lyrics">'+esc(line.lyrics)+'</span></div>';
    }).join("");
    return '<div class="section"><div class="section-label">'+esc(sec.name || "Section")+'</div>'+linesHtml+'</div>';
  }).join('<hr class="d">');

  const diagramsHtml = chordsUsed(s).map(n => {
    const d = diagramSvg(n);
    return '<div class="chord-box"><div class="chord-name">'+esc(n)+'</div>'+d.svg+'<div class="frets">'+d.frets+'</div></div>';
  }).join("");

  const query = encodeURIComponent((m.artist ? m.artist+' ' : '')+m.title);
  const spUrl = m.spotify  || 'https://open.spotify.com/search/'+query;
  const ytUrl = m.ytmusic  || 'https://music.youtube.com/search?q='+query;
  const qr = u => "https://api.qrserver.com/v1/create-qr-code/?size=64x64&data="+encodeURIComponent(u);
  const streamingHtml =
    '<div class="streaming">'
    +'<a href="'+escAttr(spUrl)+'" class="sp" target="_blank">&#9654; Spotify</a>'
    +'<a href="'+escAttr(ytUrl)+'" class="yt" target="_blank">&#9654; YouTube Music</a>'
    +'<div class="streaming-qr">'
    +'<div><img src="'+escAttr(qr(spUrl))+'" alt="Spotify QR"><span class="sp-label">Spotify</span></div>'
    +'<div><img src="'+escAttr(qr(ytUrl))+'" alt="YouTube Music QR"><span class="yt-label">YouTube Music</span></div>'
    +'</div></div>';

  return applyTemplate(SHEET_TEMPLATE, {
    TITLE: esc(m.title),
    ARTIST: esc(m.artist),
    SHEET: sheetHtml,
    DIAGRAMS: diagramsHtml,
    STREAMING: streamingHtml,
  });
}

// Find all instrument dirs containing a src/ folder
const root = __dirname;
const srcDirs = fs.readdirSync(root)
  .filter(d => fs.statSync(path.join(root, d)).isDirectory() && d !== '.git')
  .filter(d => fs.existsSync(path.join(root, d, 'src')));

let generated = 0, removed = 0;

for (const dir of srcDirs) {
  const outDir = path.join(root, dir);
  const srcDir = path.join(outDir, 'src');

  // Remove existing HTML files in the output dir
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith('.html')) {
      fs.unlinkSync(path.join(outDir, f));
      console.log(`Removed ${dir}/${f}`);
      removed++;
    }
  }

  // Regenerate from .txt sources
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

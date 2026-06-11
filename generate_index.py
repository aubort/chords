#!/usr/bin/env python3
import os, re, glob

SKIP = {'index.html', 'editor.html'}
REPO = 'aubort/chords'
BRANCH = 'main'

def parse_sheet(path):
    with open(path, encoding='utf-8') as f:
        content = f.read()

    title_m = re.search(r'<h1>([^<]+)</h1>', content)
    artist_m = re.search(r'class="artist">([^<]+)', content)
    key_m = re.search(r'class="label">Key:</span>\s*([^<]+?)\s*</span>', content)

    title = title_m.group(1).strip() if title_m else os.path.basename(path)
    artist_text = artist_m.group(1).strip() if artist_m else ''
    key = key_m.group(1).strip() if key_m else ''

    if ' · arr. for ' in artist_text:
        artist, instrument = artist_text.split(' · arr. for ', 1)
    else:
        artist = artist_text
        instrument = ''

    return {
        'path': path.replace(os.sep, '/'),
        'title': title,
        'artist': artist,
        'instrument': instrument,
        'key': key,
    }

paths = []
for pattern in ['*.html', '*/*.html']:
    for p in sorted(glob.glob(pattern)):
        if os.path.basename(p) not in SKIP:
            paths.append(p)

sheets = sorted([parse_sheet(p) for p in paths], key=lambda x: x['title'].lower())

def card(s):
    key_tag = f'<span class="tag key">{s["key"]}</span>' if s['key'] else ''
    inst_tag = f'<span class="tag">{s["instrument"]}</span>' if s['instrument'] else ''
    raw_url = f'https://raw.githubusercontent.com/{REPO}/{BRANCH}/{s["path"]}'
    return f'''    <div class="song-card">
      <a href="{s['path']}" style="text-decoration:none;color:inherit;flex:1;display:flex;align-items:center;justify-content:space-between">
        <div class="song-info">
          <div class="title">{s['title']}</div>
          <div class="artist">{s['artist']}</div>
        </div>
        <div class="song-meta">{key_tag}{inst_tag}</div>
      </a>
      <div style="margin-left:14px;flex-shrink:0">
        <a class="edit-btn" href="editor.html?url={raw_url}">Edit</a>
      </div>
    </div>'''

cards_html = '\n\n'.join(card(s) for s in sheets)

index = f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Chord Sheets</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;700&family=Playfair+Display:wght@700&display=swap');
*{{margin:0;padding:0;box-sizing:border-box}}
body{{background:#e8e4dc;font-family:'Roboto Mono',monospace;padding:24px;min-height:100vh}}
.container{{max-width:600px;margin:0 auto}}
h1{{font-family:'Playfair Display',serif;font-size:2em;color:#1a1a1a;margin-bottom:4px}}
.subtitle{{font-size:.68em;letter-spacing:.12em;text-transform:uppercase;color:#888;margin-bottom:28px}}
.song-list{{display:flex;flex-direction:column;gap:10px}}
.song-card{{background:#fffdf8;border-radius:4px;box-shadow:0 1px 6px rgba(0,0,0,.08);padding:14px 18px;text-decoration:none;color:inherit;display:flex;justify-content:space-between;align-items:center;transition:box-shadow .15s,transform .15s}}
.song-card:hover{{box-shadow:0 3px 14px rgba(0,0,0,.14);transform:translateY(-1px)}}
.song-info .title{{font-family:'Playfair Display',serif;font-size:1.05em;color:#1a1a1a;line-height:1.2}}
.song-info .artist{{font-size:.64em;letter-spacing:.1em;text-transform:uppercase;color:#888;margin-top:3px}}
.song-meta{{display:flex;gap:8px;align-items:center;flex-shrink:0;margin-left:16px}}
.tag{{font-size:.62em;letter-spacing:.08em;text-transform:uppercase;color:#888;background:#f0ede6;border-radius:3px;padding:2px 7px}}
.tag.key{{color:#b5451b;background:#faf0eb}}
.edit-btn{{
  font-family:'Roboto Mono',monospace;font-size:.6em;letter-spacing:.1em;text-transform:uppercase;
  background:transparent;border:1px solid #ddd;border-radius:3px;
  color:#aaa;padding:3px 9px;cursor:pointer;text-decoration:none;
  transition:border-color .15s,color .15s;white-space:nowrap;
  display:inline-flex;align-items:center;
}}
.edit-btn:hover{{border-color:#b5451b;color:#b5451b}}
</style></head>
<body>
<div class="container">
  <h1>Chord Sheets</h1>
  <div class="subtitle">Ukulele arrangements</div>
  <div style="margin-bottom:20px">
    <a class="edit-btn" href="editor.html" style="font-size:.72em;padding:6px 14px">+ New Song</a>
  </div>
  <div class="song-list">

{cards_html}

  </div>
</div>
</body></html>'''

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(index)

print(f'Generated index.html with {len(sheets)} sheet(s)')

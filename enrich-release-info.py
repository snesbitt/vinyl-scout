#!/usr/bin/env python3
import json, urllib.request, urllib.parse, time, sys

DISCOGS_TOKEN = "VdfNRgktOFMFhKGPmcuUOhavYJmhwAtdDCgkNPjb"

def get_json(url, headers=None):
    h = {'User-Agent': 'VinylScout/1.0'}
    if headers: h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def post_json(url, obj):
    body = json.dumps(obj).encode()
    req = urllib.request.Request(url, data=body, method='POST',
        headers={'Content-Type': 'application/json', 'User-Agent': 'VinylScout/1.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def fetch_release(release_id):
    url = f"https://api.discogs.com/releases/{release_id}?token={urllib.parse.quote(DISCOGS_TOKEN)}"
    try:
        return get_json(url)
    except:
        return None

def extract_fields(release):
    label = catalog_no = country = format_str = None
    country = release.get('country')
    labels = release.get('labels', [])
    if labels:
        label = labels[0].get('name')
        catalog_no = labels[0].get('catno')
    formats = release.get('formats', [])
    if formats:
        format_parts = [f.get('name') for f in formats if f.get('name')]
        if format_parts:
            format_str = ', '.join(format_parts)
    return {'label': label, 'catalog_no': catalog_no, 'country': country, 'format': format_str}

print("\n" + "="*70)
print("ENRICHMENT: Backfill Release Info")
print("="*70)

print("\nFetching records...")
records = get_json("https://vinylscout.org/api/records")
todo = [r for r in records if r.get('discogs_release_id')]
print(f"Found {len(todo)} with discogs_release_id")

has_all = sum(1 for r in todo if (r.get('label') and str(r.get('label')).strip() and
    r.get('catalog_no') and str(r.get('catalog_no')).strip() and
    r.get('country') and str(r.get('country')).strip() and
    r.get('format') and str(r.get('format')).strip()))
need = len(todo) - has_all
print(f"  {has_all} complete, {need} need backfill\n")

if need == 0:
    print("Done.")
    sys.exit(0)

if input(f"Fetch from Discogs and update {need}? [y/N]: ").strip().lower() != 'y':
    sys.exit(0)

ok = skip = fail = 0
for i, r in enumerate(todo, 1):
    artist, title, rid = r.get('artist', '?'), r.get('title', '?'), r.get('discogs_release_id')
    has_all = (r.get('label') and str(r.get('label')).strip() and
        r.get('catalog_no') and str(r.get('catalog_no')).strip() and
        r.get('country') and str(r.get('country')).strip() and
        r.get('format') and str(r.get('format')).strip())
    if has_all:
        print(f"{i:2d}. ✓ {artist} — {title}")
        skip += 1
        continue
    print(f"{i:2d}. • {artist} — {title} ", end='', flush=True)
    rel = fetch_release(rid)
    if not rel:
        print("(fetch failed)")
        fail += 1
        continue
    fields = extract_fields(rel)
    merged = dict(r)
    for key in ['label', 'catalog_no', 'country', 'format']:
        if fields[key]:
            merged[key] = fields[key]
    try:
        post_json("https://vinylscout.org/api/records", merged)
        print("✓")
        ok += 1
    except Exception as e:
        print(f"(upsert failed)")
        fail += 1
    time.sleep(0.2)

print("\n" + "="*70)
print(f"Complete: {ok} updated, {skip} already full, {fail} failed")
print("="*70 + "\n")

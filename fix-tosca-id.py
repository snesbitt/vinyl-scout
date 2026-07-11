#!/usr/bin/env python3
import json, urllib.request, getpass, ssl

try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CTX = ssl.create_default_context()

API = "https://vinylscout.org/api/records"

def post_json(url, obj, secret):
    body = json.dumps(obj).encode()
    req = urllib.request.Request(url, data=body, method='POST',
        headers={'Content-Type': 'application/json', 'X-Edit-Key': secret})
    with urllib.request.urlopen(req, timeout=10, context=SSL_CTX) as r:
        return json.loads(r.read())

secret = getpass.getpass("Edit secret (hidden): ").strip()
if not secret:
    print("Need the secret.")
    exit(1)

tosca = {
    "id": "rec_946515b78c74e0c8",
    "artist": "Tosca",
    "title": "J.A.C. Reissue",
    "year": 2025,
    "genre": "Electronica",
    "discogs_release_id": 35153266
}

print("\nUpdating Tosca to correct Discogs release ID: 35153266")
try:
    post_json(API, tosca, secret)
    print("✓ Updated successfully!")
    print("\nNow run: python3 vs-enrich-batch.py")
except Exception as e:
    print(f"ERROR: {e}")
    exit(1)

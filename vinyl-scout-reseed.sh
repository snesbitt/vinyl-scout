#!/usr/bin/env bash
# vinyl-scout-reseed.sh — Complete reseed automation
# Usage: bash vinyl-scout-reseed.sh
# Prerequisites: EDIT_SECRET env var set, Blobs already wiped in Netlify dashboard

set -euo pipefail

SITE="https://vinylscout.org"
API="${SITE}/api/records"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "=========================================="
echo "Vinyl Scout — Reseed Automation"
echo "=========================================="
echo ""

# Check EDIT_SECRET
if [ -z "${EDIT_SECRET:-}" ]; then
  echo -e "${RED}ERROR: EDIT_SECRET not set${NC}"
  echo "Run: export EDIT_SECRET='your-secret-here'"
  exit 1
fi

# Step 1: Check current count
echo "Step 1: Checking current state..."
CURRENT_COUNT=$(curl -s "${API}" 2>/dev/null | grep -o '"id"' | wc -l || echo "0")
echo "  Current records in Blobs: $CURRENT_COUNT"

if [ "$CURRENT_COUNT" -gt 0 ]; then
  echo -e "${YELLOW}WARNING: Blobs not empty ($CURRENT_COUNT records found)${NC}"
  echo "  You must wipe Blobs in Netlify dashboard BEFORE reseeding."
  echo "  Go to: https://app.netlify.com → vinylscout → Integrations → Blob Store → records"
  echo "  Delete all blobs, then run this script again."
  exit 1
fi

echo -e "${GREEN}✓ Blobs is empty${NC}"
echo ""

# Step 2: Download clean backup
echo "Step 2: Fetching clean 92-record backup..."
curl -sL "https://codeload.github.com/snesbitt/vinyl-scout/tar.gz/refs/heads/main" \
  | tar xz --strip-components=1 "vinyl-scout-main/backups/2026-06-16.json" -O \
  > /tmp/vs-backup.json

RECORD_COUNT=$(grep -o '"id"' /tmp/vs-backup.json | wc -l)
echo "  Backup contains: $RECORD_COUNT records"

# Extract just the records array
python3 << 'PYEOF'
import json, sys
with open('/tmp/vs-backup.json') as f:
    backup = json.load(f)
records = backup['records']
with open('/tmp/vs-reseed-payload.json', 'w') as f:
    json.dump(records, f)
print(f"  Payload prepared: {len(records)} records")
PYEOF

echo -e "${GREEN}✓ Payload ready${NC}"
echo ""

# Step 3: Reseed records
echo "Step 3: Reseeding records (92 total)..."

python3 << 'PYEOF'
import json, urllib.request, urllib.parse
import sys, os

site = "https://vinylscout.org"
api = f"{site}/api/records"
secret = os.environ.get('EDIT_SECRET', '')

if not secret:
    print("ERROR: EDIT_SECRET not set")
    sys.exit(1)

with open('/tmp/vs-reseed-payload.json') as f:
    records = json.load(f)

print(f"  Sending {len(records)} records to {api}...", flush=True)

ok = 0
fail = 0

for i, rec in enumerate(records, 1):
    try:
        body = json.dumps(rec).encode()
        req = urllib.request.Request(
            api,
            data=body,
            method='POST',
            headers={
                'Content-Type': 'application/json',
                'X-Edit-Key': secret,
                'User-Agent': 'vs-reseed/1'
            }
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read()
            ok += 1
            if i % 10 == 0:
                print(f"    {i}/{len(records)}...", flush=True)
    except Exception as e:
        print(f"  ERROR on record {i} ({rec.get('id')}): {e}")
        fail += 1

print(f"  Completed: {ok} OK, {fail} FAILED")
if fail > 0:
    sys.exit(1)
PYEOF

RESEED_EXIT=$?
if [ $RESEED_EXIT -ne 0 ]; then
  echo -e "${RED}✗ Reseed failed${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Reseed completed${NC}"
echo ""

# Step 4: Wait for Netlify to settle
echo "Step 4: Waiting for Netlify redeploy (~35s)..."
sleep 35

# Step 5: Verify post-reseed
echo "Step 5: Verifying post-reseed state..."
FINAL_COUNT=$(curl -s "${API}?bust=$(date +%s)" 2>/dev/null | grep -o '"id"' | wc -l || echo "0")
echo "  Final record count: $FINAL_COUNT"

if [ "$FINAL_COUNT" -eq 92 ]; then
  echo -e "${GREEN}✓ Reseed successful: 92 records live${NC}"
else
  echo -e "${YELLOW}⚠ Count mismatch: expected 92, got $FINAL_COUNT${NC}"
fi

echo ""
echo "=========================================="
echo "Reseed complete. Check gallery:"
echo "  https://vinylscout.org/"
echo "=========================================="
echo ""

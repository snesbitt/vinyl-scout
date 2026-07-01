#!/usr/bin/env python3
import json, sys, time, urllib.request, urllib.parse, getpass
try:
    import certifi
    SSL_CTX = urllib.request.ssl.create_default_context(cafile=certifi.where())
except ImportError:
    print("ERROR: certifi not found. Run: pip3 install certifi")
    sys.exit(1)
API_RECORDS = "https://vinylscout.org/api/records"
API_LOOKUP = "https://vinylscout.org/api/discogs/lookup"
API_PRICING = "https://vinylscout.org/api/discogs-pricing"
DISCOGS_RATE_LIMIT = 60
RATE_LIMIT_DELAY = 1.0 / (DISCOGS_RATE_LIMIT / 60)
def get_json(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode('utf-8', errors='ignore')[:200]
        except:
            pass
        err = Exception(f"HTTP {e.code}: {body or 'no details'}")
        err.status = e.code
        raise err
    except Exception as e:
        raise Exception(f"Network error: {str(e)}")
def post_json(url, data, headers=None):
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=h, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body_text = ""
        try:
            body_text = e.read().decode('utf-8', errors='ignore')[:200]
        except:
            pass
        err = Exception(f"HTTP {e.code}: {body_text or 'no details'}")
        err.status = e.code
        raise err
    except Exception as e:
        raise Exception(f"Network error: {str(e)}")
def lookup_discogs_id(artist, title, max_retries=3):
    for attempt in range(max_retries):
        try:
            params = {"artist": artist, "title": title}
            url = API_LOOKUP + "?" + urllib.parse.urlencode(params)
            result = get_json(url)
            candidates = result.get("candidates", [])
            if candidates:
                return candidates[0].get("discogs_release_id")
            return None
        except Exception as e:
            if "rate limit" in str(e).lower() or (hasattr(e, 'status') and e.status == 429):
                if attempt < max_retries - 1:
                    print(f"    Rate limited. Waiting 30s…")
                    time.sleep(30)
                    continue
            raise
    return None
def fetch_pricing(record_id, edit_secret, max_retries=3):
    for attempt in range(max_retries):
        try:
            headers = {"X-Edit-Key": edit_secret}
            body = {"recordId": record_id}
            result = post_json(API_PRICING, body, headers)
            if result.get("ok"):
                return result.get("record")
            else:
                err_msg = result.get("error", "unknown error")
                if "No Discogs match" in err_msg or result.get("code") == "NO_MATCH":
                    return None
                raise Exception(err_msg)
        except Exception as e:
            if "rate limit" in str(e).lower() or (hasattr(e, 'status') and e.status == 429):
                if attempt < max_retries - 1:
                    print(f"    Rate limited. Waiting 30s…")
                    time.sleep(30)
                    continue
            raise
    return None
def main():
    edit_secret = getpass.getpass("Edit secret (hidden): ").strip()
    if not edit_secret:
        print("ERROR: Edit secret required. Aborting.")
        sys.exit(1)
    print("\n" + "=" * 70)
    print("  Vinyl Scout — Phase 2 Enrichment")
    print("=" * 70)
    print("\nFetching all records from live store…")
    try:
        all_records = get_json(API_RECORDS)
        if not isinstance(all_records, list):
            print("ERROR: Expected a list from /api/records")
            sys.exit(1)
        print(f"  Loaded {len(all_records)} records")
    except Exception as e:
        print(f"ERROR: Could not fetch records: {e}")
        sys.exit(1)
    records_with_id = [r for r in all_records if r.get("discogs_release_id")]
    records_with_price = [r for r in all_records if r.get("price_median")]
    print(f"  {len(records_with_id)}/{len(all_records)} have Discogs IDs")
    print(f"  {len(records_with_price)}/{len(all_records)} have pricing")
    print("\nThis will:")
    print(f"  1. Lookup Discogs IDs for {len(all_records) - len(records_with_id)} records without one")
    print(f"  2. Fetch pricing + stats for all {len(all_records)} records")
    print("  3. Upsert each record after successful enrichment")
    print("\nRespond to any Discogs rate limits (60 req/min) automatically.")
    if input("\nProceed? [y/N]: ").strip().lower() != 'y':
        print("Aborted.")
        sys.exit(0)
    stats = {'id_lookups': 0, 'id_found': 0, 'id_notfound': 0, 'pricing_fetched': 0, 'pricing_skipped': 0, 'pricing_failed': 0, 'stored': 0, 'failed': 0}
    failed_records = []
    print("\n" + "-" * 70)
    for i, record in enumerate(all_records, 1):
        artist = record.get("artist", "?")
        title = record.get("title", "?")
        rec_id = record.get("id", "?")
        if not record.get("discogs_release_id"):
            print(f"{i:3d}. {artist} — {title}")
            print(f"     Lookup ID on Discogs…", end=" ", flush=True)
            stats['id_lookups'] += 1
            try:
                did = lookup_discogs_id(artist, title)
                if did:
                    record['discogs_release_id'] = did
                    print(f"found {did}")
                    stats['id_found'] += 1
                else:
                    print("not found")
                    stats['id_notfound'] += 1
                time.sleep(RATE_LIMIT_DELAY)
            except Exception as e:
                print(f"error: {e}")
                failed_records.append((artist, title, f"ID lookup: {e}"))
                stats['failed'] += 1
                continue
        else:
            print(f"{i:3d}. {artist} — {title} (ID {record.get('discogs_release_id')})")
        print(f"     Fetch pricing…", end=" ", flush=True)
        try:
            enriched = fetch_pricing(rec_id, edit_secret)
            if enriched:
                record = enriched
                has_price = record.get("price_median") or record.get("price_low")
                if has_price:
                    print(f"ok")
                    stats['pricing_fetched'] += 1
                else:
                    print(f"no pricing data")
                    stats['pricing_skipped'] += 1
            else:
                print(f"no match on Discogs (skipping)")
                stats['pricing_skipped'] += 1
            time.sleep(RATE_LIMIT_DELAY)
        except Exception as e:
            print(f"error: {e}")
            failed_records.append((artist, title, f"Pricing: {e}"))
            stats['pricing_failed'] += 1
            continue
        try:
            headers = {"X-Edit-Key": edit_secret}
            post_json(API_RECORDS, record, headers)
            stats['stored'] += 1
            time.sleep(0.1)
        except Exception as e:
            print(f"     Store failed: {e}")
            failed_records.append((artist, title, f"Store: {e}"))
            stats['failed'] += 1
    print("-" * 70)
    print("\nSummary:")
    print(f"  Discogs ID lookups:     {stats['id_lookups']} asked, {stats['id_found']} found, {stats['id_notfound']} not found")
    print(f"  Pricing fetches:        {stats['pricing_fetched']} fetched, {stats['pricing_skipped']} skipped")
    print(f"  Stored successfully:    {stats['stored']}")
    print(f"  Failed:                 {stats['failed']}")
    if failed_records:
        print("\nFailed records:")
        for artist, title, reason in failed_records:
            print(f"  • {artist} — {title}: {reason}")
    print("\n" + "=" * 70)
    if stats['failed'] == 0:
        print("  ✓ All records processed successfully!")
    else:
        print(f"  ⚠ {stats['failed']} record(s) failed. Check the list above.")
    print("=" * 70)
if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\nAborted by user.")
        sys.exit(1)

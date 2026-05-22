import https from 'https';
import fs from 'fs';

const DISCOGS_API_BASE = 'https://api.discogs.com';
const USER_AGENT = 'VinylScout/1.0 +https://vinylscout.org';

// All 93 records
const records = JSON.parse(fs.readFileSync('/tmp/vinyl-scout/enriched-input.json', 'utf8'));

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function searchDiscogs(artist, title) {
  try {
    const query = encodeURIComponent(`${artist} ${title}`);
    const url = `${DISCOGS_API_BASE}/database/search?q=${query}&type=release`;
    const res = await httpsGet(url);
    if (res.results && res.results.length > 0) {
      const result = res.results[0];
      if (result.cover_image && result.cover_image !== 'https://s.discogs.com/images/default-release-cd.png') {
        return result.cover_image;
      }
    }
  } catch (err) {
    console.error(`ERROR: ${artist} - ${title}: ${err.message}`);
  }
  return null;
}

async function enrich() {
  console.log(`Enriching ${records.length} records...\n`);
  let matched = 0;
  
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (rec.cover_url || rec.artist === 'Unknown') {
      console.log(`[${i + 1}/${records.length}] ${rec.artist} - ${rec.title} (skip)`);
      continue;
    }
    
    const coverUrl = await searchDiscogs(rec.artist, rec.title);
    if (coverUrl) {
      rec.cover_url = coverUrl;
      matched++;
      console.log(`[${i + 1}/${records.length}] ✓ ${rec.artist} - ${rec.title}`);
    } else {
      console.log(`[${i + 1}/${records.length}] ✗ ${rec.artist} - ${rec.title}`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  
  fs.writeFileSync('/tmp/vinyl-scout/enriched-catalog.json', JSON.stringify(records, null, 2));
  console.log(`\n✓ Matched: ${matched}/${records.filter(r => r.artist !== 'Unknown').length}`);
  console.log(`✓ Saved to enriched-catalog.json`);
}

enrich().catch(console.error);

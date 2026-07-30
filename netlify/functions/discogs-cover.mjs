// Vinyl Scout - fetch cover art from Discogs automatically
// version: 1
//
// Companion to save-cover.mjs. That function takes a browser-uploaded file;
// this one takes a Discogs release ID and does the whole fetch server-side,
// so accepting a pressing match in audit.html can also fill in the cover art
// automatically instead of requiring a separate manual upload every time.
//
// PURE SERVER-SIDE FETCH: Discogs image URLs are not reliably fetchable from
// a browser (CORS), so this runs the download here, then commits the bytes
// to covers/<recordId>.<ext> via the same GitHub contents API path save-cover
// uses. Does NOT modify the records store — same division of responsibility
// as save-cover.mjs: the caller (audit.html) issues a separate /api/records
// upsert with the returned URL.
//
// Same X-Edit-Key gate as save-cover.mjs and /api/records (this is a write).
//
// Env vars expected (all already set for discogs-lookup.mjs / save-cover.mjs):
//   DISCOGS_TOKEN, GITHUB_TOKEN, GITHUB_REPO (optional), GITHUB_BRANCH (optional), EDIT_SECRET

const ID_RE = /^rec_[a-f0-9]{16}$/;
const MAX_BYTES = 4 * 1024 * 1024; // matches the client-side compressed-upload cap in audit.html

function jerr(status, msg) {
  return new Response(JSON.stringify({ error: msg }),
    { status, headers: { 'Content-Type': 'application/json' } });
}

export default async (req) => {
  if (req.method !== 'POST') {
    return jerr(405, 'POST only');
  }

  const provided = req.headers.get('x-edit-key');
  const expected = process.env.EDIT_SECRET;
  if (!expected || !provided || provided !== expected) {
    return jerr(401, 'unauthorized - missing or wrong X-Edit-Key header');
  }

  let payload;
  try { payload = await req.json(); }
  catch { return jerr(400, 'invalid JSON body'); }

  const { recordId, releaseId } = payload || {};
  if (typeof recordId !== 'string' || !ID_RE.test(recordId)) {
    return jerr(400, 'recordId must match rec_<16hex>');
  }
  const rid = typeof releaseId === 'number' ? String(releaseId) : (releaseId || '').trim();
  if (!/^\d+$/.test(rid)) {
    return jerr(400, 'releaseId must be a Discogs release ID (digits only)');
  }

  const discogsToken = process.env.DISCOGS_TOKEN;
  if (!discogsToken) return jerr(500, 'DISCOGS_TOKEN is not set on the server');

  // 1. Fetch the release, pull its primary (or first) full-size image URL.
  let imageUrl;
  try {
    const relRes = await fetch('https://api.discogs.com/releases/' + encodeURIComponent(rid), {
      headers: {
        'Authorization': 'Discogs token=' + discogsToken,
        'User-Agent': 'VinylScout/1.0 +https://vinylscout.org',
      },
    });
    if (!relRes.ok) {
      let detail = '';
      try { detail = (await relRes.json()).message || ''; } catch (e) {}
      return jerr(502, 'Discogs release lookup failed: ' + relRes.status + (detail ? ' - ' + detail : ''));
    }
    const rel = await relRes.json();
    const images = Array.isArray(rel.images) ? rel.images : [];
    const primary = images.find((im) => im.type === 'primary') || images[0];
    imageUrl = primary ? (primary.uri || primary.uri150) : null;
  } catch (err) {
    return jerr(502, 'Could not reach Discogs: ' + err.message);
  }
  if (!imageUrl) {
    return jerr(404, 'This release has no cover image on Discogs');
  }

  // 2. Download the image itself (server-side — no browser CORS issue here).
  let bytes, contentType;
  try {
    const imgRes = await fetch(imageUrl, {
      headers: { 'User-Agent': 'VinylScout/1.0 +https://vinylscout.org' },
    });
    if (!imgRes.ok) return jerr(502, 'Could not download Discogs image: HTTP ' + imgRes.status);
    contentType = imgRes.headers.get('content-type') || '';
    const buf = await imgRes.arrayBuffer();
    bytes = Buffer.from(buf);
  } catch (err) {
    return jerr(502, 'Could not download Discogs image: ' + err.message);
  }

  let ext;
  if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) ext = 'jpg';
  else if (contentType.includes('image/png')) ext = 'png';
  else return jerr(415, 'Discogs image was an unsupported type: ' + (contentType || 'unknown'));

  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    return jerr(413, 'Discogs image is ' + bytes.length + ' bytes, outside the 1..' + MAX_BYTES + ' range');
  }

  // 3. Commit it to covers/<recordId>.<ext>, same GitHub contents-API dance as save-cover.mjs.
  const ghToken = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || 'snesbitt/vinyl-scout';
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!ghToken) return jerr(503, 'GITHUB_TOKEN not configured');

  const path = 'covers/' + recordId + '.' + ext;
  const ghHeaders = {
    'Authorization': 'Bearer ' + ghToken,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'vinyl-scout-cover',
  };

  let existingSha = null;
  try {
    const checkRes = await fetch(
      'https://api.github.com/repos/' + repo + '/contents/' + path + '?ref=' + branch,
      { headers: ghHeaders }
    );
    if (checkRes.ok) existingSha = (await checkRes.json()).sha;
  } catch (e) { /* probe failure is non-fatal; PUT will fail loudly if needed */ }

  const body = {
    message: 'cover: ' + recordId + ' (from Discogs release ' + rid + ', ' + bytes.length + 'B)',
    content: bytes.toString('base64'),
    branch: branch,
  };
  if (existingSha) body.sha = existingSha;

  const putRes = await fetch(
    'https://api.github.com/repos/' + repo + '/contents/' + path,
    {
      method: 'PUT',
      headers: Object.assign({}, ghHeaders, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    }
  );
  if (!putRes.ok) {
    const detail = await putRes.text();
    return jerr(502, 'GitHub commit failed: ' + putRes.status + ' ' + detail.slice(0, 200));
  }

  const result = await putRes.json();
  return new Response(JSON.stringify({
    ok: true,
    cover_url: '/' + path,
    commit_sha: result.commit && result.commit.sha ? result.commit.sha : null,
    overwrote: !!existingSha,
    source_image: imageUrl,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const config = { path: '/api/discogs/cover' };

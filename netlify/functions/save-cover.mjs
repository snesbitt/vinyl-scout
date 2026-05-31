// Vinyl Scout - cover image upload
// version: 1
//
// Writes an uploaded JPEG/PNG to covers/<recordId>.<ext> via the GitHub
// contents API. Same X-Edit-Key gate as /api/records. Does NOT modify the
// records store - the caller (audit.html) issues a separate /api/records
// upsert with the returned URL. Orphan covers from a failed second step
// cost nothing - overwritten on the next upload for that ID.

const ID_RE = /^rec_[a-f0-9]{16}$/;
const MAX_BYTES = 1024 * 1024;

function jerr(status, msg) {
  return new Response(JSON.stringify({ error: msg }),
    { status, headers: { 'Content-Type': 'application/json' } });
}

export default async (req, context) => {
  const provided = req.headers.get('x-edit-key');
  const expected = process.env.EDIT_SECRET;
  if (!expected || !provided || provided !== expected) {
    return jerr(401, 'unauthorized - missing or wrong X-Edit-Key header');
  }

  let payload;
  try { payload = await req.json(); }
  catch { return jerr(400, 'invalid JSON body'); }

  const { recordId, contentType, dataBase64 } = payload || {};
  if (typeof recordId !== 'string' || !ID_RE.test(recordId)) {
    return jerr(400, 'recordId must match rec_<16hex>');
  }
  let ext;
  if (contentType === 'image/jpeg') ext = 'jpg';
  else if (contentType === 'image/png') ext = 'png';
  else return jerr(400, 'contentType must be image/jpeg or image/png');

  if (typeof dataBase64 !== 'string' || !dataBase64.length) {
    return jerr(400, 'dataBase64 required');
  }
  let bytes;
  try { bytes = Buffer.from(dataBase64, 'base64'); }
  catch { return jerr(400, 'dataBase64 did not decode'); }
  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    return jerr(400, 'decoded image must be 1..' + MAX_BYTES + ' bytes (got ' + bytes.length + ')');
  }

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || 'snesbitt/vinyl-scout';
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token) return jerr(503, 'GITHUB_TOKEN not configured');

  const path = 'covers/' + recordId + '.' + ext;
  const ghHeaders = {
    'Authorization': 'Bearer ' + token,
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
    message: 'cover: ' + recordId + ' (' + bytes.length + 'B)',
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
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const config = { path: '/api/save-cover' };

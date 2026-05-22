# Vinyl Scout

Personal vinyl cataloging agent. Single-user, Netlify-hosted.

## What's in this bundle

A complete, deployable rebuild of Vinyl Scout including the new **photo-cover identification** feature (Claude vision identifies records from album-cover photos when OCR finds no catalog number).

```
.
├── index.html, login.html, app.js, style.css   # frontend
├── netlify.toml, package.json                  # config
└── netlify/
    ├── lib/                                    # shared helpers
    │   ├── auth.mjs        — HMAC session cookies, AUTH_PASSWORD gate
    │   ├── discogs.mjs     — Discogs API wrapper + grade pricing
    │   └── records.mjs     — Netlify Blobs CRUD for records
    └── functions/                              # one file per endpoint
        ├── auth.mjs              GET/POST/DELETE /api/auth
        ├── records.mjs           GET/PATCH/DELETE /api/records[/:id]
        ├── upload.mjs            POST /api/upload (multipart photos)
        ├── photo.mjs             GET /api/photo/:filename
        ├── quick-search.mjs      GET /api/quick-search?q=…
        ├── quick-add.mjs         POST /api/quick-add  { release_id }
        ├── disambig.mjs          POST /api/disambig   { record_id, release_id }
        ├── search.mjs            POST /api/search     { record_id, query }
        ├── listing-draft.mjs     GET /api/listing-draft?id=…
        └── identify-cover.mjs    POST /api/identify-cover   (NEW)
```

## Deploy

### 1. Environment variables (Netlify → Site configuration → Environment variables)

| Variable             | Required? | What it is                                                      |
| -------------------- | --------- | --------------------------------------------------------------- |
| `DISCOGS_TOKEN`      | yes       | Personal access token from discogs.com → Settings → Developers  |
| `DISCOGS_USERNAME`   | yes       | Your Discogs username (must match the token's owner)            |
| `ANTHROPIC_API_KEY`  | yes       | From console.anthropic.com → Settings → API Keys (starts `sk-ant-`) |
| `AUTH_PASSWORD`      | no        | Set this to lock the site behind a password. Leave unset for public mode. |
| `SESSION_SECRET`     | no        | Optional. Random string for cookie signing. Defaults to `AUTH_PASSWORD`. |

### 2. Drag-and-drop deploy

In the Netlify dashboard, go to your site → **Deploys** → drag this whole folder onto the drop zone. Wait ~30 seconds for "Published."

That's it.

## What's new in this version

When you take a photo of an album cover:

1. The browser runs OCR on the image (Tesseract.js) looking for a catalog number — same as before.
2. If a catalog number is found, Discogs identifies the release automatically — same as before.
3. **NEW: If no catalog number is found**, the server calls **Claude vision** (`/api/identify-cover`) on the first photo. If it recognizes the album, the artist + title get fed into the existing Discogs search, populating candidates on the record. You then pick the right pressing from the same disambiguation UI you already use.

You'll see status updates in the upload tray:
- `Identifying cover with vision…`
- `Identified · Pink Floyd — The Dark Side of the Moon`
- (then candidates appear when you scroll the record)

## Notes / caveats

- **Vision cost**: ~$0.005–0.01 per photo on Claude Sonnet 4.6. For 50–75 LPs that's well under a dollar total.
- **Existing data**: This bundle reads records from the `records` Netlify Blob store, one JSON blob per record. If your previous deploy stored records differently, you may see an empty list. In that case, roll back via Netlify's Deploys page (every old deploy is one-click restorable).
- **Public mode**: With `AUTH_PASSWORD` unset, anyone can view and modify the site. The sign-out button hides itself automatically in public mode.

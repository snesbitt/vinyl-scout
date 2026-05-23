/**
 * COVER ART MANAGER — Vinyl Scout Phase 3
 * 
 * Handles cover image storage, retrieval, and validation.
 * Stores images separately in Netlify Blobs, referenced by record ID.
 * 
 * Architecture:
 * - Images stored in 'covers' blob store with key: cover_<id>
 * - Records reference images by record ID (no base64 bloat)
 * - Supports JPG, PNG, WebP
 * - Auto-generates fallback SVG placeholder on retrieval
 * - Handles edge cases: missing images, corrupted data, size limits
 */

import { getStore } from '@netlify/blobs';

const COVERS_STORE = 'covers';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// ============================================================
// UPLOAD: POST /api/covers/:id
// ============================================================
async function handleUpload(req, recordId) {
  if (!recordId || recordId.match(/[^a-z0-9_-]/i)) {
    return error(400, 'Invalid record ID');
  }

  const contentType = req.headers.get('content-type');
  if (!ALLOWED_TYPES.includes(contentType)) {
    return error(400, `Unsupported type: ${contentType}. Allowed: JPG, PNG, WebP`);
  }

  const buffer = await req.arrayBuffer();
  if (buffer.byteLength === 0) {
    return error(400, 'Empty image');
  }
  if (buffer.byteLength > MAX_IMAGE_SIZE) {
    return error(413, `Image too large (max 5MB, got ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB)`);
  }

  try {
    const store = getStore(COVERS_STORE);
    const key = `cover_${recordId}`;
    
    // Store metadata alongside image
    const metadata = {
      recordId,
      type: contentType,
      size: buffer.byteLength,
      uploadedAt: new Date().toISOString(),
    };
    
    // Store image as binary blob
    await store.set(key, new Blob([buffer], { type: contentType }));
    
    // Store metadata as JSON
    await store.set(`${key}.json`, JSON.stringify(metadata));
    
    return success({
      id: recordId,
      size: buffer.byteLength,
      type: contentType,
      url: `/api/covers/${recordId}/image`,
      uploadedAt: metadata.uploadedAt,
    });
  } catch (err) {
    return error(500, `Upload failed: ${err.message}`);
  }
}

// ============================================================
// RETRIEVE: GET /api/covers/:id/image
// ============================================================
async function handleGetImage(recordId) {
  if (!recordId || recordId.match(/[^a-z0-9_-]/i)) {
    return error(400, 'Invalid record ID');
  }

  try {
    const store = getStore(COVERS_STORE);
    const key = `cover_${recordId}`;
    
    // Try to get existing image
    try {
      const image = await store.get(key, { type: 'blob' });
      if (image) {
        const metadata = await store.get(`${key}.json`).catch(() => null);
        const meta = metadata ? JSON.parse(metadata) : { type: 'image/jpeg' };
        
        return new Response(image, {
          status: 200,
          headers: {
            'Content-Type': meta.type,
            'Cache-Control': 'public, max-age=86400',
          },
        });
      }
    } catch (err) {
      // Image doesn't exist, return SVG placeholder
    }
    
    // Return SVG placeholder
    const svg = generatePlaceholder(recordId);
    return new Response(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    return error(500, `Retrieval failed: ${err.message}`);
  }
}

// ============================================================
// DELETE: DELETE /api/covers/:id
// ============================================================
async function handleDelete(recordId) {
  if (!recordId || recordId.match(/[^a-z0-9_-]/i)) {
    return error(400, 'Invalid record ID');
  }

  try {
    const store = getStore(COVERS_STORE);
    const key = `cover_${recordId}`;
    
    await store.delete(key).catch(() => {}); // ignore if not found
    await store.delete(`${key}.json`).catch(() => {});
    
    return success({ deleted: recordId });
  } catch (err) {
    return error(500, `Delete failed: ${err.message}`);
  }
}

// ============================================================
// SVG PLACEHOLDER GENERATOR
// ============================================================
function generatePlaceholder(recordId) {
  const colors = {
    moby_play: '#2C3E50',
    fleetwood_rumours: '#8B4513',
    portishead_dummy: '#1a1a1a',
    nina_simone: '#D4AF37',
    steely_aja: '#A0522D',
  };
  
  const color = colors[recordId] || '#999999';
  const gradientId = `grad_${recordId}`;
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${adjustColor(color, -20)};stop-opacity:1" />
    </linearGradient>
    <pattern id="noise" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="4" fill="${color}" opacity="0.1"/>
    </pattern>
  </defs>
  
  <rect width="300" height="300" fill="url(#${gradientId})"/>
  <rect width="300" height="300" fill="url(#noise)"/>
  
  <text x="150" y="150" font-family="Georgia, serif" font-size="48" font-weight="bold" fill="white" text-anchor="middle" opacity="0.3">♪</text>
  <text x="150" y="260" font-family="monospace" font-size="12" fill="white" text-anchor="middle" opacity="0.6">${recordId}</text>
</svg>`;
}

function adjustColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return `#${(0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
    (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
    (B < 255 ? B < 1 ? 0 : B : 255))
    .toString(16).slice(1)}`;
}

// ============================================================
// HTTP RESPONSE HELPERS
// ============================================================
function success(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function error(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ============================================================
// ROUTER
// ============================================================
export const config = {
  path: '/api/covers/:id/*',
};

export default async (req, context) => {
  const { id } = context.params;
  const segments = req.url.split('/').filter(Boolean);
  const action = segments[segments.length - 1];

  try {
    if (req.method === 'POST') {
      return await handleUpload(req, id);
    }
    if (req.method === 'GET' && action === 'image') {
      return await handleGetImage(id);
    }
    if (req.method === 'DELETE') {
      return await handleDelete(id);
    }
    
    return error(405, `${req.method} not allowed`);
  } catch (err) {
    return error(500, err.message);
  }
};

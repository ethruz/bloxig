// routes/imageUpload.js — Bloxig server-side Open Cloud image upload
//
// WHY THIS EXISTS:
// Roblox Studio plugins CANNOT call apis.roblox.com via HttpService
// ("HttpService is not allowed to access that Roblox resource"). Only a
// short whitelist of Open Cloud endpoints is callable, and only from game
// servers — NOT the Assets upload endpoint, and NOT from plugins. So the
// upload must happen here, on our server, which has no such restriction.
//
// FLOW:
//   Plugin POSTs { images: { name: base64png }, apiKey, userId }
//   -> dedupe identical images by content hash (anime UIs reuse one texture
//      dozens of times) and upload each UNIQUE image only ONCE
//   -> for each unique image: POST multipart to Open Cloud Assets API
//   -> poll the operation until done
//   -> fan the resulting asset id back out to every name that shares it
//   -> return { name: "rbxassetid://<id>" }; plugin links by name.
//
// The user's API key is used transiently and NEVER stored.
// Node 18+ has global fetch / FormData / Blob — no extra deps.

const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const { verifyJWT } = require('../middleware/isAuthenticated');

const ASSETS_URL = 'https://apis.roblox.com/assets/v1/assets';
const OPS_URL    = 'https://apis.roblox.com/assets/v1/operations/';

const MAX_POLLS  = 15;
const POLL_DELAY = 1500; // ms

// Cap on the number of UNIQUE images per import (after dedupe). Heavy texture
// reuse no longer counts against this — only genuinely distinct images do.
const MAX_UNIQUE_IMAGES = 60;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Upload one PNG buffer; returns operationId or throws.
async function startUpload(apiKey, userId, displayName, pngBuffer) {
  const form = new FormData();
  form.append('request', JSON.stringify({
    assetType: 'Decal',
    displayName: String(displayName).slice(0, 50),
    description: 'Uploaded by Bloxig',
    creationContext: { creator: { userId: String(userId) } }
  }));
  form.append('fileContent', new Blob([pngBuffer], { type: 'image/png' }), 'image.png');

  const res = await fetch(ASSETS_URL, {
    method: 'POST',
    headers: { 'x-api-key': apiKey },   // do NOT set Content-Type; fetch sets the multipart boundary
    body: form
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error('auth: API key rejected (needs assets read+write on your account)');
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`http ${res.status}: ${t.slice(0, 160)}`);
  }

  const data = await res.json();
  if (data.operationId) return data.operationId;
  if (data.path) return String(data.path).replace('operations/', '');
  // Some responses inline the finished asset.
  if (data.done && data.response && data.response.assetId) {
    return { inlineAssetId: data.response.assetId };
  }
  throw new Error('no operation id in upload response');
}

// Poll an operation until done; returns assetId or throws.
async function pollOperation(apiKey, operationId) {
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_DELAY);
    const res = await fetch(OPS_URL + operationId, {
      headers: { 'x-api-key': apiKey }
    });
    if (!res.ok) continue;
    const data = await res.json();
    if (data.done) {
      const resp = data.response;
      if (resp && resp.assetId) {
        const mod = resp.moderationResult && resp.moderationResult.moderationState;
        if (mod && String(mod).includes('Rejected')) {
          throw new Error('moderation rejected');
        }
        return resp.assetId;
      }
      if (data.error) {
        throw new Error('op error: ' + (data.error.message || data.error.code || 'unknown'));
      }
      throw new Error('operation done but no assetId');
    }
  }
  throw new Error('timed out waiting for upload');
}

// ── POST /api/upload-images ───────────────────────────────────
router.post('/upload-images', verifyJWT, async (req, res) => {
  const { images, apiKey, userId } = req.body;

  if (!images || typeof images !== 'object') {
    return res.status(400).json({ error: 'images object required' });
  }
  if (!apiKey || !userId) {
    return res.status(400).json({ error: 'apiKey and userId required' });
  }

  const names = Object.keys(images);
  if (names.length === 0) {
    return res.json({ success: true, imageMap: {}, errors: [] });
  }
  if (names.length > MAX_UNIQUE_IMAGES) {
    return res.status(413).json({
      error: `too many images (${names.length}, max ${MAX_UNIQUE_IMAGES} per import)`
    });
  }

  // ── Dedupe by content hash ───────────────────────────────────
  // Anime UIs reuse the same texture many times (one ray/texture can appear
  // 50+ times). Hash each blob, upload each UNIQUE image ONCE, then fan the
  // resulting asset id back out to every name sharing that hash. Turns e.g.
  // 159 uploads into ~32 — far fewer Open Cloud calls + moderation polls.
  const hashOf  = {};   // name -> hash
  const repName = {};   // hash -> first name carrying it (the one we upload)
  for (const name of names) {
    const b64 = images[name];
    if (typeof b64 !== 'string' || b64.length === 0) continue;
    const h = crypto.createHash('md5').update(b64).digest('hex');
    hashOf[name] = h;
    if (!repName[h]) repName[h] = name;
  }

  const uniqueHashes = Object.keys(repName);

  // Cap applies to UNIQUE images only — reuse is free.
  if (uniqueHashes.length > MAX_UNIQUE_IMAGES) {
    return res.status(413).json({
      error: `too many unique images (${uniqueHashes.length}, max ${MAX_UNIQUE_IMAGES} per import)`
    });
  }

  const idByHash = {};   // hash -> 'rbxassetid://...'
  const errors   = [];

  // Upload one representative per unique hash, sequentially (rate-limit safe).
  for (const h of uniqueHashes) {
    const name = repName[h];
    try {
      const buffer = Buffer.from(images[name], 'base64');
      if (!buffer || buffer.length === 0) {
        errors.push(`${name}: empty image`);
        continue;
      }

      const started = await startUpload(apiKey, userId, name, buffer);
      let assetId;
      if (started && started.inlineAssetId) {
        assetId = started.inlineAssetId;
      } else {
        assetId = await pollOperation(apiKey, started);
      }
      idByHash[h] = 'rbxassetid://' + assetId;
    } catch (err) {
      errors.push(`${name}: ${err.message || String(err)}`);
    }
  }

  // Fan out: every original name -> its hash's uploaded asset id.
  const imageMap = {};
  for (const name of names) {
    const h = hashOf[name];
    if (h && idByHash[h]) imageMap[name] = idByHash[h];
  }

  res.json({
    success: true,
    imageMap,
    errors,
    stats: { received: names.length, uploaded: uniqueHashes.length }
  });
});

module.exports = router;

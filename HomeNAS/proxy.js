const { createProxyMiddleware } = require('http-proxy-middleware');
const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const crypto = require('crypto');
const uploadStore = require('./upload-store');

const app = express();

// The UI is opened from the Pages site, from any localhost port, or from disk (file://).
// Reflect the origin only if it matches that set; otherwise no CORS header is sent.
// Requests without an Origin header (curl, same-origin) are allowed through untouched.
const ALLOWED_ORIGIN = [
  /^https:\/\/cliffchew84\.github\.io$/,
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = !origin || origin === 'null' || ALLOWED_ORIGIN.some(re => re.test(origin));
  if (allowed && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(allowed ? 204 : 403);
  next();
});

// The proxy rewrites the Bearer token to the authorization_code cookie the NAS expects.
const bearerToCookie = (proxyReq, req) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    proxyReq.setHeader('Cookie', `authorization_code=${auth.slice(7)}`);
    return;
  }
  // Hidden-form downloads cannot carry headers; fall back to the session cookie we set at login.
  const m = /(?:^|;\s*)homenas_session=([^;]+)/.exec(req.headers.cookie || '');
  if (m) proxyReq.setHeader('Cookie', `authorization_code=${m[1]}`);
};

// ====== Disk history (failure-risk experiment) ======
// One compact snapshot per day, stored on this Mac. The NAS is never written to.
const HISTORY_FILE = path.join(__dirname, '.health-history.jsonl');

// Read the local disk-health history. Bad lines are skipped; a missing file means no history yet.
function parsedHistoryEntries() {
  try {
    const lines = fs.readFileSync(HISTORY_FILE, 'utf8').split('\n').filter(Boolean);
    const entries = [];
    for (const line of lines) {
      try { entries.push(JSON.parse(line)); } catch (e) { /* skip a bad line */ }
    }
    return entries;
  } catch (e) { return []; }
}

app.get('/health/history', (req, res) => {
  res.json({ result: true, samples: parsedHistoryEntries().slice(-400) });
});

app.post('/health/history', express.json({ limit: '256kb' }), (req, res) => {
  // Data-integrity guard, not real authentication: a session bearer must be present.
  // Stops casual LAN writes; does not verify the token against the NAS.
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ result: false, error: 'Missing token' });
  }
  const body = req.body || {};
  if (!Array.isArray(body.disks) || body.disks.length === 0) {
    return res.status(400).json({ result: false, error: 'Bad snapshot' });
  }
  const now = new Date();
  const date = String(body.date || now.toISOString().slice(0, 10));

  // One snapshot per day: keep the first, skip later writes for the same date.
  const seenDates = new Set(parsedHistoryEntries().map(e => String(e.date || '')));
  if (seenDates.has(date)) return res.json({ result: true, skipped: 'duplicate' });

  const entry = { ts: now.toISOString(), date, disks: body.disks.slice(0, 16) };
  try {
    fs.appendFileSync(HISTORY_FILE, JSON.stringify(entry) + '\n');
  } catch (e) {
    return res.status(500).json({ result: false, error: 'Write failed' });
  }
  res.json({ result: true });
});

// ====== Resumable uploads ======
// Chunks stage on this machine. The NAS has no chunk API, so the file is
// assembled here once and sent to the NAS as one normal multipart upload.
const STAGING_ROOT = process.env.UPLOAD_DIR || path.join(__dirname, '.uploads');
const NAS_ORIGIN = (() => {
  const target = process.env.NAS_TARGET || '192.168.68.53';
  const base = /^https?:\/\//.test(target) ? target : `http://${target}`;
  return base.replace(/\/+$/, '');
})();

function tokenFrom(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const m = /(?:^|;\s*)homenas_session=([^;]+)/.exec(req.headers.cookie || '');
  return m ? decodeURIComponent(m[1]) : '';
}

function requireToken(req, res, next) {
  const token = tokenFrom(req);
  if (!token) return res.status(401).json({ result: false, error: 'Missing token' });
  req.nasToken = token;
  next();
}

// Collect a small NAS response (JSON, at most 2 MB) and resolve with its status and body.
function collectNasResponse(req, res, resolve, reject) {
  const chunks = [];
  let size = 0;
  res.on('data', chunk => {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) { req.destroy(); reject(new Error('NAS response is too large')); return; }
    chunks.push(chunk);
  });
  res.on('end', () => {
    let data = {};
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { /* keep empty */ }
    resolve({ status: res.statusCode || 0, data });
  });
}

// Small JSON call to the NAS. The NAS expects the session in a cookie.
function nasJson(token, pathname, method = 'GET') {
  return new Promise((resolve, reject) => {
    const url = new URL(NAS_ORIGIN + pathname);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method,
      headers: { Cookie: `authorization_code=${token}` }
    }, res => collectNasResponse(req, res, resolve, reject));
    req.on('error', reject);
    req.end();
  });
}

// Walk a NAS folder in pages until the name is found.
async function findNasItem(token, dir, name) {
  for (let offset = 0, page = 0; page < 40; page++, offset += 500) {
    const query = JSON.stringify({
      root: 'local',
      path: dir,
      option: {
        offset,
        limit: 500,
        order: 'name',
        reverse: false,
        filter: [{ key: 'subtype', equal: false, value: 'hidden' }]
      }
    });
    const { status, data } = await nasJson(token, `/life/v1/folder?query=${encodeURIComponent(query)}`);
    if (status === 401) { const e = new Error('Session expired'); e.status = 401; throw e; }
    if (status < 200 || status >= 300 || !data.result) throw new Error('NAS listing failed');
    const items = (data.data && data.data.items) || [];
    const hit = items.find(it => it.name === name);
    if (hit) return hit;
    if (items.length < 500) return null;
  }
  return null;
}

// A relative path keeps its folders: targetPath is the batch root.
function nasDirFor(meta) {
  const relDir = path.posix.dirname(meta.relPath);
  return relDir === '.' ? meta.targetPath : path.posix.join(meta.targetPath, relDir);
}

// Stream one multipart body: the NAS reads the file from the field named after the file.
function nasUpload(token, meta, name, filePath, dir) {
  const boundary = '----HomeNAS' + crypto.randomBytes(12).toString('hex');
  const metaJson = JSON.stringify({
    root: 'local',
    path: dir,
    mtime: meta.mtime,
    size: meta.size,
    filename: name
  });
  const safeName = String(name).replace(/"/g, '%22').replace(/\r|\n/g, ' ');
  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="application/json"\r\n` +
    `Content-Type: application/json\r\n\r\n${metaJson}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${safeName}"; filename="${safeName}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`,
    'utf8'
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const total = head.length + meta.size + tail.length;

  return new Promise((resolve, reject) => {
    const url = new URL(NAS_ORIGIN + '/life/v1/file/upload');
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method: 'POST',
      headers: {
        Cookie: `authorization_code=${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': total
      }
    }, res => collectNasResponse(req, res, resolve, reject));
    req.on('error', reject);
    req.write(head);
    const rs = fs.createReadStream(filePath);
    rs.on('error', err => { req.destroy(err); reject(err); });
    rs.on('end', () => req.end(tail));
    rs.pipe(req, { end: false });
  });
}

function jsonError(res, status, message, extra) {
  return res.status(status).json(Object.assign({ result: false, error: message }, extra || {}));
}

fs.mkdirSync(STAGING_ROOT, { recursive: true });
uploadStore.cleanOld(STAGING_ROOT);
const cleanTimer = setInterval(() => uploadStore.cleanOld(STAGING_ROOT), 60 * 60 * 1000);
if (cleanTimer.unref) cleanTimer.unref();

// Public: the login screen probes this to detect a dead proxy.
// GET and HEAD are both handled by Express.
app.get('/upload/space', (req, res) => {
  const free = uploadStore.freeBytes(STAGING_ROOT);
  res.json({
    result: true,
    free: free == null ? 0 : free,
    staging: uploadStore.stagingBytes(STAGING_ROOT),
    maxStaging: uploadStore.MAX_STAGING
  });
});

app.post('/upload/init', requireToken, express.json({ limit: '64kb' }), (req, res) => {
  let meta;
  try {
    meta = uploadStore.normalizeMeta(req.body || {});
  } catch (e) {
    return jsonError(res, 400, e.message);
  }
  const id = uploadStore.uploadIdFor(meta);
  const existing = uploadStore.readMeta(STAGING_ROOT, id);
  const staging = uploadStore.stagingBytes(STAGING_ROOT) - (existing ? existing.size : 0);
  const free = uploadStore.freeBytes(STAGING_ROOT);

  if (staging + meta.size > uploadStore.MAX_STAGING) {
    return jsonError(res, 507, 'Not enough staging space on the Mac for this batch');
  }
  if (free != null && meta.size > free - 64 * 1024 * 1024) {
    return jsonError(res, 507, 'Not enough free space on the Mac for this file');
  }

  try {
    uploadStore.writeMeta(STAGING_ROOT, id, meta);
  } catch (e) {
    return jsonError(res, 500, 'Could not create the staging folder');
  }
  const received = uploadStore.receivedChunks(STAGING_ROOT, id, meta);
  const receivedBytes = received.reduce((sum, i) => sum + uploadStore.expectedLength(meta, i), 0);
  res.json({
    result: true,
    uploadId: id,
    chunkSize: meta.chunkSize,
    totalChunks: meta.totalChunks,
    received,
    receivedBytes
  });
});

app.put('/upload/chunk', requireToken, express.raw({ type: () => true, limit: uploadStore.MAX_CHUNK + 1024 * 1024 }), (req, res) => {
  const id = String(req.query.id || '');
  if (!/^[a-f0-9]{32}$/.test(id)) return jsonError(res, 400, 'Bad upload id');
  const index = Number(req.query.index);
  const meta = uploadStore.readMeta(STAGING_ROOT, id);
  if (!meta) return jsonError(res, 404, 'Upload not found. Start it again.');
  const want = uploadStore.expectedLength(meta, index);
  if (want < 0) return jsonError(res, 400, 'Bad chunk index');
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length !== want) {
    return jsonError(res, 400, `Chunk ${index} has the wrong size`);
  }
  const dir = uploadStore.uploadDir(STAGING_ROOT, id);
  const part = path.join(dir, `${index}.part`);
  const tmp = path.join(dir, `${index}.part.tmp`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, part);
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch (_) { /* ignore */ }
    return jsonError(res, 500, 'Could not save the chunk');
  }
  res.json({ result: true, received: index });
});

app.post('/upload/finalize', requireToken, express.json({ limit: '64kb' }), async (req, res) => {
  const uploadId = String((req.body || {}).uploadId || '');
  const name = String((req.body || {}).name || '');
  if (!/^[a-f0-9]{32}$/.test(uploadId)) return jsonError(res, 400, 'Bad upload id');
  const nameError = uploadStore.validateName(name);
  if (nameError) return jsonError(res, 400, nameError);

  const meta = uploadStore.readMeta(STAGING_ROOT, uploadId);
  if (!meta) return jsonError(res, 404, 'Upload not found. Start it again.');
  const dir = nasDirFor(meta);

  try {
    const taken = await findNasItem(req.nasToken, dir, name);
    if (taken) return jsonError(res, 409, 'A file with this name already exists');

    let assembled;
    try {
      assembled = await uploadStore.assemble(STAGING_ROOT, uploadId, meta);
    } catch (e) {
      if (e.missing) return jsonError(res, 400, 'Missing chunks', { missing: e.missing });
      throw e;
    }

    const up = await nasUpload(req.nasToken, meta, name, assembled.path, dir);
    if (up.status === 401) return jsonError(res, 401, 'Session expired');
    if (up.status < 200 || up.status >= 300 || up.data.result === false) {
      return jsonError(res, 502, up.data.error || `NAS refused the upload (HTTP ${up.status})`);
    }

    // The NAS listing can lag slightly. The client retries /upload/verify.
    // Keep the staged meta until the retry so it knows the relative folder.
    let verified = false;
    try {
      const landed = await findNasItem(req.nasToken, dir, name);
      verified = !!landed && Number(landed.size) === meta.size;
    } catch (e) { /* the client retries */ }

    if (verified) uploadStore.remove(STAGING_ROOT, uploadId);
    res.json({ result: true, sha256: assembled.sha256, size: meta.size, verified });
  } catch (e) {
    if (e.status === 401) return jsonError(res, 401, 'Session expired');
    jsonError(res, 500, e.message || 'Could not finish the upload');
  }
});

app.post('/upload/verify', requireToken, express.json({ limit: '64kb' }), async (req, res) => {
  const body = req.body || {};
  const targetError = uploadStore.validateTargetPath(body.targetPath);
  if (targetError) return jsonError(res, 400, targetError);
  const nameError = uploadStore.validateName(String(body.name || ''));
  if (nameError) return jsonError(res, 400, nameError);
  const size = Number(body.size);
  if (!Number.isInteger(size) || size < 0) return jsonError(res, 400, 'Bad size');

  // finalize kept the staged meta for this retry, so the relative folder is known.
  const uploadId = String(body.uploadId || '');
  const meta = /^[a-f0-9]{32}$/.test(uploadId) ? uploadStore.readMeta(STAGING_ROOT, uploadId) : null;
  const dir = meta ? nasDirFor(meta) : body.targetPath;

  try {
    const landed = await findNasItem(req.nasToken, dir, body.name);
    const verified = !!landed && Number(landed.size) === size;
    if (verified && meta) uploadStore.remove(STAGING_ROOT, uploadId);
    res.json({ result: true, verified });
  } catch (e) {
    if (e.status === 401) return jsonError(res, 401, 'Session expired');
    // A listing error is not proof of failure. The client retries.
    res.json({ result: true, verified: false });
  }
});

app.delete('/upload/:id', requireToken, (req, res) => {
  const id = String(req.params.id || '');
  if (/^[a-f0-9]{32}$/.test(id)) uploadStore.remove(STAGING_ROOT, id);
  res.json({ result: true });
});

// Serve the UI itself to the LAN. Exact-path allowlist only — PRD.md, NAS-API.md,
// package.json and everything else are never served. Paths not listed here proxy to the NAS.
const PUBLIC_FILES = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/app.js': 'app.js',
  '/tailwind.css': 'tailwind.css',
  // PWA: manifest and icons so the home-screen icon opens the app fullscreen.
  '/manifest.json': 'manifest.json',
  '/icon-32.png': 'icon-32.png',
  '/icon-180.png': 'icon-180.png',
  '/icon-192.png': 'icon-192.png',
  '/icon-512.png': 'icon-512.png'
};
app.get(Object.keys(PUBLIC_FILES), (req, res) => {
  res.sendFile(path.join(__dirname, PUBLIC_FILES[req.path]));
});

// File listing and download API (same NAS, different path prefix).
const ROUTES = [
  { path: '/life', target: 'http://192.168.68.53/life' },
  { path: '/', target: 'http://192.168.68.53/api' }
];

for (const { path, target } of ROUTES) {
  app.use(path, createProxyMiddleware({
    target,
    changeOrigin: true,
    // http-proxy-middleware v4 reads hooks from the "on" object.
    on: { proxyReq: bearerToCookie }
  }));
}

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`Proxy running on http://localhost:${PORT} -> ${NAS_ORIGIN}`);
  console.log(`Upload staging: ${STAGING_ROOT}`);
});

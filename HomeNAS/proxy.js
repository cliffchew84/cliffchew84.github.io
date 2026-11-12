const { createProxyMiddleware } = require('http-proxy-middleware');
const express = require('express');
const fs = require('fs');
const path = require('path');

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

app.get('/health/history', (req, res) => {
  let samples = [];
  try {
    const lines = fs.readFileSync(HISTORY_FILE, 'utf8').split('\n').filter(Boolean).slice(-400);
    for (const line of lines) {
      try { samples.push(JSON.parse(line)); } catch (e) { /* skip a bad line */ }
    }
  } catch (e) { /* no history yet */ }
  res.json({ result: true, samples });
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
  let seenDates = new Set();
  try {
    const lines = fs.readFileSync(HISTORY_FILE, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try { seenDates.add(String(JSON.parse(line).date || '')); } catch (e) { /* skip a bad line */ }
    }
  } catch (e) { /* no history yet */ }
  if (seenDates.has(date)) return res.json({ result: true, skipped: 'duplicate' });

  const entry = { ts: now.toISOString(), date, disks: body.disks.slice(0, 16) };
  try {
    fs.appendFileSync(HISTORY_FILE, JSON.stringify(entry) + '\n');
  } catch (e) {
    return res.status(500).json({ result: false, error: 'Write failed' });
  }
  res.json({ result: true });
});

// Serve the UI itself to the LAN. Exact-path allowlist only — PRD.md, NAS-API.md,
// package.json and everything else are never served. Paths not listed here proxy to the NAS.
const PUBLIC_FILES = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/app.js': 'app.js',
  '/tailwind.css': 'tailwind.css'
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

app.listen(3001, () => {
  console.log('Proxy running on http://localhost:3001 -> http://192.168.68.53');
});

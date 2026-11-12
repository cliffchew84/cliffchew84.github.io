const { createProxyMiddleware } = require('http-proxy-middleware');
const express = require('express');
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
    const token = auth.slice(7);
    proxyReq.setHeader('Cookie', `authorization_code=${token}`);
  }
};

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

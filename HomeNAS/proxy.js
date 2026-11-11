const { createProxyMiddleware } = require('http-proxy-middleware');
const express = require('express');

const app = express();

// Allow the static UI served on another origin (e.g. localhost:5173) to call this proxy.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// File listing and download API (same NAS, different path prefix).
app.use('/life', createProxyMiddleware({
  target: 'http://192.168.68.53/life',
  changeOrigin: true,
  // http-proxy-middleware v4 reads hooks from the "on" object.
  on: {
    proxyReq: (proxyReq, req, res) => {
      const auth = req.headers.authorization;
      if (auth && auth.startsWith('Bearer ')) {
        const token = auth.slice(7);
        proxyReq.setHeader('Cookie', `authorization_code=${token}`);
      }
    }
  }
}));

app.use('/', createProxyMiddleware({
  target: 'http://192.168.68.53/api',
  changeOrigin: true,
  logLevel: 'debug',
  // http-proxy-middleware v4 reads hooks from the "on" object.
  on: {
    proxyReq: (proxyReq, req, res) => {
      const auth = req.headers.authorization;
      if (auth && auth.startsWith('Bearer ')) {
        const token = auth.slice(7);
        proxyReq.setHeader('Cookie', `authorization_code=${token}`);
      }
    }
  }
}));

app.listen(3001, () => {
  console.log('Proxy running on http://localhost:3001 -> http://192.168.68.53/api');
});
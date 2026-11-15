// Chunk store for resumable uploads. Lives on the Mac that runs proxy.js.
// The NAS has no chunk API, so chunks are staged here, assembled once, then
// sent to the NAS as one normal multipart upload.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CHUNK_SIZE = 5 * 1024 * 1024;
const MIN_CHUNK = 1024 * 1024;
const MAX_CHUNK = 8 * 1024 * 1024;
const MAX_FILE = 50 * 1024 * 1024 * 1024; // 50 GB
const MAX_STAGING = 60 * 1024 * 1024 * 1024; // 60 GB
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function controlChars(s) {
  return /[\u0000-\u001f\u007f]/.test(s);
}

function validateTargetPath(p) {
  if (typeof p !== 'string' || !p.startsWith('/')) return 'Target path must start with /';
  if (p.length > 1024) return 'Target path is too long';
  if (p.includes('\\') || controlChars(p)) return 'Target path has invalid characters';
  if (p.split('/').some(seg => seg === '..')) return 'Target path may not contain ..';
  return null;
}

function validateRelPath(p) {
  if (typeof p !== 'string' || !p) return 'Relative path is missing';
  if (p.startsWith('/') || p.includes('\\') || controlChars(p)) return 'Relative path has invalid characters';
  if (p.length > 1024) return 'Relative path is too long';
  const parts = p.split('/');
  for (const seg of parts) {
    if (!seg || seg === '.' || seg === '..') return 'Relative path has an invalid segment';
    if (seg.length > 255) return 'A file or folder name is too long';
  }
  return null;
}

function validateName(name) {
  if (typeof name !== 'string' || !name) return 'File name is missing';
  if (name === '.' || name === '..') return 'Invalid file name';
  if (name.includes('/') || name.includes('\\') || controlChars(name)) return 'File name has invalid characters';
  if (name.length > 255) return 'File name is too long';
  return null;
}

function normalizeMeta(input) {
  const size = Number(input.size);
  const mtime = String(input.mtime || '');
  const chunkSize = Math.min(MAX_CHUNK, Math.max(MIN_CHUNK, Number(input.chunkSize) || CHUNK_SIZE));
  if (!Number.isInteger(size) || size < 0) throw new Error('Invalid file size');
  if (size > MAX_FILE) throw new Error('File is larger than 50 GB');
  if (!mtime || Number.isNaN(Date.parse(mtime))) throw new Error('Invalid modification time');
  const targetError = validateTargetPath(input.targetPath);
  if (targetError) throw new Error(targetError);
  const relError = validateRelPath(input.relPath);
  if (relError) throw new Error(relError);
  return {
    targetPath: input.targetPath,
    relPath: input.relPath,
    size,
    mtime: new Date(mtime).toISOString(),
    chunkSize,
    totalChunks: size === 0 ? 0 : Math.ceil(size / chunkSize)
  };
}

// Deterministic: the same target, path, size and mtime reuse the same chunks.
// shortcut: a content change with identical size and mtime reuses old chunks.
function uploadIdFor(meta) {
  return crypto.createHash('sha256')
    .update([meta.targetPath, meta.relPath, meta.size, meta.mtime, meta.chunkSize].join('\n'))
    .digest('hex')
    .slice(0, 32);
}

function expectedLength(meta, index) {
  if (index < 0 || index >= meta.totalChunks) return -1;
  return Math.min(meta.chunkSize, meta.size - index * meta.chunkSize);
}

function uploadDir(root, id) {
  return path.join(root, id);
}

function metaPath(root, id) {
  return path.join(uploadDir(root, id), 'meta.json');
}

function readMeta(root, id) {
  try {
    const raw = fs.readFileSync(metaPath(root, id), 'utf8');
    const meta = JSON.parse(raw);
    meta.totalChunks = meta.size === 0 ? 0 : Math.ceil(meta.size / meta.chunkSize);
    return meta;
  } catch (e) {
    return null;
  }
}

function writeMeta(root, id, meta) {
  const dir = uploadDir(root, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(metaPath(root, id), JSON.stringify(meta));
}

function receivedChunks(root, id, meta) {
  const dir = uploadDir(root, id);
  const received = [];
  let names = [];
  try { names = fs.readdirSync(dir); } catch (e) { return received; }
  for (const name of names) {
    const m = /^(\d+)\.part$/.exec(name);
    if (!m) continue;
    const index = Number(m[1]);
    const want = expectedLength(meta, index);
    if (want < 0) continue;
    let stat;
    try { stat = fs.statSync(path.join(dir, name)); } catch (e) { continue; }
    if (stat.size === want) received.push(index);
  }
  received.sort((a, b) => a - b);
  return received;
}

function receivedBytes(root, id, meta) {
  return receivedChunks(root, id, meta).reduce((sum, i) => sum + expectedLength(meta, i), 0);
}

function stagingBytes(root) {
  let total = 0;
  let names = [];
  try { names = fs.readdirSync(root); } catch (e) { return 0; }
  for (const name of names) {
    const meta = readMeta(root, name);
    if (!meta) continue;
    total += meta.size;
  }
  return total;
}

function freeBytes(dir) {
  try {
    const s = fs.statfsSync(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch (e) {
    return null;
  }
}

function cleanOld(root, now = Date.now()) {
  let names = [];
  try { names = fs.readdirSync(root); } catch (e) { return; }
  for (const name of names) {
    const dir = path.join(root, name);
    let stat;
    try { stat = fs.statSync(dir); } catch (e) { continue; }
    if (!stat.isDirectory()) continue;
    if (now - stat.mtimeMs > MAX_AGE_MS) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
  }
}

// Concatenate the chunks in order and hash in the same pass.
// Returns { path, sha256, size }. The assembled file is reused on retry.
async function assemble(root, id, meta) {
  const dir = uploadDir(root, id);
  const assembled = path.join(dir, 'assembled.bin');

  if (fs.existsSync(assembled) && fs.statSync(assembled).size === meta.size) {
    const hash = crypto.createHash('sha256');
    await new Promise((resolve, reject) => {
      const rs = fs.createReadStream(assembled);
      rs.on('data', chunk => hash.update(chunk));
      rs.on('error', reject);
      rs.on('end', resolve);
    });
    return { path: assembled, sha256: hash.digest('hex'), size: meta.size };
  }

  const missing = [];
  for (let i = 0; i < meta.totalChunks; i++) {
    const part = path.join(dir, `${i}.part`);
    let stat = null;
    try { stat = fs.statSync(part); } catch (e) { /* missing */ }
    if (!stat || stat.size !== expectedLength(meta, i)) missing.push(i);
  }
  if (missing.length) {
    const err = new Error('Missing chunks');
    err.missing = missing;
    throw err;
  }

  const tmp = path.join(dir, 'assembled.tmp');
  const out = fs.createWriteStream(tmp);
  const outDone = new Promise((resolve, reject) => {
    out.on('error', reject);
    out.on('finish', resolve);
  });
  const hash = crypto.createHash('sha256');
  try {
    for (let i = 0; i < meta.totalChunks; i++) {
      const rs = fs.createReadStream(path.join(dir, `${i}.part`));
      for await (const chunk of rs) {
        hash.update(chunk);
        if (!out.write(chunk)) await new Promise(resolve => out.once('drain', resolve));
      }
    }
    out.end();
    await outDone;
    if (fs.statSync(tmp).size !== meta.size) throw new Error('Assembled size does not match');
    fs.renameSync(tmp, assembled);
  } catch (e) {
    try { out.destroy(); } catch (_) { /* ignore */ }
    try { fs.rmSync(tmp, { force: true }); } catch (_) { /* ignore */ }
    throw e;
  }
  return { path: assembled, sha256: hash.digest('hex'), size: meta.size };
}

function remove(root, id) {
  try { fs.rmSync(uploadDir(root, id), { recursive: true, force: true }); } catch (e) { /* ignore */ }
}

module.exports = {
  CHUNK_SIZE,
  MAX_CHUNK,
  MAX_FILE,
  MAX_STAGING,
  validateTargetPath,
  validateRelPath,
  validateName,
  normalizeMeta,
  uploadIdFor,
  expectedLength,
  uploadDir,
  metaPath,
  readMeta,
  writeMeta,
  receivedChunks,
  receivedBytes,
  stagingBytes,
  freeBytes,
  cleanOld,
  assemble,
  remove
};

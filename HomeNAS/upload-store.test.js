const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const store = require('./upload-store');

test('rejects path traversal and bad names', () => {
  assert.ok(store.validateRelPath('../etc/passwd'));
  assert.ok(store.validateRelPath('a/../b'));
  assert.ok(store.validateRelPath('/abs'));
  assert.ok(store.validateRelPath('a\\b'));
  assert.equal(store.validateRelPath('2026-11-14 Family Dinner/IMG_0001.jpg'), null);
  assert.ok(store.validateName('../x'));
  assert.ok(store.validateName('a/b'));
  assert.equal(store.validateName('IMG_0001 (1).jpg'), null);
  assert.ok(store.validateTargetPath('/home/../SharedFolder'));
  assert.equal(store.validateTargetPath('/home/Event'), null);
});

test('upload ID is stable for the same metadata', () => {
  const mb = 1024 * 1024;
  const a = store.normalizeMeta({ targetPath: '/home/Event', relPath: 'IMG_0001.jpg', size: 2 * mb, mtime: '2026-11-14T10:00:00Z', chunkSize: mb });
  const b = store.normalizeMeta({ targetPath: '/home/Event', relPath: 'IMG_0001.jpg', size: 2 * mb, mtime: '2026-11-14T10:00:00.000Z', chunkSize: mb });
  assert.equal(store.uploadIdFor(a), store.uploadIdFor(b));
  assert.equal(a.totalChunks, 2);
  assert.equal(store.expectedLength(a, 0), mb);
  assert.equal(store.expectedLength(a, 1), mb);
  assert.equal(store.expectedLength(a, 2), -1);
});

test('assembles chunks in order and hashes them', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'homenas-upload-'));
  const meta = store.normalizeMeta({ targetPath: '/home/Event', relPath: 'a.bin', size: 5, mtime: '2026-11-14T10:00:00Z', chunkSize: 1024 * 1024 });
  meta.chunkSize = 2;
  meta.totalChunks = 3;
  const id = store.uploadIdFor(meta);
  store.writeMeta(root, id, meta);
  const dir = store.uploadDir(root, id);
  fs.writeFileSync(path.join(dir, '0.part'), Buffer.from('ab'));
  fs.writeFileSync(path.join(dir, '1.part'), Buffer.from('cd'));
  fs.writeFileSync(path.join(dir, '2.part'), Buffer.from('e'));

  assert.deepEqual(store.receivedChunks(root, id, meta), [0, 1, 2]);
  const assembled = await store.assemble(root, id, meta);
  assert.equal(fs.readFileSync(assembled.path, 'utf8'), 'abcde');
  assert.equal(assembled.sha256, crypto.createHash('sha256').update('abcde').digest('hex'));

  await store.assemble(root, id, meta);
  store.remove(root, id);
  assert.equal(fs.existsSync(dir), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('reports missing chunks instead of assembling', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'homenas-upload-'));
  const meta = store.normalizeMeta({ targetPath: '/home/Event', relPath: 'a.bin', size: 3, mtime: '2026-11-14T10:00:00Z' });
  meta.chunkSize = 1;
  meta.totalChunks = 3;
  const id = store.uploadIdFor(meta);
  store.writeMeta(root, id, meta);
  fs.writeFileSync(path.join(store.uploadDir(root, id), '0.part'), Buffer.from('a'));
  await assert.rejects(() => store.assemble(root, id, meta), err => Array.isArray(err.missing) && err.missing.join(',') === '1,2');
  fs.rmSync(root, { recursive: true, force: true });
});

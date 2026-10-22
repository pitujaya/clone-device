/*
 * File API untuk node server (dipakai mock target).
 * Path dicurigai: kalau ROOT diset, semua akses dijaga di dalam ROOT.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require('../web-client/protocol.js');

const ROOT = process.env.ROOT ? path.resolve(process.env.ROOT) : null;

/** Root dibaca lazy supaya bisa diubah setelah module ini di-load. */
function rootDir() {
  const r = process.env.ROOT;
  return r ? path.resolve(r) : null;
}

const MIME = {
  '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json',
  '.html': 'text/html', '.htm': 'text/html', '.css': 'text/css',
  '.js': 'text/javascript', '.csv': 'text/csv', '.xml': 'text/xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf', '.zip': 'application/zip',
  '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.apk': 'application/vnd.android.package-archive'
};

function mimeOf(p) {
  return MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
}

/** Ubah path kiriman client jadi path absolut yang sah (dalam ROOT kalau ada). */
function resolveSafe(input) {
  let p = String(input || '/').trim();
  const ROOT = rootDir();
  if (ROOT) {
    p = p.replace(/^\/+/, '');
    const abs = path.resolve(ROOT, p);
    const rel = path.relative(ROOT, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Path di luar root');
    return abs;
  }
  if (!path.isAbsolute(p)) p = path.resolve(p);
  return path.normalize(p);
}

function listDir(input) {
  const abs = resolveSafe(input);
  const st = fs.statSync(abs);
  if (!st.isDirectory()) throw new Error('Bukan direktori: ' + abs);
  const items = fs.readdirSync(abs, { withFileTypes: true });
  const list = [];
  for (const it of items) {
    if (it.name.startsWith('.')) continue;
    const full = path.join(abs, it.name);
    let size = 0, mtime = 0, dir = it.isDirectory();
    try {
      const s = fs.statSync(full);
      size = s.size; mtime = s.mtimeMs; dir = s.isDirectory();
    } catch (_) { /* vanished */ }
    list.push({ name: it.name, path: full, dir, size, mtime });
  }
  list.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
  return { path: abs, list };
}

function readFile(input) {
  const abs = resolveSafe(input);
  const st = fs.statSync(abs);
  if (st.size > P.MAX_TRANSFER_BYTES) {
    throw new Error('File terlalu besar (' + Math.round(st.size / 1048576) + ' MB, maks ' +
      Math.round(P.MAX_TRANSFER_BYTES / 1048576) + ' MB)');
  }
  const data = fs.readFileSync(abs);
  return { path: abs, name: path.basename(abs), mime: mimeOf(abs), data: data.toString('base64') };
}

function writeFile(dir, name, b64) {
  const dirAbs = resolveSafe(dir);
  const safeName = path.basename(String(name || 'upload.bin'));
  const target = path.join(dirAbs, safeName);
  const buf = Buffer.from(String(b64 || ''), 'base64');
  if (buf.length > P.MAX_TRANSFER_BYTES) throw new Error('File terlalu besar');
  fs.writeFileSync(target, buf);
  return { path: target, size: buf.length };
}

function removePath(input) {
  const abs = resolveSafe(input);
  const st = fs.statSync(abs);
  if (st.isDirectory()) fs.rmSync(abs, { recursive: true, force: true });
  else fs.unlinkSync(abs);
  return { path: abs };
}

module.exports = { resolveSafe, listDir, readFile, writeFile, removePath, mimeOf, rootDir };

/*
 * Tes otomatis protokol Clone Device.
 * Jalankan: node --test test/
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { WebSocket } = require('ws');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8123 + (process.pid % 200);
const URL = 'ws://127.0.0.1:' + PORT + '/ws';

let serverProc = null;
let tmpRoot = null;

function waitFor(fn, timeout = 8000, label = 'timeout') {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      let v;
      try { v = fn(); } catch (_) { v = null; }
      if (v) return resolve(v);
      if (Date.now() - started > timeout) return reject(new Error('timeout: ' + label));
      setTimeout(tick, 50);
    };
    tick();
  });
}

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const inbox = [];
    const waiters = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      inbox.push(msg);
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].match(msg)) {
          waiters[i].resolve(msg);
          waiters.splice(i, 1);
        }
      }
    });
    ws.on('error', reject);
    ws.on('open', () => resolve({
      ws,
      inbox,
      send: (o) => ws.send(JSON.stringify(o)),
      wait: (match, ms = 6000) => new Promise((res, rej) => {
        const found = inbox.find(match);
        if (found) return res(found);
        const w = { match, resolve: res };
        waiters.push(w);
        setTimeout(() => {
          const i = waiters.indexOf(w);
          if (i >= 0) { waiters.splice(i, 1); rej(new Error('timeout menunggu pesan')); }
        }, ms);
      }),
      close: () => ws.close()
    }));
  });
}

test.before(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clone-test-'));
  fs.writeFileSync(path.join(tmpRoot, 'hello.txt'), 'halo dunia');
  fs.mkdirSync(path.join(tmpRoot, 'sub'));
  fs.writeFileSync(path.join(tmpRoot, 'sub', 'a.bin'), Buffer.from([1, 2, 3, 4]));

  serverProc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js'),
    '--port=' + PORT, '--root=' + tmpRoot, '--fps=10'], { stdio: 'ignore' });

  await waitForHttp(PORT, 8000);
});

function waitForHttp(port, timeout) {
  const http = require('node:http');
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/shared/protocol.js', timeout: 1000 }, (res) => {
        res.resume();
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - started > timeout) reject(new Error('timeout: server start'));
        else setTimeout(tick, 150);
      });
      req.on('timeout', () => req.destroy());
    };
    tick();
  });
}
test.after(() => {
  if (serverProc) serverProc.kill();
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test('hello berisi info device & layar', async () => {
  const c = await connect();
  c.send({ t: 'hello', client: 'test', w: 800, h: 600 });
  const hello = await c.wait((m) => m.t === 'hello');
  assert.ok(hello.screen && hello.screen.w > 0, 'harus ada ukuran layar');
  assert.ok(hello.device && hello.device.name, 'harus ada info device');
  c.close();
});

test('server push frame PNG yang valid', async () => {
  const c = await connect();
  const frame = await c.wait((m) => m.t === 'frame', 6000);
  assert.strictEqual(frame.mime, 'image/png');
  assert.strictEqual(typeof frame.data, 'string');
  const buf = Buffer.from(frame.data, 'base64');
  assert.deepStrictEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(buf.length > 1000, 'gambar harus punya isi');
  c.close();
});

test('file browser: list, get, put, delete', async () => {
  const c = await connect();
  c.send({ t: 'files', path: '/' });
  const list = await c.wait((m) => m.t === 'files');
  assert.strictEqual(list.error, undefined);
  const names = list.list.map((f) => f.name);
  assert.ok(names.includes('hello.txt'), 'harus ada hello.txt, dapat: ' + names.join(','));
  assert.ok(names.includes('sub'), 'harus ada folder sub');

  c.send({ t: 'file.get', path: '/hello.txt' });
  const f = await c.wait((m) => m.t === 'file');
  assert.strictEqual(Buffer.from(f.data, 'base64').toString(), 'halo dunia');

  c.send({ t: 'file.put', path: '/', name: 'baru.txt', data: Buffer.from('isi baru').toString('base64') });
  const okPut = await c.wait((m) => m.t === 'ok' && m.action === 'file.put');
  assert.ok(okPut.path.endsWith('baru.txt'));

  c.send({ t: 'file.del', path: '/baru.txt' });
  await c.wait((m) => m.t === 'ok' && m.action === 'file.del');

  c.send({ t: 'files', path: '/' });
  const list2 = await c.wait((m) => m.t === 'files' && !m.list.some((f) => f.name === 'baru.txt'));
  assert.ok(!list2.list.some((f) => f.name === 'baru.txt'), 'file harus terhapus');
  c.close();
});

test('path di luar root ditolak', async () => {
  const c = await connect();
  c.send({ t: 'files', path: '/../../etc' });
  const err = await c.wait((m) => m.t === 'error');
  assert.ok(err.msg, 'harus ada pesan error');
  c.close();
});

test('ping dibalas pong', async () => {
  const c = await connect();
  c.send({ t: 'ping' });
  const pong = await c.wait((m) => m.t === 'pong');
  assert.ok(pong);
  c.close();
});

test('tap memicu perubahan layar (event berubah)', async () => {
  const c = await connect();
  const f1 = await c.wait((m) => m.t === 'frame');
  await new Promise((r) => setTimeout(r, 200));
  c.send({ t: 'tap', x: 240, y: 700 });
  await new Promise((r) => setTimeout(r, 400));
  const f2 = await c.wait((m) => m.t === 'frame' && m.seq > f1.seq);
  assert.ok(f2.seq > f1.seq, 'frame harus maju');
  assert.notStrictEqual(f2.data, f1.data, 'gambar harus berubah setelah tap');
  c.close();
});

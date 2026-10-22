/*
 * Tes web-client tanpa browser: jalankan app.js di dalam DOM tiruan (shim),
 * lalu verifikasi kabel, frame, tap, dan file browser.
 *
 * Jalankan: node --test "test/*.test.js"
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const vm = require('node:vm');
const http = require('node:http');
const { WebSocket } = require('ws');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8400 + (process.pid % 150);
const BASE = 'http://127.0.0.1:' + PORT;

let serverProc = null;
let tmpRoot = null;

/* ------------------------- DOM tiruan ------------------------- */
class El {
  constructor(tag, id) {
    this.tagName = (tag || 'div').toUpperCase();
    this.id = id || '';
    this.children = [];
    this.attrs = {};
    this.listeners = {};
    this._text = '';
    this.value = '';
    this.checked = false;
    this.files = null;
    this.style = {};
    this.classes = new Set();
    const self = this;
    this.classList = {
      add: (...c) => c.forEach((x) => self.classes.add(x)),
      remove: (...c) => c.forEach((x) => self.classes.delete(x)),
      contains: (c) => self.classes.has(c),
      toggle: (c, on) => {
        const want = on === undefined ? !self.classes.has(c) : !!on;
        if (want) self.classes.add(c); else self.classes.delete(c);
        return want;
      }
    };
  }
  get className() { return [...this.classes].join(' '); }
  set className(v) {
    this.classes = new Set(String(v).split(/\s+/).filter(Boolean));
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  appendChild(c) { this.children.push(c); return c; }
  remove() {}
  set innerHTML(v) { if (!v) this.children = []; }
  get innerHTML() { return ''; }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }
  removeEventListener() {}
  dispatch(type, ev) {
    (this.listeners[type] || []).forEach((fn) => fn(Object.assign({ preventDefault() { }, stopPropagation() { }, pointerId: 1 }, ev)));
  }
  click() { this.dispatch('click', {}); }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 200, right: 100, bottom: 200 };
  }
}

function buildDOM(html) {
  const ids = new Map();
  const byId = (id) => {
    if (!ids.has(id)) ids.set(id, new El('div', id));
    return ids.get(id);
  };
  const keyBtns = [];
  for (const m of html.matchAll(/data-key="([^"]+)"/g)) {
    const el = new El('button');
    el.setAttribute('data-key', m[1]);
    keyBtns.push(el);
  }
  const tabs = [];
  for (const m of html.matchAll(/data-tab="([^"]+)"/g)) {
    const el = new El('button');
    el.setAttribute('data-tab', m[1]);
    tabs.push(el);
  }
  const panes = [];
  for (const m of html.matchAll(/id="pane-([^"]+)"/g)) panes.push(byId('pane-' + m[1]));

  const document = {
    body: new El('body'),
    getElementById: (id) => (ids.has(id) ? ids.get(id) : byId(id)),
    querySelectorAll: (sel) => {
      if (sel === '[data-key]') return keyBtns;
      if (sel === '.tab') return tabs;
      if (sel === '.pane') return panes;
      return [];
    },
    createElement: (t) => new El(t)
  };
  return { document, byId, keyBtns };
}

function makeEnv(port) {
  const store = {};
  return {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    location: { hostname: '127.0.0.1', port: String(port), protocol: 'http:' },
    Blob: class { constructor(parts, opt) { this.parts = parts; this.type = (opt || {}).type; } },
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => { } },
    atob: (b64) => Buffer.from(b64, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    confirm: () => true,
    console
  };
}

function waitFor(fn, timeout = 10000, label = 'timeout') {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      let v;
      try { v = fn(); } catch (_) { v = null; }
      if (v) return resolve(v);
      if (Date.now() - t0 > timeout) return reject(new Error('timeout: ' + label));
      setTimeout(tick, 40);
    };
    tick();
  });
}

function httpJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function bootClient(port) {
  const html = fs.readFileSync(path.join(ROOT, 'web-client', 'index.html'), 'utf8');
  const { document, byId, keyBtns } = buildDOM(html);
  const env = makeEnv(port);
  const ctx = vm.createContext(Object.assign(env, {
    document,
    WebSocket,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Object, Array, String, Number, Boolean, Buffer,
    Promise, Error, isNaN, parseInt, parseFloat, Uint8Array
  }));
  ctx.window = ctx;
  ctx.self = ctx;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'web-client', 'protocol.js'), 'utf8'), ctx, { filename: 'protocol.js' });
  const code = fs.readFileSync(path.join(ROOT, 'web-client', 'app.js'), 'utf8');
  vm.runInContext(code, ctx, { filename: 'app.js' });
  const client = { document, byId, keyBtns, ctx };
  openClients.push(client);
  return client;
}

const openClients = [];

function closeClient(c) {
  try {
    const st = c.ctx.__clone.state;
    st.settings.auto = false;
    clearTimeout(st.reconnectTimer);
    clearInterval(st.pingTimer);
    if (st.ws) st.ws.close();
  } catch (e) { /* ignore */ }
}

/* ------------------------- tes ------------------------- */
test.before(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clone-web-'));
  fs.writeFileSync(path.join(tmpRoot, 'catatan.txt'), 'isi catatan');
  serverProc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js'),
    '--port=' + PORT, '--root=' + tmpRoot, '--fps=10'], { stdio: 'ignore' });
  await waitForHttp(PORT, 8000);
});

function waitForHttp(port, timeout) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/web-client/index.html', timeout: 1000 }, (res) => {
        res.resume();
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - t0 > timeout) reject(new Error('timeout: server start'));
        else setTimeout(tick, 150);
      });
      req.on('timeout', () => req.destroy());
    };
    tick();
  });
}

test.after(() => {
  openClients.forEach(closeClient);
  if (serverProc) serverProc.kill();
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test('web-client tersambung dan menerima frame', async () => {
  const c = await bootClient(PORT);
  await waitFor(() => c.byId('status').classList.contains('online'), 10000, 'konek');
  await waitFor(() => c.byId('frame').src && c.byId('frame').src !== '', 10000, 'frame');
  assert.ok(c.byId('statusText').textContent.includes('Terhubung'));
  const fps = c.byId('fps').textContent;
  assert.ok(/fps/.test(fps), 'indikator fps harus terisi, dapat: ' + fps);
});

test('tap dari web-client terkirim dengan koordinat device', async () => {
  const c = await bootClient(PORT);
  await waitFor(() => c.byId('status').classList.contains('online'), 10000, 'konek');

  const overlay = c.byId('overlay');
  overlay.dispatch('pointerdown', { clientX: 50, clientY: 100, pointerId: 1 });
  overlay.dispatch('pointerup', { clientX: 50, clientY: 100, pointerId: 1 });

  const st = await waitFor(() => {
    const s = httpJSON(BASE + '/debug/state');
    return s.then((v) => (v.lastEvent.startsWith('TAP') ? v : null)).catch(() => null);
  }, 8000, 'tap tercatat');

  /* layar mock 480x854, area gambar 100x200 css px => x = 50/100*480 = 240, y = 100/200*854 = 427 */
  assert.strictEqual(st.lastEvent, 'TAP 240,427');
});

test('tombol navigasi mengirim perintah key', async () => {
  const c = await bootClient(PORT);
  await waitFor(() => c.byId('status').classList.contains('online'), 10000, 'konek');

  const home = c.keyBtns.find((b) => b.getAttribute('data-key') === 'HOME');
  home.click();

  const st = await waitFor(() => {
    const s = httpJSON(BASE + '/debug/state');
    return s.then((v) => (v.lastEvent.startsWith('KEY') ? v : null)).catch(() => null);
  }, 8000, 'key tercatat');
  assert.strictEqual(st.lastEvent, 'KEY HOME');
});

test('file browser web-client listing dari device', async () => {
  const c = await bootClient(PORT);
  await waitFor(() => c.byId('status').classList.contains('online'), 10000, 'konek');
  await waitFor(() => c.byId('fileList').children.length > 0, 10000, 'listing');
  const names = c.byId('fileList').children.map((li) => li.children[1].textContent);
  assert.ok(names.includes('catatan.txt'), 'harus ada catatan.txt, dapat: ' + names.join(','));
  assert.strictEqual(c.byId('crumbs').textContent, tmpRoot);
});

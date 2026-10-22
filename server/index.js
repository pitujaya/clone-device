#!/usr/bin/env node
/*
 * Clone Device - server dev/bridge
 *
 *   node server/index.js                 -> mode MOCK  (device simulasi, buat testing UI)
 *   node server/index.js --target=IP     -> mode PROXY ( relayed ke device Android asli)
 *
 * Env/args:
 *   --port=8080     port HTTP+WS
 *   --root=/path    akar file system untuk file browser (default: cwd)
 *   --fps=8         fps frame di mode mock
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const P = require('../web-client/protocol.js');
const fsapi = require('./fsapi.js');
const { MockDevice } = require('./mock.js');

const args = process.argv.slice(2);
const argOf = (name, def) => {
  const hit = args.find((a) => a.startsWith('--' + name + '='));
  if (hit) return hit.split('=').slice(1).join('=');
  const env = process.env[name.toUpperCase()];
  return env !== undefined && env !== '' ? env : def;
};

const PORT = parseInt(argOf('port', P.DEFAULT_PORT), 10);
const TARGET = argOf('target', '');
const FPS = parseInt(argOf('fps', 8), 10);
const ROOT = argOf('root', process.cwd());
const MODE = TARGET ? 'proxy' : 'mock';

process.env.ROOT = ROOT;

const ROOT_DIR = path.resolve(__dirname, '..');
const STATIC_DIRS = {
  '/': path.join(ROOT_DIR, 'web-client'),
  '/shared': path.join(ROOT_DIR, 'shared')
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

/* ------------------------------ HTTP ------------------------------ */
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  /* endpoint debug (hanya mode mock) --gunanya buat tes &development */
  if (urlPath.startsWith('/debug/')) {
    if (MODE !== 'mock') {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('debug hanya di mode mock');
      return;
    }
    if (urlPath === '/debug/state') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        seq: mock.seq, lastEvent: mock.lastEvent, taps: mock.taps, page: mock.page
      }));
      return;
    }
    if (urlPath === '/debug/frame.png') {
      const png = mock.frame || mock.nextFrame();
      res.writeHead(200, { 'content-type': 'image/png' }).end(png);
      return;
    }
  }

  if (urlPath === '/') urlPath = '/index.html';

  let base = null, rel = urlPath;
  if (urlPath.startsWith('/shared/')) {
    base = STATIC_DIRS['/shared'];
    rel = urlPath.slice('/shared'.length);
  } else {
    base = STATIC_DIRS['/'];
  }

  const file = path.join(base, rel);
  if (!file.startsWith(base)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('404 ' + rel);
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache, no-store, must-revalidate'
    });
    res.end(data);
  });
});

/* ------------------------------ WS ------------------------------ */
const wss = new WebSocketServer({ server, path: '/ws' });

const clients = new Set();
let mock = null;
let upstream = null;
let upstreamTimer = null;

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(obj) {
  const s = JSON.stringify(obj);
  for (const c of clients) if (c.readyState === WebSocket.OPEN) c.send(s);
}

function handleCommand(msg, reply) {
  try {
    switch (msg.t) {
      case P.C2S.HELLO:
        reply(P.ok(P.S2C.HELLO, MODE === 'mock'
          ? mock.info()
          : { device: { name: 'REMOTE', model: 'Android', android: '' }, screen: { w: 720, h: 1280 }, fps: 10 }));
        break;
      case P.C2S.FILES:
        reply(P.ok(P.S2C.FILES, fsapi.listDir(msg.path || '/')));
        break;
      case P.C2S.FILE_GET:
        reply(P.ok(P.S2C.FILE, fsapi.readFile(msg.path)));
        break;
      case P.C2S.FILE_PUT:
        reply(P.ok(P.S2C.OK, { action: 'file.put', ...fsapi.writeFile(msg.path, msg.name, msg.data) }));
        break;
      case P.C2S.FILE_DEL:
        reply(P.ok(P.S2C.OK, { action: 'file.del', ...fsapi.removePath(msg.path) }));
        break;
      case P.C2S.CONTROL:
        reply(P.ok(P.S2C.OK, { action: msg.action, value: msg.value }));
        break;
      case P.C2S.PING:
        reply(P.ok(P.S2C.PONG));
        break;
      default:
        break;
    }
  } catch (e) {
    reply(P.err(e.message || String(e)));
  }
}

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    const msg = P.parse(raw.toString());
    if (!msg) return;
    if (MODE === 'mock') {
      handleCommand(msg, (o) => send(ws, o));
      mock.handle(msg);
    } else {
      if (upstream && upstream.readyState === WebSocket.OPEN) upstream.send(JSON.stringify(msg));
    }
  });

  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));

  if (MODE === 'mock') {
    send(ws, P.ok(P.S2C.HELLO, mock.info()));
  } else {
    send(ws, P.ok(P.S2C.HELLO, { device: { name: 'RELAY', model: 'proxy', android: '' }, screen: { w: 720, h: 1280 } }));
    connectUpstream();
  }
});

/* ------------------------- mode proxy ------------------------- */
function connectUpstream() {
  if (upstream && upstream.readyState === WebSocket.OPEN) return;
  const url = 'ws://' + TARGET + '/ws';
  try {
    upstream = new WebSocket(url);
  } catch (e) {
    console.error('proxy: gagal buat koneksi ->', e.message);
    return;
  }
  upstream.on('open', () => console.log('proxy: tersambung ke', url));
  upstream.on('message', (raw) => broadcast(raw.toString()));
  upstream.on('close', () => {
    console.log('proxy: upstream terputus, coba lagi 3s...');
    upstream = null;
    clearTimeout(upstreamTimer);
    upstreamTimer = setTimeout(connectUpstream, 3000);
  });
  upstream.on('error', (e) => console.error('proxy: error ->', e.message));
}

/* ------------------------- mode mock ------------------------- */
function startMock() {
  mock = new MockDevice();
  mock.fps = FPS;
  const timer = setInterval(() => {
    if (clients.size === 0) return;
    const png = mock.nextFrame();
    broadcast(P.ok(P.S2C.FRAME, {
      data: png.toString('base64'),
      mime: 'image/png',
      seq: mock.seq,
      ts: Date.now()
    }));
  }, Math.max(100, Math.round(1000 / FPS)));
  timer.unref && timer.unref();
}

server.listen(PORT, '0.0.0.0', () => {
  const ips = require('os').networkInterfaces();
  const list = [];
  for (const n in ips) for (const i of ips[n] || []) {
    if (i.family === 'IPv4' && !i.internal) list.push(i.address);
  }
  console.log('Clone Device server (mode: ' + MODE + ')');
  console.log('  http://localhost:' + PORT);
  for (const ip of list) console.log('  http://' + ip + ':' + PORT);
  console.log('  file root: ' + ROOT);
  if (MODE === 'mock') startMock();
});

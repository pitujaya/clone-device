/*
 * Clone Device - Protokol WebSocket bersama
 * Dipakai oleh: server Node (server/index.js) dan web-client (browser).
 * Format: JSON teks dengan field "t" (tipe).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CloneProtocol = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var P = {};

  P.DEFAULT_PORT = 8080;
  P.DEFAULT_FPS = 10;
  P.DEFAULT_QUALITY = 55;
  P.DEFAULT_WIDTH = 720;

  /* ---- Client -> Server ---- */
  P.C2S = {
    HELLO: 'hello',
    TAP: 'tap',
    SWIPE: 'swipe',
    KEY: 'key',
    FILES: 'files',
    FILE_GET: 'file.get',
    FILE_PUT: 'file.put',
    FILE_DEL: 'file.del',
    CONTROL: 'control',
    PING: 'ping'
  };

  /* ---- Server -> Client ---- */
  P.S2C = {
    HELLO: 'hello',
    FRAME: 'frame',
    FILES: 'files',
    FILE: 'file',
    OK: 'ok',
    ERROR: 'error',
    PONG: 'pong'
  };

  /* Tombol navigasi yang didukung device */
  P.KEYS = ['HOME', 'BACK', 'RECENTS', 'NOTIF', 'POWER_MENU', 'ENTER', 'DEL', 'TEXT'];

  /* Ukuran file maksimum untuk transfer lewat WS (base64 ~1.37x) */
  P.MAX_TRANSFER_BYTES = 8 * 1024 * 1024;

  /* Helper: parse pesan, selalu return objek valid atau null */
  P.parse = function (raw) {
    try {
      var o = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!o || typeof o !== 'object' || typeof o.t !== 'string') return null;
      return o;
    } catch (e) {
      return null;
    }
  };

  P.ok = function (t, extra) {
    var m = { t: t };
    if (extra) for (var k in extra) m[k] = extra[k];
    return m;
  };

  P.err = function (msg) {
    return { t: P.S2C.ERROR, msg: String(msg) };
  };

  return P;
});

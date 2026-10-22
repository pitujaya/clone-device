/*
 * Clone Device - web client
 * Menghubung ke WS server (node dev/proxy atau device Android langsung).
 */
(function () {
  'use strict';

  var P = window.CloneProtocol;
  var $ = function (id) { return document.getElementById(id); };

  var el = {
    status: $('status'), statusText: $('statusText'),
    fps: $('fps'), ping: $('ping'),
    frame: $('frame'), overlay: $('overlay'), screen: $('screen'),
    placeholder: $('placeholder'),
    crumbs: $('crumbs'), fileList: $('fileList'), fileHint: $('fileHint'),
    fileInput: $('fileInput'),
    txt: $('txtInput'),
    sheet: $('sheet'), backdrop: $('sheetBackdrop'),
    sheetInfo: $('sheetInfo'),
    toast: $('toast')
  };

  var state = {
    ws: null,
    connected: false,
    hello: null,
    screen: { w: 720, h: 1280 },
    path: '/',
    files: [],
    seq: -1,
    blobUrl: null,
    fpsWin: [],
    pingTimer: null,
    pingSent: 0,
    reconnectTimer: null,
    reconnectDelay: 1000,
    settings: {
      host: '',
      port: 8080,
      auto: true,
      fullQuality: false
    }
  };

  /* ---------------- util ---------------- */
  function toast(msg, ms) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.toast.classList.remove('show'); }, ms || 2200);
  }

  function fmtSize(b) {
    if (b === undefined || b === null) return '';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
    return (b / 1073741824).toFixed(2) + ' GB';
  }

  function loadSettings() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('clone.settings') || 'null'); } catch (e) { saved = null; }
    if (saved && typeof saved === 'object') {
      Object.assign(state.settings, saved);
    } else {
      state.settings.host = location.hostname || '127.0.0.1';
      state.settings.port = (location.port && location.port !== '80' && location.port !== '443')
        ? parseInt(location.port, 10) : P.DEFAULT_PORT;
    }
    $('setHost').value = state.settings.host;
    $('setPort').value = state.settings.port;
    $('setAuto').checked = !!state.settings.auto;
    $('setFullQuality').checked = !!state.settings.fullQuality;
  }

  function saveSettings() {
    state.settings.host = ($('setHost').value || '').trim();
    state.settings.port = parseInt($('setPort').value, 10) || 8080;
    state.settings.auto = $('setAuto').checked;
    state.settings.fullQuality = $('setFullQuality').checked;
    try { localStorage.setItem('clone.settings', JSON.stringify(state.settings)); } catch (e) { /* ignore */ }
  }

  function wsUrl() {
    var h = state.settings.host || '127.0.0.1';
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + h + ':' + state.settings.port + '/ws';
  }

  /* ---------------- koneksi ---------------- */
  function setStatus(mode, text) {
    el.status.className = 'status ' + (mode || '');
    el.statusText.textContent = text;
  }

  function connect() {
    if (state.ws) { try { state.ws.close(); } catch (e) { /* ignore */ } }
    clearInterval(state.pingTimer);
    var url = wsUrl();
    el.sheetInfo.textContent = 'Menghubungkan ke ' + url;
    setStatus('wait', 'Menyambung...');

    var ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      setStatus('', 'Gagal');
      scheduleReconnect();
      return;
    }
    state.ws = ws;

    ws.onopen = function () {
      state.connected = true;
      state.reconnectDelay = 1000;
      setStatus('online', 'Terhubung');
      el.placeholder.classList.add('hide');
      send({ t: P.C2S.HELLO, client: 'web', w: window.innerWidth, h: window.innerHeight });
      startPing();
      loadFiles(state.path);
    };

    ws.onmessage = function (ev) {
      var msg = P.parse(ev.data);
      if (msg) handle(msg);
    };

    ws.onclose = function () {
      state.connected = false;
      clearInterval(state.pingTimer);
      setStatus('', 'Terputus');
      el.placeholder.classList.remove('hide');
      scheduleReconnect();
    };

    ws.onerror = function () {
      setStatus('', 'Gagal konek');
    };
  }

  function scheduleReconnect() {
    if (!state.settings.auto) return;
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = setTimeout(function () {
      state.reconnectDelay = Math.min(state.reconnectDelay * 1.6, 10000);
      connect();
    }, state.reconnectDelay);
  }

  function startPing() {
    clearInterval(state.pingTimer);
    state.pingTimer = setInterval(function () {
      state.pingSent = Date.now();
      send({ t: P.C2S.PING });
    }, 3000);
  }

  function send(obj) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
      toast('Belum tersambung ke device');
      return false;
    }
    state.ws.send(JSON.stringify(obj));
    return true;
  }

  /* ---------------- pesan masuk ---------------- */
  function handle(msg) {
    switch (msg.t) {
      case P.S2C.HELLO:
        state.hello = msg;
        if (msg.screen && msg.screen.w) state.screen = msg.screen;
        el.sheetInfo.textContent = 'Device: ' +
          (msg.device ? (msg.device.name + ' / ' + (msg.device.model || '') + ' / Android ' + (msg.device.android || '?')) : '?') +
          '\nLayar: ' + state.screen.w + 'x' + state.screen.h +
          '\nFPS: ' + (msg.fps || '?') + ' | Kualitas: ' + (msg.quality || '?');
        break;

      case P.S2C.FRAME:
        showFrame(msg);
        break;

      case P.S2C.FILES:
        if (msg.error) { toast('Gagal: ' + msg.error); break; }
        state.files = msg.list || [];
        state.path = msg.path || state.path;
        renderFiles();
        break;

      case P.S2C.FILE:
        downloadFile(msg);
        break;

      case P.S2C.OK:
        if (msg.action === 'file.put') toast('Berkas tersimpan');
        break;

      case P.S2C.ERROR:
        toast('Error: ' + (msg.msg || '?'));
        break;

      case P.S2C.PONG:
        el.ping.textContent = (Date.now() - state.pingSent) + ' ms';
        break;
    }
  }

  function showFrame(msg) {
    if (typeof msg.seq === 'number') {
      state.seq = msg.seq;
      state.fpsWin.push(Date.now());
      while (state.fpsWin.length && Date.now() - state.fpsWin[0] > 2000) state.fpsWin.shift();
      el.fps.textContent = (state.fpsWin.length / 2).toFixed(1) + ' fps';
    }
    var mime = msg.mime || 'image/jpeg';
    var bin = atob(msg.data);
    var len = bin.length;
    var buf = new Uint8Array(len);
    for (var i = 0; i < len; i++) buf[i] = bin.charCodeAt(i);
    var blob = new Blob([buf], { type: mime });
    if (state.blobUrl) URL.revokeObjectURL(state.blobUrl);
    state.blobUrl = URL.createObjectURL(blob);
    el.frame.src = state.blobUrl;
    el.placeholder.classList.add('hide');
  }

  /* ---------------- sentuh ---------------- */
  function deviceCoords(clientX, clientY) {
    var r = el.frame.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {
      x: Math.round((clientX - r.left) / r.width * state.screen.w),
      y: Math.round((clientY - r.top) / r.height * state.screen.h)
    };
  }

  var touch = null;

  el.overlay.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    el.screen.classList.add('touch');
    touch = {
      id: e.pointerId,
      x0: e.clientX, y0: e.clientY,
      t0: Date.now(),
      moved: false
    };
    if (el.overlay.setPointerCapture) el.overlay.setPointerCapture(e.pointerId);
  });

  el.overlay.addEventListener('pointermove', function (e) {
    if (!touch || e.pointerId !== touch.id) return;
    var dx = e.clientX - touch.x0, dy = e.clientY - touch.y0;
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) touch.moved = true;
  });

  function endTouch(e) {
    if (!touch || e.pointerId !== touch.id) return;
    var dt = Date.now() - touch.t0;
    var c = deviceCoords(e.clientX, e.clientY);
    if (c) {
      if (!touch.moved && dt < 600) {
        send({ t: P.C2S.TAP, x: c.x, y: c.y });
      } else if (touch.moved) {
        send({
          t: P.C2S.SWIPE,
          x1: Math.round((touch.x0 - el.frame.getBoundingClientRect().left) / el.frame.getBoundingClientRect().width * state.screen.w),
          y1: Math.round((touch.y0 - el.frame.getBoundingClientRect().top) / el.frame.getBoundingClientRect().height * state.screen.h),
          x2: c.x, y2: c.y,
          ms: Math.max(120, dt)
        });
      }
    }
    touch = null;
  }

  el.overlay.addEventListener('pointerup', endTouch);
  el.overlay.addEventListener('pointercancel', function () { touch = null; });

  /* ---------------- tombol ---------------- */
  Array.prototype.forEach.call(document.querySelectorAll('[data-key]'), function (btn) {
    btn.addEventListener('click', function () {
      send({ t: P.C2S.KEY, code: btn.getAttribute('data-key') });
    });
  });

  $('btnSendText').addEventListener('click', function () {
    var v = el.txt.value;
    if (!v.trim()) return;
    if (send({ t: P.C2S.KEY, code: 'TEXT', text: v })) el.txt.value = '';
  });

  $('btnFull').addEventListener('click', function () {
    document.body.classList.toggle('fs');
    if (document.body.classList.contains('fs')) {
      if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () { });
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(function () { });
    }
  });

  /* ---------------- berkas ---------------- */
  function loadFiles(path) {
    send({ t: P.C2S.FILES, path: path || '/' });
  }

  function renderFiles() {
    el.crumbs.textContent = state.path;
    el.fileList.innerHTML = '';
    if (!state.files.length) {
      el.fileHint.textContent = 'Folder kosong.';
      return;
    }
    el.fileHint.textContent = state.files.length + ' item';
    state.files.forEach(function (f) {
      var li = document.createElement('li');

      var ico = document.createElement('span');
      ico.className = 'ico';
      ico.textContent = f.dir ? '\u{1F4C1}' : '\u{1F4C4}';

      var nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = f.name;

      var sz = document.createElement('span');
      sz.className = 'sz';
      sz.textContent = f.dir ? '' : fmtSize(f.size);

      var rm = document.createElement('button');
      rm.className = 'rm';
      rm.textContent = '\u00D7';
      rm.title = 'Hapus';
      rm.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (!confirm('Hapus ' + f.name + '?')) return;
        send({ t: P.C2S.FILE_DEL, path: f.path });
        setTimeout(function () { loadFiles(state.path); }, 300);
      });

      li.appendChild(ico);
      li.appendChild(nm);
      li.appendChild(sz);
      li.appendChild(rm);
      li.addEventListener('click', function () {
        if (f.dir) loadFiles(f.path);
        else send({ t: P.C2S.FILE_GET, path: f.path });
      });
      el.fileList.appendChild(li);
    });
  }

  function downloadFile(msg) {
    try {
      var bin = atob(msg.data);
      var buf = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      var blob = new Blob([buf], { type: msg.mime || 'application/octet-stream' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = msg.name || 'file';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      toast('Berkas diterima: ' + (msg.name || ''));
    } catch (e) {
      toast('Gagal menyimpan berkas: ' + e.message);
    }
  }

  $('btnUp').addEventListener('click', function () {
    var p = state.path;
    if (p === '/' || p === '') { toast('Sudah di akar'); return; }
    var parts = p.replace(/\/+$/, '').split('/');
    parts.pop();
    loadFiles('/' + parts.join('/'));
  });

  $('btnRefresh').addEventListener('click', function () { loadFiles(state.path); });

  el.fileInput.addEventListener('change', function () {
    var f = el.fileInput.files && el.fileInput.files[0];
    if (!f) return;
    if (f.size > P.MAX_TRANSFER_BYTES) {
      toast('Terlalu besar (maks ' + fmtSize(P.MAX_TRANSFER_BYTES) + ')');
      el.fileInput.value = '';
      return;
    }
    var fr = new FileReader();
    fr.onload = function () {
      var res = String(fr.result || '');
      var b64 = res.indexOf(',') >= 0 ? res.slice(res.indexOf(',') + 1) : res;
      send({ t: P.C2S.FILE_PUT, path: state.path, name: f.name, data: b64 });
      setTimeout(function () { loadFiles(state.path); }, 500);
    };
    fr.readAsDataURL(f);
    el.fileInput.value = '';
  });

  /* ---------------- pengaturan ---------------- */
  function openSheet(open) {
    el.sheet.classList.toggle('show', open);
    el.backdrop.classList.toggle('show', open);
  }

  $('btnSettings').addEventListener('click', function () { openSheet(true); });
  el.backdrop.addEventListener('click', function () { openSheet(false); });

  $('btnApply').addEventListener('click', function () {
    saveSettings();
    openSheet(false);
    connect();
  });

  $('btnReset').addEventListener('click', function () {
    try { localStorage.removeItem('clone.settings'); } catch (e) { /* ignore */ }
    loadSettings();
    toast('Pengaturan direset');
  });

  /* ---------------- tab ---------------- */
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
    tab.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) { t.classList.remove('active'); });
      Array.prototype.forEach.call(document.querySelectorAll('.pane'), function (p) { p.classList.remove('active'); });
      tab.classList.add('active');
      $('pane-' + tab.getAttribute('data-tab')).classList.add('active');
    });
  });

  /* ---------------- mulai ---------------- */
  loadSettings();
  connect();

  /* hook debug/testing */
  window.__clone = { state: state, connect: connect, send: send, loadFiles: loadFiles };
})();

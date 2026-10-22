/*
 * Mock target device: mensimulasikan device Android untuk development/testing
 * tanpa perlu HP kedua. Menghasilkan frame PNG + menerima perintah sentuh.
 */
'use strict';
const { Canvas } = require('./png.js');

const W = 480;
const H = 854;

const COL = {
  bg: [16, 18, 24],
  statusbar: [30, 34, 44],
  widget: [26, 30, 40],
  accent: [0, 200, 160],
  accent2: [80, 140, 255],
  text: [235, 238, 245],
  dim: [140, 148, 165],
  icon: [60, 70, 95],
  tap: [255, 90, 120]
};

const APPS = [
  { name: 'WA', c: [37, 211, 102] },
  { name: 'CHAT', c: [0, 168, 132] },
  { name: 'MAPS', c: [66, 133, 244] },
  { name: 'CAM', c: [90, 96, 120] },
  { name: 'MUS', c: [255, 82, 82] },
  { name: 'SET', c: [140, 146, 165] },
  { name: 'CAL', c: [255, 168, 0] },
  { name: 'FILE', c: [120, 200, 255] }
];

class MockDevice {
  constructor(opts = {}) {
    this.w = opts.w || W;
    this.h = opts.h || H;
    this.page = 'home';
    this.taps = [];
    this.lastEvent = 'READY';
    this.seq = 0;
    this.frame = null;
    this.dirty = true;
  }

  info() {
    return {
      device: { name: 'MOCK-PHONE', model: 'Clone Simulator', android: '14 (mock)' },
      screen: { w: this.w, h: this.h },
      fps: opts_fps(this),
      quality: 100,
      width: this.w
    };
  }

  handle(msg) {
    switch (msg.t) {
      case 'tap':
        this.taps.push({ x: msg.x, y: msg.y, t: Date.now() });
        this.taps = this.taps.slice(-8);
        this.lastEvent = 'TAP ' + Math.round(msg.x) + ',' + Math.round(msg.y);
        if (this.page === 'home') {
          const hit = this.hitApp(msg.x, msg.y);
          if (hit) { this.page = 'app'; this.lastEvent = 'OPEN ' + hit; }
        } else {
          this.page = 'home';
          this.lastEvent = 'BACK';
        }
        this.dirty = true;
        break;
      case 'swipe':
        this.lastEvent = 'SWIPE ' + Math.round(msg.x1) + ',' + Math.round(msg.y1) +
          ' -> ' + Math.round(msg.x2) + ',' + Math.round(msg.y2);
        if (Math.abs((msg.x2 || 0) - (msg.x1 || 0)) > 40) {
          this.page = this.page === 'home' ? 'app' : 'home';
        }
        this.dirty = true;
        break;
      case 'key':
        this.lastEvent = 'KEY ' + msg.code + (msg.text ? ' ' + msg.text : '');
        if (msg.code === 'HOME') this.page = 'home';
        if (msg.code === 'BACK' && this.page === 'app') this.page = 'home';
        if (msg.code === 'RECENTS') this.page = 'recent';
        this.dirty = true;
        break;
      case 'control':
        this.lastEvent = 'CONTROL ' + msg.action;
        this.dirty = true;
        break;
      default:
        break;
    }
  }

  hitApp(x, y) {
    const cols = 4, rows = 2;
    const cellW = this.w / cols, cellH = 90;
    const top = 300;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (idx >= APPS.length) continue;
        const cx = c * cellW + cellW / 2;
        const cy = top + r * cellH + 40;
        if (Math.abs(x - cx) < 34 && Math.abs(y - cy) < 34) return APPS[idx].name;
      }
    }
    return null;
  }

  render() {
    const cv = new Canvas(this.w, this.h, COL.bg);
    const w = this.w, h = this.h;

    /* status bar */
    cv.fillRect(0, 0, w, 28, COL.statusbar);
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    cv.text(hh + ':' + mm, 10, 8, COL.text, 2);
    /* wifi + battery */
    for (let i = 0; i < 3; i++) cv.fillRect(w - 70 + i * 7, 20 - i * 4, 5, 4 + i * 4, COL.text);
    cv.strokeRect(w - 40, 8, 24, 12, COL.text);
    cv.fillRect(w - 38, 10, 16, 8, COL.accent);

    if (this.page === 'home') this.renderHome(cv);
    else if (this.page === 'app') this.renderApp(cv);
    else this.renderRecent(cv);

    /* ripple sentuhan */
    const t = Date.now();
    this.taps = this.taps.filter((x) => t - x.t < 700);
    for (const tp of this.taps) {
      const age = (t - tp.t) / 700;
      cv.ring(Math.round(tp.x), Math.round(tp.y), Math.round(6 + age * 26), COL.tap);
      cv.circle(Math.round(tp.x), Math.round(tp.y), 4, COL.tap);
    }

    /* event bar */
    cv.fillRect(0, h - 54, w, 54, [12, 14, 20]);
    cv.text('EVENT: ' + this.lastEvent, 8, h - 44, COL.accent, 2);
    cv.text('SEQ ' + this.seq + '  ' + this.w + 'X' + this.h, 8, h - 26, COL.dim, 2);

    return cv;
  }

  renderHome(cv) {
    const w = this.w;
    cv.fillRect(16, 48, w - 32, 170, COL.widget);
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    cv.text(hh + ':' + mm, 32, 80, COL.text, 6);
    cv.text(now.toDateString().toUpperCase().slice(0, 14), 32, 140, COL.dim, 2);
    cv.text('MOCK DEVICE', 32, 176, COL.accent, 2);

    const cols = 4;
    const cellW = w / cols;
    for (let i = 0; i < APPS.length; i++) {
      const a = APPS[i];
      const c = i % cols, r = Math.floor(i / cols);
      const cx = c * cellW + cellW / 2;
      const cy = 340 + r * 90;
      cv.fillRect(cx - 32, cy - 32, 64, 64, a.c);
      cv.fillRect(cx - 32, cy + 36, a.name.length * 12 + 6, 16, [0, 0, 0]);
      cv.text(a.name, cx - a.name.length * 6 + 2, cy + 37, [10, 12, 16], 2);
    }

    /* nav bar */
    cv.fillRect(0, this.h - 96, this.w, 42, COL.statusbar);
    cv.text('TRIANGLE', 20, this.h - 90, COL.dim, 2);
    cv.text('CIRCLE', 180, this.h - 90, COL.dim, 2);
    cv.text('SQUARE', 330, this.h - 90, COL.dim, 2);
  }

  renderApp(cv) {
    cv.fillRect(0, 28, this.w, 44, COL.accent2);
    cv.text('APP DETAIL', 14, 40, [255, 255, 255], 2);
    for (let i = 0; i < 9; i++) {
      const y = 92 + i * 56;
      cv.fillRect(12, y, this.w - 24, 48, COL.widget);
      cv.circle(38, y + 24, 14, COL.icon);
      cv.text('ITEM ' + (i + 1), 62, y + 18, COL.text, 2);
    }
    cv.text('TAP TO GO BACK', 14, this.h - 118, COL.dim, 2);
  }

  renderRecent(cv) {
    cv.fillRect(0, 28, this.w, 44, COL.accent);
    cv.text('RECENTS', 14, 40, [10, 12, 16], 2);
    for (let i = 0; i < 3; i++) {
      const x = 14 + i * 150;
      cv.fillRect(x, 90, 140, 420, COL.widget);
      cv.strokeRect(x, 90, 140, 420, COL.icon);
      cv.text('CARD ' + (i + 1), x + 12, 100, COL.dim, 2);
    }
    cv.text('PRESS HOME TO RETURN', 14, 540, COL.dim, 2);
  }

  /** Buat frame baru; return Buffer PNG. */
  nextFrame() {
    const cv = this.render();
    this.seq++;
    this.frame = cv.toPNG();
    return this.frame;
  }
}

function opts_fps(dev) {
  return dev.fps || 8;
}

module.exports = { MockDevice, W, H };

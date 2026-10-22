/*
 * Generator ikon launcher (mipmap PNG) tanpa dependency gambar.
 * Jalankan: node tools/gen-icons.js
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Canvas } = require('../server/png.js');

const OUT = path.resolve(__dirname, '..', 'app', 'src', 'main', 'res');
const SIZES = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192]
];

function drawIcon(size) {
  const cv = new Canvas(size, size, [0, 0, 0]);
  const s = size;
  const pad = Math.round(s * 0.08);
  const r = Math.round(s * 0.22);

  /* rounded rectangle background */
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = Math.max(pad - x, x - (s - pad - 1), 0);
      const dy = Math.max(pad - y, y - (s - pad - 1), 0);
      const inside = dx === 0 || dy === 0 || (dx * dx + dy * dy) <= r * r;
      if (!inside) continue;
      const t = y / s;
      cv.set(x, y, [Math.round(10 + 20 * t), Math.round(120 + 60 * t), Math.round(110 + 40 * t)]);
    }
  }

  /* layar kecil */
  const mx = Math.round(s * 0.24);
  const my = Math.round(s * 0.26);
  const mw = s - mx * 2;
  const mh = Math.round(s * 0.40);
  cv.fillRect(mx, my, mw, mh, [240, 248, 255]);
  cv.strokeRect(mx, my, mw, mh, [200, 235, 225]);

  /* garis "koneksi" */
  const ly = Math.round(s * 0.72);
  cv.fillRect(mx, ly, mw, Math.max(2, Math.round(s * 0.05)), [230, 255, 248]);
  cv.circle(mx + Math.round(mw * 0.2), ly + Math.round(mh * 0.12), Math.max(2, Math.round(s * 0.05)), [255, 120, 90]);

  return cv.toPNG();
}

for (const [dir, size] of SIZES) {
  const target = path.join(OUT, dir);
  fs.mkdirSync(target, { recursive: true });
  const png = drawIcon(size);
  fs.writeFileSync(path.join(target, 'ic_launcher.png'), png);
  fs.writeFileSync(path.join(target, 'ic_launcher_round.png'), png);
  console.log('icon ' + dir + ' ' + size + 'px (' + png.length + ' B)');
}

/*
 * Pemeriksaan statis sisi Android (resource & sumber Kotlin).
 * Karena Android SDK tidak ada di Termux, APK tidak bisa dikompilasi di sini.
 * Test ini menangkap error yang biasanya menggagalkan build: resource hilang,
 * id tidak ada, kurung kurawal tidak seimbang, nama kelas != nama file.
 *
 * Jalankan: node --test "test/*.test.js"
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const APP = path.resolve(__dirname, '..', 'app', 'src', 'main');
const RES = path.join(APP, 'res');
const KT = path.join(APP, 'java', 'com', 'clonedevice', 'app');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const resFiles = walk(RES);
const ktFiles = walk(KT).filter((f) => f.endsWith('.kt'));
const layouts = resFiles.filter((f) => f.startsWith(path.join(RES, 'layout')));
const values = resFiles.filter((f) => f.startsWith(path.join(RES, 'values')));

/* ---- kumpulkan resource yang ada ---- */
const definedIds = new Set();
const definedStrings = new Set();
const definedStyles = new Set();
const definedColors = new Set();
const definedFiles = new Map(); // type -> Set(nama)

for (const f of layouts) {
  const xml = fs.readFileSync(f, 'utf8');
  for (const m of xml.matchAll(/android:id="@\+id\/([^"]+)"/g)) definedIds.add(m[1]);
}
for (const f of values) {
  const xml = fs.readFileSync(f, 'utf8');
  for (const m of xml.matchAll(/<string\s+name="([^"]+)"/g)) definedStrings.add(m[1]);
  for (const m of xml.matchAll(/<style\s+name="([^"]+)"/g)) definedStyles.add(m[1]);
  for (const m of xml.matchAll(/<color\s+name="([^"]+)"/g)) definedColors.add(m[1]);
  for (const m of xml.matchAll(/<item\s+type="id"\s+name="([^"]+)"/g)) definedIds.add(m[1]);
}
for (const f of resFiles) {
  const rel = path.relative(RES, f).replace(/\\/g, '/');
  const m = rel.match(/^([^/]+)\/([^/]+)\./);
  if (!m) continue;
  const type = m[1].replace(/-(v\d+|anydpi|night)/g, '');
  if (!definedFiles.has(type)) definedFiles.set(type, new Set());
  definedFiles.get(type).add(m[2]);
}

/* ---- test ---- */
test('file sumber Kotlin ada dan namanya konsisten', () => {
  assert.ok(ktFiles.length >= 5, 'harus ada minimal 5 file kotlin');
  for (const f of ktFiles) {
    const src = fs.readFileSync(f, 'utf8');
    const base = path.basename(f, '.kt');
    const re = /(?:class|object)\s+([A-Za-z0-9_]+)/g;
    let found = false;
    let m;
    while ((m = re.exec(src))) {
      if (m[1] === base) found = true;
    }
    assert.ok(found, path.basename(f) + ': harusnya ada class/object bernama ' + base);
  }
});

test('kurung kurawal setiap file kotlin seimbang', () => {
  for (const f of ktFiles) {
    const src = fs.readFileSync(f, 'utf8');
    let depth = 0, maxDepth = 0;
    let inStr = false, inChar = false, inLineComment = false, inBlock = false;
    for (let i = 0; i < src.length; i++) {
      const c = src[i], n = src[i + 1];
      if (inLineComment) { if (c === '\n') inLineComment = false; continue; }
      if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
      if (inStr) { if (c === '\\') { i++; continue; } if (c === '"') inStr = false; continue; }
      if (inChar) { if (c === '\\') { i++; continue; } if (c === "'") inChar = false; continue; }
      if (c === '/' && n === '/') { inLineComment = true; i++; continue; }
      if (c === '/' && n === '*') { inBlock = true; i++; continue; }
      if (c === '"') { inStr = true; continue; }
      if (c === "'") { inChar = true; continue; }
      if (c === '{') { depth++; maxDepth = Math.max(maxDepth, depth); }
      if (c === '}') depth--;
    }
    assert.strictEqual(depth, 0, path.basename(f) + ': kurung kurawal tidak seimbang');
    assert.ok(maxDepth > 0, path.basename(f) + ': tidak ada blok kode');
  }
});

test('semua R.id yang dipakai di Kotlin terdefinisi', () => {
  for (const f of ktFiles) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bR\.id\.([A-Za-z0-9_]+)/g)) {
      assert.ok(definedIds.has(m[1]),
        path.basename(f) + ': R.id.' + m[1] + ' tidak ada di res/');
    }
  }
});

test('semua R.string/layout/drawable/xml yang dipakai di Kotlin terdefinisi', () => {
  const map = {
    string: definedStrings,
    layout: definedFiles.get('layout'),
    drawable: definedFiles.get('drawable'),
    xml: definedFiles.get('xml'),
    mipmap: definedFiles.get('mipmap')
  };
  for (const f of ktFiles) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bR\.(string|layout|drawable|xml|mipmap)\.([A-Za-z0-9_]+)/g)) {
      const set = map[m[1]];
      if (!set) continue; // tipe dari library, tidak dicek
      assert.ok(set.has(m[2]),
        path.basename(f) + ': R.' + m[1] + '.' + m[2] + ' tidak ada di res/');
    }
  }
});

test('semua referensi @string/@drawable/@mipmap/@xml/@style di res & manifest valid', () => {
  /* style & drawable boleh berasal dari library (appcompat/material) */
  const isLibraryStyle = (n) =>
    /^(Theme|Widget|TextAppearance|Base)\./.test(n) || /^(AppCompat|Material)/.test(n);
  const files = resFiles.concat([path.join(APP, 'AndroidManifest.xml')]);
  for (const f of files) {
    const xml = fs.readFileSync(f, 'utf8');
    const rel = path.relative(APP, f).replace(/\\/g, '/');
    for (const m of xml.matchAll(/@string\/([A-Za-z0-9_.]+)/g)) {
      assert.ok(definedStrings.has(m[1]), rel + ': @string/' + m[1] + ' tidak ada');
    }
    for (const m of xml.matchAll(/@style\/([A-Za-z0-9_.]+)/g)) {
      if (isLibraryStyle(m[1])) continue;
      assert.ok(definedStyles.has(m[1]), rel + ': @style/' + m[1] + ' tidak ada');
    }
    for (const m of xml.matchAll(/@(drawable|mipmap|xml)\/([A-Za-z0-9_.]+)/g)) {
      const set = definedFiles.get(m[1]);
      if (!set) continue;
      assert.ok(set.has(m[2]), rel + ': @' + m[1] + '/' + m[2] + ' tidak ada');
    }
  }
});

test('semua class yang di-activity terdaftar di manifest', () => {
  const manifest = fs.readFileSync(path.join(APP, 'AndroidManifest.xml'), 'utf8');
  for (const f of ktFiles) {
    const src = fs.readFileSync(f, 'utf8');
    const m = src.match(/class\s+([A-Za-z0-9_]+)\s*:\s*([A-Za-z0-9_.]+)\s*\(/);
    if (!m) continue;
    const cls = m[1];
    const superCls = m[2];
    if (superCls !== 'Activity' && superCls !== 'Service' &&
      superCls !== 'AccessibilityService' && !superCls.endsWith('Service')) continue;
    assert.ok(manifest.includes('android:name=".' + cls + '"'),
      cls + ' tidak terdaftar di AndroidManifest.xml');
  }
});

test('service accessibility punya meta-data config', () => {
  const manifest = fs.readFileSync(path.join(APP, 'AndroidManifest.xml'), 'utf8');
  assert.ok(manifest.includes('android.accessibilityservice'),
    'manifest harus mendaftarkan meta-data android.accessibilityservice');
  const cfg = path.join(RES, 'xml', 'accessibility_service_config.xml');
  assert.ok(fs.existsSync(cfg), 'accessibility_service_config.xml tidak ada');
  const xml = fs.readFileSync(cfg, 'utf8');
  assert.ok(xml.includes('canPerformGestures="true"'),
    'canPerformGestures harus true agar dispatchGesture jalan');
});

test('semua file yaml/xml gradle dan res valid secara sintaks dasar', () => {
  for (const f of resFiles.filter((f) => f.endsWith('.xml'))) {
    const xml = fs.readFileSync(f, 'utf8');
    const open = (xml.match(/</g) || []).length;
    const close = (xml.match(/>/g) || []).length;
    assert.strictEqual(open, close, path.relative(APP, f) + ': tag tidak seimbang');
  }
});

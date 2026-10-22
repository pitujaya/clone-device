#!/usr/bin/env node
// Verifier statis: cek semua referensi Android dalam kode Kotlin terhadap
// android-all.jar (API 34 asli) agar error compile ketahuan tanpa CI.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const JAR = process.argv[2] || 'android-all.jar';
const SRC = process.argv[3] || '.';

// 1. Semua kelas yang ada di jar
const listing = execFileSync('unzip', ['-Z1', JAR], { maxBuffer: 1 << 28 })
  .toString().split('\n').filter(l => l.endsWith('.class'));
const classes = new Set(listing.map(p => p.slice(0, -6).replace(/\//g, '.')));

// 2. Cache nama member per kelas (constant pool => nama field & method)
const memberCache = new Map();
function membersOf(fqcn) {
  if (memberCache.has(fqcn)) return memberCache.get(fqcn);
  const entry = fqcn.replace(/\./g, '/') + '.class';
  let names = new Set();
  try {
    const buf = execFileSync('unzip', ['-p', JAR, entry], { maxBuffer: 1 << 26 });
    const s = buf.toString('latin1');
    const re = /[A-Za-z_$][A-Za-z0-9_$]*/g;
    let m;
    while ((m = re.exec(s))) names.add(m[0]);
  } catch (e) { /* kelas tidak ada */ }
  memberCache.set(fqcn, names);
  return names;
}

const ktDir = path.join(SRC, 'app/src/main/java/com/clonedevice/app');
const files = fs.readdirSync(ktDir).filter(f => f.endsWith('.kt'));
const problems = [];
const androidImports = new Map(); // simple name -> fqcn

for (const f of files) {
  const src = fs.readFileSync(path.join(ktDir, f), 'utf8');
  // import android.* -> cek kelasnya ada
  for (const m of src.matchAll(/^import\s+(android\.[\w.]+)/gm)) {
    const fq = m[1];
    if (fq.endsWith('.*')) continue;
    const simple = fq.split('.').pop();
    androidImports.set(simple, fq);
    if (!classes.has(fq)) {
      // mungkin nested class: Outer.Inner
      const parts = fq.split('.');
      let nestedOk = false;
      for (let i = parts.length - 1; i > 0; i--) {
        const cand = parts.slice(0, i).join('.') + '$' + parts.slice(i).join('$');
        if (classes.has(cand)) { nestedOk = true; break; }
      }
      if (!nestedOk) problems.push(`${f}: import ${fq} -> KELAS TIDAK ADA di API 34`);
    }
  }
  // referensi Class.MEMBER untuk kelas android yang di-import
  for (const m of src.matchAll(/\b([A-Z][A-Za-z0-9]*)\.([A-Z][A-Z0-9_]{2,})\b/g)) {
    const cls = m[1], mem = m[2];
    if (!androidImports.has(cls)) continue;
    const fq = androidImports.get(cls);
    const members = membersOf(fq);
    if (members.size && !members.has(mem)) {
      problems.push(`${f}: ${cls}.${mem} -> MEMBER TIDAK ADA di ${fq}`);
    }
  }
  // referensi Outer.Inner.MEMBER (nested class)
  for (const m of src.matchAll(/\b([A-Z][A-Za-z0-9]*)\.([A-Z][A-Za-z0-9]*)\.([A-Z][A-Z0-9_]{2,})\b/g)) {
    const outer = m[1], inner = m[2], mem = m[3];
    if (!androidImports.has(outer)) continue;
    const fq = androidImports.get(outer) + '$' + inner;
    if (!classes.has(fq)) { problems.push(`${f}: ${outer}.${inner} -> nested class TIDAK ADA`); continue; }
    const members = membersOf(fq);
    if (members.size && !members.has(mem)) {
      problems.push(`${f}: ${outer}.${inner}.${mem} -> MEMBER TIDAK ADA di ${fq}`);
    }
  }
  // pemanggilan method statis: Class.method(  dan  Class.Inner.method(
  for (const m of src.matchAll(/\b([A-Z][A-Za-z0-9]*)(?:\.([A-Z][A-Za-z0-9]*))?\.([a-z][A-Za-z0-9_]*)\(/g)) {
    const outer = m[1], inner = m[2], meth = m[3];
    if (!androidImports.has(outer)) continue;
    const fq = inner ? androidImports.get(outer) + '$' + inner : androidImports.get(outer);
    if (!classes.has(fq)) { problems.push(`${f}: ${outer}${inner ? '.' + inner : ''} -> kelas TIDAK ADA`); continue; }
    const members = membersOf(fq);
    if (members.size && !members.has(meth)) {
      problems.push(`${f}: ${fq}.${meth}() -> METHOD TIDAK ADA`);
    }
  }
}

const uniq = [...new Set(problems)];
if (uniq.length) { console.log('MASALAH DITEMUKAN:'); uniq.forEach(p => console.log('  ✗ ' + p)); }
else console.log('✓ Semua referensi Android valid terhadap API 34');
console.log(`(dicek ${files.length} file, ${androidImports.size} import android.*)`);

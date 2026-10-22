# Build Clone Device

## Struktur

- `app/` — Android APK (Kotlin, MediaProjection)
- `server/` — Server Node.js (mock device + proxy)
- `web-client/` — UI web

## Cara build APK

### Opsi A — Android Studio (paling gampang)

1. Buka folder project ini di Android Studio
2. Tunggu Gradle sync
3. Build > Build APK(s) > Build APK(s)
4. Hasil: `app/build/outputs/apk/debug/app-debug.apk`

### Opsi B — Gradle CLI

Pastikan Java 17 dan Android SDK (platform 34, build-tools) sudah ada, lalu:

```bash
gradle assembleDebug
```

Butuh Gradle 8.1+ dan Android SDK Platform 34.

### Opsi C — Termux (HP Android)

Termux bisa membangun APK, tapi perlu Android SDK yang dikompilasi untuk ARM
(banyak toolchain tidak tersedia). Kalau gagal, pakai Opsi A/B di PC.

```bash
pkg install openjdk-17
# lalu pasang Android SDK command line tools + platform 34 + build-tools
gradle assembleDebug
```

### Opsi D — GitHub Actions (tanpa PC) ⭐ paling praktis

Sudah jadi: `.github/workflows/build-apk.yml`. Setiap push ke `main` akan:

1. job `test` — `npm ci` + `npm test` (18 tes)
2. job `build` — unduh Java 17, Android SDK (platform 34 + build-tools 34.0.0),
   Gradle 8.4, lalu `assembleDebug` + `assembleRelease`

Hasilnya di artifact `clone-device-apk` yang bisa diunduh dari tab **Actions**
di repo, atau otomatis:

```bash
gh run download --repo pitujaya/clone-device --name clone-device-apk
```

> Catatan: agar push file `.github/workflows/` diterima, token GitHub harus
> punya scope `repo` **dan** `workflow`. Token OAuth biasa dari `gh` kalau
> scope `workflow` belum di-*refresh* akan ditolak dengan pesan
> "refusing to allow an OAuth App to create or update workflow ... without
> `workflow` scope".

Untuk install di HP:

```bash
# salin ke folder Download HP, lalu buka lewat file manager & install
cp app-debug.apk /storage/emulated/0/Download/
```

### Verifikasi API Android tanpa menunggu CI

`tools/verify-android.js` memeriksa semua `import android.*` dan anggota
`Class.MEMBER` di kode Kotlin terhadap `android-all.jar` (API 34 asli),
sehingga salah nama API ketahuan sebelum push:

```bash
curl -L -o android-all.jar \
  https://repo1.maven.org/maven2/org/robolectric/android-all/14-robolectric-10818077/android-all-14-robolectric-10818077.jar
node tools/verify-android.js android-all.jar .
```

## Menjalankan server development di Termux

```bash
cd "clone device"
npm install
npm start
```

Buka `http://<IP-HP>:8080` dari device lain. Server ini **mock**: device
disimulasikan, jadi bisa dipakai ngobrol sama device target tanpa perlu.

## Tes

```bash
npm test
```

Isi tes:
- `test/protocol.test.js` — protokol WebSocket (hello, frame, file browser, path escape, ping, tap)
- `test/webclient.test.js` — web-client dijalankan di DOM tiruan (koneksi, frame, tap, tombol, file browser)
- `test/android.test.js` — pemeriksaan statis resource & sumber Kotlin (XML, R.id, brace balance, manifest)

## Catatan ikon

Ikon launcher dibuat script, bukan file binary dari luar:

```bash
npm run icons
```

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

### Opsi D — GitHub Actions (tanpa PC)

Tambahkan workflow `.github/workflows/build-apk.yml` di repo ini dengan
`gradle/actions/setup-gradle` + `android-actions/setup-android`, lalu ambil
artefak APK-nya. (Belum dibuat — bilang saja kalau mau.)

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

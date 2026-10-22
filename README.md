# Clone Device

Remote access device Android lewat jaringan lokal (LAN):
**screen mirroring + kendali sentuh + file browser.**

```
┌──────────────┐   WebSocket (JSON)   ┌──────────────────────────┐
│  web-client  │ ───────────────────► │  APK Android (target)    │
│  (browser)   │ ◄─────────────────── │  MediaProjection + WS    │
└──────────────┘   frame JPEG base64   └──────────────────────────┘
```

## Isi project

| Folder | Isi |
|---|---|
| `app/` | APK Android (Kotlin) — capture layar, server WS, AccessibilityService untuk kontrol |
| `web-client/` | UI web yang dibuka di browser device pengontrol |
| `server/` | Server Node.js untuk development (mock device & proxy) |
| `shared/PROTOCOL.md` | Spesifikasi protokol WebSocket |
| `test/` | Tes otomatis (protokol, web-client, resource Android) |
| `tools/gen-icons.js` | Generator ikon launcher (tanpa dependency gambar) |

## Cara pakai

### 1. Build & pasang APK di device target

Bisa di PC (Windows/Linux/macOS) dengan Android Studio atau Gradle, atau di Termux (lihat `README_BUILD.md`).

```bash
gradle assembleDebug        # hasil: app/build/outputs/apk/debug/app-debug.apk
```

### 2. Jalankan di device target

1. Buka aplikasi "Clone Device"
2. Tekan **Mulai Mirroring + Server** → izinkan capture layar
3. Tekan **Aktifkan Kontrol** → nyalakan layanan aksesibilitas (wajib untuk tap/swipe)
4. Tekan **Izin Semua Berkas** → izinkan (wajib untuk file browser)
5. Catat IP yang tampil di aplikasi, misal `192.168.1.7`

### 3. Buka dari device pengontrol

Buka `web-client/index.html` lewat server dev (atau host statis mana pun), lalu atur
**Alamat server / device** di menu ⚙ → isi `192.168.1.7` port `8080`.

Untuk development, server Node bisa jadi perantara:

```bash
npm install
npm start                                   # mode mock: device simulasi
npm run proxy -- --target=192.168.1.7      # mode proxy: teruskan ke device asli
```

Lalu buka `http://<IP-PC>:8080` di browser HP.

## Fitur

- **Mirroring real-time** — frame layar dikirim sebagai JPEG (bisa atur FPS, kualitas, lebar)
- **Kontrol sentuh** — tap & swipe langsung ke layar device, tombol Home / Back / Recents / Notifikasi
- **Ketik teks** — kirim teks ke input yang sedang fokus di device
- **File browser** — lihat, unduh, unggah, dan hapus berkas device
- **Mock device** — server development yang mensimulasikan device Android, jadi UI bisa dites tanpa HP kedua

## Batasan

- Kontrol sentuh butuh layanan **Aksesibilitas** aktif di device target (dibuat oleh user, tidak bisa diaktifkan diam-diam)
- Tombol **Enter** mencari tombol enter di keyboard; bisa gagal di keyboard tertentu
- Transfer file dibatasi 8 MB per file
- Semua lalu lintas **tidak terenkripsi** — pakai hanya di jaringan lokal yang kamu percaya

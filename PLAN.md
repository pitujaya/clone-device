# Clone Device Plan

## Goal
Buat APK untuk remote device: mirroring + akses file via jaringan

## Arsitektur (final)
- **Client**: web-client statis (browser HP/laptop) — cukup 1 file HTML/CSS/JS
- **Server**: APK Android di device target (Kotlin + MediaProjection + Java-WebSocket)
- **Transport**: WebSocket mentah, JSON teks (`shared/PROTOCOL.md`)
- **Development**: server Node.js (mock device / proxy) + tes otomatis

Kenapa bukan Socket.IO: APK harus ringan, dan Java-WebSocket jauh lebih
simpel daripada membawa engine Socket.IO ke Android.

## Fitur utama
- [x] Screen mirroring (JPEG base64, atur FPS/kualitas/lebar)
- [x] Kontrol sentuh: tap & swipe (AccessibilityService.dispatchGesture)
- [x] Tombol navigasi: Home / Back / Recents / Notifikasi / Daya
- [x] Ketik teks ke input yang fokus (ACTION_SET_TEXT)
- [x] File browser: list / unduh / unggah / hapus
- [x] Info device (nama, model, versi Android, ukuran layar)
- [x] Mock device di Node untuk testing tanpa HP kedua
- [x] Tes otomatis (protokol, web-client, resource Android)

## Kendala yang sudah diselesaikan
- ~~Socket.IO vs Java-WebSocket~~ → diseragamkan ke WebSocket mentah
- ~~ImageReader tidak dibuat~~ → `createVirtualDisplay` kini memakai `reader.surface`
- ~~Tidak ada kompresi~~ → JPEG + base64 per frame
- ~~Kurung kurawal broadcast~~ → multi-client, tiap client dapat salinan frame
- ~~Android 14 butuh startForeground sebelum getMediaProjection~~ → urutannya dibetulkan

## Batasan yang masih ada
- [ ] Enter key kadang tidak ketemu di keyboard tertentu
- [ ] Belum ada streaming video (WebRTC) — masih kirim frame per JPEG
- [ ] Belum ada transfer file besar (chunking) — masih 8 MB sekali jalan
- [ ] Belum ada autentikasi/password untuk server WS

## Ide lanjutan
- WebRTC untuk latency rendah & video
- Audio forwarding (AudioRecord -> Opus)
- Pairing via kode QR + token
- Build APK via GitHub Actions

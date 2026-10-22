# Protokol Clone Device (v1)

Transport: **WebSocket mentah** (`ws://<IP_TARGET>:8080`), teks JSON.
Tidak pakai Socket.IO — APK (Kotlin) dan web-client harus bicara protokol yang sama.

Semua pesan punya field `t` (tipe). Field tambahan opsional.

## Client -> Server

| `t` | Field | Arti |
|---|---|---|
| `hello` | `client`, `w`, `h` | Client baru connect, `w/h` ukuran layar client (CSS px) |
| `tap` | `x`, `y` | Ketuk pada koordinat **device px** |
| `swipe` | `x1`,`y1`,`x2`,`y2`,`ms` | Geser, durasi ms |
| `key` | `code`, `text?` | `code`: HOME/BACK/RECENTS/NOTIF/POWER_MENU/ENTER/DEL/TEXT. `text` dipakai bila `code=TEXT` |
| `files` | `path` | Minta daftar isi direktori |
| `file.get` | `path` | Minta isi file (base64) |
| `file.put` | `path`, `name`, `data` | Upload file (base64) |
| `file.del` | `path` | Hapus file/direktori |
| `control` | `action`, `value?` | `start`/`stop`/`fps`/`quality`/`width` |
| `ping` | — | Cek koneksi |

## Server -> Client

| `t` | Field | Arti |
|---|---|---|
| `hello` | `device{name,model,android}`, `screen{w,h}`, `fps`, `quality`, `width` | Info device, layar, dan setting |
| `frame` | `data` (base64), `mime`, `seq`, `ts` | 1 frame layar. `mime` = `image/jpeg` (device asli) atau `image/png` (mock) |
| `files` | `path`, `list[]`, `error?` | Isi direktori. `list[]`: `{name,path,dir,size,mtime}` |
| `file` | `path`, `name`, `mime`, `data` (base64) | Isi file |
| `ok` | `action?`, `path?` | Aksi berhasil |
| `error` | `msg` | Gagal |
| `pong` | — | Balasan ping |

## Aturan
- Koordinat selalu dalam **device pixel** (bukan CSS px). Client wajib menskalakan.
- `seq` frame naik monoton, dipakai client untuk deteksi frame baru.
- Server boleh push frame ke semua client yang terhubung.
- Kalau `frame` belum pernah masuk, client harus tetap bisa kirim perintah (UI tetap hidup).

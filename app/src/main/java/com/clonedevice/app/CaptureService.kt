package com.clonedevice.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageFormat
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.util.Base64
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import androidx.core.app.ServiceCompat
import org.java_websocket.server.WebSocketServer
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Foreground service yang:
 *  1. menangkap layar device via MediaProjection
 *  2. mengubah frame jadi JPEG
 *  3. mengirimkannya ke semua client WebSocket
 */
class CaptureService : Service() {

    companion object {
        private const val TAG = "CloneCapture"
        const val ACTION_START = "com.clonedevice.app.START"
        const val ACTION_STOP = "com.clonedevice.app.STOP"
        const val EXTRA_RESULT_CODE = "resultCode"
        const val EXTRA_RESULT_DATA = "data"
        const val NOTIF_ID = 4711
        const val CHANNEL_ID = "clone_capture"

        @Volatile
        var isRunning = false
            private set
    }

    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var ws: WsServer? = null
    private var captureThread: HandlerThread? = null
    private var captureHandler: Handler? = null
    private val running = AtomicBoolean(false)

    private var bitmap: Bitmap? = null
    private var lastFrameAt = 0L
    private var frameSeq = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopEverything()
            stopSelf()
            return START_NOT_STICKY
        }

        val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, -1) ?: -1
        @Suppress("DEPRECATION")
        val data: Intent? = intent?.getParcelableExtra(EXTRA_RESULT_DATA)
        if (resultCode == -1 || data == null) {
            Log.w(TAG, "start tanpa izin capture")
            stopSelf()
            return START_NOT_STICKY
        }

        /* Android 14+: startForeground WAJIB sebelum getMediaProjection */
        startForegroundCompat()

        if (projection == null) {
            val mgr = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            val p = try {
                mgr.getMediaProjection(resultCode, data)
            } catch (e: Exception) {
                Log.e(TAG, "gagal ambil projection", e)
                null
            }
            if (p == null) {
                stopSelf()
                return START_NOT_STICKY
            }
            projection = p
            p.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() {
                    Log.i(TAG, "projection dihentikan oleh sistem")
                    stopEverything()
                    stopSelf()
                }
            }, mainHandler())
            setupCapture(p)
        }

        startWebSocket()
        isRunning = true
        return START_STICKY
    }

    private fun mainHandler() = Handler(android.os.Looper.getMainLooper())

    /* ------------------------- capture ------------------------- */
    private fun setupCapture(p: MediaProjection) {
        val dm = DisplayMetrics()
        val wm = getSystemService(WINDOW_SERVICE) as WindowManager
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getRealMetrics(dm)

        val targetW = Config.getWidth(this)
        val scale = targetW.toFloat() / dm.widthPixels.toFloat()
        val w = targetW
        val h = ((dm.heightPixels * scale).toInt() / 2) * 2
        val realW = dm.widthPixels
        val realH = dm.heightPixels

        val thread = HandlerThread("clone-capture")
        thread.start()
        captureThread = thread
        captureHandler = Handler(thread.looper)

        val r = ImageReader.newInstance(w, h, ImageFormat.RGBA_8888, 2)
        r.setOnImageAvailableListener({ reader -> onImageAvailable(reader) }, captureHandler)
        reader = r

        virtualDisplay = p.createVirtualDisplay(
            "clone",
            w, h, dm.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            r.surface, null, null
        )

        Log.i(TAG, "capture siap ${w}x$h (device asli ${realW}x$realH)")
        sendMeta()
    }

    private fun onImageAvailable(r: ImageReader) {
        val image: Image = r.acquireLatestImage() ?: return
        try {
            val cfgFps = Config.getFps(this)
            val now = System.currentTimeMillis()
            if (now - lastFrameAt < 1000L / cfgFps) return
            lastFrameAt = now

            val bmp = toBitmap(image)
            if (bmp == null) return
            val out = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.JPEG, Config.getQuality(this), out)
            val bytes = out.toByteArray()
            out.close()
            val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
            frameSeq++
            ws?.broadcastFrame(b64, "image/jpeg", frameSeq)
        } catch (e: Exception) {
            Log.e(TAG, "gagal proses frame", e)
        } finally {
            try { image.close() } catch (_: Exception) { }
        }
    }

    /** Salin buffer ImageReader (RGBA) ke Bitmap, aman untuk rowStride != width*4. */
    private fun toBitmap(image: Image): Bitmap? {
        val plane = image.planes[0] ?: return null
        val buffer = plane.buffer
        val rowStride = plane.rowStride
        val pxW = image.width
        val pxH = image.height

        var bmp = bitmap
        if (bmp == null || bmp.width != pxW || bmp.height != pxH) {
            bmp = Bitmap.createBitmap(pxW, pxH, Bitmap.Config.ARGB_8888)
            bitmap = bmp
        }

        try {
            if (rowStride == pxW * 4) {
                buffer.rewind()
                bmp.copyPixelsFromBuffer(buffer)
            } else {
                val line = ByteArray(pxW * 4)
                val full = ByteArray(pxW * 4 * pxH)
                for (y in 0 until pxH) {
                    buffer.position(y * rowStride)
                    buffer.get(line, 0, pxW * 4)
                    System.arraycopy(line, 0, full, y * pxW * 4, pxW * 4)
                }
                bmp.copyPixelsFromBuffer(ByteBuffer.wrap(full))
            }
        } catch (e: Exception) {
            Log.e(TAG, "copyPixelsFromBuffer gagal", e)
            return null
        }
        return bmp
    }

    /* ------------------------- websocket ------------------------- */
    private fun startWebSocket() {
        if (ws != null) return
        val port = Config.getPort(this)
        val server = WsServer(port, object : WsServer.Handler {
            override fun onCommand(conn: org.java_websocket.WebSocket?, msg: org.json.JSONObject?) {
                handleCommand(conn, msg)
            }

            override fun onClientsChanged(count: Int) {
                Log.i(TAG, "jumlah client: $count")
            }
        })
        ws = server
        Thread({ server.start() }, "clone-ws").apply { isDaemon = true }.start()
        Log.i(TAG, "web server jalan di port $port")
    }

    /* ------------------------- perintah ------------------------- */
    private fun handleCommand(conn: org.java_websocket.WebSocket?, msg: org.json.JSONObject?) {
        if (msg == null) return
        val type = msg.optString("t")
        when (type) {
            "hello" -> {
                conn?.send(Protocol.hello(this))
            }

            "tap" -> {
                val x = msg.optInt("x", -1)
                val y = msg.optInt("y", -1)
                if (x < 0 || y < 0) return
                ControlService.instance?.tap(x, y) ?: conn?.send(Protocol.error("Kontrol belum diaktifkan"))
            }

            "swipe" -> {
                val x1 = msg.optInt("x1", -1); val y1 = msg.optInt("y1", -1)
                val x2 = msg.optInt("x2", -1); val y2 = msg.optInt("y2", -1)
                val ms = msg.optLong("ms", 300L)
                if (x1 < 0 || y1 < 0 || x2 < 0 || y2 < 0) return
                ControlService.instance?.swipe(x1, y1, x2, y2, ms)
                    ?: conn?.send(Protocol.error("Kontrol belum diaktifkan"))
            }

            "key" -> {
                val code = msg.optString("code")
                val text = msg.optString("text", "")
                val svc = ControlService.instance
                if (svc == null) {
                    conn?.send(Protocol.error("Kontrol belum diaktifkan"))
                    return
                }
                when (code) {
                    "HOME" -> svc.global(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_HOME)
                    "BACK" -> svc.global(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK)
                    "RECENTS" -> svc.global(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_RECENTS)
                    "NOTIF" -> svc.global(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS)
                    "POWER_MENU" -> svc.global(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_POWER_DIALOG)
                    "ENTER" -> svc.pressEnter()
                    "DEL" -> svc.pressDelete()
                    "TEXT" -> svc.sendText(text)
                    else -> conn?.send(Protocol.error("Key tidak dikenal: $code"))
                }
            }

            "files" -> {
                val path = msg.optString("path", "/")
                try {
                    conn?.send(Protocol.files(FileManager.listDir(this, path)))
                } catch (e: Exception) {
                    conn?.send(Protocol.error(e.message ?: "Gagal baca folder"))
                }
            }

            "file.get" -> {
                val path = msg.optString("path", "")
                try {
                    conn?.send(Protocol.file(FileManager.readFile(this, path)))
                } catch (e: Exception) {
                    conn?.send(Protocol.error(e.message ?: "Gagal baca file"))
                }
            }

            "file.put" -> {
                val path = msg.optString("path", "/")
                val name = msg.optString("name", "upload.bin")
                val data = msg.optString("data", "")
                try {
                    val r = FileManager.writeFile(this, path, name, data)
                    conn?.send(Protocol.ok(mapOf(
                        "action" to "file.put",
                        "path" to r,
                        "size" to java.io.File(r).length()
                    )))
                } catch (e: Exception) {
                    conn?.send(Protocol.error(e.message ?: "Gagal simpan file"))
                }
            }

            "file.del" -> {
                val path = msg.optString("path", "")
                try {
                    val r = FileManager.delete(this, path)
                    conn?.send(Protocol.ok(mapOf("action" to "file.del", "path" to r)))
                } catch (e: Exception) {
                    conn?.send(Protocol.error(e.message ?: "Gagal hapus file"))
                }
            }

            "control" -> {
                val action = msg.optString("action")
                val value = msg.optDouble("value", -1.0).toInt()
                when (action) {
                    "fps" -> if (value > 0) Config.setFps(this, value)
                    "quality" -> if (value > 0) Config.setQuality(this, value)
                    "width" -> if (value > 0) Config.setWidth(this, value)
                }
                conn?.send(Protocol.ok(mapOf("action" to action, "value" to value)))
            }

            "ping" -> conn?.send(Protocol.pong())
        }
    }

    private fun sendMeta() {
        ws?.broadcast(Protocol.hello(this))
    }

    /* ------------------------- cleanup ------------------------- */
    private fun stopEverything() {
        running.set(false)
        isRunning = false
        try { ws?.stop(1000) } catch (_: Exception) { }
        ws = null
        try { virtualDisplay?.release() } catch (_: Exception) { }
        virtualDisplay = null
        try { reader?.close() } catch (_: Exception) { }
        reader = null
        try { projection?.stop() } catch (_: Exception) { }
        projection = null
        bitmap?.recycle()
        bitmap = null
        captureHandler?.removeCallbacksAndMessages(null)
        captureThread?.quitSafely()
        captureThread = null
        captureHandler = null
    }

    override fun onDestroy() {
        stopEverything()
        super.onDestroy()
    }

    /* ------------------------- notifikasi ------------------------- */
    private fun startForegroundCompat() {
        val notif = buildNotification()
        try {
            ServiceCompat.startForeground(
                this,
                NOTIF_ID,
                notif,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            )
        } catch (e: Exception) {
            Log.e(TAG, "startForeground gagal", e)
            startForeground(NOTIF_ID, notif)
        }
    }

    private fun buildNotification(): Notification {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Clone Device", NotificationManager.IMPORTANCE_LOW)
            )
        }
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            Notification.Builder(this)
        }
        val stopIntent = Intent(this, CaptureService::class.java).setAction(ACTION_STOP)
        val pi = android.os.PendingIntent.getService(
            this, 0, stopIntent,
            android.os.PendingIntent.FLAG_UPDATE_CURRENT or android.os.PendingIntent.FLAG_IMMUTABLE
        )
        return builder
            .setContentTitle("Clone Device aktif")
            .setContentText("Server mirroring jalan - port ${Config.getPort(this)}")
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", pi)
            .build()
    }
}

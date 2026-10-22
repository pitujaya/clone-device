package com.clonedevice.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    companion object {
        private const val REQ_CAPTURE = 1001
        private const val REQ_NOTIF = 1002
    }

    private lateinit var mgr: MediaProjectionManager
    private lateinit var tvStatus: TextView
    private lateinit var tvUrl: TextView
    private lateinit var tvControl: TextView
    private lateinit var tvStorage: TextView
    private lateinit var etPort: EditText
    private lateinit var etFps: EditText
    private lateinit var etQuality: EditText
    private lateinit var etWidth: EditText
    private lateinit var btnStart: Button
    private lateinit var btnStop: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        mgr = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager

        tvStatus = findViewById(R.id.tvStatus)
        tvUrl = findViewById(R.id.tvUrl)
        tvControl = findViewById(R.id.tvControl)
        tvStorage = findViewById(R.id.tvStorage)
        etPort = findViewById(R.id.etPort)
        etFps = findViewById(R.id.etFps)
        etQuality = findViewById(R.id.etQuality)
        etWidth = findViewById(R.id.etWidth)
        btnStart = findViewById(R.id.btnStart)
        btnStop = findViewById(R.id.btnStop)

        etPort.setText(Config.getPort(this).toString())
        etFps.setText(Config.getFps(this).toString())
        etQuality.setText(Config.getQuality(this).toString())
        etWidth.setText(Config.getWidth(this).toString())

        btnStart.setOnClickListener {
            saveSettings()
            requestNotificationPermission()
            startActivityForResult(mgr.createScreenCaptureIntent(), REQ_CAPTURE)
        }

        btnStop.setOnClickListener {
            stopService(Intent(this, CaptureService::class.java))
            toast("Server dihentikan")
            refresh()
        }

        findViewById<Button>(R.id.btnAccessibility).setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }

        findViewById<Button>(R.id.btnStorage).setOnClickListener {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val i = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESSION_PERMISSION)
                i.data = Uri.parse("package:$packageName")
                try {
                    startActivity(i)
                } catch (e: Exception) {
                    startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESSION_PERMISSION))
                }
            } else {
                toast("Tidak perlu izin ini di Android bawah 11")
            }
        }

        findViewById<Button>(R.id.btnSave).setOnClickListener {
            saveSettings()
            toast("Pengaturan disimpan")
            refresh()
        }
    }

    private fun saveSettings() {
        Config.setPort(this, etPort.text.toString().toIntOrNull() ?: Config.DEFAULT_PORT)
        Config.setFps(this, etFps.text.toString().toIntOrNull() ?: Config.DEFAULT_FPS)
        Config.setQuality(this, etQuality.text.toString().toIntOrNull() ?: Config.DEFAULT_QUALITY)
        Config.setWidth(this, etWidth.text.toString().toIntOrNull() ?: Config.DEFAULT_WIDTH)
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIF)
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_CAPTURE) return
        if (resultCode != RESULT_OK || data == null) {
            toast("Izin capture layar dibatalkan")
            return
        }
        val intent = Intent(this, CaptureService::class.java).apply {
            action = CaptureService.ACTION_START
            putExtra(CaptureService.EXTRA_RESULT_CODE, resultCode)
            putExtra(CaptureService.EXTRA_RESULT_DATA, data)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
        toast("Mirroring + server dijalankan")
        refresh()
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun refresh() {
        val running = CaptureService.isRunning
        tvStatus.text = if (running) "Server AKTIF" else "Server berhenti"
        tvStatus.setTextColor(
            ContextCompat.getColor(this, if (running) android.R.color.holo_green_light else android.R.color.holo_orange_light)
        )
        btnStop.isEnabled = running
        btnStart.isEnabled = !running

        val port = Config.getPort(this)
        tvUrl.text = "Akses dari device lain:\nhttp://${ipAddress()}:$port"

        tvControl.text = if (ControlService.isEnabled()) {
            "Kontrol sentuh: AKTIF"
        } else {
            "Kontrol sentuh: BELUM AKTIF - tekan \"Aktifkan Kontrol\""
        }
        tvStorage.text = if (FileManager.hasStoragePermission()) {
            "Izin semua berkas: OK"
        } else {
            "Izin semua berkas: BELUM - file browser dibatasi"
        }
    }

    private fun ipAddress(): String {
        return try {
            val en = java.net.NetworkInterface.getNetworkInterfaces()
            while (en.hasMoreElements()) {
                val intf = en.nextElement()
                if (intf.isLoopback || !intf.isUp) continue
                val addrs = intf.inetAddresses
                while (addrs.hasMoreElements()) {
                    val a = addrs.nextElement()
                    if (!a.isLoopbackAddress && a is java.net.Inet4Address) {
                        return a.hostAddress ?: "127.0.0.1"
                    }
                }
            }
            "127.0.0.1"
        } catch (e: Exception) {
            "127.0.0.1"
        }
    }

    private fun toast(msg: String) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
    }
}

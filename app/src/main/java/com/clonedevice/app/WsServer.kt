package com.clonedevice.app

import android.util.Log
import org.java_websocket.WebSocket
import org.java_websocket.handshake.ClientHandshake
import org.java_websocket.server.WebSocketServer
import org.json.JSONObject
import java.net.InetSocketAddress
import java.util.Collections

/**
 * Server WebSocket di device target. Menerima perintah dari client
 * dan mem-broadcast frame layar ke semua client yang terhubung.
 */
class WsServer(port: Int, private val handler: Handler) : WebSocketServer(InetSocketAddress(port)) {

    interface Handler {
        fun onCommand(conn: WebSocket?, msg: JSONObject?)
        fun onClientsChanged(count: Int)
    }

    private val conns: MutableSet<WebSocket> = Collections.synchronizedSet(mutableSetOf())

    override fun onOpen(conn: WebSocket?, handshake: ClientHandshake?) {
        if (conn == null) return
        conns.add(conn)
        Log.i(TAG, "client masuk: ${conn.remoteSocketAddress}")
        handler.onClientsChanged(conns.size)
    }

    override fun onClose(conn: WebSocket?, code: Int, reason: String?, remote: Boolean) {
        if (conn != null) conns.remove(conn)
        handler.onClientsChanged(conns.size)
    }

    override fun onMessage(conn: WebSocket?, message: String?) {
        val raw = message ?: return
        val msg = try {
            JSONObject(raw)
        } catch (e: Exception) {
            Log.w(TAG, "pesan bukan JSON: $raw")
            return
        }
        handler.onCommand(conn, msg)
    }

    override fun onError(conn: WebSocket?, ex: Exception?) {
        Log.e(TAG, "ws error: ${ex?.message}")
    }

    override fun onStart() {
        Log.i(TAG, "ws server start di port ${port}")
    }

    /** Kirim 1 frame layar (JPEG base64) ke semua client. */
    fun broadcastFrame(b64: String, mime: String, seq: Long) {
        val sb = StringBuilder(b64.length + 80)
        sb.append("{\"t\":\"frame\",\"mime\":\"").append(mime)
        sb.append("\",\"seq\":").append(seq)
        sb.append(",\"ts\":").append(System.currentTimeMillis())
        sb.append(",\"data\":\"").append(b64).append("\"}")
        broadcast(sb.toString())
    }

    fun broadcast(text: String) {
        val list = synchronized(conns) { conns.toList() }
        for (c in list) {
            try {
                if (c.isOpen) c.send(text)
            } catch (e: Exception) {
                Log.w(TAG, "gagal kirim: ${e.message}")
            }
        }
    }

    companion object {
        private const val TAG = "CloneWs"
    }
}

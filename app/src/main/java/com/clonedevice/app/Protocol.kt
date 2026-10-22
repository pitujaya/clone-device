package com.clonedevice.app

import android.content.Context
import android.os.Build
import android.util.DisplayMetrics
import android.view.WindowManager
import org.json.JSONArray
import org.json.JSONObject

/**
 * Pembuat pesan JSON sesuai PROTOCOL.md (lihat shared/PROTOCOL.md).
 */
object Protocol {

    fun hello(ctx: Context): String {
        val dm = DisplayMetrics()
        val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getRealMetrics(dm)

        val device = JSONObject()
            .put("name", Build.MODEL ?: "Android")
            .put("model", Build.DEVICE ?: "")
            .put("android", Build.VERSION.RELEASE ?: "")

        val screen = JSONObject()
            .put("w", dm.widthPixels)
            .put("h", dm.heightPixels)

        return JSONObject()
            .put("t", "hello")
            .put("device", device)
            .put("screen", screen)
            .put("fps", Config.getFps(ctx))
            .put("quality", Config.getQuality(ctx))
            .put("width", Config.getWidth(ctx))
            .toString()
    }

    fun pong(): String = JSONObject().put("t", "pong").toString()

    fun error(msg: String): String =
        JSONObject().put("t", "error").put("msg", msg).toString()

    fun ok(fields: Map<String, Any?>): String {
        val o = JSONObject().put("t", "ok")
        for ((k, v) in fields) o.put(k, v ?: JSONObject.NULL)
        return o.toString()
    }

    fun files(listing: FileManager.Listing): String {
        val arr = JSONArray()
        for (it in listing.items) {
            arr.put(
                JSONObject()
                    .put("name", it.name)
                    .put("path", it.path)
                    .put("dir", it.dir)
                    .put("size", it.size)
                    .put("mtime", it.mtime)
            )
        }
        return JSONObject()
            .put("t", "files")
            .put("path", listing.path)
            .put("list", arr)
            .toString()
    }

    fun file(f: FileManager.FileData): String =
        JSONObject()
            .put("t", "file")
            .put("path", f.path)
            .put("name", f.name)
            .put("mime", f.mime)
            .put("data", f.data)
            .toString()
}

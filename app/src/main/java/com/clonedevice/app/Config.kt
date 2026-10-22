package com.clonedevice.app

import android.content.Context
import android.content.SharedPreferences

/**
 * Pengaturan app yang disimpan di SharedPreferences.
 */
object Config {
    private const val PREFS = "clone_device"
    private const val KEY_PORT = "port"
    private const val KEY_FPS = "fps"
    private const val KEY_QUALITY = "quality"
    private const val KEY_WIDTH = "width"

    const val DEFAULT_PORT = 8080
    const val DEFAULT_FPS = 10
    const val DEFAULT_QUALITY = 55
    const val DEFAULT_WIDTH = 720

    private fun prefs(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun getPort(ctx: Context): Int = prefs(ctx).getInt(KEY_PORT, DEFAULT_PORT)    fun setPort(ctx: Context, v: Int) = prefs(ctx).edit().putInt(KEY_PORT, v.coerceIn(1024, 65535)).apply()

    fun getFps(ctx: Context): Int = prefs(ctx).getInt(KEY_FPS, DEFAULT_FPS)
    fun setFps(ctx: Context, v: Int) = prefs(ctx).edit().putInt(KEY_FPS, v.coerceIn(1, 30)).apply()

    fun getQuality(ctx: Context): Int = prefs(ctx).getInt(KEY_QUALITY, DEFAULT_QUALITY)
    fun setQuality(ctx: Context, v: Int) = prefs(ctx).edit().putInt(KEY_QUALITY, v.coerceIn(10, 100)).apply()

    fun getWidth(ctx: Context): Int = prefs(ctx).getInt(KEY_WIDTH, DEFAULT_WIDTH)
    fun setWidth(ctx: Context, v: Int) = prefs(ctx).edit().putInt(KEY_WIDTH, v.coerceIn(240, 1440)).apply()
}

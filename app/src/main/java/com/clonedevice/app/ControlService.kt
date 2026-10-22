package com.clonedevice.app

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.StrokeDescription

/**
 * AccessibilityService untuk kendali device:
 *  - tap / swipe  -> dispatchGesture
 *  - home / back / recents / notifikasi -> performGlobalAction
 *  - ketik teks / backspace -> ACTION_SET_TEXT pada input yang fokus
 *
 * User harus mengaktifkannya manual di Settings > Aksesibilitas.
 */
class ControlService : AccessibilityService() {

    companion object {
        private const val TAG = "CloneControl"
        private const val TAP_MS = 70L

        @Volatile
        var instance: ControlService? = null
            private set

        fun isEnabled(): Boolean = instance != null
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.i(TAG, "layanan aksesibilitas aktif")
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        super.onDestroy()
    }

    override fun onInterrupt() {}

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

    /* ---------------------- gestur ---------------------- */
    fun tap(x: Int, y: Int) {
        val path = Path().apply { moveTo(x.toFloat(), y.toFloat()) }
        val stroke = StrokeDescription(path, 0, TAP_MS)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        val ok = dispatchGesture(gesture, null, null)
        Log.i(TAG, "tap $x,$y -> $ok")
    }

    fun swipe(x1: Int, y1: Int, x2: Int, y2: Int, durationMs: Long) {
        val path = Path().apply {
            moveTo(x1.toFloat(), y1.toFloat())
            lineTo(x2.toFloat(), y2.toFloat())
        }
        val dur = durationMs.coerceIn(120L, 3000L)
        val stroke = StrokeDescription(path, 0, dur)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        val ok = dispatchGesture(gesture, null, null)
        Log.i(TAG, "swipe $x1,$y1 -> $x2,$y2 (${dur}ms) -> $ok")
    }

    fun global(action: Int) {
        val ok = performGlobalAction(action)
        Log.i(TAG, "global action $action -> $ok")
    }

    /* ---------------------- ketik ---------------------- */
    fun sendText(text: String) {
        if (text.isEmpty()) return
        val node = focusedInput()
        if (node == null) {
            Log.w(TAG, "tidak ada input yang fokus")
            return
        }
        val args = Bundle().apply {
            putCharSequence(
                AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                text
            )
        }
        val ok = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        Log.i(TAG, "setText -> $ok")
    }

    fun pressDelete() {
        val node = focusedInput() ?: return
        val cur = node.text?.toString() ?: return
        if (cur.isEmpty()) return
        val args = Bundle().apply {
            putCharSequence(
                AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                cur.dropLast(1)
            )
        }
        node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    /** Tekan Enter: cari tombol enter di keyboard (IME), lalu tap. */
    fun pressEnter() {
        val node = findEnterKey()
        if (node != null) {
            val b = Rect()
            node.getBoundsInScreen(b)
            if (b.width() > 0 && b.height() > 0) {
                tap(b.centerX(), b.centerY())
                return
            }
        }
        Log.w(TAG, "tombol enter tidak ditemukan di keyboard")
    }

    private fun focusedInput(): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        if (focused != null && focused.isEditable) return focused
        return null
    }

    /** Cari node enter di semua window (termasuk keyboard). */
    private fun findEnterKey(): AccessibilityNodeInfo? {
        val labels = listOf("enter", "newline", "return", "↵", "send", "done", "go", "search")
        val winList: List<android.view.accessibility.AccessibilityWindowInfo>? =
            try { windows } catch (e: Exception) { null }
        if (winList == null) return null
        for (w in winList) {
            val root = w.root ?: continue
            val hit = search(root, labels, 0)
            if (hit != null) return hit
        }
        return null
    }

    private fun search(node: AccessibilityNodeInfo, labels: List<String>, depth: Int): AccessibilityNodeInfo? {
        if (depth > 12) return null
        val texts = listOf(node.text?.toString(), node.contentDescription?.toString())
        for (t in texts) {
            if (t.isNullOrBlank()) continue
            val low = t.lowercase()
            if (labels.any { low == it }) return node
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val hit = search(child, labels, depth + 1)
            if (hit != null) return hit
        }
        return null
    }
}

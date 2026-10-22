package com.clonedevice.app

import android.os.Environment
import android.util.Base64
import android.webkit.MimeTypeMap
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException

/**
 * Akses file system device untuk file browser.
 * Butuh izin "Semua file" (MANAGE_EXTERNAL_STORAGE) agar bisa Jelajah
 * penyimpanan bersama.
 */
object FileManager {

    const val MAX_BYTES = 8L * 1024 * 1024

    data class Item(
        val name: String,
        val path: String,
        val dir: Boolean,
        val size: Long,
        val mtime: Long
    )

    data class Listing(val path: String, val items: List<Item>)

    data class FileData(
        val path: String,
        val name: String,
        val mime: String,
        val data: String
    )

    fun hasStoragePermission(): Boolean =
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            true
        }

    fun listDir(ctx: Context, path: String): Listing {
        val p = path.trim()
        if (p.isEmpty() || p == "/") return rootListing()

        val f = File(p)
        if (!f.exists()) throw FileNotFoundException("Path tidak ada: $p")
        if (!f.isDirectory) throw IOException("Bukan folder: $p")

        val children = f.listFiles() ?: emptyArray()
        val items = children
            .sortedWith(compareBy({ !it.isDirectory }, { it.name.lowercase() }))
            .map {
                Item(
                    name = it.name,
                    path = it.absolutePath,
                    dir = it.isDirectory,
                    size = if (it.isDirectory) 0L else it.length(),
                    mtime = it.lastModified()
                )
            }
        return Listing(f.absolutePath, items)
    }

    /** Daftar akar saat user membuka "/" */
    private fun rootListing(): Listing {
        val candidates = listOf(
            "/storage/emulated/0",
            "/sdcard",
            "/storage/self/primary",
            "/storage",
            "/"
        )
        val items = candidates
            .distinct()
            .map { File(it) }
            .filter { it.exists() }
            .map {
                Item(
                    name = if (it.absolutePath == "/") "/" else it.absolutePath,
                    path = it.absolutePath,
                    dir = true,
                    size = 0L,
                    mtime = it.lastModified()
                )
            }
        return Listing("/", items)
    }

    fun readFile(ctx: Context, path: String): FileData {
        val f = File(path.trim())
        if (!f.exists()) throw FileNotFoundException("File tidak ada: $path")
        if (f.isDirectory) throw IOException("Itu folder, bukan file")
        if (f.length() > MAX_BYTES) {
            throw IOException("File terlalu besar (maks ${MAX_BYTES / 1048576} MB)")
        }
        val bytes = f.readBytes()
        return FileData(
            path = f.absolutePath,
            name = f.name,
            mime = mimeOf(f.name),
            data = Base64.encodeToString(bytes, Base64.NO_WRAP)
        )
    }

    fun writeFile(ctx: Context, dir: String, name: String, base64: String): String {
        val target = File(dir.trim(), safeName(name))
        target.parentFile?.mkdirs()
        val bytes = try {
            Base64.decode(base64, Base64.DEFAULT)
        } catch (e: Exception) {
            throw IOException("Data file rusak")
        }
        if (bytes.size > MAX_BYTES) throw IOException("File terlalu besar")
        target.writeBytes(bytes)
        return target.absolutePath
    }

    fun delete(ctx: Context, path: String): String {
        val f = File(path.trim())
        if (!f.exists()) throw FileNotFoundException("Tidak ada: $path")
        val ok = if (f.isDirectory) f.deleteRecursively() else f.delete()
        if (!ok) throw IOException("Gagal hapus: $path")
        return f.absolutePath
    }

    private fun safeName(name: String): String {
        val clean = name.substringAfterLast('/').substringAfterLast('\\')
        if (clean.isEmpty() || clean == "." || clean == "..") throw IOException("Nama file tidak valid")
        return clean
    }

    private fun mimeOf(name: String): String {
        val ext = name.substringAfterLast('.', "").lowercase()
        MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)?.let { return it }
        return when (ext) {
            "txt" -> "text/plain"
            "md" -> "text/markdown"
            "json" -> "application/json"
            "csv" -> "text/csv"
            "log" -> "text/plain"
            else -> "application/octet-stream"
        }
    }
}

package com.moneytrack.capture.update

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import java.io.File

sealed interface DownloadState {
    data class Enqueued(val downloadId: Long, val file: File) : DownloadState
    data class Downloading(val downloadedBytes: Long, val totalBytes: Long) : DownloadState
    data class Ready(val file: File) : DownloadState
    data object Failed : DownloadState
}

fun updateApkFileName(versionName: String): String? = versionName
    .takeIf(UPDATE_VERSION_NAME_PATTERN::matches)
    ?.let { "MoneyTrack-$it.apk" }

class ApkDownloadManager(
    context: Context,
    private val preferences: UpdatePreferences,
) {
    private val appContext = context.applicationContext
    private val downloadManager = appContext.getSystemService(DownloadManager::class.java)

    fun enqueue(manifest: AndroidUpdateManifest): DownloadState = synchronized(DOWNLOAD_COORDINATION_LOCK) {
        if (!canEnqueueUpdateDownload(preferences.pendingDownload())) {
            return@synchronized DownloadState.Failed
        }
        val fileName = updateApkFileName(manifest.versionName) ?: return@synchronized DownloadState.Failed
        if (!isAllowedUpdateApkUrl(manifest.apkUrl)) return@synchronized DownloadState.Failed
        val destination = managedUpdateFile(appContext, fileName) ?: return@synchronized DownloadState.Failed

        try {
            if (destination.exists() && !destination.delete()) return@synchronized DownloadState.Failed
            val request = DownloadManager.Request(manifest.apkUrl.toUri())
                .setAllowedOverRoaming(false)
                .setMimeType(APK_MIME_TYPE)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setTitle("MoneyTrack ${manifest.versionName}")
                .setDestinationInExternalFilesDir(appContext, UPDATE_DIRECTORY, fileName)
            val downloadId = downloadManager.enqueue(request)
            preferences.recordDownload(downloadId, manifest.versionCode)
            DownloadState.Enqueued(downloadId, destination)
        } catch (_: Exception) {
            DownloadState.Failed
        }
    }

    fun query(manifest: AndroidUpdateManifest): DownloadState {
        val pending = preferences.pendingDownload() ?: return DownloadState.Failed
        if (pending.versionCode != manifest.versionCode) return DownloadState.Failed
        val fileName = updateApkFileName(manifest.versionName) ?: return DownloadState.Failed
        val destination = managedUpdateFile(appContext, fileName) ?: return DownloadState.Failed
        val cursor = runCatching {
            downloadManager.query(DownloadManager.Query().setFilterById(pending.downloadId))
        }.getOrNull() ?: return DownloadState.Failed

        cursor.use {
            if (!it.moveToFirst()) return DownloadState.Failed
            return when (it.getInt(it.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))) {
                DownloadManager.STATUS_SUCCESSFUL -> DownloadState.Ready(destination)
                DownloadManager.STATUS_PENDING,
                DownloadManager.STATUS_RUNNING,
                DownloadManager.STATUS_PAUSED,
                -> DownloadState.Downloading(
                    downloadedBytes = it.getLong(
                        it.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR),
                    ).coerceAtLeast(0L),
                    totalBytes = it.getLong(
                        it.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES),
                    ).coerceAtLeast(0L),
                )
                else -> DownloadState.Failed
            }
        }
    }

    fun registerCompletionReceiver(onComplete: (Long) -> Unit): BroadcastReceiver {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action != DownloadManager.ACTION_DOWNLOAD_COMPLETE) return
                val downloadId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
                if (downloadId >= 0L) onComplete(downloadId)
            }
        }
        ContextCompat.registerReceiver(
            appContext,
            receiver,
            IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        return receiver
    }

    fun unregisterCompletionReceiver(receiver: BroadcastReceiver) {
        appContext.unregisterReceiver(receiver)
    }

    fun discard(manifest: AndroidUpdateManifest) = synchronized(DOWNLOAD_COORDINATION_LOCK) {
        val pending = preferences.pendingDownload()
        if (pendingDownloadMatchesVersion(pending, manifest.versionCode)) {
            runCatching { downloadManager.remove(requireNotNull(pending).downloadId) }
            preferences.clearDownload()
        }
        deleteManagedUpdateFile(manifest)
    }

    fun discardPending(expected: PendingUpdateDownload) = synchronized(DOWNLOAD_COORDINATION_LOCK) {
        if (preferences.pendingDownload() != expected) return@synchronized
        runCatching { downloadManager.remove(expected.downloadId) }
        managedUpdateDirectory(appContext)
            ?.listFiles()
            .orEmpty()
            .filter(::isDirectManagedApk)
            .forEach { file -> runCatching { file.delete() } }
        preferences.clearDownload()
    }

    private fun deleteManagedUpdateFile(manifest: AndroidUpdateManifest) {
        updateApkFileName(manifest.versionName)
            ?.let { managedUpdateFile(appContext, it) }
            ?.takeIf(File::isFile)
            ?.delete()
    }

    private companion object {
        const val APK_MIME_TYPE = "application/vnd.android.package-archive"
    }
}

internal fun pendingDownloadMatchesVersion(
    pending: PendingUpdateDownload?,
    versionCode: Long,
): Boolean = pending?.versionCode == versionCode

internal fun canEnqueueUpdateDownload(pending: PendingUpdateDownload?): Boolean = pending == null

internal const val UPDATE_DIRECTORY = "android-updates"

internal fun managedUpdateFile(context: Context, fileName: String): File? {
    return runCatching {
        val directory = managedUpdateDirectory(context) ?: return@runCatching null
        val file = File(directory, fileName).canonicalFile
        file.takeIf { it.parentFile == directory && it.extension == "apk" }
    }.getOrNull()
}

private fun managedUpdateDirectory(context: Context): File? = runCatching {
    context.getExternalFilesDir(UPDATE_DIRECTORY)?.canonicalFile
}.getOrNull()

private fun isDirectManagedApk(file: File): Boolean = runCatching {
    file.isFile && file.extension == "apk" && file.canonicalFile.parentFile == file.parentFile?.canonicalFile
}.getOrDefault(false)

private val DOWNLOAD_COORDINATION_LOCK = Any()

internal fun isManagedUpdateFile(context: Context, file: File): Boolean {
    val directory = context.getExternalFilesDir(UPDATE_DIRECTORY)?.canonicalFile ?: return false
    val candidate = runCatching { file.canonicalFile }.getOrNull() ?: return false
    return candidate.parentFile == directory && candidate.extension == "apk"
}

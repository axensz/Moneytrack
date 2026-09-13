package com.moneytrack.capture.update

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import org.json.JSONArray
import org.json.JSONObject

data class PendingUpdateDownload(
    val downloadId: Long,
    val versionCode: Long,
)

class UpdatePreferences internal constructor(
    private val preferences: SharedPreferences,
    private val decoder: AndroidUpdateManifestDecoder = AndroidUpdateManifestDecoder(),
    private val nowMillis: () -> Long = System::currentTimeMillis,
) {
    fun shouldCheck(manual: Boolean): Boolean {
        if (manual) return true

        val lastSuccessfulCheck = preferences.getLong(KEY_LAST_SUCCESSFUL_CHECK, -1L)
        if (lastSuccessfulCheck < 0L) return true

        val now = nowMillis()
        return now < lastSuccessfulCheck ||
            now - lastSuccessfulCheck >= AUTOMATIC_CHECK_INTERVAL_MILLIS
    }

    fun recordSuccessfulCheck(result: UpdateCheckResult) {
        if (result is UpdateCheckResult.Failed) return

        preferences.edit {
            putLong(KEY_LAST_SUCCESSFUL_CHECK, nowMillis())
            when (result) {
                is UpdateCheckResult.Available -> putString(
                    KEY_AVAILABLE_MANIFEST,
                    encodeManifest(result.manifest),
                )
                UpdateCheckResult.Current -> remove(KEY_AVAILABLE_MANIFEST)
                UpdateCheckResult.Failed -> Unit
            }
        }
    }

    fun cachedAvailableManifest(): AndroidUpdateManifest? = preferences
        .getString(KEY_AVAILABLE_MANIFEST, null)
        ?.let(decoder::decode)

    fun recordDownload(downloadId: Long, versionCode: Long) {
        if (downloadId < 0L || versionCode <= 0L) return
        preferences.edit {
            putLong(KEY_DOWNLOAD_ID, downloadId)
            putLong(KEY_DOWNLOAD_VERSION_CODE, versionCode)
        }
    }

    fun pendingDownload(): PendingUpdateDownload? {
        val downloadId = preferences.getLong(KEY_DOWNLOAD_ID, -1L)
        val versionCode = preferences.getLong(KEY_DOWNLOAD_VERSION_CODE, -1L)
        return if (downloadId >= 0L && versionCode > 0L) {
            PendingUpdateDownload(downloadId, versionCode)
        } else {
            null
        }
    }

    fun clearDownload() {
        preferences.edit {
            remove(KEY_DOWNLOAD_ID)
            remove(KEY_DOWNLOAD_VERSION_CODE)
        }
    }

    private fun encodeManifest(manifest: AndroidUpdateManifest): String {
        val notes = JSONArray()
        manifest.releaseNotes.forEach(notes::put)
        return JSONObject()
            .put("schemaVersion", manifest.schemaVersion)
            .put("channel", manifest.channel)
            .put("versionCode", manifest.versionCode)
            .put("versionName", manifest.versionName)
            .put("apkUrl", manifest.apkUrl)
            .put("sha256", manifest.sha256)
            .put("sizeBytes", manifest.sizeBytes)
            .put("releaseNotes", notes)
            .toString()
    }

    companion object {
        const val AUTOMATIC_CHECK_INTERVAL_MILLIS = 24L * 60L * 60L * 1_000L
        private const val PREFERENCES_NAME = "moneytrack_android_updates"
        private const val KEY_LAST_SUCCESSFUL_CHECK = "last_successful_check"
        private const val KEY_AVAILABLE_MANIFEST = "available_manifest"
        private const val KEY_DOWNLOAD_ID = "download_id"
        private const val KEY_DOWNLOAD_VERSION_CODE = "download_version_code"

        fun create(context: Context): UpdatePreferences = UpdatePreferences(
            context.applicationContext.getSharedPreferences(
                PREFERENCES_NAME,
                Context.MODE_PRIVATE,
            ),
        )
    }
}

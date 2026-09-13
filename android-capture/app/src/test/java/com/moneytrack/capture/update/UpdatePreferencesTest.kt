package com.moneytrack.capture.update

import android.content.SharedPreferences
import java.lang.reflect.Proxy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdatePreferencesTest {
    private var now = 1_800_000_000_000L
    private val values = mutableMapOf<String, Any?>()
    private val preferences = UpdatePreferences(inMemoryPreferences(values)) { now }

    @Test
    fun `allows first and manual checks but throttles a recent automatic check`() {
        assertTrue(preferences.shouldCheck(manual = false))

        preferences.recordSuccessfulCheck(UpdateCheckResult.Current)

        assertFalse(preferences.shouldCheck(manual = false))
        assertTrue(preferences.shouldCheck(manual = true))
        now += UpdatePreferences.AUTOMATIC_CHECK_INTERVAL_MILLIS - 1
        assertFalse(preferences.shouldCheck(manual = false))
        now += 1
        assertTrue(preferences.shouldCheck(manual = false))
    }

    @Test
    fun `allows a safe retry when the wall clock moves backwards`() {
        preferences.recordSuccessfulCheck(UpdateCheckResult.Current)

        now -= 1

        assertTrue(preferences.shouldCheck(manual = false))
    }

    @Test
    fun `does not throttle after a failed check`() {
        preferences.recordSuccessfulCheck(UpdateCheckResult.Failed)

        assertTrue(preferences.shouldCheck(manual = false))
        assertNull(preferences.cachedAvailableManifest())
    }

    @Test
    fun `persists only validated non financial update metadata`() {
        val manifest = AndroidUpdateManifest(
            schemaVersion = 1,
            channel = "canary",
            versionCode = 3,
            versionName = "0.2.1",
            apkUrl =
                "https://github.com/axensz/Moneytrack/releases/download/android-quick-expense-0.2.1/" +
                    "MoneyTrack-Android-0.2.1.apk",
            sha256 = "d952d9448995f41faf4521ea4e6ee0bba04e71dbb7bda5f214d518add878dbdc",
            sizeBytes = 9_942_363,
            releaseNotes = listOf("Acceso rápido"),
        )

        preferences.recordSuccessfulCheck(UpdateCheckResult.Available(manifest))

        assertEquals(manifest, preferences.cachedAvailableManifest())
        assertEquals(setOf("last_successful_check", "available_manifest"), values.keys)

        preferences.recordSuccessfulCheck(UpdateCheckResult.Current)
        assertNull(preferences.cachedAvailableManifest())
    }

    @Test
    fun `stores only the download identity and version and clears them together`() {
        preferences.recordDownload(downloadId = 41L, versionCode = 3L)

        assertEquals(PendingUpdateDownload(downloadId = 41L, versionCode = 3L), preferences.pendingDownload())
        assertEquals(setOf("download_id", "download_version_code"), values.keys)

        preferences.clearDownload()
        assertNull(preferences.pendingDownload())
        assertTrue(values.isEmpty())
    }

    private fun inMemoryPreferences(values: MutableMap<String, Any?>): SharedPreferences =
        Proxy.newProxyInstance(
            SharedPreferences::class.java.classLoader,
            arrayOf(SharedPreferences::class.java),
        ) { _, method, arguments ->
            when (method.name) {
                "getLong" -> values[arguments!![0] as String] as? Long ?: arguments[1] as Long
                "getString" -> values[arguments!![0] as String] as? String ?: arguments[1] as String?
                "edit" -> editor(values)
                "contains" -> values.containsKey(arguments!![0] as String)
                "getAll" -> values.toMap()
                else -> error("Unexpected SharedPreferences call: ${method.name}")
            }
        } as SharedPreferences

    private fun editor(values: MutableMap<String, Any?>): SharedPreferences.Editor {
        lateinit var editor: SharedPreferences.Editor
        editor = Proxy.newProxyInstance(
            SharedPreferences.Editor::class.java.classLoader,
            arrayOf(SharedPreferences.Editor::class.java),
        ) { _, method, arguments ->
            when (method.name) {
                "putLong", "putString" -> editor.also {
                    values[arguments!![0] as String] = arguments[1]
                }
                "remove" -> editor.also { values.remove(arguments!![0] as String) }
                "clear" -> editor.also { values.clear() }
                "apply" -> null
                "commit" -> true
                else -> error("Unexpected SharedPreferences.Editor call: ${method.name}")
            }
        } as SharedPreferences.Editor
        return editor
    }
}

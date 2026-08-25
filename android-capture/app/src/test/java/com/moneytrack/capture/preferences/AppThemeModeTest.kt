package com.moneytrack.capture.preferences

import android.content.SharedPreferences
import com.moneytrack.capture.core.CaptureResultCode
import java.lang.reflect.Proxy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class AppThemeModeTest {
    @Test
    fun `wire values parse and invalid falls back to system`() {
        assertEquals(AppThemeMode.SYSTEM, AppThemeMode.fromWireValue("system"))
        assertEquals(AppThemeMode.LIGHT, AppThemeMode.fromWireValue("light"))
        assertEquals(AppThemeMode.DARK, AppThemeMode.fromWireValue("dark"))
        assertEquals(AppThemeMode.SYSTEM, AppThemeMode.fromWireValue("unexpected"))
    }

    @Test
    fun `theme mode persists independently from capture settings`() {
        val preferences = capturePreferences()

        preferences.captureEnabled = true
        preferences.setAllowedPackages(setOf("com.example.wallet"))
        preferences.appThemeMode = AppThemeMode.DARK

        assertEquals(AppThemeMode.DARK, preferences.appThemeMode)
        assertEquals(true, preferences.captureEnabled)
        assertEquals(setOf("com.example.wallet"), preferences.allowedPackages())
    }

    @Test
    fun `notification updates reuse one delivery generation until removal`() {
        val storedValues = mutableMapOf<String, Any?>()
        val preferences = capturePreferences(storedValues)
        val packageName = "com.example.bank"
        val notificationKey = "0|com.example.bank|purchase|42"

        assertEquals(
            1_000L,
            preferences.notificationDeliveryStartedAt(packageName, notificationKey, 1_000L),
        )
        assertEquals(
            1_000L,
            preferences.notificationDeliveryStartedAt(packageName, notificationKey, 2_000L),
        )

        preferences.forgetNotificationDelivery(packageName, notificationKey)

        assertEquals(
            3_000L,
            preferences.notificationDeliveryStartedAt(packageName, notificationKey, 3_000L),
        )
        assertFalse(storedValues.keys.any { it.contains(notificationKey) })
    }

    @Test
    fun `write failure survives irrelevant results and clears only after stored`() {
        val preferences = capturePreferences()

        preferences.recordCaptureResult(CaptureResultCode.WRITE_FAILED, recordedAtEpochMillis = 4_000L)
        assertEquals(4_000L, preferences.pendingSyncFailureAtEpochMillis)

        preferences.recordCaptureResult(CaptureResultCode.PACKAGE_NOT_ALLOWED, recordedAtEpochMillis = 5_000L)
        assertEquals(4_000L, preferences.pendingSyncFailureAtEpochMillis)

        preferences.recordCaptureResult(CaptureResultCode.STORED, recordedAtEpochMillis = 6_000L)
        assertNull(preferences.pendingSyncFailureAtEpochMillis)
        assertEquals(CaptureResultCode.STORED.name, preferences.lastResultCode)
    }

    private fun capturePreferences(
        values: MutableMap<String, Any?> = mutableMapOf(),
    ): CapturePreferences = CapturePreferences::class.java
        .getDeclaredConstructor(SharedPreferences::class.java)
        .apply { isAccessible = true }
        .newInstance(inMemoryPreferences(values))

    private fun inMemoryPreferences(values: MutableMap<String, Any?>): SharedPreferences =
        Proxy.newProxyInstance(
            javaClass.classLoader,
            arrayOf(SharedPreferences::class.java),
        ) { _, method, arguments ->
            when (method.name) {
                "getBoolean" -> values[arguments!![0]] as? Boolean ?: arguments[1]
                "getString" -> values[arguments!![0]] as? String ?: arguments[1]
                "getStringSet" -> (values[arguments!![0]] as? Set<*>)
                    ?.filterIsInstance<String>()
                    ?.toSet()
                    ?: arguments[1]
                "getLong" -> values[arguments!![0]] as? Long ?: arguments[1]
                "edit" -> editor(values)
                else -> error("Unexpected SharedPreferences call: ${method.name}")
            }
        } as SharedPreferences

    private fun editor(values: MutableMap<String, Any?>): SharedPreferences.Editor {
        lateinit var editor: SharedPreferences.Editor
        editor = Proxy.newProxyInstance(
            javaClass.classLoader,
            arrayOf(SharedPreferences.Editor::class.java),
        ) { _, method, arguments ->
            when (method.name) {
                "putBoolean", "putString", "putStringSet", "putLong" -> {
                    values[arguments!![0] as String] = arguments[1]
                    editor
                }
                "remove" -> {
                    values.remove(arguments!![0] as String)
                    editor
                }
                "apply" -> Unit
                "commit" -> true
                else -> error("Unexpected SharedPreferences.Editor call: ${method.name}")
            }
        } as SharedPreferences.Editor
        return editor
    }
}

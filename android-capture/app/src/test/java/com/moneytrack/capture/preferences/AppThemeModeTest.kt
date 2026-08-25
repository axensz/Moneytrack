package com.moneytrack.capture.preferences

import android.content.SharedPreferences
import java.lang.reflect.Proxy
import org.junit.Assert.assertEquals
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
        val preferences = CapturePreferences::class.java
            .getDeclaredConstructor(SharedPreferences::class.java)
            .apply { isAccessible = true }
            .newInstance(inMemoryPreferences())

        preferences.captureEnabled = true
        preferences.setAllowedPackages(setOf("com.example.wallet"))
        preferences.appThemeMode = AppThemeMode.DARK

        assertEquals(AppThemeMode.DARK, preferences.appThemeMode)
        assertEquals(true, preferences.captureEnabled)
        assertEquals(setOf("com.example.wallet"), preferences.allowedPackages())
    }

    private fun inMemoryPreferences(): SharedPreferences {
        val values = mutableMapOf<String, Any?>()
        return Proxy.newProxyInstance(
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
                "edit" -> editor(values)
                else -> error("Unexpected SharedPreferences call: ${method.name}")
            }
        } as SharedPreferences
    }

    private fun editor(values: MutableMap<String, Any?>): SharedPreferences.Editor {
        lateinit var editor: SharedPreferences.Editor
        editor = Proxy.newProxyInstance(
            javaClass.classLoader,
            arrayOf(SharedPreferences.Editor::class.java),
        ) { _, method, arguments ->
            when (method.name) {
                "putBoolean", "putString", "putStringSet" -> {
                    values[arguments!![0] as String] = arguments[1]
                    editor
                }
                "apply" -> Unit
                else -> error("Unexpected SharedPreferences.Editor call: ${method.name}")
            }
        } as SharedPreferences.Editor
        return editor
    }
}

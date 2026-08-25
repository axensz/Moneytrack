package com.moneytrack.capture.preferences

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import java.util.UUID

data class DiscoveredNotificationSource(
    val packageName: String,
    val label: String,
)

class CapturePreferences private constructor(
    private val preferences: SharedPreferences,
) {
    var captureEnabled: Boolean
        get() = preferences.getBoolean(KEY_CAPTURE_ENABLED, false)
        set(value) {
            preferences.edit { putBoolean(KEY_CAPTURE_ENABLED, value) }
        }

    fun allowedPackages(): Set<String> = preferences
        .getStringSet(KEY_ALLOWED_PACKAGES, emptySet())
        ?.toSet()
        .orEmpty()

    fun setAllowedPackages(packageNames: Set<String>) {
        val validPackages = packageNames.filterTo(mutableSetOf(), ::isValidPackageName)
        preferences.edit { putStringSet(KEY_ALLOWED_PACKAGES, validPackages) }
    }

    @Synchronized
    fun installationId(): String {
        preferences.getString(KEY_INSTALLATION_ID, null)?.let { return it }
        val installationId = UUID.randomUUID().toString()
        preferences.edit(commit = true) {
            putString(KEY_INSTALLATION_ID, installationId)
        }
        return installationId
    }

    fun rememberDiscoveredSource(packageName: String, label: String) {
        if (!isValidPackageName(packageName)) return
        val packages = preferences
            .getStringSet(KEY_DISCOVERED_PACKAGES, emptySet())
            ?.toMutableSet()
            ?: mutableSetOf()
        packages.add(packageName)
        val safeLabel = label.trim().take(MAX_LABEL_LENGTH).ifBlank { packageName }
        preferences.edit {
            putStringSet(KEY_DISCOVERED_PACKAGES, packages)
            putString(sourceLabelKey(packageName), safeLabel)
        }
    }

    fun discoveredSources(): List<DiscoveredNotificationSource> = preferences
        .getStringSet(KEY_DISCOVERED_PACKAGES, emptySet())
        .orEmpty()
        .filter(::isValidPackageName)
        .sorted()
        .map { packageName ->
            DiscoveredNotificationSource(
                packageName = packageName,
                label = preferences.getString(sourceLabelKey(packageName), packageName)
                    ?.take(MAX_LABEL_LENGTH)
                    .orEmpty()
                    .ifBlank { packageName },
            )
        }

    var lastResultCode: String?
        get() = preferences.getString(KEY_LAST_RESULT, null)
        set(value) {
            preferences.edit { putString(KEY_LAST_RESULT, value) }
        }

    companion object {
        private const val PREFERENCES_NAME = "moneytrack_capture_private"
        private const val KEY_CAPTURE_ENABLED = "capture_enabled"
        private const val KEY_ALLOWED_PACKAGES = "allowed_packages"
        private const val KEY_INSTALLATION_ID = "installation_id"
        private const val KEY_DISCOVERED_PACKAGES = "discovered_packages"
        private const val KEY_LAST_RESULT = "last_result_code"
        private const val SOURCE_LABEL_PREFIX = "source_label."
        private const val MAX_PACKAGE_LENGTH = 160
        private const val MAX_LABEL_LENGTH = 80
        private val PACKAGE_NAME = Regex("[A-Za-z0-9._]+")

        fun create(context: Context): CapturePreferences = CapturePreferences(
            context.applicationContext.getSharedPreferences(
                PREFERENCES_NAME,
                Context.MODE_PRIVATE,
            ),
        )

        private fun isValidPackageName(value: String): Boolean =
            value.isNotBlank() && value.length <= MAX_PACKAGE_LENGTH && PACKAGE_NAME.matches(value)

        private fun sourceLabelKey(packageName: String) = "$SOURCE_LABEL_PREFIX$packageName"
    }
}

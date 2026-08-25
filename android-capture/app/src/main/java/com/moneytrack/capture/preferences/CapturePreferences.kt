package com.moneytrack.capture.preferences

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.UUID

enum class AppThemeMode(val wireValue: String) {
    SYSTEM("system"),
    LIGHT("light"),
    DARK("dark"),
    ;

    companion object {
        fun fromWireValue(value: String?): AppThemeMode =
            entries.firstOrNull { it.wireValue == value } ?: SYSTEM
    }
}

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

    var appThemeMode: AppThemeMode
        get() = AppThemeMode.fromWireValue(preferences.getString(KEY_APP_THEME_MODE, null))
        set(value) {
            preferences.edit { putString(KEY_APP_THEME_MODE, value.wireValue) }
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

    @Synchronized
    fun notificationDeliveryStartedAt(
        packageName: String,
        notificationKey: String,
        postedAtEpochMillis: Long,
    ): Long {
        require(isValidPackageName(packageName)) { "Invalid source package" }
        require(notificationKey.isNotBlank()) { "Missing notification identity" }
        require(postedAtEpochMillis > 0) { "Invalid observed time" }

        val preferenceKey = notificationDeliveryKey(packageName, notificationKey)
        val currentStartedAt = preferences.getLong(preferenceKey, 0L)
        if (
            currentStartedAt > 0L &&
            timestampsAreWithinActiveDelivery(currentStartedAt, postedAtEpochMillis)
        ) {
            return currentStartedAt
        }
        preferences.edit(commit = true) {
            putLong(preferenceKey, postedAtEpochMillis)
        }
        return postedAtEpochMillis
    }

    fun forgetNotificationDelivery(packageName: String, notificationKey: String) {
        if (!isValidPackageName(packageName) || notificationKey.isBlank()) return
        preferences.edit(commit = true) {
            remove(notificationDeliveryKey(packageName, notificationKey))
        }
    }

    var lastResultCode: String?
        get() = preferences.getString(KEY_LAST_RESULT, null)
        set(value) {
            preferences.edit { putString(KEY_LAST_RESULT, value) }
        }

    companion object {
        private const val PREFERENCES_NAME = "moneytrack_capture_private"
        private const val KEY_CAPTURE_ENABLED = "capture_enabled"
        private const val KEY_APP_THEME_MODE = "app_theme_mode"
        private const val KEY_ALLOWED_PACKAGES = "allowed_packages"
        private const val KEY_INSTALLATION_ID = "installation_id"
        private const val KEY_DISCOVERED_PACKAGES = "discovered_packages"
        private const val KEY_LAST_RESULT = "last_result_code"
        private const val SOURCE_LABEL_PREFIX = "source_label."
        private const val NOTIFICATION_DELIVERY_PREFIX = "notification_delivery."
        private const val MAX_ACTIVE_DELIVERY_AGE_MILLIS = 24 * 60 * 60 * 1_000L
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

        private fun notificationDeliveryKey(packageName: String, notificationKey: String): String {
            val digest = MessageDigest.getInstance("SHA-256")
                .digest("$packageName|$notificationKey".toByteArray(StandardCharsets.UTF_8))
                .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
            return "$NOTIFICATION_DELIVERY_PREFIX$digest"
        }

        private fun timestampsAreWithinActiveDelivery(first: Long, second: Long): Boolean {
            val difference = if (first >= second) first - second else second - first
            return difference <= MAX_ACTIVE_DELIVERY_AGE_MILLIS
        }
    }
}

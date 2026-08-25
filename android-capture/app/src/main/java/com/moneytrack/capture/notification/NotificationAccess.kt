package com.moneytrack.capture.notification

import android.content.ComponentName
import android.content.Context
import android.provider.Settings

object NotificationAccess {
    fun isGranted(context: Context): Boolean {
        val enabledListeners = Settings.Secure.getString(
            context.contentResolver,
            ENABLED_NOTIFICATION_LISTENERS,
        ).orEmpty()
        val expected = ComponentName(context, MoneyNotificationListenerService::class.java)
        return enabledListeners
            .split(':')
            .mapNotNull(ComponentName::unflattenFromString)
            .any { it == expected }
    }

    private const val ENABLED_NOTIFICATION_LISTENERS = "enabled_notification_listeners"
}

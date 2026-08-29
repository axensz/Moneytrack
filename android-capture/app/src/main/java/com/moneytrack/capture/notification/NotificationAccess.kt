package com.moneytrack.capture.notification

import android.content.ComponentName
import android.content.Context
import android.provider.Settings
import android.service.notification.NotificationListenerService

object NotificationAccess {
    @Volatile
    var listenerConnected: Boolean = false
        private set

    @Volatile
    private var connectionObserver: ((Boolean) -> Unit)? = null

    fun isGranted(context: Context): Boolean {
        val enabledListeners = Settings.Secure.getString(
            context.contentResolver,
            ENABLED_NOTIFICATION_LISTENERS,
        ).orEmpty()
        return enabledListeners
            .split(':')
            .mapNotNull(ComponentName::unflattenFromString)
            .any { it == componentName(context) }
    }

    fun requestRebind(context: Context) {
        if (isGranted(context) && !listenerConnected) {
            NotificationListenerService.requestRebind(componentName(context))
        }
    }

    internal fun markListenerConnected(connected: Boolean) {
        if (listenerConnected == connected) return
        listenerConnected = connected
        connectionObserver?.invoke(connected)
    }

    internal fun observeConnection(observer: ((Boolean) -> Unit)?) {
        connectionObserver = observer
        observer?.invoke(listenerConnected)
    }

    private fun componentName(context: Context) =
        ComponentName(context, MoneyNotificationListenerService::class.java)

    private const val ENABLED_NOTIFICATION_LISTENERS = "enabled_notification_listeners"
}

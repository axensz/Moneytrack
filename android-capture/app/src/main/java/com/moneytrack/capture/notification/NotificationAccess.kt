package com.moneytrack.capture.notification

import android.content.ComponentName
import android.content.Context
import android.os.SystemClock
import android.provider.Settings
import android.service.notification.NotificationListenerService

object NotificationAccess {
    enum class ConnectionState { CONNECTED, CONNECTING, DISCONNECTED }

    /** True only between Android's connection and disconnection callbacks. */
    @Volatile
    var listenerConnected: Boolean = false
        private set

    @Volatile
    private var lastRebindRequestedAtElapsedMillis: Long? = null

    internal var clock: () -> Long = { SystemClock.elapsedRealtime() }
    internal var accessGrantedProvider: ((Context) -> Boolean)? = null
    internal var rebindRequest: (Context) -> Unit = { context ->
        NotificationListenerService.requestRebind(componentName(context))
    }

    @Volatile
    private var connectionObserver: ((Boolean) -> Unit)? = null

    fun isGranted(context: Context): Boolean {
        accessGrantedProvider?.let { return it(context) }
        val enabledListeners = Settings.Secure.getString(
            context.contentResolver,
            ENABLED_NOTIFICATION_LISTENERS,
        ).orEmpty()
        return enabledListeners
            .split(':')
            .mapNotNull(ComponentName::unflattenFromString)
            .any { it == componentName(context) }
    }

    /** Reading status must never start or extend a reconnection attempt. */
    fun connectionState(context: Context): ConnectionState = when {
        !isGranted(context) -> ConnectionState.DISCONNECTED
        listenerConnected -> ConnectionState.CONNECTED
        withinGraceWindow() -> ConnectionState.CONNECTING
        else -> ConnectionState.DISCONNECTED
    }

    fun requestRebind(context: Context) {
        if (!isGranted(context) || listenerConnected || withinGraceWindow()) return
        lastRebindRequestedAtElapsedMillis = clock()
        try {
            rebindRequest(context)
        } catch (_: RuntimeException) {
            // Android can revoke access between the check and the request.
            lastRebindRequestedAtElapsedMillis = null
        }
        connectionObserver?.invoke(listenerConnected)
    }

    internal fun markListenerConnected(connected: Boolean) {
        if (connected) lastRebindRequestedAtElapsedMillis = null
        if (listenerConnected == connected) return
        listenerConnected = connected
        connectionObserver?.invoke(connected)
    }

    internal fun observeConnection(observer: ((Boolean) -> Unit)?) {
        connectionObserver = observer
        observer?.invoke(listenerConnected)
    }

    internal fun resetForTesting() {
        listenerConnected = false
        lastRebindRequestedAtElapsedMillis = null
        connectionObserver = null
        clock = { SystemClock.elapsedRealtime() }
        accessGrantedProvider = null
        rebindRequest = { context -> NotificationListenerService.requestRebind(componentName(context)) }
    }

    private fun withinGraceWindow(): Boolean = lastRebindRequestedAtElapsedMillis?.let {
        clock() - it in 0 until GRACE_WINDOW_MILLIS
    } ?: false

    private fun componentName(context: Context) =
        ComponentName(context, MoneyNotificationListenerService::class.java)

    private const val ENABLED_NOTIFICATION_LISTENERS = "enabled_notification_listeners"
    internal const val GRACE_WINDOW_MILLIS = 9_000L
}

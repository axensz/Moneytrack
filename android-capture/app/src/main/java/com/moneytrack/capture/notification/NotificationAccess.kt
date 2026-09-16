package com.moneytrack.capture.notification

import android.content.ComponentName
import android.content.Context
import android.os.SystemClock
import android.provider.Settings
import android.service.notification.NotificationListenerService

object NotificationAccess {
    /**
     * Estado de conexión resuelto que consume la UI (aguas arriba en `CaptureSetupFlow`).
     *
     * - [CONNECTED]: `onListenerConnected()` se ejecutó y el listener está operable.
     * - [CONNECTING]: acceso concedido y reconexión normal en curso (dentro de la ventana de
     *   gracia o con un rebind recién solicitado); se trata como activo.
     * - [DISCONNECTED]: sin acceso, o acceso concedido pero listener genuinamente inoperante
     *   tras agotarse la ventana de gracia.
     */
    enum class ConnectionState { CONNECTED, CONNECTING, DISCONNECTED }

    /**
     * Bandera en memoria del proceso: refleja únicamente si `onListenerConnected()` se ejecutó
     * y aún no llegó `onListenerDisconnected()`/`onDestroy()`. Es un insumo, no la verdad
     * absoluta: el estado resuelto se calcula en [connectionState].
     */
    @Volatile
    var listenerConnected: Boolean = false
        private set

    /**
     * Marca temporal (vía [clock], `elapsedRealtime`) de la última conexión efectiva observada.
     * Se usa para la ventana de gracia que absorbe desconexiones/reciclados transitorios.
     * `0L` significa que aún no se ha observado ninguna conexión en este proceso.
     */
    @Volatile
    internal var lastConnectedAtElapsedMillis: Long = 0L
        private set

    /**
     * Marca temporal (vía [clock]) del último rebind solicitado. Permite tratar como activo
     * (CONNECTING) el intervalo inmediatamente posterior a un rebind proactivo.
     * `0L` significa que aún no se ha solicitado rebind en este proceso.
     */
    @Volatile
    private var lastRebindRequestedAtElapsedMillis: Long = 0L

    /**
     * Reloj inyectable para determinismo en pruebas unitarias JVM, donde
     * `SystemClock.elapsedRealtime()` puede no estar disponible. Por defecto usa el reloj real.
     */
    internal var clock: () -> Long = { SystemClock.elapsedRealtime() }

    /**
     * Hook interno para consultar el estado de acceso sin depender de un [Context] real. Se usa
     * en las pruebas de la ventana de gracia. Cuando es `null`, [connectionState] usa el
     * [Context] recibido (comportamiento de producción).
     */
    internal var accessGrantedProvider: ((Context) -> Boolean)? = null

    /**
     * Hook interno para ejecutar la solicitud de rebind real. Por defecto invoca el API estático
     * de Android [NotificationListenerService.requestRebind]. En pruebas unitarias JVM ese API
     * lanza `RuntimeException("Stub!")` (y [componentName] requiere un [Context] real), por lo que
     * las pruebas lo sustituyen por un no-op. Se restablece al valor de producción en
     * [resetForTesting].
     */
    internal var rebindRequest: (Context) -> Unit = { context ->
        NotificationListenerService.requestRebind(componentName(context))
    }

    /** Observa el estado de conexión resuelto (activo = CONNECTED/CONNECTING). */
    @Volatile
    private var connectionObserver: ((Boolean) -> Unit)? = null

    /**
     * Último estado activo/inactivo emitido al observador. Se usa para no emitir cambios
     * redundantes cuando la ventana de gracia mantiene el estado resuelto estable.
     */
    @Volatile
    private var lastEmittedActive: Boolean? = null

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

    /**
     * Estado de conexión resuelto. Combina el acceso concedido (fuente de verdad), la bandera
     * en memoria, la ventana de gracia y un rebind recién solicitado.
     *
     * Reglas:
     * - [listenerConnected] == true -> [ConnectionState.CONNECTED].
     * - acceso concedido y (dentro de la ventana de gracia o rebind recién solicitado) ->
     *   [ConnectionState.CONNECTING]. Además, si no hay conexión efectiva, se solicita un rebind
     *   proactivo idempotente.
     * - acceso concedido y ventana de gracia agotada sin reconexión -> [ConnectionState.DISCONNECTED].
     * - acceso no concedido -> [ConnectionState.DISCONNECTED] (el flujo prioriza NOTIFICATION_ACCESS
     *   aguas arriba); nunca se dispara rebind sin acceso.
     */
    fun connectionState(context: Context): ConnectionState {
        if (listenerConnected) {
            return ConnectionState.CONNECTED
        }
        if (!isGranted(context)) {
            return ConnectionState.DISCONNECTED
        }
        // Acceso concedido pero sin conexión efectiva: solicitar rebind proactivo (idempotente)
        // y tratar el estado como CONNECTING mientras la gracia siga vigente.
        requestRebind(context)
        return if (withinGraceWindow()) {
            ConnectionState.CONNECTING
        } else {
            ConnectionState.DISCONNECTED
        }
    }

    fun requestRebind(context: Context) {
        if (isGranted(context) && !listenerConnected) {
            lastRebindRequestedAtElapsedMillis = clock()
            rebindRequest(context)
        }
    }

    internal fun markListenerConnected(connected: Boolean) {
        if (connected) {
            lastConnectedAtElapsedMillis = clock()
        }
        if (listenerConnected == connected) return
        listenerConnected = connected
        // Al desconectar no se fuerza DISCONNECTED inmediato: la ventana de gracia (evaluada
        // en connectionState) decide si sigue activo mientras el acceso siga concedido.
        emitResolvedActive()
    }

    /**
     * Observa el estado resuelto (activo = CONNECTED/CONNECTING). Emite inmediatamente el
     * estado actual y luego solo los cambios distintos del estado resuelto.
     *
     * Nota: sin un [Context], el observador no puede consultar el acceso; usa la mejor
     * aproximación disponible (bandera + ventana de gracia + rebind). Los callers que necesiten
     * el estado exacto deben usar [connectionState] con su [Context].
     */
    internal fun observeConnection(observer: ((Boolean) -> Unit)?) {
        connectionObserver = observer
        lastEmittedActive = null
        emitResolvedActive()
    }

    /** Reinicia el estado en memoria. Pensado para aislar pruebas unitarias. */
    internal fun resetForTesting() {
        listenerConnected = false
        lastConnectedAtElapsedMillis = 0L
        lastRebindRequestedAtElapsedMillis = 0L
        lastEmittedActive = null
        clock = { SystemClock.elapsedRealtime() }
        accessGrantedProvider = null
        rebindRequest = { context -> NotificationListenerService.requestRebind(componentName(context)) }
    }

    /** True si estamos dentro de la ventana de gracia por conexión reciente o rebind reciente. */
    private fun withinGraceWindow(): Boolean {
        val now = clock()
        val sinceConnected = lastConnectedAtElapsedMillis != 0L &&
            now - lastConnectedAtElapsedMillis < GRACE_WINDOW_MILLIS
        val sinceRebind = lastRebindRequestedAtElapsedMillis != 0L &&
            now - lastRebindRequestedAtElapsedMillis < GRACE_WINDOW_MILLIS
        return sinceConnected || sinceRebind
    }

    /**
     * Estado resuelto aproximado sin [Context]: la bandera manda; si no, la ventana de gracia
     * lo mantiene activo (CONNECTING) hasta que expire.
     */
    private fun resolvedActiveWithoutContext(): Boolean =
        listenerConnected || withinGraceWindow()

    private fun emitResolvedActive() {
        val observer = connectionObserver ?: return
        val active = resolvedActiveWithoutContext()
        if (lastEmittedActive == active) return
        lastEmittedActive = active
        observer.invoke(active)
    }

    private fun componentName(context: Context) =
        ComponentName(context, MoneyNotificationListenerService::class.java)

    private const val ENABLED_NOTIFICATION_LISTENERS = "enabled_notification_listeners"

    /** Ventana de gracia (debounce) que absorbe desconexiones/reciclados transitorios. */
    internal const val GRACE_WINDOW_MILLIS = 9_000L
}

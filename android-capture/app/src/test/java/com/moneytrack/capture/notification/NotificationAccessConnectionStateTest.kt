package com.moneytrack.capture.notification

import android.content.Context
import android.content.ContextWrapper
import com.moneytrack.capture.notification.NotificationAccess.ConnectionState
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

/**
 * Pruebas unitarias deterministas de [NotificationAccess.connectionState] con reloj inyectable.
 *
 * Objetivo (tarea 4): cubrir el mapeo CONNECTED/CONNECTING/DISCONNECTED según la bandera en
 * memoria, el acceso concedido, la ventana de gracia y el rebind, y las transiciones de
 * [NotificationAccess.markListenerConnected] dentro y fuera de la ventana de gracia.
 *
 * Determinismo en JVM: se inyecta el reloj ([NotificationAccess.clock]) para controlar
 * `elapsedRealtime`, el proveedor de acceso ([NotificationAccess.accessGrantedProvider]) para
 * decidir el acceso sin un [Context] real, y un [NotificationAccess.rebindRequest] no-op que
 * cuenta invocaciones (para evitar la llamada estática de Android y aseverar el rebind proactivo).
 *
 * ------------------------------------------------------------------------------------------------
 * MATIZ IMPORTANTE (rebind vs. gracia) — comportamiento REAL del código corregido:
 *
 * `connectionState` invoca `requestRebind(context)` ANTES de evaluar `withinGraceWindow()`, y
 * `requestRebind` registra `lastRebindRequestedAtElapsedMillis = clock()` cada vez que el acceso
 * está concedido y la bandera es `false`. Por tanto, CADA llamada a `connectionState` con acceso
 * concedido y bandera `false` refresca la marca de rebind al "ahora", de modo que la ventana de
 * gracia por rebind SIEMPRE está vigente en el momento de la evaluación. Consecuencia: mientras el
 * acceso siga concedido y la bandera sea `false`, `connectionState` devuelve CONNECTING de forma
 * estable (rebind proactivo idempotente) y NUNCA cae a DISCONNECTED por esa vía, aunque hayamos
 * avanzado el reloj mucho más allá de `GRACE_WINDOW_MILLIS` respecto a la última conexión.
 *
 * Por eso el DISCONNECTED "limpio" y determinista se prueba por la única vía en que es alcanzable:
 * acceso NO concedido (sin rebind). El caso de acceso concedido documenta explícitamente que el
 * estado converge a CONNECTING (no oscila hacia pausa) incluso con el reloj muy avanzado.
 * ------------------------------------------------------------------------------------------------
 *
 * Validates: Requirements 2.2, 2.3, 3.2, 3.4
 */
class NotificationAccessConnectionStateTest {

    /**
     * `Context` placeholder no dereferenciado: con `accessGrantedProvider` y `rebindRequest`
     * inyectados, `connectionState` nunca invoca métodos sobre el contexto. `ContextWrapper(null)`
     * es una instancia concreta válida que sirve únicamente como argumento no nulo.
     */
    private val context: Context = ContextWrapper(null)

    /** Reloj determinista y controlable durante la prueba. */
    private var fakeNowMillis: Long = 1_000L

    /** Contador de invocaciones del rebind proactivo (para aseverar 0 sin acceso). */
    private var rebindInvocations: Int = 0

    @Before
    fun setUp() {
        NotificationAccess.resetForTesting()
        NotificationAccess.clock = { fakeNowMillis }
        // Rebind no-op que cuenta invocaciones: evita la llamada estática de Android (Stub!)
        // y el uso de un Context real.
        rebindInvocations = 0
        NotificationAccess.rebindRequest = { rebindInvocations++ }
    }

    @After
    fun tearDown() {
        NotificationAccess.resetForTesting()
    }

    // -------------------------------------------------------------------------
    // Mapeo básico CONNECTED / CONNECTING / DISCONNECTED
    // -------------------------------------------------------------------------

    /** Bandera conectada -> CONNECTED, independiente del reloj. */
    @Test
    fun `listener conectado resuelve CONNECTED independiente del reloj`() {
        NotificationAccess.accessGrantedProvider = { true }
        NotificationAccess.markListenerConnected(true)

        assertEquals(ConnectionState.CONNECTED, NotificationAccess.connectionState(context))

        // Avanzar el reloj mucho más allá de la ventana de gracia no cambia CONNECTED:
        // la bandera manda mientras el listener siga operable.
        fakeNowMillis += NotificationAccess.GRACE_WINDOW_MILLIS * 10
        assertEquals(ConnectionState.CONNECTED, NotificationAccess.connectionState(context))
        // Con la bandera en true nunca se solicita rebind proactivo.
        assertEquals("No debe solicitarse rebind con listener conectado", 0, rebindInvocations)
    }

    /**
     * Acceso concedido, bandera false y conexión reciente dentro de la gracia
     * (avance de reloj < GRACE_WINDOW_MILLIS) -> CONNECTING.
     */
    @Test
    fun `acceso concedido con conexion reciente dentro de la gracia resuelve CONNECTING`() {
        NotificationAccess.accessGrantedProvider = { true }
        NotificationAccess.markListenerConnected(true) // fija lastConnectedAt = fakeNow
        NotificationAccess.markListenerConnected(false) // el SO recicla el servicio

        // Avanzamos el reloj, pero seguimos dentro de la ventana de gracia por conexión.
        fakeNowMillis += NotificationAccess.GRACE_WINDOW_MILLIS - 1_000L

        assertEquals(ConnectionState.CONNECTING, NotificationAccess.connectionState(context))
        // El rebind proactivo idempotente se dispara al evaluar el estado sin conexión efectiva.
        assertEquals("Debe solicitarse rebind proactivo", 1, rebindInvocations)
    }

    /**
     * Acceso concedido, bandera false y arranque de proceso (sin conexión previa,
     * lastConnectedAt = 0): el rebind proactivo registra la marca de gracia por rebind y el
     * estado resuelve CONNECTING.
     */
    @Test
    fun `acceso concedido en arranque de proceso resuelve CONNECTING por rebind proactivo`() {
        NotificationAccess.accessGrantedProvider = { true }
        // Sin markListenerConnected: bandera inicial false, lastConnectedAt = 0.

        assertEquals(ConnectionState.CONNECTING, NotificationAccess.connectionState(context))
        assertEquals("Debe solicitarse rebind proactivo en arranque", 1, rebindInvocations)
    }

    /**
     * MATIZ del rebind/gracia (documentado en el encabezado): con acceso concedido y bandera
     * false, aunque avancemos el reloj MUCHO más allá de la gracia respecto a la última conexión,
     * `connectionState` NO cae a DISCONNECTED, porque `requestRebind` (llamado ANTES de evaluar la
     * gracia) refresca `lastRebindRequestedAt` al "ahora" en cada evaluación. El estado converge de
     * forma estable a CONNECTING (rebind proactivo idempotente), evitando la oscilación hacia
     * "pausado". Esto es el comportamiento REAL y deseado del fix.
     */
    @Test
    fun `acceso concedido con gracia por conexion agotada sigue CONNECTING por rebind proactivo`() {
        NotificationAccess.accessGrantedProvider = { true }
        NotificationAccess.markListenerConnected(true) // lastConnectedAt = fakeNow
        NotificationAccess.markListenerConnected(false)

        // Primera evaluación tras expirar la gracia por conexión: registra el rebind -> CONNECTING.
        fakeNowMillis += NotificationAccess.GRACE_WINDOW_MILLIS + 1_000L
        assertEquals(ConnectionState.CONNECTING, NotificationAccess.connectionState(context))

        // Segunda evaluación muy posterior (reloj avanzado > gracia también respecto al último
        // rebind): al volver a evaluar, requestRebind refresca de nuevo la marca -> sigue CONNECTING.
        fakeNowMillis += NotificationAccess.GRACE_WINDOW_MILLIS + 1_000L
        assertEquals(ConnectionState.CONNECTING, NotificationAccess.connectionState(context))

        // Dos evaluaciones sin conexión efectiva -> dos rebinds proactivos.
        assertEquals(2, rebindInvocations)
    }

    /**
     * Acceso NO concedido, bandera false -> DISCONNECTED y NO se dispara rebind.
     * Esta es la única vía determinista y limpia para observar DISCONNECTED (ver el matiz del
     * encabezado: con acceso concedido el rebind proactivo mantiene CONNECTING).
     */
    @Test
    fun `acceso no concedido resuelve DISCONNECTED sin disparar rebind`() {
        NotificationAccess.accessGrantedProvider = { false }
        // Aunque hubo una conexión reciente, sin acceso concedido el estado es DISCONNECTED.
        NotificationAccess.markListenerConnected(true)
        NotificationAccess.markListenerConnected(false)
        fakeNowMillis += 1_000L // aún dentro de la gracia por conexión

        assertEquals(ConnectionState.DISCONNECTED, NotificationAccess.connectionState(context))
        assertEquals("Nunca debe solicitarse rebind sin acceso concedido", 0, rebindInvocations)
    }

    // -------------------------------------------------------------------------
    // Transiciones de markListenerConnected(true/false) dentro y fuera de la gracia
    // -------------------------------------------------------------------------

    /**
     * markListenerConnected(true) luego (false) DENTRO de la gracia -> connectionState sigue
     * CONNECTING (la desconexión transitoria queda absorbida por la ventana de gracia).
     */
    @Test
    fun `transicion conectado a desconectado dentro de la gracia sigue CONNECTING`() {
        NotificationAccess.accessGrantedProvider = { true }
        NotificationAccess.markListenerConnected(true)
        assertEquals(ConnectionState.CONNECTED, NotificationAccess.connectionState(context))

        NotificationAccess.markListenerConnected(false)
        // Avance dentro de la ventana de gracia por conexión.
        fakeNowMillis += NotificationAccess.GRACE_WINDOW_MILLIS - 500L
        assertEquals(ConnectionState.CONNECTING, NotificationAccess.connectionState(context))
    }

    /**
     * markListenerConnected(true) luego (false) FUERA de la gracia por conexión -> connectionState
     * sigue CONNECTING mientras el acceso siga concedido, POR EL MATIZ del rebind proactivo (ver
     * encabezado). El DISCONNECTED genuino solo se observa cuando el acceso deja de estar
     * concedido; aquí verificamos que, tras revocar el acceso, el estado sí cae a DISCONNECTED.
     */
    @Test
    fun `transicion fuera de la gracia converge CONNECTING con acceso y DISCONNECTED sin acceso`() {
        NotificationAccess.accessGrantedProvider = { true }
        NotificationAccess.markListenerConnected(true)
        NotificationAccess.markListenerConnected(false)

        // Fuera de la ventana de gracia por conexión.
        fakeNowMillis += NotificationAccess.GRACE_WINDOW_MILLIS + 2_000L
        // Con acceso concedido, el rebind proactivo mantiene CONNECTING (no oscila hacia pausa).
        assertEquals(ConnectionState.CONNECTING, NotificationAccess.connectionState(context))

        // Si el acceso se revoca, el estado cae limpiamente a DISCONNECTED (sin rebind adicional).
        val rebindsBefore = rebindInvocations
        NotificationAccess.accessGrantedProvider = { false }
        assertEquals(ConnectionState.DISCONNECTED, NotificationAccess.connectionState(context))
        assertEquals(
            "No debe solicitarse rebind tras revocar el acceso",
            rebindsBefore,
            rebindInvocations,
        )
    }
}

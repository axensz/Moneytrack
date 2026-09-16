package com.moneytrack.capture.core

import android.content.Context
import android.content.ContextWrapper
import com.moneytrack.capture.core.CaptureSetupStep.LISTENER_CONNECTION
import com.moneytrack.capture.notification.NotificationAccess
import org.junit.After
import org.junit.Assert.assertNotEquals
import org.junit.Before
import org.junit.Test

/**
 * Prueba de EXPLORACIÓN de la condición de bug (Property 1: Bug Condition).
 *
 * Objetivo: surfacear contraejemplos que demuestren el bug ANTES del fix y, una vez implementado,
 * validar que el comportamiento esperado se cumple (tarea 3.5).
 *
 * DÓNDE VIVE EL FIX: el fix NO cambia `CaptureSetupFlow.resolve` para una bandera cruda dada
 * (`resolve(..., notificationListenerConnected = false)` sigue devolviendo `LISTENER_CONNECTION`,
 * lo cual es correcto y necesario para preservar la señal genuina). El fix vive en la DERIVACIÓN
 * del estado de conexión: `NotificationAccess.connectionState(context)` mapea "acceso concedido +
 * bandera en memoria `false` pero dentro de la ventana de gracia / rebind reciente" a `CONNECTING`
 * (activo), y la UI (`MainActivity`) deriva `listenerActive = (CONNECTED || CONNECTING)` que es lo
 * que alimenta a `resolve`.
 *
 * Por eso esta prueba ejercita el ESTADO RESUELTO (donde vive el fix): reproduce cada escenario de
 * la condición de bug a través de `NotificationAccess.connectionState(...)`, deriva
 * `listenerActive` y luego alimenta `resolve` con ese valor derivado. La condición de bug
 * (`isBugCondition`) se mantiene idéntica: acceso concedido + listener realmente operable +
 * bandera en memoria `listenerConnected = false`.
 *
 * CRÍTICO (tarea 1): esta prueba DEBE FALLAR sobre el código SIN corregir; su fallo confirma el
 * bug. Cuando pasa tras el fix, confirma que la condición de bug ya no produce
 * `LISTENER_CONNECTION` (tarea 3.5).
 *
 * Determinismo en JVM: se inyecta el reloj (`NotificationAccess.clock`), el proveedor de acceso
 * (`accessGrantedProvider`) y un `rebindRequest` no-op para evitar la llamada estática de Android
 * (`NotificationListenerService.requestRebind`) y el uso de un `Context` real.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3
 */
class CaptureListenerAutoPauseBugConditionTest {

    /**
     * `Context` placeholder no dereferenciado: con `accessGrantedProvider` y `rebindRequest`
     * inyectados, `connectionState` nunca invoca métodos sobre el contexto. `ContextWrapper(null)`
     * es una instancia concreta válida que sirve únicamente como argumento no nulo.
     */
    private val context: Context = ContextWrapper(null)

    /**
     * Entrada del flujo de captura para la propiedad.
     *
     * `listenerActuallyOperable` modela que el listener puede recibir/entregar notificaciones o se
     * reconecta de forma normal. Aquí acota la propiedad a las entradas que disparan el bug y, en
     * la derivación del estado resuelto, se traduce en "acceso concedido + dentro de la ventana de
     * gracia" (lo que `connectionState` debe resolver como activo).
     */
    private data class SetupInput(
        val signedIn: Boolean,
        val notificationAccessGranted: Boolean,
        val captureEnabled: Boolean,
        val allowedPackages: Set<String>,
        val listenerConnected: Boolean,
        val listenerActuallyOperable: Boolean,
    )

    /**
     * Condición de bug del diseño (SIN CAMBIOS):
     * notificationAccessGranted AND listenerActuallyOperable AND NOT listenerConnected.
     */
    private fun isBugCondition(input: SetupInput): Boolean =
        input.notificationAccessGranted &&
            input.listenerActuallyOperable &&
            !input.listenerConnected

    @Before
    fun setUp() {
        NotificationAccess.resetForTesting()
        // Reloj determinista y controlable.
        NotificationAccess.clock = { fakeNowMillis }
        // Rebind no-op: evita la llamada estática de Android (Stub!) y el uso del Context real.
        NotificationAccess.rebindRequest = { /* no-op en unit test */ }
    }

    @After
    fun tearDown() {
        NotificationAccess.resetForTesting()
    }

    private var fakeNowMillis: Long = 1_000L

    /**
     * Deriva `listenerActive` desde el estado resuelto, tal como lo hace `MainActivity`:
     * CONNECTED/CONNECTING -> true (activo), DISCONNECTED -> false.
     */
    private fun listenerActiveFromResolvedState(): Boolean =
        when (NotificationAccess.connectionState(context)) {
            NotificationAccess.ConnectionState.CONNECTED,
            NotificationAccess.ConnectionState.CONNECTING,
            -> true

            NotificationAccess.ConnectionState.DISCONNECTED -> false
        }

    private fun resolveWithResolvedState(input: SetupInput): CaptureSetupStep =
        CaptureSetupFlow.resolve(
            signedIn = input.signedIn,
            notificationAccessGranted = input.notificationAccessGranted,
            captureEnabled = input.captureEnabled,
            allowedPackages = input.allowedPackages,
            notificationListenerConnected = listenerActiveFromResolvedState(),
        )

    /**
     * Configura `NotificationAccess` para simular acceso concedido y una desconexión reciente
     * (dentro de la ventana de gracia): fija `lastConnectedAt` con `markListenerConnected(true)` y
     * luego pone la bandera en `false` con `markListenerConnected(false)`. El estado resuelto debe
     * ser CONNECTING mientras la gracia siga vigente.
     */
    private fun simulateRecycledWithAccessGranted() {
        NotificationAccess.accessGrantedProvider = { true }
        NotificationAccess.markListenerConnected(true) // fija lastConnectedAt en fakeNow
        NotificationAccess.markListenerConnected(false) // el SO recicla el servicio
        // Avanzamos un poco el reloj, aún dentro de la ventana de gracia.
        fakeNowMillis += 1_000L
    }

    /**
     * Simula el arranque del proceso: acceso concedido, bandera inicial `false` y sin conexión
     * previa. `connectionState` debe disparar el rebind proactivo (registrando el intervalo de
     * gracia por rebind) y devolver CONNECTING.
     */
    private fun simulateProcessStartWithAccessGranted() {
        NotificationAccess.accessGrantedProvider = { true }
        // Sin markListenerConnected: bandera inicial false, lastConnectedAt = 0.
    }

    /**
     * Property 1 (acotada): para toda entrada donde `isBugCondition` es true, el paso resuelto a
     * partir del ESTADO RESUELTO NO debe ser `LISTENER_CONNECTION`.
     */
    @Test
    fun `property - acceso concedido y listener operable no debe resolver LISTENER_CONNECTION`() {
        val allowlists = listOf(setOf("com.wallet"), setOf("com.wallet", "com.bank"))
        for (sources in allowlists) {
            val input = SetupInput(
                signedIn = true,
                notificationAccessGranted = true,
                captureEnabled = true,
                allowedPackages = sources,
                listenerConnected = false,
                listenerActuallyOperable = true,
            )
            check(isBugCondition(input)) { "El generador debe producir solo entradas de bug: $input" }
            simulateRecycledWithAccessGranted()
            val step = resolveWithResolvedState(input)
            assertNotEquals(
                "Contraejemplo (Property 1): con acceso concedido y listener operable, el estado " +
                    "resuelto no debe reportar pausa. Entrada=$input, paso=$step",
                LISTENER_CONNECTION,
                step,
            )
        }
    }

    /**
     * Caso 1 del diseño — Reciclado del servicio con acceso concedido.
     * El acceso nunca se revocó; el SO recicla el servicio y `listenerConnected` pasa a `false`,
     * pero el listener se reconecta de inmediato (dentro de la ventana de gracia -> CONNECTING).
     */
    @Test
    fun `caso reciclado del servicio con acceso concedido no debe reportar pausa`() {
        val input = SetupInput(
            signedIn = true,
            notificationAccessGranted = true,
            captureEnabled = true,
            allowedPackages = setOf("com.wallet"),
            listenerConnected = false,
            listenerActuallyOperable = true,
        )
        simulateRecycledWithAccessGranted()
        assertNotEquals(
            "Contraejemplo (reciclado): acceso concedido + reconexión dentro de la gracia resuelve " +
                "$LISTENER_CONNECTION",
            LISTENER_CONNECTION,
            resolveWithResolvedState(input),
        )
    }

    /**
     * Caso 2 del diseño — Arranque del proceso / recreación de la actividad.
     * El proceso arranca con el acceso concedido y la bandera inicial es `false` antes de que
     * `onListenerConnected()` se ejecute; el estado resuelto debe disparar rebind proactivo y
     * devolver CONNECTING dentro de la gracia.
     */
    @Test
    fun `caso arranque del proceso con acceso concedido no debe reportar pausa`() {
        val input = SetupInput(
            signedIn = true,
            notificationAccessGranted = true,
            captureEnabled = true,
            allowedPackages = setOf("com.wallet"),
            listenerConnected = false, // valor inicial en memoria, previo a onListenerConnected()
            listenerActuallyOperable = true,
        )
        simulateProcessStartWithAccessGranted()
        assertNotEquals(
            "Contraejemplo (arranque): bandera inicial false con acceso concedido resuelve " +
                "$LISTENER_CONNECTION",
            LISTENER_CONNECTION,
            resolveWithResolvedState(input),
        )
    }

    /**
     * Caso 3 del diseño — Ciclos repetidos (Xiaomi/HyperOS).
     * Alternancia conexión/desconexión con acceso concedido, siempre dentro de la ventana de
     * gracia: la resolución NO debe oscilar hacia "pausado" en los tramos operables.
     */
    @Test
    fun `caso ciclos repetidos con acceso concedido no debe oscilar hacia pausado`() {
        NotificationAccess.accessGrantedProvider = { true }
        // Secuencia de estados de la bandera en memoria durante los reciclados del SO.
        val flagCycle = listOf(true, false, true, false, false, true)
        for ((index, connectedFlag) in flagCycle.withIndex()) {
            NotificationAccess.markListenerConnected(connectedFlag)
            // El reloj avanza levemente en cada tramo, siempre dentro de la ventana de gracia.
            fakeNowMillis += 500L
            val input = SetupInput(
                signedIn = true,
                notificationAccessGranted = true,
                captureEnabled = true,
                allowedPackages = setOf("com.wallet"),
                listenerConnected = connectedFlag,
                // Durante todo el ciclo el acceso sigue concedido y el listener reconecta normalmente.
                listenerActuallyOperable = true,
            )
            // Solo los tramos con bandera en false cumplen la condición de bug.
            if (isBugCondition(input)) {
                assertNotEquals(
                    "Contraejemplo (ciclo #$index): oscilación hacia pausa con acceso concedido " +
                        "y listener operable. Entrada=$input",
                    LISTENER_CONNECTION,
                    resolveWithResolvedState(input),
                )
            }
        }
    }
}

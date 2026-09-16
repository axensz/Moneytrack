package com.moneytrack.capture.core

import com.moneytrack.capture.core.CaptureSetupStep.*
import org.junit.Assert.assertEquals
import org.junit.Test

class CaptureSetupFlowTest {
    @Test
    fun `setup progress follows the required priority`() {
        assertEquals(SESSION, resolve(signedIn = false, access = false, enabled = false, sources = emptySet()))
        assertEquals(NOTIFICATION_ACCESS, resolve(signedIn = true, access = false, enabled = false, sources = emptySet()))
        assertEquals(CAPTURE, resolve(signedIn = true, access = true, enabled = false, sources = setOf("wallet")))
        assertEquals(CAPTURE, resolve(signedIn = true, access = true, enabled = true, sources = emptySet()))
        assertEquals(
            LISTENER_CONNECTION,
            resolve(signedIn = true, access = true, enabled = true, sources = setOf("wallet")),
        )
        assertEquals(
            READY,
            resolve(
                signedIn = true,
                access = true,
                enabled = true,
                sources = setOf("wallet"),
                listenerConnected = true,
            ),
        )
    }

    /**
     * Insumo RESUELTO (tarea 3.2 / 4): el parámetro que consume `resolve` representa el estado de
     * conexión resuelto (`listenerActive`), derivado por el caller desde
     * `NotificationAccess.connectionState(...)` con el mapeo CONNECTED/CONNECTING -> true y
     * DISCONNECTED -> false. Con todo lo demás en orden:
     *  - `listenerActive = true` (CONNECTED/CONNECTING) -> READY (un reciclado transitorio cubierto
     *    por la ventana de gracia NO fuerza LISTENER_CONNECTION).
     *  - `listenerActive = false` (DISCONNECTED genuino tras la gracia) -> LISTENER_CONNECTION como
     *    señal genuina.
     * La prioridad de pasos y la cláusula `when` no cambian; solo cambia el SIGNIFICADO del insumo.
     */
    @Test
    fun `insumo resuelto activo resuelve READY y no muestra LISTENER_CONNECTION`() {
        assertEquals(
            READY,
            resolve(
                signedIn = true,
                access = true,
                enabled = true,
                sources = setOf("wallet"),
                listenerConnected = true, // CONNECTED/CONNECTING -> listenerActive = true
            ),
        )
    }

    @Test
    fun `insumo resuelto inactivo preserva la senal genuina de LISTENER_CONNECTION`() {
        assertEquals(
            LISTENER_CONNECTION,
            resolve(
                signedIn = true,
                access = true,
                enabled = true,
                sources = setOf("wallet"),
                listenerConnected = false, // DISCONNECTED genuino -> listenerActive = false
            ),
        )
    }

    @Test
    fun `insumo resuelto no invierte la prioridad de pasos anteriores`() {
        // Con insumo resuelto activo, los pasos de mayor prioridad siguen mandando.
        assertEquals(
            SESSION,
            resolve(signedIn = false, access = true, enabled = true, sources = setOf("wallet"), listenerConnected = true),
        )
        assertEquals(
            NOTIFICATION_ACCESS,
            resolve(signedIn = true, access = false, enabled = true, sources = setOf("wallet"), listenerConnected = true),
        )
        assertEquals(
            CAPTURE,
            resolve(signedIn = true, access = true, enabled = false, sources = setOf("wallet"), listenerConnected = true),
        )
        assertEquals(
            CAPTURE,
            resolve(signedIn = true, access = true, enabled = true, sources = emptySet(), listenerConnected = true),
        )
    }

    private fun resolve(
        signedIn: Boolean,
        access: Boolean,
        enabled: Boolean,
        sources: Set<String>,
        listenerConnected: Boolean = false,
    ) = CaptureSetupFlow.resolve(
        signedIn = signedIn,
        notificationAccessGranted = access,
        captureEnabled = enabled,
        allowedPackages = sources,
        notificationListenerConnected = listenerConnected,
    )
}

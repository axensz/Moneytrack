package com.moneytrack.capture.core

import com.moneytrack.capture.core.CaptureSetupStep.CAPTURE
import com.moneytrack.capture.core.CaptureSetupStep.LISTENER_CONNECTION
import com.moneytrack.capture.core.CaptureSetupStep.NOTIFICATION_ACCESS
import com.moneytrack.capture.core.CaptureSetupStep.READY
import com.moneytrack.capture.core.CaptureSetupStep.SESSION
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pruebas de PRESERVACIÓN (Property 2: Preservation).
 *
 * Objetivo: garantizar que, para toda entrada donde NO se cumple la condición de bug
 * (`isBugCondition(input) == false`), la resolución del flujo permanece INALTERADA tras el
 * fix, preservando la prioridad de pasos:
 *   SESSION → NOTIFICATION_ACCESS → CAPTURE → LISTENER_CONNECTION (genuino) → READY.
 *
 * Metodología observation-first:
 *   1. Se observa el comportamiento del código SIN corregir (`CaptureSetupFlow.resolve`
 *      actual) para las entradas de no-bug.
 *   2. Se fijan esas salidas reales en las aserciones de esta prueba.
 *   3. Tras el fix (tarea 3.6) estas MISMAS pruebas deben seguir pasando.
 *
 * Nota sobre el enfoque PBT: el módulo solo dispone de JUnit4 (sin librería de
 * property-testing). La propiedad de preservación se comprueba de forma acotada y
 * determinista generando combinaciones de (signedIn, access, enabled, sources,
 * connectionState) con un generador pseudoaleatorio de semilla fija, de modo que la
 * ejecución sea reproducible.
 *
 * Como el fix aún no existe, la comparación `original vs fixed` se fija observando la salida
 * actual de `resolve` (que hace las veces de referencia `resolveSetupStep_original`) y
 * afirmándola como el resultado esperado a preservar.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 */
class CaptureListenerAutoPausePreservationTest {

    /**
     * Estado de conexión resuelto que introducirá el fix. Sobre el código sin corregir el
     * único insumo real es la bandera cruda `listenerConnected`; aquí se modela el estado
     * para poder acotar la condición de bug y mapear a la señal booleana que consume `resolve`.
     */
    private enum class ConnectionState { CONNECTED, CONNECTING, DISCONNECTED }

    /**
     * Entrada del flujo de captura.
     *
     * `listenerConnected` es la bandera en memoria (insumo actual de `resolve`).
     * `listenerActuallyOperable` modela si el listener puede recibir/entregar notificaciones o
     * se reconecta de forma normal; se usa solo para clasificar la condición de bug.
     */
    private data class SetupInput(
        val signedIn: Boolean,
        val notificationAccessGranted: Boolean,
        val captureEnabled: Boolean,
        val allowedPackages: Set<String>,
        val connectionState: ConnectionState,
        val listenerActuallyOperable: Boolean,
    ) {
        /** Bandera cruda que hoy consume `resolve`: solo CONNECTED cuenta como conectado. */
        val listenerConnected: Boolean get() = connectionState == ConnectionState.CONNECTED
    }

    /**
     * Condición de bug del diseño:
     *   notificationAccessGranted AND listenerActuallyOperable AND NOT listenerConnected.
     */
    private fun isBugCondition(input: SetupInput): Boolean =
        input.notificationAccessGranted &&
            input.listenerActuallyOperable &&
            !input.listenerConnected

    /**
     * Referencia `resolveSetupStep_original`: la resolución del código SIN corregir.
     * Consume únicamente la bandera cruda `listenerConnected`.
     */
    private fun resolveOriginal(input: SetupInput): CaptureSetupStep =
        CaptureSetupFlow.resolve(
            signedIn = input.signedIn,
            notificationAccessGranted = input.notificationAccessGranted,
            captureEnabled = input.captureEnabled,
            allowedPackages = input.allowedPackages,
            notificationListenerConnected = input.listenerConnected,
        )

    /**
     * Referencia `resolveSetupStep_fixed`. El fix aún no existe (tarea 3), así que apunta a la
     * misma implementación actual. Tras el fix, esta prueba se re-ejecuta (tarea 3.6) y debe
     * seguir pasando para las entradas de no-bug, confirmando la preservación.
     */
    private fun resolveFixed(input: SetupInput): CaptureSetupStep = resolveOriginal(input)

    /**
     * Salida esperada según la prioridad actual del flujo, calculada de forma independiente a
     * `resolve` para que la aserción no sea tautológica: fija explícitamente el comportamiento
     * observado a preservar.
     */
    private fun expectedStep(input: SetupInput): CaptureSetupStep = when {
        !input.signedIn -> SESSION
        !input.notificationAccessGranted -> NOTIFICATION_ACCESS
        !input.captureEnabled || input.allowedPackages.isEmpty() -> CAPTURE
        !input.listenerConnected -> LISTENER_CONNECTION
        else -> READY
    }

    // -------------------------------------------------------------------------
    // Casos observados explícitos (fijados con observation-first)
    // -------------------------------------------------------------------------

    /** Req 3.1 — Acceso NO concedido → NOTIFICATION_ACCESS. */
    @Test
    fun `preservacion - acceso no concedido resuelve NOTIFICATION_ACCESS`() {
        val input = SetupInput(
            signedIn = true,
            notificationAccessGranted = false,
            captureEnabled = true,
            allowedPackages = setOf("com.wallet"),
            connectionState = ConnectionState.DISCONNECTED,
            listenerActuallyOperable = true,
        )
        check(!isBugCondition(input))
        assertEquals(NOTIFICATION_ACCESS, resolveOriginal(input))
        assertEquals(resolveOriginal(input), resolveFixed(input))
    }

    /** Req 3.4 — Sesión ausente → SESSION (máxima prioridad). */
    @Test
    fun `preservacion - sesion ausente resuelve SESSION`() {
        val input = SetupInput(
            signedIn = false,
            notificationAccessGranted = false,
            captureEnabled = false,
            allowedPackages = emptySet(),
            connectionState = ConnectionState.DISCONNECTED,
            listenerActuallyOperable = false,
        )
        check(!isBugCondition(input))
        assertEquals(SESSION, resolveOriginal(input))
        assertEquals(resolveOriginal(input), resolveFixed(input))
    }

    /** Req 3.4 — Captura deshabilitada → CAPTURE. */
    @Test
    fun `preservacion - captura deshabilitada resuelve CAPTURE`() {
        val input = SetupInput(
            signedIn = true,
            notificationAccessGranted = true,
            captureEnabled = false,
            allowedPackages = setOf("com.wallet"),
            connectionState = ConnectionState.CONNECTED,
            listenerActuallyOperable = true,
        )
        check(!isBugCondition(input))
        assertEquals(CAPTURE, resolveOriginal(input))
        assertEquals(resolveOriginal(input), resolveFixed(input))
    }

    /** Req 3.4 — Allowlist vacía → CAPTURE. */
    @Test
    fun `preservacion - allowlist vacia resuelve CAPTURE`() {
        val input = SetupInput(
            signedIn = true,
            notificationAccessGranted = true,
            captureEnabled = true,
            allowedPackages = emptySet(),
            connectionState = ConnectionState.CONNECTED,
            listenerActuallyOperable = true,
        )
        check(!isBugCondition(input))
        assertEquals(CAPTURE, resolveOriginal(input))
        assertEquals(resolveOriginal(input), resolveFixed(input))
    }

    /**
     * Req 3.2 — Acceso concedido + listener genuinamente inoperable (tras la ventana de
     * gracia) → LISTENER_CONNECTION como señal genuina. Este caso NO es bug condition porque
     * `listenerActuallyOperable = false`.
     */
    @Test
    fun `preservacion - listener genuinamente inoperable preserva senal LISTENER_CONNECTION`() {
        val input = SetupInput(
            signedIn = true,
            notificationAccessGranted = true,
            captureEnabled = true,
            allowedPackages = setOf("com.wallet"),
            connectionState = ConnectionState.DISCONNECTED,
            listenerActuallyOperable = false,
        )
        check(!isBugCondition(input))
        assertEquals(LISTENER_CONNECTION, resolveOriginal(input))
        assertEquals(resolveOriginal(input), resolveFixed(input))
    }

    /** Estado plenamente operativo → READY. */
    @Test
    fun `preservacion - todo concedido y conectado resuelve READY`() {
        val input = SetupInput(
            signedIn = true,
            notificationAccessGranted = true,
            captureEnabled = true,
            allowedPackages = setOf("com.wallet"),
            connectionState = ConnectionState.CONNECTED,
            listenerActuallyOperable = true,
        )
        check(!isBugCondition(input))
        assertEquals(READY, resolveOriginal(input))
        assertEquals(resolveOriginal(input), resolveFixed(input))
    }

    // -------------------------------------------------------------------------
    // Property 2: Preservation (acotada / determinista sobre todo el espacio no-bug)
    // -------------------------------------------------------------------------

    /**
     * Enumeración exhaustiva del espacio de entrada acotado:
     * (signedIn) × (access) × (enabled) × (sources) × (connectionState) × (operable).
     * Cubre de forma completa el dominio finito relevante para `resolve`.
     */
    private fun allInputs(): List<SetupInput> {
        val sourceSets = listOf(
            emptySet(),
            setOf("com.wallet"),
            setOf("com.wallet", "com.bank"),
        )
        val inputs = mutableListOf<SetupInput>()
        for (signedIn in listOf(true, false)) {
            for (access in listOf(true, false)) {
                for (enabled in listOf(true, false)) {
                    for (sources in sourceSets) {
                        for (state in ConnectionState.values()) {
                            for (operable in listOf(true, false)) {
                                inputs += SetupInput(
                                    signedIn = signedIn,
                                    notificationAccessGranted = access,
                                    captureEnabled = enabled,
                                    allowedPackages = sources,
                                    connectionState = state,
                                    listenerActuallyOperable = operable,
                                )
                            }
                        }
                    }
                }
            }
        }
        return inputs
    }

    /**
     * Property 2: para toda entrada donde NO se cumple la condición de bug,
     * resolveSetupStep_original(input) = resolveSetupStep_fixed(input), y coincide con la
     * prioridad de pasos observada. Enumeración exhaustiva del dominio acotado.
     */
    @Test
    fun `property - preservacion para toda entrada no-bug (enumeracion exhaustiva)`() {
        var checked = 0
        for (input in allInputs()) {
            if (isBugCondition(input)) continue
            checked++
            val original = resolveOriginal(input)
            val fixed = resolveFixed(input)
            assertEquals(
                "Preservacion violada (original != esperado). Entrada=$input",
                expectedStep(input),
                original,
            )
            assertEquals(
                "Preservacion violada (original != fixed). Entrada=$input",
                original,
                fixed,
            )
        }
        // Sanity: el espacio no-bug no debe estar vacío.
        check(checked > 0) { "El generador no produjo entradas de no-bug" }
    }

    /**
     * Variante pseudoaleatoria con semilla fija: genera combinaciones aleatorias de
     * (signedIn, access, enabled, sources, connectionState, operable) y verifica la propiedad
     * de preservación sobre las entradas de no-bug. Determinista por la semilla.
     */
    @Test
    fun `property - preservacion sobre combinaciones aleatorias con semilla fija`() {
        val random = java.util.Random(20240117L)
        val sourceSets = listOf(
            emptySet(),
            setOf("com.wallet"),
            setOf("com.wallet", "com.bank"),
            setOf("com.wallet", "com.bank", "com.pay"),
        )
        val states = ConnectionState.values()
        var checked = 0
        repeat(500) {
            val input = SetupInput(
                signedIn = random.nextBoolean(),
                notificationAccessGranted = random.nextBoolean(),
                captureEnabled = random.nextBoolean(),
                allowedPackages = sourceSets[random.nextInt(sourceSets.size)],
                connectionState = states[random.nextInt(states.size)],
                listenerActuallyOperable = random.nextBoolean(),
            )
            if (isBugCondition(input)) return@repeat
            checked++
            val original = resolveOriginal(input)
            val fixed = resolveFixed(input)
            assertEquals(
                "Preservacion violada (original != esperado). Entrada=$input",
                expectedStep(input),
                original,
            )
            assertEquals(
                "Preservacion violada (original != fixed). Entrada=$input",
                original,
                fixed,
            )
        }
        check(checked > 0) { "El generador aleatorio no produjo entradas de no-bug" }
    }
}

package com.moneytrack.capture.core

enum class CaptureSetupStep {
    SESSION,
    NOTIFICATION_ACCESS,
    CAPTURE,
    LISTENER_CONNECTION,
    READY,
}

object CaptureSetupFlow {
    /**
     * Resuelve el paso de configuración a mostrar según el estado actual.
     *
     * Prioridad (no cambia): [CaptureSetupStep.SESSION] →
     * [CaptureSetupStep.NOTIFICATION_ACCESS] → [CaptureSetupStep.CAPTURE] →
     * [CaptureSetupStep.LISTENER_CONNECTION] → [CaptureSetupStep.READY].
     *
     * @param notificationListenerConnected estado de conexión RESUELTO del
     *   listener (listener activo), NO la bandera cruda en memoria del proceso.
     *   El caller (`MainActivity`) debe derivar este booleano a partir de
     *   `NotificationAccess.connectionState(...)` con el mapeo:
     *   `CONNECTED`/`CONNECTING` → `true` (activo) y `DISCONNECTED` → `false`
     *   (inactivo). Así, un reciclado transitorio del servicio cubierto por la
     *   ventana de gracia no fuerza el paso [CaptureSetupStep.LISTENER_CONNECTION].
     *   La cláusula `when` es idéntica a la anterior: para un insumo booleano dado
     *   el resultado no cambia (preservación garantizada); solo cambia el
     *   SIGNIFICADO del valor que el caller debe suministrar (estado resuelto,
     *   no la bandera cruda).
     */
    fun resolve(
        signedIn: Boolean,
        notificationAccessGranted: Boolean,
        captureEnabled: Boolean,
        allowedPackages: Set<String>,
        notificationListenerConnected: Boolean,
    ): CaptureSetupStep = when {
        !signedIn -> CaptureSetupStep.SESSION
        !notificationAccessGranted -> CaptureSetupStep.NOTIFICATION_ACCESS
        !captureEnabled || allowedPackages.isEmpty() -> CaptureSetupStep.CAPTURE
        !notificationListenerConnected -> CaptureSetupStep.LISTENER_CONNECTION
        else -> CaptureSetupStep.READY
    }
}

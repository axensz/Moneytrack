package com.moneytrack.capture.core

enum class CaptureSetupStep {
    SESSION,
    NOTIFICATION_ACCESS,
    CAPTURE,
    LISTENER_CONNECTION,
    READY,
}

object CaptureSetupFlow {
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

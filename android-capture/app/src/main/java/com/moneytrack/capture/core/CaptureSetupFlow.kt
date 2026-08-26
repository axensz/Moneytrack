package com.moneytrack.capture.core

enum class CaptureSetupStep {
    SESSION,
    NOTIFICATION_ACCESS,
    CAPTURE,
    READY,
}

object CaptureSetupFlow {
    fun resolve(
        signedIn: Boolean,
        notificationAccessGranted: Boolean,
        captureEnabled: Boolean,
        allowedPackages: Set<String>,
    ): CaptureSetupStep = when {
        !signedIn -> CaptureSetupStep.SESSION
        !notificationAccessGranted -> CaptureSetupStep.NOTIFICATION_ACCESS
        !captureEnabled || allowedPackages.isEmpty() -> CaptureSetupStep.CAPTURE
        else -> CaptureSetupStep.READY
    }
}

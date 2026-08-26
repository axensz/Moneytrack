package com.moneytrack.capture.core

data class CaptureEligibilityState(
    val signedIn: Boolean,
    val captureEnabled: Boolean,
    val notificationAccessGranted: Boolean,
    val allowedPackages: Set<String>,
)

enum class CaptureEligibilityResult {
    SIGNED_OUT,
    CAPTURE_DISABLED,
    NOTIFICATION_ACCESS_MISSING,
    ALLOWLIST_EMPTY,
    PACKAGE_NOT_ALLOWED,
    READY,
}

object CaptureEligibility {
    fun evaluate(
        state: CaptureEligibilityState,
        sourcePackage: String,
    ): CaptureEligibilityResult = when {
        !state.signedIn -> CaptureEligibilityResult.SIGNED_OUT
        !state.captureEnabled -> CaptureEligibilityResult.CAPTURE_DISABLED
        !state.notificationAccessGranted -> CaptureEligibilityResult.NOTIFICATION_ACCESS_MISSING
        state.allowedPackages.isEmpty() -> CaptureEligibilityResult.ALLOWLIST_EMPTY
        sourcePackage !in state.allowedPackages -> CaptureEligibilityResult.PACKAGE_NOT_ALLOWED
        else -> CaptureEligibilityResult.READY
    }
}

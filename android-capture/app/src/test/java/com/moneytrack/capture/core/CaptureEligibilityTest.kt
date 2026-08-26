package com.moneytrack.capture.core

import org.junit.Assert.assertEquals
import org.junit.Test

class CaptureEligibilityTest {
    @Test
    fun `signed out state stops before every other setting`() {
        assertEquals(
            CaptureEligibilityResult.SIGNED_OUT,
            evaluate(signedIn = false),
        )
    }

    @Test
    fun `disabled capture is not ready`() {
        assertEquals(
            CaptureEligibilityResult.CAPTURE_DISABLED,
            evaluate(captureEnabled = false),
        )
    }

    @Test
    fun `missing notification access is explicit`() {
        assertEquals(
            CaptureEligibilityResult.NOTIFICATION_ACCESS_MISSING,
            evaluate(notificationAccessGranted = false),
        )
    }

    @Test
    fun `empty allowlist cannot capture`() {
        assertEquals(
            CaptureEligibilityResult.ALLOWLIST_EMPTY,
            evaluate(allowedPackages = emptySet()),
        )
    }

    @Test
    fun `wrong package is rejected before content inspection`() {
        assertEquals(
            CaptureEligibilityResult.PACKAGE_NOT_ALLOWED,
            evaluate(sourcePackage = "com.other.app"),
        )
    }

    @Test
    fun `ready state requires every precondition`() {
        assertEquals(CaptureEligibilityResult.READY, evaluate())
    }

    private fun evaluate(
        signedIn: Boolean = true,
        captureEnabled: Boolean = true,
        notificationAccessGranted: Boolean = true,
        allowedPackages: Set<String> = setOf("com.example.bank"),
        sourcePackage: String = "com.example.bank",
    ) = CaptureEligibility.evaluate(
        CaptureEligibilityState(
            signedIn = signedIn,
            captureEnabled = captureEnabled,
            notificationAccessGranted = notificationAccessGranted,
            allowedPackages = allowedPackages,
        ),
        sourcePackage,
    )
}

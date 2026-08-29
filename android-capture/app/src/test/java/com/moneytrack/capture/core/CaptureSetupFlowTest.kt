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

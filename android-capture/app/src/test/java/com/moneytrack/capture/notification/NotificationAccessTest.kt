package com.moneytrack.capture.notification

import org.junit.Assert.assertEquals
import org.junit.Test

class NotificationAccessTest {
    @Test
    fun `connection observer receives current state and distinct transitions`() {
        val observed = mutableListOf<Boolean>()
        try {
            NotificationAccess.observeConnection(null)
            NotificationAccess.markListenerConnected(false)

            NotificationAccess.observeConnection(observed::add)
            NotificationAccess.markListenerConnected(true)
            NotificationAccess.markListenerConnected(true)
            NotificationAccess.markListenerConnected(false)
            NotificationAccess.observeConnection(null)
            NotificationAccess.markListenerConnected(true)

            assertEquals(listOf(false, true, false), observed)
        } finally {
            NotificationAccess.observeConnection(null)
            NotificationAccess.markListenerConnected(false)
        }
    }
}

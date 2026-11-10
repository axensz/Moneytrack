package com.moneytrack.capture.notification

import android.content.ContextWrapper
import com.moneytrack.capture.notification.NotificationAccess.ConnectionState
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class NotificationAccessConnectionStateTest {
    private val context = ContextWrapper(null)
    private var now = 0L
    private var granted = true
    private var requests = 0

    @Before
    fun setUp() {
        NotificationAccess.resetForTesting()
        NotificationAccess.clock = { now }
        NotificationAccess.accessGrantedProvider = { granted }
        NotificationAccess.rebindRequest = { requests++ }
    }

    @After
    fun tearDown() = NotificationAccess.resetForTesting()

    @Test
    fun `permission alone is not a connection and reading status never requests one`() {
        repeat(3) {
            assertEquals(ConnectionState.DISCONNECTED, NotificationAccess.connectionState(context))
        }
        assertEquals(0, requests)
    }

    @Test
    fun `rebind expires even when status is read repeatedly`() {
        NotificationAccess.requestRebind(context)
        assertEquals(ConnectionState.CONNECTING, NotificationAccess.connectionState(context))
        now = NotificationAccess.GRACE_WINDOW_MILLIS - 1
        NotificationAccess.requestRebind(context)
        assertEquals(ConnectionState.CONNECTING, NotificationAccess.connectionState(context))
        now++
        repeat(3) {
            assertEquals(ConnectionState.DISCONNECTED, NotificationAccess.connectionState(context))
        }
        now += 86_400_000L
        assertEquals(ConnectionState.DISCONNECTED, NotificationAccess.connectionState(context))
        assertEquals(1, requests)
    }

    @Test
    fun `only a connection callback confirms capture and disconnect immediately clears it`() {
        val observed = mutableListOf<Boolean>()
        NotificationAccess.observeConnection(observed::add)
        NotificationAccess.markListenerConnected(true)
        assertEquals(ConnectionState.CONNECTED, NotificationAccess.connectionState(context))
        now += 86_400_000L
        assertEquals(ConnectionState.CONNECTED, NotificationAccess.connectionState(context))
        NotificationAccess.markListenerConnected(false)
        assertEquals(ConnectionState.DISCONNECTED, NotificationAccess.connectionState(context))
        assertEquals(listOf(false, true, false), observed)
    }

    @Test
    fun `revoked permission overrides a stale connected callback`() {
        NotificationAccess.markListenerConnected(true)
        granted = false
        assertEquals(ConnectionState.DISCONNECTED, NotificationAccess.connectionState(context))
        NotificationAccess.requestRebind(context)
        assertEquals(0, requests)
    }

    @Test
    fun `a failed rebind does not crash or claim to be connecting`() {
        now = 1_000L
        NotificationAccess.rebindRequest = { throw SecurityException("Access revoked") }
        NotificationAccess.requestRebind(context)
        assertEquals(ConnectionState.DISCONNECTED, NotificationAccess.connectionState(context))
    }

    @Test
    fun `a later explicit retry can reconnect after timeout`() {
        NotificationAccess.requestRebind(context)
        now += NotificationAccess.GRACE_WINDOW_MILLIS
        assertEquals(ConnectionState.DISCONNECTED, NotificationAccess.connectionState(context))
        NotificationAccess.requestRebind(context)
        assertEquals(2, requests)
        assertEquals(ConnectionState.CONNECTING, NotificationAccess.connectionState(context))
        NotificationAccess.markListenerConnected(true)
        NotificationAccess.requestRebind(context)
        assertEquals(2, requests)
        assertEquals(ConnectionState.CONNECTED, NotificationAccess.connectionState(context))
    }
}

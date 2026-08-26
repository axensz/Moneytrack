package com.moneytrack.capture.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthenticationUiStateTest {
    @Test
    fun `begin is single flight and clears an earlier failure`() {
        val failed = AuthenticationUiState(failure = AuthenticationResult.FAILED)
        val started = requireNotNull(failed.begin())

        assertTrue(started.inProgress)
        assertNull(started.failure)
        assertNull(started.begin())
    }

    @Test
    fun `completion exposes only failures and clears progress`() {
        val started = requireNotNull(AuthenticationUiState().begin())

        val failure = started.complete(AuthenticationResult.CONFIGURATION_MISSING)
        assertFalse(failure.inProgress)
        assertEquals(AuthenticationResult.CONFIGURATION_MISSING, failure.failure)

        val success = started.complete(AuthenticationResult.SIGNED_IN)
        assertFalse(success.inProgress)
        assertNull(success.failure)
    }
}

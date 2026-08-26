package com.moneytrack.capture.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CandidateFingerprintTest {
    @Test
    fun `same event produces the same document identity`() {
        val first = fingerprint()
        val retry = fingerprint()

        assertEquals(first, retry)
    }

    @Test
    fun `notification key and delivery generation change identity`() {
        assertNotEquals(fingerprint(), fingerprint(notificationKey = "other-key"))
        assertNotEquals(
            fingerprint(),
            fingerprint(deliveryStartedAtEpochMillis = 1_777_000_000_001L),
        )
    }

    @Test
    fun `identity is exactly 64 lowercase hexadecimal characters`() {
        val result = fingerprint()

        assertEquals(64, result.length)
        assertTrue(Regex("[a-f0-9]{64}").matches(result))
    }

    @Test
    fun `hash output contains no financial notification text`() {
        val rawLookingKey = "Compra $ 12.345 en Mercado con tarjeta 1234"
        val result = fingerprint(notificationKey = rawLookingKey)

        listOf("Compra", "12.345", "Mercado", "1234", "$").forEach { fragment ->
            assertFalse(result.contains(fragment, ignoreCase = true))
        }
    }

    private fun fingerprint(
        notificationKey: String = "notification-key",
        deliveryStartedAtEpochMillis: Long = 1_777_000_000_000L,
    ): String = CandidateFingerprint.create(
        deviceInstallId = "0b0e9e7b-46b3-4db6-b652-55aca1178ee4",
        packageName = "com.example.bank",
        notificationKey = notificationKey,
        deliveryStartedAtEpochMillis = deliveryStartedAtEpochMillis,
    )
}

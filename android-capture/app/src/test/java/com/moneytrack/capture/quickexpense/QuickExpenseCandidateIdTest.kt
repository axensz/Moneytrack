package com.moneytrack.capture.quickexpense

import java.security.SecureRandom
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class QuickExpenseCandidateIdTest {
    @Test
    fun `generates unique opaque lowercase identities`() {
        val generator = QuickExpenseCandidateId()
        val identities = List(100) { generator.generate() }

        assertEquals(100, identities.toSet().size)
        assertTrue(identities.all { Regex("[a-f0-9]{64}").matches(it) })
    }

    @Test
    fun `encodes exactly 32 injected random bytes as hexadecimal`() {
        val random = object : SecureRandom() {
            override fun nextBytes(bytes: ByteArray) {
                bytes.indices.forEach { index -> bytes[index] = index.toByte() }
            }
        }

        assertEquals(
            "000102030405060708090a0b0c0d0e0f" +
                "101112131415161718191a1b1c1d1e1f",
            QuickExpenseCandidateId(random).generate(),
        )
    }
}

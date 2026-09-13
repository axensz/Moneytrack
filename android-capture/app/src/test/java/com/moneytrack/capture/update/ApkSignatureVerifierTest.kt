package com.moneytrack.capture.update

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ApkSignatureVerifierTest {
    @Test
    fun `requires at least one valid signer in common`() {
        val first = "1".repeat(64)
        val second = "2".repeat(64)

        assertTrue(sameSigner(setOf(first, second), setOf(second)))
        assertTrue(sameSigner(setOf(second.uppercase()), setOf(second)))
        assertFalse(sameSigner(setOf(first), setOf(second)))
    }

    @Test
    fun `rejects empty and malformed signer sets`() {
        val signer = "a".repeat(64)

        assertFalse(sameSigner(emptySet(), setOf(signer)))
        assertFalse(sameSigner(setOf(signer), emptySet()))
        assertFalse(sameSigner(setOf("not-a-digest"), setOf("not-a-digest")))
    }
}

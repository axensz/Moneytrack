package com.moneytrack.capture.quickexpense

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class QuickExpenseHandoffTest {
    @Test
    fun `builds an opaque review URL from only the candidate identity`() {
        assertEquals(
            "https://axensz.github.io/Moneytrack/?view=transactions&reviewAndroid=$CANDIDATE_ID",
            QuickExpenseHandoff.url(CANDIDATE_ID),
        )
    }

    @Test
    fun `rejects malformed candidate identities`() {
        listOf("", "abc", "A".repeat(64), "g".repeat(64), "a".repeat(63), "a".repeat(65))
            .forEach { candidateId ->
                assertTrue(candidateId, runCatching { QuickExpenseHandoff.url(candidateId) }.isFailure)
            }
    }

    private companion object {
        const val CANDIDATE_ID =
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
}

package com.moneytrack.capture.core

import org.junit.Assert.assertEquals
import org.junit.Test

class SourceSelectionTest {
    @Test
    fun `removing one source preserves every other allowed source`() {
        assertEquals(
            setOf("com.nequi", "com.bancolombia"),
            SourceSelection.remove(
                allowedPackages = setOf("com.nequi", "com.bancolombia", "com.android.shell"),
                packageName = "com.android.shell",
            ),
        )
    }
}

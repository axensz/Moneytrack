package com.moneytrack.capture.core

import org.junit.Assert.assertEquals
import org.junit.Test

class SourceLabelResolverTest {
    @Test
    fun `resolves safe labels for synthetic real and unnamed sources`() {
        val testSource = "Fuente de prueba"
        val fallback = "Aplicación financiera"

        assertEquals(
            testSource,
            SourceLabelResolver.resolve("com.android.shell", "Shell", testSource, fallback),
        )
        assertEquals(
            "Bancolombia",
            SourceLabelResolver.resolve("com.bancolombia.app", "Bancolombia", testSource, fallback),
        )
        assertEquals(
            fallback,
            SourceLabelResolver.resolve("com.example.hidden", "com.example.hidden", testSource, fallback),
        )
        assertEquals(
            fallback,
            SourceLabelResolver.resolve("com.example.empty", "   ", testSource, fallback),
        )
    }
}

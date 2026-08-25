package com.moneytrack.capture.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class SourceLabelResolverTest {
    @Test
    fun `resolves safe labels for synthetic real and unnamed sources`() {
        val testSource = "Fuente de prueba"
        val fallback = "Aplicación detectada"

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

    @Test
    fun `observed labels cannot impersonate a reserved source or control display direction`() {
        val testSource = "Fuente de prueba"
        val fallback = "Aplicación detectada"
        val reservedLabels = setOf("Google Wallet")

        assertEquals(
            fallback,
            SourceLabelResolver.resolve(
                "com.example.impostor",
                "Google Wallet",
                testSource,
                fallback,
                reservedLabels,
            ),
        )
        assertEquals(
            fallback,
            SourceLabelResolver.resolve(
                "com.example.bidi",
                "Google\u202E Wallet",
                testSource,
                fallback,
                reservedLabels,
            ),
        )

        val sanitized = SourceLabelResolver.resolve(
            "com.example.bank",
            "Banco\u202E  Uno\n",
            testSource,
            fallback,
            reservedLabels,
        )
        assertEquals("Banco Uno", sanitized)
        assertFalse(sanitized.any { character ->
            Character.getType(character) == Character.CONTROL.toInt() ||
                Character.getType(character) == Character.FORMAT.toInt()
        })
    }
}

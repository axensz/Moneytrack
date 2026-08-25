package com.moneytrack.capture.core

import com.moneytrack.capture.preferences.DiscoveredNotificationSource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AvailableCaptureSourceCatalogTest {
    @Test
    fun `offers Google Wallet as the recommended known source when nothing was observed`() {
        val sources = AvailableCaptureSourceCatalog.options(emptyList(), emptySet())

        assertEquals(1, sources.size)
        assertEquals("com.google.android.apps.walletnfcrel", sources.single().packageName)
        assertEquals("Google Wallet", sources.single().label)
        assertEquals(CaptureSourceOrigin.KNOWN, sources.single().origin)
        assertFalse(sources.single().isSelected)
    }

    @Test
    fun `deduplicates Wallet and keeps other observed sources after it`() {
        val sources = AvailableCaptureSourceCatalog.options(
            observedSources = listOf(
                DiscoveredNotificationSource("com.banco.uno", "Banco Uno"),
                DiscoveredNotificationSource("com.google.android.apps.walletnfcrel", "Wallet"),
                DiscoveredNotificationSource("com.banco.dos", "Banco Dos"),
                DiscoveredNotificationSource("com.banco.uno", "Banco Uno repetido"),
            ),
            allowedPackages = emptySet(),
        )

        assertEquals(
            listOf(
                "com.google.android.apps.walletnfcrel",
                "com.banco.uno",
                "com.banco.dos",
            ),
            sources.map { it.packageName },
        )
        assertEquals("Google Wallet", sources.first().label)
        assertEquals(CaptureSourceOrigin.KNOWN, sources.first().origin)
        assertEquals(CaptureSourceOrigin.OBSERVED, sources[1].origin)
    }

    @Test
    fun `builds options without changing the allowed packages`() {
        val allowedPackages = mutableSetOf("com.banco.uno")

        val sources = AvailableCaptureSourceCatalog.options(
            observedSources = listOf(DiscoveredNotificationSource("com.banco.uno", "Banco Uno")),
            allowedPackages = allowedPackages,
        )

        assertEquals(setOf("com.banco.uno"), allowedPackages)
        assertFalse(sources.first().isSelected)
        assertTrue(sources[1].isSelected)
    }
}

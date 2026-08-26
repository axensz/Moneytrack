package com.moneytrack.capture.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PurchaseParserRouterTest {
    private val router = PurchaseParserRouter()

    @Test
    fun `routes only the official Wallet package to the Wallet parser`() {
        val wallet = router.parse(
            raw(
                packageName = AvailableCaptureSourceCatalog.GOOGLE_WALLET_PACKAGE,
                title = "OXXO EDS PORTAL DE NIQ",
                text = "COP2,600.00 with Oro",
            ),
            CANDIDATE_ID,
        ) as PurchaseParseResult.Accepted

        assertEquals("google-wallet-purchase", wallet.candidate.parserId)

        val impersonator = router.parse(
            raw(
                packageName = "com.example.wallet",
                title = "OXXO EDS PORTAL DE NIQ",
                text = "COP2,600.00 with Oro",
            ),
            CANDIDATE_ID,
        )
        assertTrue(impersonator is PurchaseParseResult.Rejected)
    }

    @Test
    fun `keeps the existing strict parser for other allowed sources`() {
        val result = router.parse(
            raw(
                packageName = "com.example.bank",
                title = "Movimiento",
                text = "Compra COP 12.345 en Librería Norte con tarjeta •••• 9876",
            ),
            CANDIDATE_ID,
        ) as PurchaseParseResult.Accepted

        assertEquals("strict-cop-purchase", result.candidate.parserId)
        assertEquals("9876", result.candidate.cardLast4)
    }

    private fun raw(
        packageName: String,
        title: String,
        text: String,
    ) = RawNotification(
        packageName = packageName,
        notificationKey = "purchase",
        postedAtEpochMillis = 1_777_000_000_000L,
        title = title,
        text = text,
        bigText = null,
        subText = null,
    )

    companion object {
        private const val CANDIDATE_ID =
            "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    }
}

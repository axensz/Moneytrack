package com.moneytrack.capture.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GoogleWalletPurchaseParserTest {
    private val parser = GoogleWalletPurchaseParser()

    @Test
    fun `parses both approved Google Wallet fixtures`() {
        assertWallet(
            title = "TIENDA D1 ESTACION NIQ",
            body = "COP13,990.00 with MamáDébito",
            amountMinor = 1_399_000L,
            merchant = "TIENDA D1 ESTACION NIQ",
            observedLabel = "MamáDébito",
        )
        assertWallet(
            title = "OXXO EDS PORTAL DE NIQ",
            body = "COP2,600.00 with Oro",
            amountMinor = 260_000L,
            merchant = "OXXO EDS PORTAL DE NIQ",
            observedLabel = "Oro",
        )
    }

    @Test
    fun `parses the unambiguous Colombian localized variant`() {
        assertWallet(
            title = "TIENDA D1 ESTACION NIQ",
            body = "COP 13.990,00 con Oro",
            amountMinor = 1_399_000L,
            merchant = "TIENDA D1 ESTACION NIQ",
            observedLabel = "Oro",
        )
    }

    @Test
    fun `accepts the purchase but omits an invalid nickname hint`() {
        listOf("Oro-2", "EsteApodoTieneMasDeVeinticuatroLetras").forEach { label ->
            val result = accepted(body = "COP2,600.00 with $label")
            assertNull(result.candidate.observedInstrumentLabel)
        }
    }

    @Test
    fun `rejects ambiguous malformed nonpositive and non COP bodies`() {
        listOf(
            "COP2,600 with Oro",
            "COP0.00 with Oro",
            "COP-2,600.00 with Oro",
            "USD2,600.00 with Oro",
        ).forEach { body ->
            assertTrue(parser.parse(raw(body = body), CANDIDATE_ID) is PurchaseParseResult.Rejected)
        }
    }

    @Test
    fun `rejects two different valid expanded bodies instead of guessing`() {
        val result = parser.parse(
            raw(
                body = "COP2,600.00 with Oro",
                bigText = "COP13,990.00 with MamáDébito",
            ),
            CANDIDATE_ID,
        )

        assertRejected(result, PurchaseParseCode.AMBIGUOUS_AMOUNT)
    }

    @Test
    fun `requires a usable individual merchant title`() {
        val result = parser.parse(raw(title = "  ", body = "COP2,600.00 with Oro"), CANDIDATE_ID)

        assertTrue(result is PurchaseParseResult.Rejected)
    }

    private fun assertWallet(
        title: String,
        body: String,
        amountMinor: Long,
        merchant: String,
        observedLabel: String,
    ) {
        val candidate = accepted(title, body).candidate
        assertEquals(2, candidate.schemaVersion)
        assertEquals(amountMinor, candidate.amountMinor)
        assertEquals(merchant, candidate.merchant)
        assertEquals(observedLabel, candidate.observedInstrumentLabel)
        assertNull(candidate.cardLast4)
        assertEquals("google-wallet-purchase", candidate.parserId)
        assertEquals(1, candidate.parserVersion)
        assertEquals(PurchaseConfidence.MEDIUM, candidate.confidence)
    }

    private fun accepted(
        title: String = "OXXO EDS PORTAL DE NIQ",
        body: String,
    ) = parser.parse(raw(title = title, body = body), CANDIDATE_ID) as PurchaseParseResult.Accepted

    private fun raw(
        title: String = "OXXO EDS PORTAL DE NIQ",
        body: String,
        bigText: String? = null,
    ) = RawNotification(
        packageName = AvailableCaptureSourceCatalog.GOOGLE_WALLET_PACKAGE,
        notificationKey = "wallet-purchase",
        postedAtEpochMillis = 1_777_000_000_000L,
        title = title,
        text = body,
        bigText = bigText,
        subText = null,
    )

    private fun assertRejected(result: PurchaseParseResult, expectedCode: PurchaseParseCode) {
        assertTrue(result is PurchaseParseResult.Rejected)
        assertEquals(expectedCode, (result as PurchaseParseResult.Rejected).code)
    }

    companion object {
        private const val CANDIDATE_ID =
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
}

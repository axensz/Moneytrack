package com.moneytrack.capture.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class StrictCopPurchaseParserTest {
    private val parser = StrictCopPurchaseParser()

    @Test
    fun `accepts Colombian pesos with thousands and decimal separators`() {
        val result = parser.parse(
            raw(text = "Pagaste $ 12.345,67 en Mercado Central con tarjeta terminada en 1234"),
            CANDIDATE_ID,
        )

        assertTrue(result is PurchaseParseResult.Accepted)
        val candidate = (result as PurchaseParseResult.Accepted).candidate
        assertEquals(1_234_567L, candidate.amountMinor)
        assertEquals("COP", candidate.currency)
        assertEquals("Mercado Central", candidate.merchant)
        assertEquals("1234", candidate.cardLast4)
        assertEquals(PurchaseConfidence.HIGH, candidate.confidence)
    }

    @Test
    fun `accepts COP whole pesos without inventing decimals`() {
        val result = parser.parse(
            raw(text = "Compra COP 12.345 en Librería Norte con tarjeta •••• 9876"),
            CANDIDATE_ID,
        ) as PurchaseParseResult.Accepted

        assertEquals(1_234_500L, result.candidate.amountMinor)
        assertEquals("Librería Norte", result.candidate.merchant)
        assertEquals("9876", result.candidate.cardLast4)
    }

    @Test
    fun `normalizes merchant whitespace and card suffix`() {
        val result = parser.parse(
            raw(
                title = "Consumo aprobado",
                text = "Compra por $ 9.900 en   Café   del Parque   con tu tarjeta finalizada en 4321.",
            ),
            CANDIDATE_ID,
        ) as PurchaseParseResult.Accepted

        assertEquals("Café del Parque", result.candidate.merchant)
        assertEquals("4321", result.candidate.cardLast4)
        assertEquals(PurchaseConfidence.HIGH, result.candidate.confidence)
    }

    @Test
    fun `uses medium confidence when last four are absent`() {
        val result = parser.parse(
            raw(text = "Pago realizado por COP 45.000 en Supermercado Uno"),
            CANDIDATE_ID,
        ) as PurchaseParseResult.Accepted

        assertEquals("Supermercado Uno", result.candidate.merchant)
        assertNull(result.candidate.cardLast4)
        assertEquals(PurchaseConfidence.MEDIUM, result.candidate.confidence)
    }

    @Test
    fun `rejects two candidate amounts instead of guessing`() {
        val result = parser.parse(
            raw(text = "Compra por $ 12.345 en Tienda Uno, saldo COP 50.000"),
            CANDIDATE_ID,
        )

        assertRejected(result, PurchaseParseCode.AMBIGUOUS_AMOUNT)
    }

    @Test
    fun `rejects rejection reversal and security markers even with a COP amount`() {
        listOf(
            "Compra rechazada por $ 12.000",
            "Compra declinada por COP 12.000",
            "Compra fallida por $ 12.000",
            "Compra anulada por COP 12.000",
            "Compra reversada por $ 12.000",
            "Código para compra $ 12.000",
            "Clave para compra COP 12.000",
            "OTP para compra $ 12.000",
        ).forEach { notificationText ->
            assertRejected(
                parser.parse(raw(text = notificationText), CANDIDATE_ID),
                PurchaseParseCode.FORBIDDEN_MARKER,
            )
        }
    }

    @Test
    fun `rejects USD and other non-COP amounts`() {
        val result = parser.parse(
            raw(text = "Compra USD 12.34 en Online Store"),
            CANDIDATE_ID,
        )

        assertRejected(result, PurchaseParseCode.UNSUPPORTED_CURRENCY)
    }

    @Test
    fun `rejects malformed or non-positive money`() {
        listOf(
            "Compra por $ 12.34.56 en Tienda",
            "Compra por COP 0 en Tienda",
            "Compra por $ -12.000 en Tienda",
        ).forEach { notificationText ->
            val result = parser.parse(raw(text = notificationText), CANDIDATE_ID)
            assertFalse(result is PurchaseParseResult.Accepted)
        }
    }

    @Test
    fun `requires an explicit purchase marker`() {
        val result = parser.parse(
            raw(text = "Movimiento por COP 12.000 en Tienda Uno"),
            CANDIDATE_ID,
        )

        assertRejected(result, PurchaseParseCode.NO_PURCHASE_MARKER)
    }

    private fun raw(
        title: String? = null,
        text: String? = null,
    ) = RawNotification(
        packageName = "com.example.bank",
        notificationKey = "notification-key",
        postedAtEpochMillis = 1_777_000_000_000L,
        title = title,
        text = text,
        bigText = null,
        subText = null,
    )

    private fun assertRejected(
        result: PurchaseParseResult,
        expectedCode: PurchaseParseCode,
    ) {
        assertTrue(result is PurchaseParseResult.Rejected)
        assertEquals(expectedCode, (result as PurchaseParseResult.Rejected).code)
    }

    companion object {
        private const val CANDIDATE_ID =
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
}

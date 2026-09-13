package com.moneytrack.capture.quickexpense

import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class QuickExpenseFormValidatorTest {
    private val valid = QuickExpenseFormInput(
        merchant = "Almuerzo",
        date = LocalDate.of(2026, 9, 13),
        amount = "13.990",
        category = "Comida",
        accountId = "cash-1",
    )

    @Test
    fun `parses explicit Colombian peso formats without Double`() {
        assertEquals(1_399_000L, parseCopAmountMinor("13.990"))
        assertEquals(1_399L, parseCopAmountMinor("13,99"))
        assertEquals(190L, parseCopAmountMinor("1,9"))
        assertEquals(1_399_050L, parseCopAmountMinor("13.990,50"))
        assertEquals(1_399_000L, parseCopAmountMinor(" 13990 "))
    }

    @Test
    fun `rejects ambiguous malformed non-positive and excessive amounts`() {
        listOf(
            "",
            "0",
            "1,999",
            "1.23",
            "01",
            "-1.000",
            "COP 1.000",
            "1.000.000.000,01",
        ).forEach { value -> assertNull(value, parseCopAmountMinor(value)) }
        assertEquals(100_000_000_000L, parseCopAmountMinor("1.000.000.000"))
    }

    @Test
    fun `returns the first invalid field in capture order`() {
        assertEquals(
            QuickExpenseField.MERCHANT,
            validateQuickExpenseForm(valid.copy(merchant = " "))?.field,
        )
        assertEquals(
            QuickExpenseField.DATE,
            validateQuickExpenseForm(valid.copy(date = null))?.field,
        )
        assertEquals(
            QuickExpenseField.AMOUNT,
            validateQuickExpenseForm(valid.copy(amount = "0"))?.field,
        )
        assertEquals(
            QuickExpenseField.CATEGORY,
            validateQuickExpenseForm(valid.copy(category = ""))?.field,
        )
        assertEquals(
            QuickExpenseField.ACCOUNT,
            validateQuickExpenseForm(valid.copy(accountId = ""))?.field,
        )
        assertNull(validateQuickExpenseForm(valid))
    }

    @Test
    fun `enforces persisted text bounds`() {
        assertEquals(
            QuickExpenseField.MERCHANT,
            validateQuickExpenseForm(valid.copy(merchant = "m".repeat(141)))?.field,
        )
        assertEquals(
            QuickExpenseField.CATEGORY,
            validateQuickExpenseForm(valid.copy(category = "c".repeat(101)))?.field,
        )
        assertEquals(
            QuickExpenseField.ACCOUNT,
            validateQuickExpenseForm(valid.copy(accountId = "a".repeat(1_501)))?.field,
        )
    }

    @Test
    fun `builds a trimmed draft at local noon without changing internal text`() {
        val zoneId = ZoneId.of("America/Bogota")
        val draft = buildQuickExpenseDraft(
            input = valid.copy(
                merchant = "  Café  del parque  ",
                category = "  Comida  ",
                accountId = "  cash-1  ",
            ),
            candidateId = "a".repeat(64),
            zoneId = zoneId,
        )
        val occurredAt = java.time.Instant.ofEpochMilli(draft.occurredAtEpochMillis)
            .atZone(zoneId)

        assertEquals("Café  del parque", draft.merchant)
        assertEquals("Comida", draft.suggestedCategory)
        assertEquals("cash-1", draft.suggestedAccountId)
        assertEquals(1_399_000L, draft.amountMinor)
        assertEquals(valid.date, occurredAt.toLocalDate())
        assertEquals(LocalTime.NOON, occurredAt.toLocalTime())
        assertTrue(draft.occurredAtEpochMillis > 0)
    }
}

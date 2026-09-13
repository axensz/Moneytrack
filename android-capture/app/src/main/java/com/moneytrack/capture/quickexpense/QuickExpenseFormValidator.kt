package com.moneytrack.capture.quickexpense

import java.math.BigDecimal
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

data class QuickExpenseFormInput(
    val merchant: String,
    val date: LocalDate?,
    val amount: String,
    val category: String,
    val accountId: String,
)

enum class QuickExpenseField {
    MERCHANT,
    DATE,
    AMOUNT,
    CATEGORY,
    ACCOUNT,
}

data class QuickExpenseValidationIssue(
    val field: QuickExpenseField,
    val message: String,
)

fun parseCopAmountMinor(value: String): Long? {
    val token = value.trim()
    if (!COP_AMOUNT.matches(token)) return null

    return try {
        BigDecimal(token.replace(".", "").replace(',', '.'))
            .movePointRight(2)
            .longValueExact()
            .takeIf { it in 1..QuickExpenseDraft.MAX_AMOUNT_MINOR }
    } catch (_: ArithmeticException) {
        null
    } catch (_: NumberFormatException) {
        null
    }
}

fun validateQuickExpenseForm(
    input: QuickExpenseFormInput,
): QuickExpenseValidationIssue? {
    val merchant = input.merchant.trim()
    if (merchant.isEmpty() || merchant.length > 140) {
        return QuickExpenseValidationIssue(
            QuickExpenseField.MERCHANT,
            "Escribe en qué gastaste, usando máximo 140 caracteres.",
        )
    }
    if (input.date == null) {
        return QuickExpenseValidationIssue(
            QuickExpenseField.DATE,
            "Selecciona la fecha del gasto.",
        )
    }
    if (parseCopAmountMinor(input.amount) == null) {
        return QuickExpenseValidationIssue(
            QuickExpenseField.AMOUNT,
            "Escribe un monto válido en pesos colombianos.",
        )
    }

    val category = input.category.trim()
    if (category.isEmpty() || category.length > 100) {
        return QuickExpenseValidationIssue(
            QuickExpenseField.CATEGORY,
            "Selecciona una categoría de gasto válida.",
        )
    }

    val accountId = input.accountId.trim()
    if (accountId.isEmpty() || accountId.length > 1_500) {
        return QuickExpenseValidationIssue(
            QuickExpenseField.ACCOUNT,
            "Selecciona la cuenta, efectivo o tarjeta que pagó.",
        )
    }
    return null
}

fun buildQuickExpenseDraft(
    input: QuickExpenseFormInput,
    candidateId: String,
    zoneId: ZoneId = ZoneId.systemDefault(),
): QuickExpenseDraft {
    val issue = validateQuickExpenseForm(input)
    require(issue == null) { issue?.message ?: "Invalid quick expense form" }

    val date = requireNotNull(input.date)
    val amountMinor = requireNotNull(parseCopAmountMinor(input.amount))
    return QuickExpenseDraft(
        candidateId = candidateId,
        occurredAtEpochMillis = date.atTime(LocalTime.NOON)
            .atZone(zoneId)
            .toInstant()
            .toEpochMilli(),
        amountMinor = amountMinor,
        merchant = input.merchant.trim(),
        suggestedAccountId = input.accountId.trim(),
        suggestedCategory = input.category.trim(),
    )
}

private val COP_AMOUNT = Regex(
    "^(?:0|[1-9]\\d*|[1-9]\\d{0,2}(?:\\.\\d{3})+)(?:,(\\d{1,2}))?$",
)

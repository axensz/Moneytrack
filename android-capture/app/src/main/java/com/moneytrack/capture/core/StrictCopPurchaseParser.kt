package com.moneytrack.capture.core

enum class PurchaseParseCode {
    ACCEPTED_HIGH,
    ACCEPTED_MEDIUM,
    NO_PURCHASE_MARKER,
    FORBIDDEN_MARKER,
    NO_COP_AMOUNT,
    AMBIGUOUS_AMOUNT,
    UNSUPPORTED_CURRENCY,
    MALFORMED_AMOUNT,
}

sealed interface PurchaseParseResult {
    data class Accepted(
        val candidate: NormalizedPurchaseCandidate,
        val code: PurchaseParseCode,
    ) : PurchaseParseResult

    data class Rejected(val code: PurchaseParseCode) : PurchaseParseResult
}

class StrictCopPurchaseParser {
    fun parse(
        notification: RawNotification,
        candidateId: String,
    ): PurchaseParseResult {
        val content = notification.combinedText()
        if (!PURCHASE_MARKER.containsMatchIn(content)) {
            return PurchaseParseResult.Rejected(PurchaseParseCode.NO_PURCHASE_MARKER)
        }
        if (FORBIDDEN_MARKER.containsMatchIn(content)) {
            return PurchaseParseResult.Rejected(PurchaseParseCode.FORBIDDEN_MARKER)
        }
        if (UNSUPPORTED_CURRENCY.containsMatchIn(content)) {
            return PurchaseParseResult.Rejected(PurchaseParseCode.UNSUPPORTED_CURRENCY)
        }

        val amountMatches = COP_AMOUNT.findAll(content).toList()
        if (amountMatches.size > 1) {
            return PurchaseParseResult.Rejected(PurchaseParseCode.AMBIGUOUS_AMOUNT)
        }
        if (amountMatches.isEmpty()) {
            val code = if (COP_PREFIX.containsMatchIn(content)) {
                PurchaseParseCode.MALFORMED_AMOUNT
            } else {
                PurchaseParseCode.NO_COP_AMOUNT
            }
            return PurchaseParseResult.Rejected(code)
        }

        val amountMinor = parseAmountMinor(amountMatches.single().groupValues[1])
            ?: return PurchaseParseResult.Rejected(PurchaseParseCode.MALFORMED_AMOUNT)
        val merchant = extractMerchant(content)
        val cardLast4 = extractLastFour(content)
        val confidence = if (merchant != null && cardLast4 != null) {
            PurchaseConfidence.HIGH
        } else {
            PurchaseConfidence.MEDIUM
        }
        val candidate = NormalizedPurchaseCandidate(
            candidateId = candidateId,
            sourcePackage = notification.packageName,
            occurredAtEpochMillis = notification.postedAtEpochMillis,
            amountMinor = amountMinor,
            merchant = merchant ?: UNKNOWN_MERCHANT,
            cardLast4 = cardLast4,
            confidence = confidence,
        )
        return PurchaseParseResult.Accepted(
            candidate = candidate,
            code = if (confidence == PurchaseConfidence.HIGH) {
                PurchaseParseCode.ACCEPTED_HIGH
            } else {
                PurchaseParseCode.ACCEPTED_MEDIUM
            },
        )
    }

    private fun parseAmountMinor(token: String): Long? {
        val parts = token.split(',')
        if (parts.size > 2) return null
        val wholeDigits = parts[0].replace(".", "")
        if (wholeDigits.isEmpty() || wholeDigits.any { !it.isDigit() }) return null
        val fractionDigits = when (parts.size) {
            1 -> "00"
            else -> parts[1].padEnd(2, '0')
        }
        if (fractionDigits.length != 2 || fractionDigits.any { !it.isDigit() }) return null

        return try {
            val amountMinor = Math.addExact(
                Math.multiplyExact(wholeDigits.toLong(), 100L),
                fractionDigits.toLong(),
            )
            amountMinor.takeIf { it in 1..NormalizedPurchaseCandidate.MAX_AMOUNT_MINOR }
        } catch (_: ArithmeticException) {
            null
        } catch (_: NumberFormatException) {
            null
        }
    }

    private fun extractMerchant(content: String): String? {
        val captured = MERCHANT.find(content)?.groupValues?.get(1)
            ?.replace(Regex("\\s+"), " ")
            ?.trim(' ', ',', '.', ';', ':', '-')
            ?.takeIf(String::isNotBlank)
            ?: return null
        return captured.takeIf { it.length <= 140 }
    }

    private fun extractLastFour(content: String): String? {
        val match = LAST_FOUR.find(content) ?: return null
        return match.groupValues.drop(1).firstOrNull(String::isNotEmpty)
    }

    companion object {
        private const val UNKNOWN_MERCHANT = "Comercio por confirmar"
        private val PURCHASE_MARKER = Regex(
            "\\b(?:compra|consumo|pagaste|pago\\s+realizado)\\b",
            RegexOption.IGNORE_CASE,
        )
        private val FORBIDDEN_MARKER = Regex(
            "\\b(?:rechazada|declinada|fallida|anulada|reversada|código|codigo|clave|otp)\\b",
            RegexOption.IGNORE_CASE,
        )
        private val UNSUPPORTED_CURRENCY = Regex(
            "\\b(?:USD|EUR|GBP|CAD|AUD)\\b|US\\$",
            RegexOption.IGNORE_CASE,
        )
        private val COP_PREFIX = Regex("(?:\\bCOP\\b|\\$)\\s*-?", RegexOption.IGNORE_CASE)
        private val COP_AMOUNT = Regex(
            "(?:\\bCOP\\b\\s*|\\$\\s*)" +
                "(\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:,\\d{1,2})?)" +
                "(?![\\d.,])",
            RegexOption.IGNORE_CASE,
        )
        private val MERCHANT = Regex(
            "\\ben\\s+(.+?)(?=\\s+(?:con|desde|usando)\\b|[.!?]|$)",
            RegexOption.IGNORE_CASE,
        )
        private val LAST_FOUR = Regex(
            "(?:terminad[ao]|finalizad[ao])(?:\\s+en)?\\s*(?:[•*]{4}\\s*)?(\\d{4})" +
                "|[•*]{4}\\s*(\\d{4})",
            RegexOption.IGNORE_CASE,
        )
    }
}

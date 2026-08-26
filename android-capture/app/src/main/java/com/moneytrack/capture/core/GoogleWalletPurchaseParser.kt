package com.moneytrack.capture.core

import java.text.Normalizer

class GoogleWalletPurchaseParser {
    fun parse(
        notification: RawNotification,
        candidateId: String,
        occurredAtEpochMillis: Long = notification.postedAtEpochMillis,
    ): PurchaseParseResult {
        val merchant = normalizeMerchant(notification.title)
            ?: return PurchaseParseResult.Rejected(PurchaseParseCode.NO_PURCHASE_MARKER)
        val bodies = listOfNotNull(notification.text, notification.bigText)
            .map(::normalizeText)
            .filter(String::isNotEmpty)
            .distinct()
        if (bodies.isEmpty()) {
            return PurchaseParseResult.Rejected(PurchaseParseCode.NO_COP_AMOUNT)
        }
        if (bodies.any(FORBIDDEN_MARKER::containsMatchIn)) {
            return PurchaseParseResult.Rejected(PurchaseParseCode.FORBIDDEN_MARKER)
        }

        val parsedBodies = bodies.mapNotNull(::parseBody)
        if (parsedBodies.isEmpty()) {
            return PurchaseParseResult.Rejected(rejectionCode(bodies))
        }
        val distinctPurchases = parsedBodies.distinct()
        if (distinctPurchases.size != 1) {
            return PurchaseParseResult.Rejected(PurchaseParseCode.AMBIGUOUS_AMOUNT)
        }

        val purchase = distinctPurchases.single()
        return PurchaseParseResult.Accepted(
            candidate = NormalizedPurchaseCandidate(
                candidateId = candidateId,
                schemaVersion = NormalizedPurchaseCandidate.GOOGLE_WALLET_SCHEMA_VERSION,
                sourcePackage = notification.packageName,
                occurredAtEpochMillis = occurredAtEpochMillis,
                amountMinor = purchase.amountMinor,
                merchant = merchant,
                cardLast4 = null,
                observedInstrumentLabel = normalizeObservedLabel(purchase.instrumentDescriptor),
                parserId = NormalizedPurchaseCandidate.GOOGLE_WALLET_PARSER_ID,
                confidence = PurchaseConfidence.MEDIUM,
            ),
            code = PurchaseParseCode.ACCEPTED_MEDIUM,
        )
    }

    private fun parseBody(body: String): ParsedWalletBody? {
        val match = WALLET_BODY.matchEntire(body) ?: return null
        val amountMinor = parseAmountMinor(match.groupValues[1]) ?: return null
        return ParsedWalletBody(
            amountMinor = amountMinor,
            instrumentDescriptor = match.groupValues[2],
        )
    }

    private fun parseAmountMinor(token: String): Long? {
        val decimalSeparator = when {
            ENGLISH_GROUPED.matches(token) || PLAIN_DOT_DECIMAL.matches(token) -> '.'
            COLOMBIAN_GROUPED.matches(token) || PLAIN_COMMA_DECIMAL.matches(token) -> ','
            PLAIN_INTEGER.matches(token) -> null
            else -> return null
        }
        val normalized = when (decimalSeparator) {
            '.' -> token.replace(",", "")
            ',' -> token.replace(".", "").replace(',', '.')
            else -> "$token.00"
        }
        val parts = normalized.split('.')
        if (parts.size != 2 || parts[1].length != 2) return null
        return try {
            val amountMinor = Math.addExact(
                Math.multiplyExact(parts[0].toLong(), 100L),
                parts[1].toLong(),
            )
            amountMinor.takeIf { it in 1..NormalizedPurchaseCandidate.MAX_AMOUNT_MINOR }
        } catch (_: ArithmeticException) {
            null
        } catch (_: NumberFormatException) {
            null
        }
    }

    private fun rejectionCode(bodies: List<String>): PurchaseParseCode = when {
        bodies.any(NON_COP_CURRENCY::containsMatchIn) ->
            PurchaseParseCode.UNSUPPORTED_CURRENCY
        bodies.any(COP_PREFIX::containsMatchIn) ->
            PurchaseParseCode.MALFORMED_AMOUNT
        else -> PurchaseParseCode.NO_COP_AMOUNT
    }

    private fun normalizeMerchant(value: String?): String? = value
        ?.let(::normalizeText)
        ?.takeIf { it.isNotEmpty() && it.length <= 140 }
        ?.takeUnless { it.equals(AvailableCaptureSourceCatalog.GOOGLE_WALLET_LABEL, true) }

    private fun normalizeObservedLabel(value: String): String? {
        val normalized = normalizeText(value)
        val codePoints = normalized.codePoints().toArray()
        return normalized.takeIf {
            codePoints.isNotEmpty() &&
                codePoints.size <= 24 &&
                codePoints.all(Character::isLetter)
        }
    }

    private fun normalizeText(value: String): String = Normalizer
        .normalize(value, Normalizer.Form.NFKC)
        .codePoints()
        .filter { codePoint ->
            !Character.isISOControl(codePoint) &&
                Character.getType(codePoint) != Character.FORMAT.toInt()
        }
        .toArray()
        .let { codePoints -> String(codePoints, 0, codePoints.size) }
        .trim()
        .replace(WHITESPACE, " ")

    private data class ParsedWalletBody(
        val amountMinor: Long,
        val instrumentDescriptor: String,
    )

    companion object {
        private val WHITESPACE = Regex("\\s+")
        private val WALLET_BODY = Regex(
            "^COP\\s*(\\S+)\\s+(?:with|con)\\s+(.+)$",
            RegexOption.IGNORE_CASE,
        )
        private val ENGLISH_GROUPED = Regex("\\d{1,3}(?:,\\d{3})+\\.\\d{2}")
        private val COLOMBIAN_GROUPED = Regex("\\d{1,3}(?:\\.\\d{3})+,\\d{2}")
        private val PLAIN_DOT_DECIMAL = Regex("\\d+\\.\\d{2}")
        private val PLAIN_COMMA_DECIMAL = Regex("\\d+,\\d{2}")
        private val PLAIN_INTEGER = Regex("\\d+")
        private val COP_PREFIX = Regex("^COP\\b|^COP(?=\\d)", RegexOption.IGNORE_CASE)
        private val NON_COP_CURRENCY = Regex(
            "^(?:USD|EUR|GBP|CAD|AUD)\\b|^(?:USD|EUR|GBP|CAD|AUD)(?=\\d)",
            RegexOption.IGNORE_CASE,
        )
        private val FORBIDDEN_MARKER = Regex(
            "\\b(?:rechazada|declinada|fallida|anulada|reversada|reembolso|" +
                "rejected|declined|failed|cancelled|canceled|reversed|refunded|" +
                "código|codigo|clave|otp)\\b",
            RegexOption.IGNORE_CASE,
        )
    }
}

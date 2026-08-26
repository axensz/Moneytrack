package com.moneytrack.capture.core

enum class PurchaseConfidence(val wireValue: String) {
    HIGH("high"),
    MEDIUM("medium"),
}

/**
 * Exact normalized payload accepted by the repository boundary.
 * It intentionally has no title, body, PAN, token or device identifier field.
 */
data class NormalizedPurchaseCandidate(
    val candidateId: String,
    val sourcePackage: String,
    val occurredAtEpochMillis: Long,
    val amountMinor: Long,
    val currency: String = CURRENCY,
    val merchant: String,
    val cardLast4: String?,
    val parserId: String = PARSER_ID,
    val parserVersion: Int = PARSER_VERSION,
    val confidence: PurchaseConfidence,
) {
    init {
        require(CANDIDATE_ID.matches(candidateId)) { "Invalid candidate identity" }
        require(sourcePackage.isNotBlank() && sourcePackage.length <= 160) {
            "Invalid source package"
        }
        require(occurredAtEpochMillis > 0) { "Invalid observed time" }
        require(amountMinor in 1..MAX_AMOUNT_MINOR) { "Invalid normalized amount" }
        require(currency == CURRENCY) { "Unsupported currency" }
        require(merchant.isNotBlank() && merchant.length <= 140) { "Invalid merchant" }
        require(cardLast4 == null || LAST_FOUR.matches(cardLast4)) { "Invalid last four" }
        require(parserId == PARSER_ID && parserVersion == PARSER_VERSION) {
            "Unsupported parser contract"
        }
    }

    companion object {
        const val CURRENCY = "COP"
        const val PARSER_ID = "strict-cop-purchase"
        const val PARSER_VERSION = 1
        const val MAX_AMOUNT_MINOR = 100_000_000_000L
        private val CANDIDATE_ID = Regex("[a-f0-9]{64}")
        private val LAST_FOUR = Regex("[0-9]{4}")
    }
}

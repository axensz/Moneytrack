package com.moneytrack.capture.quickexpense

data class QuickExpenseDraft(
    val candidateId: String,
    val occurredAtEpochMillis: Long,
    val amountMinor: Long,
    val merchant: String,
    val suggestedAccountId: String,
    val suggestedCategory: String,
) {
    init {
        require(CANDIDATE_ID.matches(candidateId)) { "Invalid candidate identity" }
        require(occurredAtEpochMillis > 0) { "Invalid expense date" }
        require(amountMinor in 1..MAX_AMOUNT_MINOR) { "Invalid expense amount" }
        require(merchant.isNotBlank() && merchant.length <= 140) {
            "Invalid expense description"
        }
        require(suggestedAccountId.isNotBlank() && suggestedAccountId.length <= 1_500) {
            "Invalid expense account"
        }
        require(suggestedCategory.isNotBlank() && suggestedCategory.length <= 100) {
            "Invalid expense category"
        }
    }

    companion object {
        const val SCHEMA_VERSION = 3
        const val SOURCE = "android-shortcut"
        const val CURRENCY = "COP"
        const val MAX_AMOUNT_MINOR = 100_000_000_000L
        private val CANDIDATE_ID = Regex("[a-f0-9]{64}")
    }
}

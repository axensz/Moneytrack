package com.moneytrack.capture.quickexpense

object QuickExpenseHandoff {
    fun url(candidateId: String): String {
        require(CANDIDATE_ID.matches(candidateId)) { "Invalid candidate identity" }
        return "$REVIEW_URL$candidateId"
    }

    private const val REVIEW_URL =
        "https://axensz.github.io/Moneytrack/?view=transactions&reviewAndroid="
    private val CANDIDATE_ID = Regex("[a-f0-9]{64}")
}

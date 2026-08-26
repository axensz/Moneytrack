package com.moneytrack.capture.data

import com.moneytrack.capture.core.NormalizedPurchaseCandidate
import com.moneytrack.capture.preferences.CapturePreferences

class CandidateSyncDispatcher(
    private val syncScope: String,
    private val preferences: CapturePreferences,
    private val saveCandidate: (
        NormalizedPurchaseCandidate,
        (CandidateWriteResult) -> Unit,
    ) -> Unit = FirebaseCandidateRepository(syncScope)::save,
) {
    fun reconcile() {
        preferences.candidatesNeedingRetry().forEach(::sync)
    }

    fun sync(
        candidate: NormalizedPurchaseCandidate,
        onResult: (CandidateWriteResult) -> Unit = {},
    ): Boolean {
        val operationKey = "$syncScope/${candidate.candidateId}"
        if (!acquire(operationKey)) return false

        val anchoredCandidate = preferences.markCandidateEnqueued(candidate.candidateId)
        if (anchoredCandidate == null) {
            release(operationKey)
            return false
        }

        try {
            saveCandidate(anchoredCandidate) { result ->
                preferences.recordCandidateWriteResult(
                    candidateId = anchoredCandidate.candidateId,
                    stored = result == CandidateWriteResult.STORED,
                )
                release(operationKey)
                onResult(result)
            }
        } catch (_: RuntimeException) {
            preferences.recordCandidateWriteResult(
                candidateId = anchoredCandidate.candidateId,
                stored = false,
            )
            release(operationKey)
            onResult(CandidateWriteResult.WRITE_FAILED)
        }
        return true
    }

    private companion object {
        private val inFlight = mutableSetOf<String>()

        @Synchronized
        fun acquire(operationKey: String): Boolean = inFlight.add(operationKey)

        @Synchronized
        fun release(operationKey: String) {
            inFlight.remove(operationKey)
        }
    }
}

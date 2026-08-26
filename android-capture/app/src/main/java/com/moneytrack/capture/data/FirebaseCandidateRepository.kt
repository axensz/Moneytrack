package com.moneytrack.capture.data

import com.google.firebase.Timestamp
import com.google.firebase.firestore.FirebaseFirestore
import com.moneytrack.capture.core.NormalizedPurchaseCandidate
import java.util.Date

enum class CandidateWriteResult {
    STORED,
    WRITE_FAILED,
}

fun interface CandidateDocumentSink {
    fun setDocument(
        collectionPath: String,
        documentId: String,
        fields: Map<String, Any>,
        onComplete: (Result<Unit>) -> Unit,
    )
}

class FirestoreCandidateDocumentSink(
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance(),
) : CandidateDocumentSink {
    override fun setDocument(
        collectionPath: String,
        documentId: String,
        fields: Map<String, Any>,
        onComplete: (Result<Unit>) -> Unit,
    ) {
        firestore.collection(collectionPath)
            .document(documentId)
            .set(fields)
            .addOnSuccessListener { onComplete(Result.success(Unit)) }
            .addOnFailureListener { onComplete(Result.failure(it)) }
    }
}

/**
 * Persistence boundary for normalized candidates. Raw notification content
 * cannot cross this API because it has no parameter or field for it.
 */
class FirebaseCandidateRepository(
    uid: String,
    private val sink: CandidateDocumentSink = FirestoreCandidateDocumentSink(),
) {
    private val collectionPath: String

    init {
        require(uid.isNotBlank() && uid.length <= MAX_UID_LENGTH && '/' !in uid) {
            "Invalid authenticated user"
        }
        collectionPath = "users/$uid/transactionImportCandidates"
    }

    fun save(
        candidate: NormalizedPurchaseCandidate,
        onResult: (CandidateWriteResult) -> Unit,
    ) {
        val fields = buildMap<String, Any> {
            put("schemaVersion", candidate.schemaVersion.toLong())
            put("source", "android-notification")
            put("sourcePackage", candidate.sourcePackage)
            put("occurredAt", Timestamp(Date(candidate.occurredAtEpochMillis)))
            put("amountMinor", candidate.amountMinor)
            put("currency", candidate.currency)
            put("merchant", candidate.merchant)
            candidate.cardLast4?.let { put("cardLast4", it) }
            candidate.observedInstrumentLabel?.let { put("observedInstrumentLabel", it) }
            put("parserId", candidate.parserId)
            put("parserVersion", candidate.parserVersion.toLong())
            put("confidence", candidate.confidence.wireValue)
            put("status", "pending")
        }

        try {
            sink.setDocument(collectionPath, candidate.candidateId, fields) { result ->
                onResult(
                    if (result.isSuccess) {
                        CandidateWriteResult.STORED
                    } else {
                        CandidateWriteResult.WRITE_FAILED
                    },
                )
            }
        } catch (_: RuntimeException) {
            onResult(CandidateWriteResult.WRITE_FAILED)
        }
    }

    companion object {
        private const val MAX_UID_LENGTH = 128
    }
}

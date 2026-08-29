package com.moneytrack.capture.data

import com.google.firebase.Timestamp
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Source
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

    fun getDocument(
        collectionPath: String,
        documentId: String,
        onComplete: (Result<Map<String, Any>?>) -> Unit,
    ) {
        onComplete(Result.failure(UnsupportedOperationException("Server read unavailable")))
    }
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

    override fun getDocument(
        collectionPath: String,
        documentId: String,
        onComplete: (Result<Map<String, Any>?>) -> Unit,
    ) {
        firestore.collection(collectionPath)
            .document(documentId)
            .get(Source.SERVER)
            .addOnSuccessListener { document ->
                onComplete(Result.success(if (document.exists()) document.data else null))
            }
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
                if (result.isSuccess) {
                    onResult(CandidateWriteResult.STORED)
                } else {
                    reconcileFailedWrite(candidate.candidateId, fields, onResult)
                }
            }
        } catch (_: RuntimeException) {
            onResult(CandidateWriteResult.WRITE_FAILED)
        }
    }

    private fun reconcileFailedWrite(
        candidateId: String,
        fields: Map<String, Any>,
        onResult: (CandidateWriteResult) -> Unit,
    ) {
        try {
            sink.getDocument(collectionPath, candidateId) { result ->
                val isStored = result.getOrNull()?.let { serverFields ->
                    IMMUTABLE_FIELDS.all { key -> serverFields[key] == fields[key] }
                } == true
                onResult(if (isStored) CandidateWriteResult.STORED else CandidateWriteResult.WRITE_FAILED)
            }
        } catch (_: RuntimeException) {
            onResult(CandidateWriteResult.WRITE_FAILED)
        }
    }

    companion object {
        private const val MAX_UID_LENGTH = 128
        private val IMMUTABLE_FIELDS = setOf(
            "schemaVersion",
            "source",
            "sourcePackage",
            "occurredAt",
            "amountMinor",
            "currency",
            "merchant",
            "cardLast4",
            "observedInstrumentLabel",
            "parserId",
            "parserVersion",
            "confidence",
        )
    }
}

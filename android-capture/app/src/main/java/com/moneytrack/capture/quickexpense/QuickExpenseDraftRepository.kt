package com.moneytrack.capture.quickexpense

import com.google.firebase.Timestamp
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import java.math.BigDecimal
import java.util.Date

enum class QuickExpenseWriteResult {
    STORED,
    COLLISION,
    WRITE_FAILED,
}

enum class QuickExpenseDocumentResult {
    CREATED,
    MATCHED,
    COLLISION,
}

fun interface QuickExpenseDocumentStore {
    fun createIfAbsentOrMatch(
        collectionPath: String,
        documentId: String,
        fields: Map<String, Any>,
        onComplete: (Result<QuickExpenseDocumentResult>) -> Unit,
    )
}

class FirebaseQuickExpenseDocumentStore(
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance(),
) : QuickExpenseDocumentStore {
    override fun createIfAbsentOrMatch(
        collectionPath: String,
        documentId: String,
        fields: Map<String, Any>,
        onComplete: (Result<QuickExpenseDocumentResult>) -> Unit,
    ) {
        val reference = firestore.collection(collectionPath).document(documentId)
        firestore.runTransaction { transaction ->
            val snapshot = transaction.get(reference)
            when {
                !snapshot.exists() -> {
                    transaction.set(reference, fields)
                    QuickExpenseDocumentResult.CREATED
                }
                quickExpensePendingDocumentMatches(snapshot.data.orEmpty(), fields) -> {
                    QuickExpenseDocumentResult.MATCHED
                }
                else -> QuickExpenseDocumentResult.COLLISION
            }
        }.addOnSuccessListener { result -> onComplete(Result.success(result)) }
            .addOnFailureListener { error -> onComplete(Result.failure(error)) }
    }
}

class QuickExpenseDraftRepository(
    uid: String,
    private val store: QuickExpenseDocumentStore = FirebaseQuickExpenseDocumentStore(),
    private val serverTimestamp: () -> Any = { FieldValue.serverTimestamp() },
) {
    private val collectionPath: String

    init {
        requireValidQuickExpenseUid(uid)
        collectionPath = "users/$uid/transactionImportCandidates"
    }

    fun save(
        draft: QuickExpenseDraft,
        onResult: (QuickExpenseWriteResult) -> Unit,
    ) {
        try {
            val fields = mapOf(
                "schemaVersion" to QuickExpenseDraft.SCHEMA_VERSION.toLong(),
                "source" to QuickExpenseDraft.SOURCE,
                "occurredAt" to Timestamp(Date(draft.occurredAtEpochMillis)),
                "amountMinor" to draft.amountMinor,
                "currency" to QuickExpenseDraft.CURRENCY,
                "merchant" to draft.merchant,
                "suggestedAccountId" to draft.suggestedAccountId,
                "suggestedCategory" to draft.suggestedCategory,
                "createdAt" to serverTimestamp(),
                "status" to "pending",
            )

            store.createIfAbsentOrMatch(
                collectionPath = collectionPath,
                documentId = draft.candidateId,
                fields = fields,
            ) { result ->
                onResult(
                    when (result.getOrNull()) {
                        QuickExpenseDocumentResult.CREATED,
                        QuickExpenseDocumentResult.MATCHED,
                        -> QuickExpenseWriteResult.STORED
                        QuickExpenseDocumentResult.COLLISION -> QuickExpenseWriteResult.COLLISION
                        null -> QuickExpenseWriteResult.WRITE_FAILED
                    },
                )
            }
        } catch (_: RuntimeException) {
            onResult(QuickExpenseWriteResult.WRITE_FAILED)
        }
    }
}

internal fun quickExpenseImmutableFieldsMatch(
    existing: Map<String, Any?>,
    expected: Map<String, Any>,
): Boolean = QUICK_EXPENSE_IMMUTABLE_FIELDS.all { key ->
    if (key in QUICK_EXPENSE_NUMERIC_FIELDS) {
        existing[key].asExactLong() == expected[key].asExactLong()
    } else {
        existing[key] == expected[key]
    }
}

internal fun quickExpensePendingDocumentMatches(
    existing: Map<String, Any?>,
    expected: Map<String, Any>,
): Boolean = existing.keys == QUICK_EXPENSE_DOCUMENT_FIELDS &&
    existing["status"] == "pending" &&
    existing["createdAt"] is Timestamp &&
    quickExpenseImmutableFieldsMatch(existing, expected)

private fun Any?.asExactLong(): Long? {
    val number = this as? Number ?: return null
    return try {
        BigDecimal(number.toString()).longValueExact()
    } catch (_: ArithmeticException) {
        null
    } catch (_: NumberFormatException) {
        null
    }
}

private val QUICK_EXPENSE_IMMUTABLE_FIELDS = setOf(
    "schemaVersion",
    "source",
    "occurredAt",
    "amountMinor",
    "currency",
    "merchant",
    "suggestedAccountId",
    "suggestedCategory",
)

private val QUICK_EXPENSE_DOCUMENT_FIELDS = QUICK_EXPENSE_IMMUTABLE_FIELDS + setOf(
    "createdAt",
    "status",
)

private val QUICK_EXPENSE_NUMERIC_FIELDS = setOf("schemaVersion", "amountMinor")

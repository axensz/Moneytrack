package com.moneytrack.capture.quickexpense

import com.google.firebase.Timestamp
import java.util.Date
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class QuickExpenseDraftRepositoryTest {
    @Test
    fun `creates the exact v3 document at the authenticated user path`() {
        val marker = Any()
        val store = FakeDocumentStore(QuickExpenseDocumentResult.CREATED)
        var result: QuickExpenseWriteResult? = null

        QuickExpenseDraftRepository(USER_ID, store) { marker }.save(draft()) { result = it }

        val request = store.requests.single()
        assertEquals("users/$USER_ID/transactionImportCandidates", request.collectionPath)
        assertEquals(CANDIDATE_ID, request.documentId)
        assertEquals(
            setOf(
                "schemaVersion",
                "source",
                "occurredAt",
                "amountMinor",
                "currency",
                "merchant",
                "suggestedAccountId",
                "suggestedCategory",
                "createdAt",
                "status",
            ),
            request.fields.keys,
        )
        assertEquals(3L, request.fields["schemaVersion"])
        assertEquals("android-shortcut", request.fields["source"])
        assertEquals(OCCURRED_AT, (request.fields["occurredAt"] as Timestamp).toDate().time)
        assertEquals(139_900L, request.fields["amountMinor"])
        assertEquals("COP", request.fields["currency"])
        assertEquals("Almuerzo", request.fields["merchant"])
        assertEquals("cash", request.fields["suggestedAccountId"])
        assertEquals("Comida", request.fields["suggestedCategory"])
        assertSame(marker, request.fields["createdAt"])
        assertEquals("pending", request.fields["status"])
        assertSame(QuickExpenseWriteResult.STORED, result)
    }

    @Test
    fun `treats an identical retry as stored without weakening collision handling`() {
        val matching = FakeDocumentStore(QuickExpenseDocumentResult.MATCHED)
        val collision = FakeDocumentStore(QuickExpenseDocumentResult.COLLISION)
        var matchingResult: QuickExpenseWriteResult? = null
        var collisionResult: QuickExpenseWriteResult? = null

        QuickExpenseDraftRepository(USER_ID, matching) { Any() }
            .save(draft()) { matchingResult = it }
        QuickExpenseDraftRepository(USER_ID, collision) { Any() }
            .save(draft()) { collisionResult = it }

        assertSame(QuickExpenseWriteResult.STORED, matchingResult)
        assertSame(QuickExpenseWriteResult.COLLISION, collisionResult)
    }

    @Test
    fun `maps an offline transaction to write failed`() {
        val store = FakeDocumentStore(failure = IllegalStateException("offline"))
        var result: QuickExpenseWriteResult? = null

        QuickExpenseDraftRepository(USER_ID, store) { Any() }.save(draft()) { result = it }

        assertSame(QuickExpenseWriteResult.WRITE_FAILED, result)
    }

    @Test
    fun `maps a synchronous timestamp failure without reaching the store`() {
        val store = FakeDocumentStore(QuickExpenseDocumentResult.CREATED)
        var result: QuickExpenseWriteResult? = null

        QuickExpenseDraftRepository(USER_ID, store) {
            throw IllegalStateException("timestamp unavailable")
        }.save(draft()) { result = it }

        assertSame(QuickExpenseWriteResult.WRITE_FAILED, result)
        assertTrue(store.requests.isEmpty())
    }

    @Test
    fun `rejects an invalid uid before reaching the document store`() {
        val store = FakeDocumentStore(QuickExpenseDocumentResult.CREATED)

        val failure = runCatching { QuickExpenseDraftRepository(" ", store) { Any() } }

        assertTrue(failure.isFailure)
        assertTrue(store.requests.isEmpty())
    }

    @Test
    fun `matches only the exact pending v3 document`() {
        val expected = expectedDocumentFields()
        val existing = expectedImmutableFields() + mapOf(
            "schemaVersion" to 3,
            "amountMinor" to 139_900.toInt(),
            "createdAt" to Timestamp(Date(OCCURRED_AT + 1_000L)),
            "status" to "pending",
        )

        assertTrue(quickExpensePendingDocumentMatches(existing, expected))
        assertTrue(!quickExpensePendingDocumentMatches(existing + ("merchant" to "Cena"), expected))
        assertTrue(!quickExpensePendingDocumentMatches(existing - "suggestedCategory", expected))
        assertTrue(!quickExpensePendingDocumentMatches(existing + ("status" to "confirmed"), expected))
        assertTrue(!quickExpensePendingDocumentMatches(existing + ("transactionId" to "ledger-id"), expected))
        assertTrue(!quickExpensePendingDocumentMatches(existing + ("createdAt" to "not-a-timestamp"), expected))
    }

    private fun expectedDocumentFields(): Map<String, Any> = expectedImmutableFields() + mapOf(
        "createdAt" to Any(),
        "status" to "pending",
    )

    private fun expectedImmutableFields(): Map<String, Any> = mapOf(
        "schemaVersion" to 3L,
        "source" to "android-shortcut",
        "occurredAt" to Timestamp(Date(OCCURRED_AT)),
        "amountMinor" to 139_900L,
        "currency" to "COP",
        "merchant" to "Almuerzo",
        "suggestedAccountId" to "cash",
        "suggestedCategory" to "Comida",
    )

    private fun draft() = QuickExpenseDraft(
        candidateId = CANDIDATE_ID,
        occurredAtEpochMillis = OCCURRED_AT,
        amountMinor = 139_900L,
        merchant = "Almuerzo",
        suggestedAccountId = "cash",
        suggestedCategory = "Comida",
    )

    private class FakeDocumentStore(
        private val outcome: QuickExpenseDocumentResult? = null,
        private val failure: Throwable? = null,
    ) : QuickExpenseDocumentStore {
        val requests = mutableListOf<WriteRequest>()

        override fun createIfAbsentOrMatch(
            collectionPath: String,
            documentId: String,
            fields: Map<String, Any>,
            onComplete: (Result<QuickExpenseDocumentResult>) -> Unit,
        ) {
            requests += WriteRequest(collectionPath, documentId, fields)
            if (failure != null) {
                onComplete(Result.failure(failure))
            } else {
                onComplete(Result.success(requireNotNull(outcome)))
            }
        }
    }

    private data class WriteRequest(
        val collectionPath: String,
        val documentId: String,
        val fields: Map<String, Any>,
    )

    private companion object {
        const val USER_ID = "firebase-user"
        const val OCCURRED_AT = 1_789_300_800_000L
        const val CANDIDATE_ID =
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
}

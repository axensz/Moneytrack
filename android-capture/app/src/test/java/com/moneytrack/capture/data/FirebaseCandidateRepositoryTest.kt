package com.moneytrack.capture.data

import com.google.firebase.Timestamp
import com.moneytrack.capture.core.NormalizedPurchaseCandidate
import com.moneytrack.capture.core.PurchaseConfidence
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class FirebaseCandidateRepositoryTest {
    @Test
    fun `writes the deterministic document at the authenticated user path`() {
        val sink = FakeDocumentSink()
        val repository = FirebaseCandidateRepository(USER_ID, sink)

        repository.save(candidate()) {}
        repository.save(candidate()) {}

        assertEquals(2, sink.requests.size)
        assertTrue(sink.requests.all { it.collectionPath == "users/$USER_ID/transactionImportCandidates" })
        assertTrue(sink.requests.all { it.documentId == CANDIDATE_ID })
    }

    @Test
    fun `writes only the exact normalized pending payload`() {
        val sink = FakeDocumentSink()
        FirebaseCandidateRepository(USER_ID, sink).save(candidate()) {}

        val fields = sink.requests.single().fields
        assertEquals(
            setOf(
                "schemaVersion",
                "source",
                "sourcePackage",
                "occurredAt",
                "amountMinor",
                "currency",
                "merchant",
                "cardLast4",
                "parserId",
                "parserVersion",
                "confidence",
                "status",
            ),
            fields.keys,
        )
        assertEquals(1L, fields["schemaVersion"])
        assertEquals("android-notification", fields["source"])
        assertEquals("com.example.bank", fields["sourcePackage"])
        assertEquals(1_735_689_600_123L, (fields["occurredAt"] as Timestamp).toDate().time)
        assertEquals(12_345_67L, fields["amountMinor"])
        assertEquals("COP", fields["currency"])
        assertEquals("Café Central", fields["merchant"])
        assertEquals("4321", fields["cardLast4"])
        assertEquals("strict-cop-purchase", fields["parserId"])
        assertEquals(1L, fields["parserVersion"])
        assertEquals("high", fields["confidence"])
        assertEquals("pending", fields["status"])
    }

    @Test
    fun `omits optional last four and every raw or sensitive key`() {
        val sink = FakeDocumentSink()
        FirebaseCandidateRepository(USER_ID, sink).save(candidate(cardLast4 = null)) {}

        val keys = sink.requests.single().fields.keys
        assertFalse("cardLast4" in keys)
        assertTrue(
            keys.intersect(
                setOf(
                    "title",
                    "text",
                    "bigText",
                    "subText",
                    "rawPayload",
                    "pan",
                    "cvv",
                    "otp",
                    "deviceInstallId",
                ),
            ).isEmpty(),
        )
    }

    @Test
    fun `writes Wallet v2 parser metadata and bounded observed nickname`() {
        val sink = FakeDocumentSink()
        FirebaseCandidateRepository(USER_ID, sink).save(walletCandidate()) {}

        val fields = sink.requests.single().fields
        assertEquals(2L, fields["schemaVersion"])
        assertEquals("google-wallet-purchase", fields["parserId"])
        assertEquals("Oro", fields["observedInstrumentLabel"])
        assertFalse("cardLast4" in fields)
        assertTrue(
            fields.keys.intersect(
                setOf("title", "text", "bigText", "subText", "rawPayload", "pan", "cvv", "otp"),
            ).isEmpty(),
        )
    }

    @Test
    fun `maps all sink failures to one generic result`() {
        val sink = FakeDocumentSink()
        val repository = FirebaseCandidateRepository(USER_ID, sink)
        var first: CandidateWriteResult? = null
        var second: CandidateWriteResult? = null

        repository.save(candidate()) { first = it }
        sink.requests.single().complete(Result.failure(IllegalStateException("private server detail")))
        assertEquals(1, sink.readRequests.size)
        sink.readRequests.single().complete(Result.failure(IllegalStateException("private server detail")))
        sink.requests.clear()
        sink.readRequests.clear()
        repository.save(candidate()) { second = it }
        sink.requests.single().complete(Result.failure(SecurityException("different sensitive detail")))
        assertEquals(1, sink.readRequests.size)
        sink.readRequests.single().complete(Result.failure(SecurityException("different sensitive detail")))

        assertSame(CandidateWriteResult.WRITE_FAILED, first)
        assertSame(CandidateWriteResult.WRITE_FAILED, second)
    }

    @Test
    fun `reconciles a failed write with a matching confirmed server document`() {
        val sink = FakeDocumentSink()
        var result: CandidateWriteResult? = null

        FirebaseCandidateRepository(USER_ID, sink).save(candidate()) { result = it }
        sink.requests.single().complete(Result.failure(IllegalStateException("callback lost")))
        assertEquals(1, sink.readRequests.size)
        val read = sink.readRequests.single()
        assertEquals("users/$USER_ID/transactionImportCandidates", read.collectionPath)
        assertEquals(CANDIDATE_ID, read.documentId)
        read.complete(Result.success(serverFields(status = "confirmed")))

        assertSame(CandidateWriteResult.STORED, result)
    }

    @Test
    fun `reconciles a failed write with a matching dismissed server document`() {
        val sink = FakeDocumentSink()
        var result: CandidateWriteResult? = null

        FirebaseCandidateRepository(USER_ID, sink).save(candidate()) { result = it }
        sink.requests.single().complete(Result.failure(IllegalStateException("callback lost")))
        assertEquals(1, sink.readRequests.size)
        sink.readRequests.single().complete(Result.success(serverFields(status = "dismissed")))

        assertSame(CandidateWriteResult.STORED, result)
    }

    @Test
    fun `keeps a failed write failed when the server document differs`() {
        val sink = FakeDocumentSink()
        var result: CandidateWriteResult? = null

        FirebaseCandidateRepository(USER_ID, sink).save(candidate()) { result = it }
        sink.requests.single().complete(Result.failure(IllegalStateException("callback lost")))
        assertEquals(1, sink.readRequests.size)
        sink.readRequests.single().complete(Result.success(serverFields(amountMinor = 1L)))

        assertSame(CandidateWriteResult.WRITE_FAILED, result)
    }

    @Test
    fun `keeps a failed write failed when an optional normalized field differs`() {
        val sink = FakeDocumentSink()
        var result: CandidateWriteResult? = null

        FirebaseCandidateRepository(USER_ID, sink).save(candidate()) { result = it }
        sink.requests.single().complete(Result.failure(IllegalStateException("callback lost")))
        sink.readRequests.single().complete(
            Result.success(serverFields() + ("observedInstrumentLabel" to "Oro")),
        )

        assertSame(CandidateWriteResult.WRITE_FAILED, result)
    }

    @Test
    fun `keeps a failed write failed when the server document is absent`() {
        val sink = FakeDocumentSink()
        var result: CandidateWriteResult? = null

        FirebaseCandidateRepository(USER_ID, sink).save(candidate()) { result = it }
        sink.requests.single().complete(Result.failure(IllegalStateException("callback lost")))
        assertEquals(1, sink.readRequests.size)
        sink.readRequests.single().complete(Result.success(null))

        assertSame(CandidateWriteResult.WRITE_FAILED, result)
    }

    @Test
    fun `keeps a failed write failed when the server read fails`() {
        val sink = FakeDocumentSink()
        var result: CandidateWriteResult? = null

        FirebaseCandidateRepository(USER_ID, sink).save(candidate()) { result = it }
        sink.requests.single().complete(Result.failure(IllegalStateException("callback lost")))
        assertEquals(1, sink.readRequests.size)
        sink.readRequests.single().complete(Result.failure(SecurityException("server unavailable")))

        assertSame(CandidateWriteResult.WRITE_FAILED, result)
    }

    @Test
    fun `keeps a failed write failed when the server read throws synchronously`() {
        val sink = FakeDocumentSink(readError = SecurityException("server unavailable"))
        var result: CandidateWriteResult? = null

        FirebaseCandidateRepository(USER_ID, sink).save(candidate()) { result = it }
        sink.requests.single().complete(Result.failure(IllegalStateException("callback lost")))

        assertEquals(1, sink.readRequests.size)
        assertSame(CandidateWriteResult.WRITE_FAILED, result)
    }

    @Test
    fun `reports stored without exposing sink output`() {
        val sink = FakeDocumentSink()
        var result: CandidateWriteResult? = null

        FirebaseCandidateRepository(USER_ID, sink).save(candidate()) { result = it }
        sink.requests.single().complete(Result.success(Unit))

        assertSame(CandidateWriteResult.STORED, result)
    }

    private fun candidate(cardLast4: String? = "4321") = NormalizedPurchaseCandidate(
        candidateId = CANDIDATE_ID,
        sourcePackage = "com.example.bank",
        occurredAtEpochMillis = 1_735_689_600_123L,
        amountMinor = 12_345_67L,
        merchant = "Café Central",
        cardLast4 = cardLast4,
        confidence = PurchaseConfidence.HIGH,
    )

    private fun walletCandidate() = NormalizedPurchaseCandidate(
        candidateId = CANDIDATE_ID,
        schemaVersion = 2,
        sourcePackage = "com.google.android.apps.walletnfcrel",
        occurredAtEpochMillis = 1_735_689_600_123L,
        amountMinor = 260_000L,
        merchant = "OXXO EDS PORTAL DE NIQ",
        cardLast4 = null,
        observedInstrumentLabel = "Oro",
        parserId = "google-wallet-purchase",
        confidence = PurchaseConfidence.MEDIUM,
    )

    private fun serverFields(
        status: String = "pending",
        amountMinor: Long = 12_345_67L,
    ): Map<String, Any> = mapOf(
        "schemaVersion" to 1L,
        "source" to "android-notification",
        "sourcePackage" to "com.example.bank",
        "occurredAt" to Timestamp(java.util.Date(1_735_689_600_123L)),
        "amountMinor" to amountMinor,
        "currency" to "COP",
        "merchant" to "Café Central",
        "cardLast4" to "4321",
        "parserId" to "strict-cop-purchase",
        "parserVersion" to 1L,
        "confidence" to "high",
        "status" to status,
    )

    private class FakeDocumentSink(
        private val readError: RuntimeException? = null,
    ) : CandidateDocumentSink {
        val requests = mutableListOf<WriteRequest>()
        val readRequests = mutableListOf<ReadRequest>()

        override fun setDocument(
            collectionPath: String,
            documentId: String,
            fields: Map<String, Any>,
            onComplete: (Result<Unit>) -> Unit,
        ) {
            requests += WriteRequest(collectionPath, documentId, fields, onComplete)
        }

        override fun getDocument(
            collectionPath: String,
            documentId: String,
            onComplete: (Result<Map<String, Any>?>) -> Unit,
        ) {
            readRequests += ReadRequest(collectionPath, documentId, onComplete)
            readError?.let { throw it }
        }
    }

    private data class WriteRequest(
        val collectionPath: String,
        val documentId: String,
        val fields: Map<String, Any>,
        val complete: (Result<Unit>) -> Unit,
    )

    private data class ReadRequest(
        val collectionPath: String,
        val documentId: String,
        val complete: (Result<Map<String, Any>?>) -> Unit,
    )

    companion object {
        private const val USER_ID = "firebase-user"
        private const val CANDIDATE_ID =
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
}

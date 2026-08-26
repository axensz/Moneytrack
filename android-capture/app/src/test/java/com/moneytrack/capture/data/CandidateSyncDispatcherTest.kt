package com.moneytrack.capture.data

import android.content.SharedPreferences
import com.moneytrack.capture.core.NormalizedPurchaseCandidate
import com.moneytrack.capture.core.PurchaseConfidence
import com.moneytrack.capture.preferences.CandidateSyncOverview
import com.moneytrack.capture.preferences.CapturePreferences
import java.lang.reflect.Proxy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CandidateSyncDispatcherTest {
    @Test
    fun `one in-flight write is retried by a new dispatcher after failure`() {
        val storedValues = mutableMapOf<String, Any?>()
        val preferences = capturePreferences(storedValues)
        val candidate = candidate()
        preferences.prepareCandidateForDelivery(USER_ID, PACKAGE_NAME, NOTIFICATION_KEY, candidate)
        val writes = mutableListOf<(CandidateWriteResult) -> Unit>()
        val dispatcher = CandidateSyncDispatcher(USER_ID, preferences) { anchored, onResult ->
            assertEquals(candidate, anchored)
            writes += onResult
        }

        assertTrue(dispatcher.sync(candidate))
        assertFalse(dispatcher.sync(candidate))
        assertEquals(1, writes.size)
        assertEquals(CandidateSyncOverview.PENDING, preferences.candidateSyncOverview(USER_ID))

        writes.single()(CandidateWriteResult.WRITE_FAILED)
        assertEquals(CandidateSyncOverview.FAILED, preferences.candidateSyncOverview(USER_ID))

        val restartedPreferences = capturePreferences(storedValues)
        val retriedWrites = mutableListOf<(CandidateWriteResult) -> Unit>()
        CandidateSyncDispatcher(USER_ID, restartedPreferences) { anchored, onResult ->
            assertEquals(candidate, anchored)
            retriedWrites += onResult
        }.reconcile()

        assertEquals(1, retriedWrites.size)
        assertEquals(CandidateSyncOverview.PENDING, restartedPreferences.candidateSyncOverview(USER_ID))
        retriedWrites.single()(CandidateWriteResult.STORED)
        assertEquals(CandidateSyncOverview.IDLE, restartedPreferences.candidateSyncOverview(USER_ID))
        assertTrue(restartedPreferences.candidatesNeedingRetry(USER_ID).isEmpty())
    }

    @Test
    fun `synchronous repository failure remains retryable`() {
        val preferences = capturePreferences()
        val candidate = candidate()
        preferences.prepareCandidateForDelivery(USER_ID, PACKAGE_NAME, NOTIFICATION_KEY, candidate)
        var result: CandidateWriteResult? = null
        val dispatcher = CandidateSyncDispatcher(USER_ID, preferences) { _, _ ->
            throw IllegalStateException("transport unavailable")
        }

        assertTrue(dispatcher.sync(candidate) { result = it })

        assertEquals(CandidateWriteResult.WRITE_FAILED, result)
        assertEquals(CandidateSyncOverview.FAILED, preferences.candidateSyncOverview(USER_ID))
        assertEquals(listOf(candidate), preferences.candidatesNeedingRetry(USER_ID))
    }

    @Test
    fun `pending candidate is retried only by its owning user scope`() {
        val storedValues = mutableMapOf<String, Any?>()
        val preferences = capturePreferences(storedValues)
        val candidate = candidate()
        preferences.prepareCandidateForDelivery(
            USER_ID,
            PACKAGE_NAME,
            NOTIFICATION_KEY,
            candidate,
        )
        var otherUserWrites = 0

        CandidateSyncDispatcher(OTHER_USER_ID, preferences) { _, _ ->
            otherUserWrites += 1
        }.reconcile()

        assertEquals(0, otherUserWrites)
        assertEquals(CandidateSyncOverview.IDLE, preferences.candidateSyncOverview(OTHER_USER_ID))
        assertEquals(CandidateSyncOverview.PENDING, preferences.candidateSyncOverview(USER_ID))
        assertFalse(storedValues.toString().contains(USER_ID))

        var ownerWrites = 0
        CandidateSyncDispatcher(USER_ID, preferences) { _, onResult ->
            ownerWrites += 1
            onResult(CandidateWriteResult.STORED)
        }.reconcile()

        assertEquals(1, ownerWrites)
        assertEquals(CandidateSyncOverview.IDLE, preferences.candidateSyncOverview(USER_ID))
    }

    private fun candidate() = NormalizedPurchaseCandidate(
        candidateId = CANDIDATE_ID,
        sourcePackage = PACKAGE_NAME,
        occurredAtEpochMillis = 1_735_689_600_123L,
        amountMinor = 12_345_67L,
        merchant = "Café Central",
        cardLast4 = "4321",
        confidence = PurchaseConfidence.HIGH,
    )

    private fun capturePreferences(
        values: MutableMap<String, Any?> = mutableMapOf(),
    ): CapturePreferences = CapturePreferences::class.java
        .getDeclaredConstructor(SharedPreferences::class.java)
        .apply { isAccessible = true }
        .newInstance(inMemoryPreferences(values))

    private fun inMemoryPreferences(values: MutableMap<String, Any?>): SharedPreferences =
        Proxy.newProxyInstance(
            javaClass.classLoader,
            arrayOf(SharedPreferences::class.java),
        ) { _, method, arguments ->
            when (method.name) {
                "getString" -> values[arguments!![0]] as? String ?: arguments[1]
                "getStringSet" -> (values[arguments!![0]] as? Set<*>)
                    ?.filterIsInstance<String>()
                    ?.toSet()
                    ?: arguments[1]
                "edit" -> editor(values)
                else -> error("Unexpected SharedPreferences call: ${method.name}")
            }
        } as SharedPreferences

    private fun editor(values: MutableMap<String, Any?>): SharedPreferences.Editor {
        lateinit var editor: SharedPreferences.Editor
        editor = Proxy.newProxyInstance(
            javaClass.classLoader,
            arrayOf(SharedPreferences.Editor::class.java),
        ) { _, method, arguments ->
            when (method.name) {
                "putString", "putStringSet" -> {
                    values[arguments!![0] as String] = arguments[1]
                    editor
                }
                "remove" -> {
                    values.remove(arguments!![0] as String)
                    editor
                }
                "apply" -> Unit
                "commit" -> true
                else -> error("Unexpected SharedPreferences.Editor call: ${method.name}")
            }
        } as SharedPreferences.Editor
        return editor
    }

    companion object {
        private const val USER_ID = "firebase-user"
        private const val OTHER_USER_ID = "different-firebase-user"
        private const val PACKAGE_NAME = "com.example.bank"
        private const val NOTIFICATION_KEY = "0|com.example.bank|purchase|42"
        private const val CANDIDATE_ID =
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
}

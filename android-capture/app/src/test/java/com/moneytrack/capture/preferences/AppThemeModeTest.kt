package com.moneytrack.capture.preferences

import android.content.SharedPreferences
import com.moneytrack.capture.core.NormalizedPurchaseCandidate
import com.moneytrack.capture.core.PurchaseConfidence
import java.lang.reflect.Proxy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AppThemeModeTest {
    @Test
    fun `wire values parse and invalid falls back to system`() {
        assertEquals(AppThemeMode.SYSTEM, AppThemeMode.fromWireValue("system"))
        assertEquals(AppThemeMode.LIGHT, AppThemeMode.fromWireValue("light"))
        assertEquals(AppThemeMode.DARK, AppThemeMode.fromWireValue("dark"))
        assertEquals(AppThemeMode.SYSTEM, AppThemeMode.fromWireValue("unexpected"))
    }

    @Test
    fun `theme mode persists independently from capture settings`() {
        val preferences = capturePreferences()

        preferences.captureEnabled = true
        preferences.setAllowedPackages(setOf("com.example.wallet"))
        preferences.appThemeMode = AppThemeMode.DARK

        assertEquals(AppThemeMode.DARK, preferences.appThemeMode)
        assertEquals(true, preferences.captureEnabled)
        assertEquals(setOf("com.example.wallet"), preferences.allowedPackages())
    }

    @Test
    fun `notification updates reuse one delivery generation until removal`() {
        val storedValues = mutableMapOf<String, Any?>()
        val preferences = capturePreferences(storedValues)
        val packageName = "com.example.bank"
        val notificationKey = "0|com.example.bank|purchase|42"

        assertEquals(
            1_000L,
            preferences.notificationDeliveryStartedAt(packageName, notificationKey, 1_000L),
        )
        assertEquals(
            1_000L,
            preferences.notificationDeliveryStartedAt(packageName, notificationKey, 2_000L),
        )

        preferences.forgetNotificationDelivery(packageName, notificationKey)

        assertEquals(
            3_000L,
            preferences.notificationDeliveryStartedAt(packageName, notificationKey, 3_000L),
        )
        assertFalse(storedValues.keys.any { it.contains(notificationKey) })
    }

    @Test
    fun `active delivery never splits by age and stale delivery is reconciled`() {
        val preferences = capturePreferences()
        val packageName = "com.example.bank"
        val notificationKey = "0|com.example.bank|purchase|42"

        assertEquals(
            1_000L,
            preferences.notificationDeliveryStartedAt(packageName, notificationKey, 1_000L),
        )
        assertEquals(
            1_000L,
            preferences.notificationDeliveryStartedAt(
                packageName,
                notificationKey,
                1_000L + 48 * 60 * 60 * 1_000L,
            ),
        )

        preferences.reconcileActiveNotificationDeliveries(
            listOf(ActiveNotificationDelivery(packageName, notificationKey)),
        )
        assertEquals(
            1_000L,
            preferences.notificationDeliveryStartedAt(packageName, notificationKey, 9_000L),
        )

        preferences.reconcileActiveNotificationDeliveries(emptyList())
        assertEquals(
            10_000L,
            preferences.notificationDeliveryStartedAt(packageName, notificationKey, 10_000L),
        )
    }

    @Test
    fun `first normalized payload survives restart and anchors notification updates`() {
        val storedValues = mutableMapOf<String, Any?>()
        val preferences = capturePreferences(storedValues)
        val first = candidate(CANDIDATE_A, occurredAt = 1_000L, amountMinor = 12_345L)
        val changedUpdate = first.copy(
            occurredAtEpochMillis = 6_000L,
            amountMinor = 99_999L,
            merchant = "Comercio actualizado",
        )

        val initialRecord = checkNotNull(preferences.prepareCandidateForDelivery(
            USER_ID,
            PACKAGE_NAME,
            NOTIFICATION_KEY,
            first,
        ))
        val updateRecord = checkNotNull(preferences.prepareCandidateForDelivery(
            USER_ID,
            PACKAGE_NAME,
            NOTIFICATION_KEY,
            changedUpdate,
        ))

        assertEquals(first, initialRecord.candidate)
        assertEquals(first, updateRecord.candidate)
        assertEquals(CandidateSyncState.ENQUEUED, updateRecord.state)

        val restarted = capturePreferences(storedValues)
        assertEquals(listOf(first), restarted.candidatesNeedingRetry(USER_ID))
        assertFalse(storedValues.toString().contains(NOTIFICATION_KEY))
    }

    @Test
    fun `Wallet v2 normalized payload survives restart without raw notification text`() {
        val storedValues = mutableMapOf<String, Any?>()
        val preferences = capturePreferences(storedValues)
        val walletCandidate = NormalizedPurchaseCandidate(
            candidateId = CANDIDATE_B,
            schemaVersion = 2,
            sourcePackage = "com.google.android.apps.walletnfcrel",
            occurredAtEpochMillis = 2_000L,
            amountMinor = 260_000L,
            merchant = "OXXO EDS PORTAL DE NIQ",
            cardLast4 = null,
            observedInstrumentLabel = "Oro",
            parserId = "google-wallet-purchase",
            confidence = PurchaseConfidence.MEDIUM,
        )

        preferences.prepareCandidateForDelivery(
            USER_ID,
            "com.google.android.apps.walletnfcrel",
            "wallet-notification-key",
            walletCandidate,
        )

        assertEquals(
            listOf(walletCandidate),
            capturePreferences(storedValues).candidatesNeedingRetry(USER_ID),
        )
        assertFalse(storedValues.toString().contains("wallet-notification-key"))
    }

    @Test
    fun `legacy sync record v2 remains readable after local format upgrade`() {
        val legacyRecord = listOf(
            "2",
            "c7185b8fa071b1d87801c001de6ed8169638f487e2852c24afb895d1165a797f",
            CANDIDATE_A,
            "enqueued",
            "Y29tLmV4YW1wbGUuYmFuaw",
            "1000",
            "12345",
            "Q29tZXJjaW8gaW5pY2lhbA",
            "1234",
            "high",
        ).joinToString("|")
        val preferences = capturePreferences(
            mutableMapOf("sync_candidate_records" to setOf(legacyRecord)),
        )

        assertEquals(
            listOf(candidate(CANDIDATE_A, occurredAt = 1_000L, amountMinor = 12_345L)),
            preferences.candidatesNeedingRetry(USER_ID),
        )
    }

    @Test
    fun `sync failures are candidate scoped and clear only after each candidate is stored`() {
        val preferences = capturePreferences()
        val first = candidate(CANDIDATE_A, occurredAt = 1_000L, amountMinor = 12_345L)
        val second = candidate(CANDIDATE_B, occurredAt = 2_000L, amountMinor = 54_321L)
        preferences.prepareCandidateForDelivery(USER_ID, PACKAGE_NAME, NOTIFICATION_KEY, first)
        preferences.prepareCandidateForDelivery(
            USER_ID,
            PACKAGE_NAME,
            "$NOTIFICATION_KEY-second",
            second,
        )

        preferences.recordCandidateWriteResult(USER_ID, first.candidateId, stored = false)
        preferences.recordCandidateWriteResult(USER_ID, second.candidateId, stored = false)
        preferences.appThemeMode = AppThemeMode.LIGHT
        assertEquals(CandidateSyncOverview.FAILED, preferences.candidateSyncOverview(USER_ID))

        preferences.recordCandidateWriteResult(USER_ID, first.candidateId, stored = true)
        assertEquals(CandidateSyncOverview.FAILED, preferences.candidateSyncOverview(USER_ID))
        assertEquals(listOf(second), preferences.candidatesNeedingRetry(USER_ID))

        preferences.recordCandidateWriteResult(USER_ID, second.candidateId, stored = true)
        assertEquals(CandidateSyncOverview.IDLE, preferences.candidateSyncOverview(USER_ID))
        assertTrue(preferences.candidatesNeedingRetry(USER_ID).isEmpty())
    }

    @Test
    fun `active delivery cannot move its candidate to another signed in user`() {
        val storedValues = mutableMapOf<String, Any?>()
        val preferences = capturePreferences(storedValues)
        val candidate = candidate(CANDIDATE_A, occurredAt = 1_000L, amountMinor = 12_345L)

        val ownerRecord = preferences.prepareCandidateForDelivery(
            USER_ID,
            PACKAGE_NAME,
            NOTIFICATION_KEY,
            candidate,
        )
        val otherUserRecord = preferences.prepareCandidateForDelivery(
            OTHER_USER_ID,
            PACKAGE_NAME,
            NOTIFICATION_KEY,
            candidate,
        )

        assertEquals(candidate, ownerRecord?.candidate)
        assertNull(otherUserRecord)
        assertEquals(listOf(candidate), preferences.candidatesNeedingRetry(USER_ID))
        assertTrue(preferences.candidatesNeedingRetry(OTHER_USER_ID).isEmpty())
        assertFalse(storedValues.toString().contains(USER_ID))
        assertFalse(storedValues.toString().contains(OTHER_USER_ID))
    }

    private fun candidate(
        id: String,
        occurredAt: Long,
        amountMinor: Long,
    ) = NormalizedPurchaseCandidate(
        candidateId = id,
        sourcePackage = PACKAGE_NAME,
        occurredAtEpochMillis = occurredAt,
        amountMinor = amountMinor,
        merchant = "Comercio inicial",
        cardLast4 = "1234",
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
                "getBoolean" -> values[arguments!![0]] as? Boolean ?: arguments[1]
                "getString" -> values[arguments!![0]] as? String ?: arguments[1]
                "getStringSet" -> (values[arguments!![0]] as? Set<*>)
                    ?.filterIsInstance<String>()
                    ?.toSet()
                    ?: arguments[1]
                "getLong" -> values[arguments!![0]] as? Long ?: arguments[1]
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
                "putBoolean", "putString", "putStringSet", "putLong" -> {
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
        private const val CANDIDATE_A =
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        private const val CANDIDATE_B =
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
}

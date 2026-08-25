package com.moneytrack.capture.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationCaptureCoordinatorTest {
    @Test
    fun `wrong package never inspects raw content or calls repository`() {
        var rawInspected = false
        val writes = mutableListOf<NormalizedPurchaseCandidate>()
        val results = mutableListOf<CaptureResultCode>()
        val coordinator = coordinator(writes)

        coordinator.process(
            state = readyState(allowedPackages = setOf("com.allowed.bank")),
            installationId = INSTALLATION_ID,
            event = metadata(packageName = "com.other.bank"),
            rawProvider = {
                rawInspected = true
                raw()
            },
            onResult = results::add,
        )

        assertFalse(rawInspected)
        assertTrue(writes.isEmpty())
        assertEquals(listOf(CaptureResultCode.PACKAGE_NOT_ALLOWED), results)
    }

    @Test
    fun `parser rejection never calls repository`() {
        val writes = mutableListOf<NormalizedPurchaseCandidate>()
        val results = mutableListOf<CaptureResultCode>()

        coordinator(writes).process(
            state = readyState(),
            installationId = INSTALLATION_ID,
            event = metadata(),
            rawProvider = { raw(text = "Tu compra fue rechazada por el banco") },
            onResult = results::add,
        )

        assertTrue(writes.isEmpty())
        assertEquals(listOf(CaptureResultCode.FORBIDDEN_MARKER), results)
    }

    @Test
    fun `raw inspection failure is generic and never calls repository`() {
        val writes = mutableListOf<NormalizedPurchaseCandidate>()
        val results = mutableListOf<CaptureResultCode>()

        coordinator(writes).process(
            state = readyState(),
            installationId = INSTALLATION_ID,
            event = metadata(),
            rawProvider = { error("private notification detail") },
            onResult = results::add,
        )

        assertTrue(writes.isEmpty())
        assertEquals(listOf(CaptureResultCode.INSPECTION_FAILED), results)
    }

    @Test
    fun `duplicate delivery uses the same candidate document identity`() {
        val writes = mutableListOf<NormalizedPurchaseCandidate>()
        val results = mutableListOf<CaptureResultCode>()
        val coordinator = coordinator(writes)

        repeat(2) {
            coordinator.process(
                state = readyState(),
                installationId = INSTALLATION_ID,
                event = metadata(),
                rawProvider = { raw() },
                onResult = results::add,
            )
        }

        assertEquals(2, writes.size)
        assertEquals(writes[0].candidateId, writes[1].candidateId)
        assertTrue(writes[0].candidateId.matches(Regex("[a-f0-9]{64}")))
        assertEquals(
            listOf(
                CaptureResultCode.ACCEPTED_HIGH,
                CaptureResultCode.STORED,
                CaptureResultCode.ACCEPTED_HIGH,
                CaptureResultCode.STORED,
            ),
            results,
        )
    }

    @Test
    fun `an update with a new post time keeps the active delivery identity`() {
        val writes = mutableListOf<NormalizedPurchaseCandidate>()
        val coordinator = coordinator(writes)

        listOf(POSTED_AT, POSTED_AT + 5_000L).forEach { observedAt ->
            coordinator.process(
                state = readyState(),
                installationId = INSTALLATION_ID,
                event = metadata(
                    postedAtEpochMillis = observedAt,
                    deliveryStartedAtEpochMillis = POSTED_AT,
                ),
                rawProvider = { raw(postedAtEpochMillis = observedAt) },
                onResult = {},
            )
        }

        assertEquals(2, writes.size)
        assertEquals(writes[0].candidateId, writes[1].candidateId)
    }

    private fun coordinator(writes: MutableList<NormalizedPurchaseCandidate>) =
        NotificationCaptureCoordinator(
            writeCandidate = { candidate, onComplete ->
                writes += candidate
                onComplete(true)
            },
        )

    private fun readyState(allowedPackages: Set<String> = setOf(PACKAGE_NAME)) =
        CaptureEligibilityState(
            signedIn = true,
            captureEnabled = true,
            notificationAccessGranted = true,
            allowedPackages = allowedPackages,
        )

    private fun metadata(
        packageName: String = PACKAGE_NAME,
        postedAtEpochMillis: Long = POSTED_AT,
        deliveryStartedAtEpochMillis: Long = postedAtEpochMillis,
    ) = NotificationEventMetadata(
        packageName = packageName,
        notificationKey = "0|$packageName|purchase|42",
        postedAtEpochMillis = postedAtEpochMillis,
        deliveryStartedAtEpochMillis = deliveryStartedAtEpochMillis,
    )

    private fun raw(
        text: String = "Compra por COP 12.345,67 en Café Central con tarjeta terminada en 4321",
        postedAtEpochMillis: Long = POSTED_AT,
    ) =
        RawNotification(
            packageName = PACKAGE_NAME,
            notificationKey = "0|$PACKAGE_NAME|purchase|42",
            postedAtEpochMillis = postedAtEpochMillis,
            title = "Movimiento",
            text = text,
            bigText = null,
            subText = null,
        )

    companion object {
        private const val INSTALLATION_ID = "901302f4-0014-4ad7-a734-9e9af98d7257"
        private const val PACKAGE_NAME = "com.example.bank"
        private const val POSTED_AT = 1_735_689_600_123L
    }
}

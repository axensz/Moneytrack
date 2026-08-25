package com.moneytrack.capture.core

data class NotificationEventMetadata(
    val packageName: String,
    val notificationKey: String,
    val postedAtEpochMillis: Long,
)

enum class CaptureResultCode {
    SIGNED_OUT,
    CAPTURE_DISABLED,
    NOTIFICATION_ACCESS_MISSING,
    ALLOWLIST_EMPTY,
    PACKAGE_NOT_ALLOWED,
    NO_PURCHASE_MARKER,
    FORBIDDEN_MARKER,
    NO_COP_AMOUNT,
    AMBIGUOUS_AMOUNT,
    UNSUPPORTED_CURRENCY,
    MALFORMED_AMOUNT,
    ACCEPTED_HIGH,
    ACCEPTED_MEDIUM,
    STORED,
    WRITE_FAILED,
    INSPECTION_FAILED,
}

class NotificationCaptureCoordinator(
    private val parser: StrictCopPurchaseParser = StrictCopPurchaseParser(),
    private val writeCandidate: (
        NormalizedPurchaseCandidate,
        (Boolean) -> Unit,
    ) -> Unit,
) {
    fun process(
        state: CaptureEligibilityState,
        installationId: String,
        event: NotificationEventMetadata,
        rawProvider: () -> RawNotification,
        onResult: (CaptureResultCode) -> Unit,
    ) {
        val eligibility = CaptureEligibility.evaluate(state, event.packageName)
        if (eligibility != CaptureEligibilityResult.READY) {
            onResult(eligibility.toCaptureCode())
            return
        }

        val candidateId = try {
            CandidateFingerprint.create(
                deviceInstallId = installationId,
                packageName = event.packageName,
                notificationKey = event.notificationKey,
                postedAtEpochMillis = event.postedAtEpochMillis,
            )
        } catch (_: RuntimeException) {
            onResult(CaptureResultCode.INSPECTION_FAILED)
            return
        }

        val parseResult = try {
            val raw = rawProvider()
            if (
                raw.packageName != event.packageName ||
                raw.notificationKey != event.notificationKey ||
                raw.postedAtEpochMillis != event.postedAtEpochMillis
            ) {
                onResult(CaptureResultCode.INSPECTION_FAILED)
                return
            }
            parser.parse(raw, candidateId)
        } catch (_: RuntimeException) {
            onResult(CaptureResultCode.INSPECTION_FAILED)
            return
        }

        when (parseResult) {
            is PurchaseParseResult.Rejected -> onResult(parseResult.code.toCaptureCode())
            is PurchaseParseResult.Accepted -> {
                onResult(parseResult.code.toCaptureCode())
                try {
                    writeCandidate(parseResult.candidate) { stored ->
                        onResult(
                            if (stored) {
                                CaptureResultCode.STORED
                            } else {
                                CaptureResultCode.WRITE_FAILED
                            },
                        )
                    }
                } catch (_: RuntimeException) {
                    onResult(CaptureResultCode.WRITE_FAILED)
                }
            }
        }
    }

    private fun CaptureEligibilityResult.toCaptureCode(): CaptureResultCode = when (this) {
        CaptureEligibilityResult.SIGNED_OUT -> CaptureResultCode.SIGNED_OUT
        CaptureEligibilityResult.CAPTURE_DISABLED -> CaptureResultCode.CAPTURE_DISABLED
        CaptureEligibilityResult.NOTIFICATION_ACCESS_MISSING ->
            CaptureResultCode.NOTIFICATION_ACCESS_MISSING
        CaptureEligibilityResult.ALLOWLIST_EMPTY -> CaptureResultCode.ALLOWLIST_EMPTY
        CaptureEligibilityResult.PACKAGE_NOT_ALLOWED -> CaptureResultCode.PACKAGE_NOT_ALLOWED
        CaptureEligibilityResult.READY -> error("Ready is handled before result mapping")
    }

    private fun PurchaseParseCode.toCaptureCode(): CaptureResultCode = when (this) {
        PurchaseParseCode.ACCEPTED_HIGH -> CaptureResultCode.ACCEPTED_HIGH
        PurchaseParseCode.ACCEPTED_MEDIUM -> CaptureResultCode.ACCEPTED_MEDIUM
        PurchaseParseCode.NO_PURCHASE_MARKER -> CaptureResultCode.NO_PURCHASE_MARKER
        PurchaseParseCode.FORBIDDEN_MARKER -> CaptureResultCode.FORBIDDEN_MARKER
        PurchaseParseCode.NO_COP_AMOUNT -> CaptureResultCode.NO_COP_AMOUNT
        PurchaseParseCode.AMBIGUOUS_AMOUNT -> CaptureResultCode.AMBIGUOUS_AMOUNT
        PurchaseParseCode.UNSUPPORTED_CURRENCY -> CaptureResultCode.UNSUPPORTED_CURRENCY
        PurchaseParseCode.MALFORMED_AMOUNT -> CaptureResultCode.MALFORMED_AMOUNT
    }
}

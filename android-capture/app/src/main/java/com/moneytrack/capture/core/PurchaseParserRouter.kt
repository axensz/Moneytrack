package com.moneytrack.capture.core

class PurchaseParserRouter(
    private val strictParser: StrictCopPurchaseParser = StrictCopPurchaseParser(),
    private val googleWalletParser: GoogleWalletPurchaseParser = GoogleWalletPurchaseParser(),
) {
    fun parse(
        notification: RawNotification,
        candidateId: String,
        occurredAtEpochMillis: Long = notification.postedAtEpochMillis,
    ): PurchaseParseResult = if (
        notification.packageName == AvailableCaptureSourceCatalog.GOOGLE_WALLET_PACKAGE
    ) {
        googleWalletParser.parse(notification, candidateId, occurredAtEpochMillis)
    } else {
        strictParser.parse(notification, candidateId, occurredAtEpochMillis)
    }
}

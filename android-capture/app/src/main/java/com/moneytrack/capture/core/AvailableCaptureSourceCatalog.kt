package com.moneytrack.capture.core

import com.moneytrack.capture.preferences.DiscoveredNotificationSource

enum class CaptureSourceOrigin {
    KNOWN,
    OBSERVED,
}

data class AvailableCaptureSource(
    val packageName: String,
    val label: String,
    val origin: CaptureSourceOrigin,
    val isSelected: Boolean,
)

object AvailableCaptureSourceCatalog {
    const val GOOGLE_WALLET_PACKAGE = "com.google.android.apps.walletnfcrel"
    const val DIAGNOSTIC_SHELL_PACKAGE = "com.android.shell"

    private val googleWallet = AvailableCaptureSource(
        packageName = GOOGLE_WALLET_PACKAGE,
        label = "Google Wallet",
        origin = CaptureSourceOrigin.KNOWN,
        isSelected = false,
    )

    fun productAllowedPackages(allowedPackages: Set<String>): Set<String> =
        allowedPackages - DIAGNOSTIC_SHELL_PACKAGE

    fun options(
        observedSources: List<DiscoveredNotificationSource>,
        allowedPackages: Set<String>,
        includeDiagnostics: Boolean = false,
    ): List<AvailableCaptureSource> {
        val effectiveAllowed = if (includeDiagnostics) {
            allowedPackages.toSet()
        } else {
            productAllowedPackages(allowedPackages)
        }
        return (listOf(googleWallet) + observedSources.map { source ->
            AvailableCaptureSource(
                packageName = source.packageName,
                label = source.label,
                origin = CaptureSourceOrigin.OBSERVED,
                isSelected = false,
            )
        })
            .distinctBy { it.packageName }
            .filter { includeDiagnostics || it.packageName != DIAGNOSTIC_SHELL_PACKAGE }
            .map { source -> source.copy(isSelected = source.packageName in effectiveAllowed) }
    }
}

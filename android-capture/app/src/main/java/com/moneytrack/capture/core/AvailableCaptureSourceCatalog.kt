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
    const val GOOGLE_WALLET_LABEL = "Google Wallet"
    const val DIAGNOSTIC_SHELL_PACKAGE = "com.android.shell"

    private val googleWallet = AvailableCaptureSource(
        packageName = GOOGLE_WALLET_PACKAGE,
        label = GOOGLE_WALLET_LABEL,
        origin = CaptureSourceOrigin.KNOWN,
        isSelected = false,
    )
    private val knownSources = listOf(googleWallet)

    val verifiedLabels: Set<String> = knownSources.mapTo(linkedSetOf()) { it.label }

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
        return (knownSources + observedSources.map { source ->
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

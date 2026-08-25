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
    private val googleWallet = AvailableCaptureSource(
        packageName = "com.google.android.apps.walletnfcrel",
        label = "Google Wallet",
        origin = CaptureSourceOrigin.KNOWN,
        isSelected = false,
    )

    fun options(
        observedSources: List<DiscoveredNotificationSource>,
        allowedPackages: Set<String>,
    ): List<AvailableCaptureSource> =
        (listOf(googleWallet) + observedSources.map { source ->
            AvailableCaptureSource(
                packageName = source.packageName,
                label = source.label,
                origin = CaptureSourceOrigin.OBSERVED,
                isSelected = false,
            )
        })
            .distinctBy { it.packageName }
            .map { source -> source.copy(isSelected = source.packageName in allowedPackages) }
}

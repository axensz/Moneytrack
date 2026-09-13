package com.moneytrack.capture.update

import java.util.concurrent.Executor

const val PRIVATE_UPDATE_MANIFEST_URL = "https://axensz.github.io/Moneytrack/android/update.json"

sealed interface UpdateCheckResult {
    data object Current : UpdateCheckResult
    data class Available(val manifest: AndroidUpdateManifest) : UpdateCheckResult
    data object Failed : UpdateCheckResult
}

class UpdateChecker(
    private val transport: UpdateManifestTransport,
    private val decoder: AndroidUpdateManifestDecoder,
    private val installedVersionCode: Long,
) {
    fun checkAsync(executor: Executor, onResult: (UpdateCheckResult) -> Unit) {
        executor.execute { onResult(check()) }
    }

    fun check(): UpdateCheckResult = try {
        val response = transport.fetch(PRIVATE_UPDATE_MANIFEST_URL)
        if (response !is UpdateTransportResult.Success) {
            UpdateCheckResult.Failed
        } else {
            val manifest = decoder.decode(response.body)
            if (manifest == null) {
                UpdateCheckResult.Failed
            } else {
                when (decideUpdate(installedVersionCode, manifest.versionCode)) {
                    UpdateDecision.CURRENT -> UpdateCheckResult.Current
                    UpdateDecision.AVAILABLE -> UpdateCheckResult.Available(manifest)
                }
            }
        }
    } catch (_: Exception) {
        UpdateCheckResult.Failed
    }
}

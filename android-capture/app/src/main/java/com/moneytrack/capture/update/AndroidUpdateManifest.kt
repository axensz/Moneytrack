package com.moneytrack.capture.update

data class AndroidUpdateManifest(
    val schemaVersion: Int,
    val channel: String,
    val versionCode: Long,
    val versionName: String,
    val apkUrl: String,
    val sha256: String,
    val sizeBytes: Long,
    val releaseNotes: List<String>,
)

enum class UpdateDecision {
    CURRENT,
    AVAILABLE,
}

fun decideUpdate(installedVersionCode: Long, remoteVersionCode: Long): UpdateDecision =
    if (remoteVersionCode > installedVersionCode) {
        UpdateDecision.AVAILABLE
    } else {
        UpdateDecision.CURRENT
    }

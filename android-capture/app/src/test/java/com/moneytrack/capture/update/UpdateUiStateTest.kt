package com.moneytrack.capture.update

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UpdateUiStateTest {
    private val manifest = AndroidUpdateManifest(
        schemaVersion = 1,
        channel = "canary",
        versionCode = 3,
        versionName = "0.2.1",
        apkUrl =
            "https://github.com/axensz/Moneytrack/releases/download/android-quick-expense-0.2.1/" +
                "MoneyTrack-Android-0.2.1.apk",
        sha256 = "d952d9448995f41faf4521ea4e6ee0bba04e71dbb7bda5f214d518add878dbdc",
        sizeBytes = 9_942_363,
        releaseNotes = listOf("Acceso rápido"),
    )
    private val apk = File("MoneyTrack-0.2.1.apk")

    @Test
    fun `check results map to hidden available or error`() {
        assertEquals(UpdateUiPhase.HIDDEN, updateUiStateFor(UpdateCheckResult.Current).phase)
        assertEquals(UpdateUiPhase.ERROR, updateUiStateFor(UpdateCheckResult.Failed).phase)

        val available = updateUiStateFor(UpdateCheckResult.Available(manifest))
        assertEquals(UpdateUiPhase.AVAILABLE, available.phase)
        assertEquals(manifest, available.manifest)
    }

    @Test
    fun `download states retain the validated manifest`() {
        val available = UpdateUiState(UpdateUiPhase.AVAILABLE, manifest)

        val downloading = updateUiStateFor(
            available,
            DownloadState.Downloading(downloadedBytes = 100, totalBytes = 400),
        )
        assertEquals(UpdateUiPhase.DOWNLOADING, downloading.phase)
        assertEquals(100, downloading.downloadedBytes)
        assertEquals(400, downloading.totalBytes)

        val ready = updateUiStateFor(available, DownloadState.Ready(apk))
        assertEquals(UpdateUiPhase.READY_TO_INSTALL, ready.phase)
        assertEquals(apk, ready.file)

        val failed = updateUiStateFor(available, DownloadState.Failed)
        assertEquals(UpdateUiPhase.ERROR, failed.phase)
        assertEquals(manifest, failed.manifest)
    }

    @Test
    fun `integrity and signer checks fail closed`() {
        val ready = UpdateUiState(UpdateUiPhase.READY_TO_INSTALL, manifest, apk)

        assertEquals(
            UpdateUiPhase.READY_TO_INSTALL,
            verifiedUpdateUiState(ready, IntegrityResult.Verified, SignatureResult.Verified).phase,
        )
        assertEquals(
            UpdateUiPhase.ERROR,
            verifiedUpdateUiState(ready, IntegrityResult.HashMismatch, SignatureResult.Verified).phase,
        )
        assertEquals(
            UpdateUiPhase.ERROR,
            verifiedUpdateUiState(ready, IntegrityResult.Verified, SignatureResult.DifferentSigner).phase,
        )
    }

    @Test
    fun `permission state keeps the ready APK for an explicit retry`() {
        val ready = UpdateUiState(UpdateUiPhase.READY_TO_INSTALL, manifest, apk)

        val permission = permissionRequiredUpdateUiState(ready)

        assertEquals(UpdateUiPhase.PERMISSION_REQUIRED, permission.phase)
        assertEquals(manifest, permission.manifest)
        assertEquals(apk, permission.file)
        assertNull(UpdateUiState(UpdateUiPhase.HIDDEN).file)
    }
}

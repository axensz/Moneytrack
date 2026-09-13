package com.moneytrack.capture.update

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
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

    @Test
    fun `checks are blocked while an update operation or download is active`() {
        val pending = PendingUpdateDownload(downloadId = 41, versionCode = 3)

        assertTrue(canCheckForUpdate(UpdateUiState(UpdateUiPhase.HIDDEN), busy = false, pending = null))
        assertTrue(canCheckForUpdate(UpdateUiState(UpdateUiPhase.AVAILABLE, manifest), busy = false, pending = null))
        assertFalse(canCheckForUpdate(UpdateUiState(UpdateUiPhase.HIDDEN), busy = true, pending = null))
        assertFalse(canCheckForUpdate(UpdateUiState(UpdateUiPhase.AVAILABLE, manifest), busy = false, pending = pending))
        assertFalse(canCheckForUpdate(UpdateUiState(UpdateUiPhase.DOWNLOADING, manifest), busy = false, pending = null))
        assertFalse(canCheckForUpdate(UpdateUiState(UpdateUiPhase.READY_TO_INSTALL, manifest, apk), busy = false, pending = null))
        assertFalse(canCheckForUpdate(UpdateUiState(UpdateUiPhase.PERMISSION_REQUIRED, manifest, apk), busy = false, pending = null))
    }

    @Test
    fun `stale controller adopts the cached manifest that owns the pending download`() {
        val cached = manifest.copy(versionCode = 4, versionName = "0.2.2")
        val pending = PendingUpdateDownload(downloadId = 42, versionCode = 4)

        assertEquals(
            cached,
            manifestForPendingDownload(
                pending = pending,
                local = manifest,
                cached = cached,
            ),
        )
        assertNull(
            manifestForPendingDownload(
                pending = pending,
                local = manifest,
                cached = null,
            ),
        )
        assertEquals(
            manifest,
            resumeManifestAfterOrphanDownload(local = manifest, cached = null),
        )
    }

    @Test
    fun `a changed or current manifest discards the previous cached update`() {
        val newer = manifest.copy(versionCode = 4, versionName = "0.2.2")

        assertFalse(shouldDiscardCachedUpdate(null, UpdateCheckResult.Current))
        assertTrue(shouldDiscardCachedUpdate(manifest, UpdateCheckResult.Current))
        assertFalse(shouldDiscardCachedUpdate(manifest, UpdateCheckResult.Available(manifest)))
        assertTrue(shouldDiscardCachedUpdate(manifest, UpdateCheckResult.Available(newer)))
        assertFalse(shouldDiscardCachedUpdate(manifest, UpdateCheckResult.Failed))
    }

    @Test
    fun `operation guard rejects overlap and stale completion`() {
        val guard = UpdateOperationGuard()
        val firstOwner = Any()
        val secondOwner = Any()
        val first = requireNotNull(guard.begin(firstOwner))

        assertTrue(guard.busy)
        assertNull(guard.begin(secondOwner))
        guard.invalidate(secondOwner)
        assertTrue(guard.busy)
        assertTrue(guard.isCurrent(firstOwner, first))
        guard.invalidate(firstOwner)
        assertFalse(guard.finish(firstOwner, first))

        val second = requireNotNull(guard.begin(secondOwner))
        assertTrue(guard.finish(secondOwner, second))
        assertFalse(guard.busy)
    }

    @Test
    fun `download completion received during a refresh is consumed afterwards`() {
        val guard = UpdateOperationGuard()
        val owner = Any()
        val completion = DownloadCompletionTracker()
        val pending = PendingUpdateDownload(downloadId = 41, versionCode = 3)
        val operation = requireNotNull(guard.begin(owner))

        completion.record(pending.downloadId)
        assertTrue(guard.finish(owner, operation))

        assertTrue(completion.consume(pending))
        assertFalse(completion.consume(pending))
    }

    @Test
    fun `waiting controller resumes when the process operation becomes available`() {
        val guard = UpdateOperationGuard()
        val firstOwner = Any()
        val waitingOwner = Any()
        val operation = requireNotNull(guard.begin(firstOwner))
        var resumed = false

        guard.runWhenAvailable(waitingOwner) { resumed = true }
        assertFalse(resumed)

        assertTrue(guard.finish(firstOwner, operation))
        assertTrue(resumed)
    }

    @Test
    fun `rejection cleanup keeps immediate retry and another controller serialized`() {
        val guard = UpdateOperationGuard()
        val rejectingOwner = Any()
        val retryingOwner = Any()
        val cleanup = requireNotNull(guard.begin(rejectingOwner))
        var discarded = false

        assertNull(guard.begin(retryingOwner))
        assertTrue(guard.runIfCurrent(rejectingOwner, cleanup) { discarded = true })
        assertTrue(discarded)
        assertTrue(guard.busy)

        assertTrue(guard.finish(rejectingOwner, cleanup))
        assertTrue(guard.begin(retryingOwner) != null)
    }
}

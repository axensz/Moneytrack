package com.moneytrack.capture.update

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ApkDownloadManagerTest {
    @Test
    fun `builds a bounded deterministic APK file name`() {
        assertEquals("MoneyTrack-0.2.1.apk", updateApkFileName("0.2.1"))
        assertEquals("MoneyTrack-canary_3.apk", updateApkFileName("canary_3"))
    }

    @Test
    fun `rejects unsafe or oversized version names`() {
        listOf("", "../0.2.1", "0.2.1/evil", "0.2.1?x", "a".repeat(33)).forEach {
            assertNull(it, updateApkFileName(it))
        }
    }

    @Test
    fun `discard targets only the pending download for the expected release`() {
        val pending = PendingUpdateDownload(downloadId = 41, versionCode = 3)
        val replacement = PendingUpdateDownload(downloadId = 42, versionCode = 3)

        assertTrue(pendingDownloadMatchesVersion(pending, 3))
        assertFalse(pendingDownloadMatchesVersion(pending, 4))
        assertFalse(pendingDownloadMatchesVersion(null, 3))
        assertFalse(canEnqueueUpdateDownload(pending))
        assertTrue(canEnqueueUpdateDownload(null))
        assertTrue(canMutatePendingDownload(pending, pending, 3))
        assertFalse(canMutatePendingDownload(replacement, pending, 3))
        assertFalse(canMutatePendingDownload(pending, pending, 4))
        assertTrue(canMutatePendingDownload(null, null, 3))
    }

    @Test
    fun `pending identity is cleared only after confirmed removal`() {
        assertTrue(canClearPendingAfterRemoval(removedCount = 1, stillExists = true))
        assertTrue(canClearPendingAfterRemoval(removedCount = 0, stillExists = false))
        assertFalse(canClearPendingAfterRemoval(removedCount = 0, stillExists = true))
    }

    @Test
    fun `completed download notification cannot bypass MoneyTrack verification`() {
        val source = listOf(
            File("android-capture/app/src/main/java/com/moneytrack/capture/update/ApkDownloadManager.kt"),
            File("app/src/main/java/com/moneytrack/capture/update/ApkDownloadManager.kt"),
            File("src/main/java/com/moneytrack/capture/update/ApkDownloadManager.kt"),
        ).firstOrNull(File::isFile)?.readText() ?: error("Missing ApkDownloadManager source")

        assertTrue(source.contains("setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)"))
        assertTrue(source.contains("setVisibleInDownloadsUi(false)"))
        assertFalse(source.contains("VISIBILITY_VISIBLE_NOTIFY_COMPLETED"))
    }
}

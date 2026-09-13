package com.moneytrack.capture.update

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

        assertTrue(pendingDownloadMatchesVersion(pending, 3))
        assertFalse(pendingDownloadMatchesVersion(pending, 4))
        assertFalse(pendingDownloadMatchesVersion(null, 3))
        assertFalse(canEnqueueUpdateDownload(pending))
        assertTrue(canEnqueueUpdateDownload(null))
    }
}

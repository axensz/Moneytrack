package com.moneytrack.capture.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
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
}

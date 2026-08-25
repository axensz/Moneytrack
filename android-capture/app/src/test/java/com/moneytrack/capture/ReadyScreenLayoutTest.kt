package com.moneytrack.capture

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReadyScreenLayoutTest {
    @Test
    fun `ready card avoids repeated explanation and source heading`() {
        val layout = activityMainLayout()

        assertFalse(layout.contains("@string/ready_explanation"))
        assertFalse(layout.contains("@string/ready_sources_heading"))
    }

    @Test
    fun `web action is standalone instead of another card`() {
        val layout = activityMainLayout()

        assertFalse(layout.contains("@+id/ready_web_card"))
        assertTrue(layout.contains("@+id/open_pwa_button"))
        assertTrue(layout.contains("@drawable/ic_open_in_new"))
    }

    private fun activityMainLayout(): String {
        val candidates = listOf(
            File("src/main/res/layout/activity_main.xml"),
            File("app/src/main/res/layout/activity_main.xml"),
            File("android-capture/app/src/main/res/layout/activity_main.xml"),
        )
        return candidates.firstOrNull(File::isFile)?.readText()
            ?: error("Unable to locate activity_main.xml from ${File(".").absolutePath}")
    }
}

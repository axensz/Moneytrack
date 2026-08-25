package com.moneytrack.capture

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GuidedUiLayoutContractTest {
    @Test
    fun `capture uses a switch and actions use semantic styles`() {
        val layout = resource("layout/activity_main.xml")
        assertTrue(layout.contains("<androidx.appcompat.widget.SwitchCompat"))
        assertTrue(layout.contains("style=\"@style/Widget.MoneyTrack.Button.Primary\""))
        assertTrue(layout.contains("style=\"@style/Widget.MoneyTrack.Button.Tertiary\""))
        assertTrue(layout.contains("style=\"@style/Widget.MoneyTrack.Button.Utility\""))
        assertFalse(layout.contains("<CheckBox\n                android:id=\"@+id/capture_switch\""))
    }

    @Test
    fun `ready and completion use icon plus semantic success surface`() {
        val layout = resource("layout/activity_main.xml")
        assertTrue(layout.contains("@+id/setup_progress_panel"))
        assertTrue(layout.contains("@+id/progress_track"))
        assertTrue(layout.contains("@drawable/status_success_panel"))
        assertTrue(layout.contains("@drawable/ic_check_circle"))
        assertTrue(layout.contains("@+id/content_column"))
    }

    @Test
    fun `button labels are sentence case and privacy copy is neutral`() {
        val styles = resource("values/styles.xml")
        val layout = resource("layout/activity_main.xml")
        assertTrue(styles.contains("<item name=\"android:textAllCaps\">false</item>"))
        assertTrue(layout.contains("android:textColor=\"@color/text_secondary\""))
    }

    private fun resource(relative: String): String {
        val candidates = listOf(
            File("android-capture/app/src/main/res/$relative"),
            File("app/src/main/res/$relative"),
            File("src/main/res/$relative"),
        )
        return candidates.firstOrNull(File::isFile)?.readText()
            ?: error("Missing Android resource $relative")
    }
}

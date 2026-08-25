package com.moneytrack.capture

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element

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
    fun `ready and completion use icon plus semantic status treatment`() {
        val layout = resource("layout/activity_main.xml")
        assertTrue(layout.contains("@+id/setup_progress_panel"))
        assertTrue(layout.contains("@+id/progress_track"))
        assertTrue(layout.contains("@drawable/ic_check_circle"))
        assertTrue(layout.contains("@+id/content_column"))
    }

    @Test
    fun `active capture keeps the same neutral surface as the other steps`() {
        val document = DocumentBuilderFactory.newInstance()
            .newDocumentBuilder()
            .parse(resourceFile("layout/activity_main.xml"))
        val elements = document.getElementsByTagName("*")
        val readyStep = (0 until elements.length)
            .mapNotNull { elements.item(it) as? Element }
            .single { it.getAttribute("android:id") == "@+id/ready_step" }

        assertEquals("@drawable/status_panel", readyStep.getAttribute("android:background"))
    }

    @Test
    fun `button labels are sentence case and privacy copy is neutral`() {
        val styles = resource("values/styles.xml")
        val layout = resource("layout/activity_main.xml")
        assertTrue(styles.contains("<item name=\"android:textAllCaps\">false</item>"))
        assertTrue(layout.contains("android:textColor=\"@color/text_secondary\""))
    }

    @Test
    fun `authentication reserves an accessible inline feedback region`() {
        val layout = resource("layout/activity_main.xml")
        assertTrue(layout.contains("@+id/auth_feedback"))
        assertTrue(layout.contains("android:accessibilityLiveRegion=\"polite\""))
    }

    @Test
    fun `completion styling belongs to the progress panel and not the header`() {
        val document = DocumentBuilderFactory.newInstance()
            .newDocumentBuilder()
            .parse(resourceFile("layout/activity_main.xml"))
        val elements = document.getElementsByTagName("*")
        val panel = (0 until elements.length)
            .mapNotNull { elements.item(it) as? Element }
            .single { it.getAttribute("android:id") == "@+id/setup_progress_panel" }
        val descendantIds = panel.getElementsByTagName("*").let { descendants ->
            (0 until descendants.length)
                .mapNotNull { descendants.item(it) as? Element }
                .map { it.getAttribute("android:id") }
                .toSet()
        }

        assertTrue(descendantIds.contains("@+id/step_progress"))
        assertTrue(descendantIds.contains("@+id/progress_track"))
        assertFalse(descendantIds.contains("@+id/theme_button"))
    }

    private fun resource(relative: String): String = resourceFile(relative).readText()

    private fun resourceFile(relative: String): File {
        val candidates = listOf(
            File("android-capture/app/src/main/res/$relative"),
            File("app/src/main/res/$relative"),
            File("src/main/res/$relative"),
        )
        return candidates.firstOrNull(File::isFile)
            ?: error("Missing Android resource $relative")
    }
}

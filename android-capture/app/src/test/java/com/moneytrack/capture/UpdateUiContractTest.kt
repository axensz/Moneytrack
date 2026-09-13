package com.moneytrack.capture

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element

class UpdateUiContractTest {
    @Test
    fun `both Android entries include the shared update surface`() {
        val main = resourceFile("layout/activity_main.xml").readText()
        val quick = resourceFile("layout/activity_quick_expense.xml").readText()

        assertTrue(main.contains("@layout/include_update_status"))
        assertTrue(quick.contains("@layout/include_update_status"))
    }

    @Test
    fun `update panel is hidden by default accessible and secondary`() {
        val document = parse(resourceFile("layout/include_update_status.xml"))
        val elements = document.getElementsByTagName("*")
        val byId = (0 until elements.length)
            .mapNotNull { elements.item(it) as? Element }
            .filter { it.hasAttribute("android:id") }
            .associateBy { it.getAttribute("android:id") }
        val panel = requireNotNull(byId["@+id/update_status_panel"])
        val action = requireNotNull(byId["@+id/update_action"])

        assertEquals("gone", panel.getAttribute("android:visibility"))
        assertEquals("polite", panel.getAttribute("android:accessibilityLiveRegion"))
        assertEquals("@style/Widget.MoneyTrack.Button.Secondary", action.getAttribute("style"))
        assertEquals("gone", action.getAttribute("android:visibility"))
    }

    @Test
    fun `copy exposes manual check progress and a repairable error`() {
        val strings = resourceFile("values/strings.xml").readText()

        assertTrue(strings.contains(">Buscar actualización</string>"))
        assertTrue(strings.contains(">Actualizar MoneyTrack</string>"))
        assertTrue(strings.contains(">Descargando actualización…</string>"))
        assertTrue(strings.contains(">No pudimos preparar la actualización. Intenta de nuevo.</string>"))
    }

    @Test
    fun `activities delegate lifecycle without handing over their primary actions`() {
        val main = sourceFile("MainActivity.kt").readText()
        val quick = sourceFile("QuickExpenseActivity.kt").readText()
        val controller = sourceFile("update/UpdateUiController.kt").readText()

        listOf(main, quick).forEach { source ->
            assertTrue(source.contains("UpdateUiController.bind"))
            assertTrue(source.contains("updateUiController.onStart()"))
            assertTrue(source.contains("updateUiController.onStop()"))
            assertTrue(source.contains("updateUiController.onDestroy()"))
        }
        assertTrue(main.contains("showManualCheck = true"))
        assertTrue(quick.contains("showManualCheck = false"))
        assertFalse(controller.contains("quick_expense_primary_action"))
        assertFalse(controller.contains("sign_in_button"))
        assertFalse(controller.contains("manage_sources_button"))
    }

    private fun parse(file: File) = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file)

    private fun resourceFile(relative: String): File = findFile(
        "android-capture/app/src/main/res/$relative",
        "app/src/main/res/$relative",
        "src/main/res/$relative",
    )

    private fun sourceFile(relative: String): File = findFile(
        "android-capture/app/src/main/java/com/moneytrack/capture/$relative",
        "app/src/main/java/com/moneytrack/capture/$relative",
        "src/main/java/com/moneytrack/capture/$relative",
    )

    private fun findFile(vararg candidates: String): File = candidates
        .asSequence()
        .map(::File)
        .firstOrNull(File::isFile)
        ?: error("Missing ${candidates.first()}")
}

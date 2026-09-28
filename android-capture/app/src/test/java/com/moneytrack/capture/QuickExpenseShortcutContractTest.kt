package com.moneytrack.capture

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element

class QuickExpenseShortcutContractTest {
    @Test
    fun `launcher publishes the static Registrar gasto shortcut`() {
        val manifest = xmlFile("AndroidManifest.xml")
        val document = parse(manifest)
        val elements = document.getElementsByTagName("*")
        val mainActivity = (0 until elements.length)
            .mapNotNull { elements.item(it) as? Element }
            .single { it.tagName == "activity" && it.getAttribute("android:name") == ".MainActivity" }
        val metadata = mainActivity.getElementsByTagName("meta-data").item(0) as Element

        assertEquals("android.app.shortcuts", metadata.getAttribute("android:name"))
        assertEquals("@xml/shortcuts", metadata.getAttribute("android:resource"))

        val shortcuts = parse(resourceFile("xml/shortcuts.xml"))
        val shortcut = shortcuts.getElementsByTagName("shortcut").item(0) as Element
        val intent = shortcut.getElementsByTagName("intent").item(0) as Element
        assertEquals("quick_expense", shortcut.getAttribute("android:shortcutId"))
        assertEquals("true", shortcut.getAttribute("android:enabled"))
        assertEquals("@string/quick_expense_short_label", shortcut.getAttribute("android:shortcutShortLabel"))
        assertEquals("@drawable/ic_add_expense", shortcut.getAttribute("android:icon"))
        assertEquals("com.moneytrack.capture.action.QUICK_EXPENSE", intent.getAttribute("android:action"))
        assertEquals("com.moneytrack.capture", intent.getAttribute("android:targetPackage"))
        assertEquals("com.moneytrack.capture.QuickExpenseActivity", intent.getAttribute("android:targetClass"))
        assertEquals(0, shortcut.getElementsByTagName("extra").length)
    }

    @Test
    fun `quick expense activity is exported with the MoneyTrack theme and no financial intent contract`() {
        val manifestText = xmlFile("AndroidManifest.xml").readText()
        val document = parse(xmlFile("AndroidManifest.xml"))
        val elements = document.getElementsByTagName("activity")
        val activity = (0 until elements.length)
            .mapNotNull { elements.item(it) as? Element }
            .single { it.getAttribute("android:name") == ".QuickExpenseActivity" }

        assertEquals("true", activity.getAttribute("android:exported"))
        assertEquals("@style/Theme.MoneytrackCapture.Starting", activity.getAttribute("android:theme"))
        assertEquals("adjustResize", activity.getAttribute("android:windowSoftInputMode"))
        assertFalse(manifestText.contains("reviewAmount"))
        assertFalse(manifestText.contains("suggestedCategory", ignoreCase = true))
        assertFalse(manifestText.contains("suggestedAccountId", ignoreCase = true))
    }

    @Test
    fun `shortcut labels use the approved product language`() {
        val strings = resourceFile("values/strings.xml").readText()
        assertTrue(strings.contains("<string name=\"quick_expense_short_label\">Registrar gasto</string>"))
        assertTrue(strings.contains("<string name=\"quick_expense_title\">Registrar gasto</string>"))
    }

    private fun parse(file: File) = DocumentBuilderFactory.newInstance()
        .newDocumentBuilder()
        .parse(file)

    private fun xmlFile(relative: String): File {
        val candidates = listOf(
            File("android-capture/app/src/main/$relative"),
            File("app/src/main/$relative"),
            File("src/main/$relative"),
        )
        return candidates.firstOrNull(File::isFile)
            ?: error("Missing Android XML $relative")
    }

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

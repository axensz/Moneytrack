package com.moneytrack.capture

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element

class QuickExpenseTileContractTest {
    @Test
    fun `quick settings registers Registrar gasto as an action tile`() {
        val document = parse(mainFile("AndroidManifest.xml"))
        val services = document.getElementsByTagName("service")
        val service = (0 until services.length)
            .mapNotNull { services.item(it) as? Element }
            .firstOrNull { it.getAttribute("android:name") == ".QuickExpenseTileService" }

        assertNotNull("QuickExpenseTileService must be registered", service)
        requireNotNull(service)
        assertEquals("true", service.getAttribute("android:exported"))
        assertEquals(
            "android.permission.BIND_QUICK_SETTINGS_TILE",
            service.getAttribute("android:permission"),
        )
        assertEquals("@string/quick_expense_tile_label", service.getAttribute("android:label"))
        assertEquals("@drawable/ic_quick_expense_tile", service.getAttribute("android:icon"))

        val actions = service.getElementsByTagName("action")
        assertEquals(1, actions.length)
        assertEquals(
            "android.service.quicksettings.action.QS_TILE",
            (actions.item(0) as Element).getAttribute("android:name"),
        )
        val metadata = service.getElementsByTagName("meta-data")
        val metadataNames = (0 until metadata.length)
            .mapNotNull { metadata.item(it) as? Element }
            .map { it.getAttribute("android:name") }
        assertFalse(metadataNames.contains("android.service.quicksettings.TOGGLEABLE_TILE"))
        assertFalse(metadataNames.contains("android.service.quicksettings.ACTIVE_TILE"))
    }

    @Test
    fun `tile uses a system-native accessible visual`() {
        val vector = parse(resourceFile("drawable/ic_quick_expense_tile.xml")).documentElement
        val path = vector.getElementsByTagName("path").item(0) as Element
        val strings = resourceFile("values/strings.xml").readText()

        assertEquals("24dp", vector.getAttribute("android:width"))
        assertEquals("24dp", vector.getAttribute("android:height"))
        assertEquals("#FFFFFFFF", path.getAttribute("android:fillColor"))
        assertTrue(strings.contains("<string name=\"quick_expense_tile_label\">Registrar gasto</string>"))
        assertTrue(
            strings.contains(
                "<string name=\"quick_expense_tile_description\">Abrir el formulario para registrar un gasto</string>",
            ),
        )
    }

    @Test
    fun `tile requires unlock only when a secure device is locked`() {
        assertTrue(QuickExpenseTileBehavior.requiresUnlock(isSecure = true, isLocked = true))
        assertFalse(QuickExpenseTileBehavior.requiresUnlock(isSecure = true, isLocked = false))
        assertFalse(QuickExpenseTileBehavior.requiresUnlock(isSecure = false, isLocked = true))
        assertFalse(QuickExpenseTileBehavior.requiresUnlock(isSecure = false, isLocked = false))
    }

    @Test
    fun `tile uses pending intent from Android 14 onward`() {
        assertFalse(QuickExpenseTileBehavior.usesPendingIntent(apiLevel = 33))
        assertTrue(QuickExpenseTileBehavior.usesPendingIntent(apiLevel = 34))
        assertTrue(QuickExpenseTileBehavior.usesPendingIntent(apiLevel = 36))
    }

    private fun parse(file: File) = DocumentBuilderFactory.newInstance()
        .newDocumentBuilder()
        .parse(file)

    private fun mainFile(relative: String): File = findFile(
        "android-capture/app/src/main/$relative",
        "app/src/main/$relative",
        "src/main/$relative",
    )

    private fun resourceFile(relative: String): File = findFile(
        "android-capture/app/src/main/res/$relative",
        "app/src/main/res/$relative",
        "src/main/res/$relative",
    )

    private fun findFile(vararg candidates: String): File = candidates
        .map(::File)
        .firstOrNull(File::isFile)
        ?: error("Missing Android file: ${candidates.last()}")
}

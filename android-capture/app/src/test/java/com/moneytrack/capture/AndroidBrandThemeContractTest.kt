package com.moneytrack.capture

import java.io.File
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidBrandThemeContractTest {
    @Test
    fun `android packages the exact canonical PWA mark`() {
        assertArrayEquals(
            file(
                "../../public/icons/icon-512x512-maskable.png",
                "../public/icons/icon-512x512-maskable.png",
                "public/icons/icon-512x512-maskable.png",
            )
                .readBytes(),
            file(
                "android-capture/app/src/main/res/drawable-nodpi/moneytrack_icon_maskable.png",
                "app/src/main/res/drawable-nodpi/moneytrack_icon_maskable.png",
                "src/main/res/drawable-nodpi/moneytrack_icon_maskable.png",
            ).readBytes(),
        )
        val manifest = text(
            "src/main/AndroidManifest.xml",
            "app/src/main/AndroidManifest.xml",
            "android-capture/app/src/main/AndroidManifest.xml",
        )
        assertTrue(manifest.contains("android:icon=\"@mipmap/ic_launcher\""))
        assertTrue(manifest.contains("android:roundIcon=\"@mipmap/ic_launcher\""))
    }

    @Test
    fun `splash and appearance use the canonical mark and neutral icon`() {
        val styles = text(
            "android-capture/app/src/main/res/values/styles.xml",
            "app/src/main/res/values/styles.xml",
            "src/main/res/values/styles.xml",
        )
        val layout = text(
            "android-capture/app/src/main/res/layout/activity_main.xml",
            "app/src/main/res/layout/activity_main.xml",
            "src/main/res/layout/activity_main.xml",
        )
        assertTrue(styles.contains("@drawable/moneytrack_icon_maskable"))
        assertTrue(layout.contains("@drawable/ic_appearance"))
        assertFalse(layout.contains("@drawable/ic_theme"))
    }

    @Test
    fun `every theme variant defines the AppCompat accent`() {
        listOf(
            "values/styles.xml",
            "values-night/styles.xml",
            "values-v27/styles.xml",
            "values-night-v27/styles.xml",
        ).forEach { relative ->
            val value = text(
                "android-capture/app/src/main/res/$relative",
                "app/src/main/res/$relative",
                "src/main/res/$relative",
            )
            assertTrue("$relative misses AppCompat colorAccent", value.contains("<item name=\"colorAccent\">"))
            assertTrue(value.contains("<item name=\"android:colorAccent\">"))
        }
    }

    @Test
    fun `visible identity and appearance copy use MoneyTrack casing`() {
        val strings = text(
            "android-capture/app/src/main/res/values/strings.xml",
            "app/src/main/res/values/strings.xml",
            "src/main/res/values/strings.xml",
        )
        assertTrue(strings.contains("<string name=\"app_name\">MoneyTrack</string>"))
        assertTrue(strings.contains("<string name=\"theme_dialog_title\">Apariencia</string>"))
        assertTrue(strings.contains("<string name=\"theme_button_description\">Cambiar apariencia</string>"))
        assertFalse(strings.contains("Moneytrack Capture"))
    }

    private fun text(vararg candidates: String) = file(*candidates).readText()

    private fun file(vararg candidates: String): File =
        candidates.map(::File).firstOrNull(File::isFile)
            ?: error("Missing resource; checked " + candidates.toList())
}

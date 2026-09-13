package com.moneytrack.capture.update

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element

class ApkInstallerContractTest {
    @Test
    fun `manifest exposes only a private FileProvider for verified updates`() {
        val manifestFile = mainFile("AndroidManifest.xml")
        val manifestText = manifestFile.readText()
        val document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(manifestFile)
        val providers = document.getElementsByTagName("provider")
        val provider = (0 until providers.length)
            .mapNotNull { providers.item(it) as? Element }
            .single { it.getAttribute("android:name") == "androidx.core.content.FileProvider" }

        assertTrue(manifestText.contains("android.permission.REQUEST_INSTALL_PACKAGES"))
        assertEquals("${'$'}{applicationId}.fileprovider", provider.getAttribute("android:authorities"))
        assertEquals("false", provider.getAttribute("android:exported"))
        assertEquals("true", provider.getAttribute("android:grantUriPermissions"))
        assertEquals("@xml/file_paths", (provider.getElementsByTagName("meta-data").item(0) as Element)
            .getAttribute("android:resource"))
    }

    @Test
    fun `FileProvider path is limited to the Android update directory`() {
        val paths = DocumentBuilderFactory.newInstance()
            .newDocumentBuilder()
            .parse(resourceFile("xml/file_paths.xml"))
        val children = paths.documentElement.childNodes
        val entries = (0 until children.length).mapNotNull { children.item(it) as? Element }

        assertEquals(1, entries.size)
        assertEquals("external-files-path", entries.single().tagName)
        assertEquals("android_updates", entries.single().getAttribute("name"))
        assertEquals("android-updates/", entries.single().getAttribute("path"))
    }

    @Test
    fun `installer uses only Android system permission and install actions`() {
        val installer = sourceFile("update/ApkInstaller.kt").readText()
        val downloader = sourceFile("update/ApkDownloadManager.kt").readText()
        val integrity = sourceFile("update/ApkIntegrityVerifier.kt").readText()

        assertTrue(installer.contains("Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES"))
        assertTrue(installer.contains("Intent.ACTION_INSTALL_PACKAGE"))
        assertFalse(installer.contains("Intent.ACTION_VIEW"))
        assertTrue(installer.contains("FLAG_GRANT_READ_URI_PERMISSION"))
        assertTrue(downloader.contains("setAllowedOverRoaming(false)"))
        assertTrue(downloader.contains("setDestinationInExternalFilesDir"))
        assertTrue(downloader.contains("ContextCompat.RECEIVER_NOT_EXPORTED"))
        assertTrue(integrity.contains("MessageDigest.isEqual"))
    }

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

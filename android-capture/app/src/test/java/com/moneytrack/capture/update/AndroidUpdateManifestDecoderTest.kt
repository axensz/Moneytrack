package com.moneytrack.capture.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidUpdateManifestDecoderTest {
    private val decoder = AndroidUpdateManifestDecoder()

    @Test
    fun `decodes the exact canary manifest`() {
        val manifest = decoder.decode(validManifest)

        assertEquals(
            AndroidUpdateManifest(
                schemaVersion = 1,
                channel = "canary",
                versionCode = 3,
                versionName = "0.2.1",
                apkUrl = allowedApkUrl,
                sha256 = validSha,
                sizeBytes = 9_942_363,
                releaseNotes = listOf("Acceso rápido para registrar gastos"),
            ),
            manifest,
        )
    }

    @Test
    fun `rejects unknown and duplicate top level keys`() {
        val unknown = validManifest.dropLast(2) + ",\n  \"unexpected\": true\n}"
        val duplicate = validManifest.replace(
            "\"versionCode\": 3,",
            "\"versionCode\": 3,\n  \"versionCode\": 4,",
        )

        assertNull(decoder.decode(unknown))
        assertNull(decoder.decode(duplicate))
    }

    @Test
    fun `rejects wrong scalar and collection types`() {
        listOf(
            validManifest.replace("\"schemaVersion\": 1", "\"schemaVersion\": \"1\""),
            validManifest.replace("\"channel\": \"canary\"", "\"channel\": 1"),
            validManifest.replace("\"versionCode\": 3", "\"versionCode\": \"3\""),
            validManifest.replace("\"versionName\": \"0.2.1\"", "\"versionName\": 21"),
            validManifest.replace("\"apkUrl\": \"$allowedApkUrl\"", "\"apkUrl\": true"),
            validManifest.replace("\"sizeBytes\": 9942363", "\"sizeBytes\": 9942363.0"),
            validManifest.replace(
                "\"releaseNotes\": [\"Acceso rápido para registrar gastos\"]",
                "\"releaseNotes\": \"Acceso rápido para registrar gastos\"",
            ),
            validManifest.replace(
                "[\"Acceso rápido para registrar gastos\"]",
                "[1]",
            ),
        ).forEach { assertNull(it, decoder.decode(it)) }
    }

    @Test
    fun `rejects unsupported schema channel and non positive versions`() {
        listOf(
            validManifest.replace("\"schemaVersion\": 1", "\"schemaVersion\": 2"),
            validManifest.replace("\"channel\": \"canary\"", "\"channel\": \"stable\""),
            validManifest.replace("\"versionCode\": 3", "\"versionCode\": 0"),
            validManifest.replace("\"versionCode\": 3", "\"versionCode\": -1"),
            validManifest.replace("\"versionName\": \"0.2.1\"", "\"versionName\": \"   \""),
        ).forEach { assertNull(it, decoder.decode(it)) }
    }

    @Test
    fun `rejects malformed hashes and non positive sizes`() {
        listOf(
            validManifest.replace(validSha, "a".repeat(63)),
            validManifest.replace(validSha, "g".repeat(64)),
            validManifest.replace("\"sizeBytes\": 9942363", "\"sizeBytes\": 0"),
            validManifest.replace("\"sizeBytes\": 9942363", "\"sizeBytes\": -1"),
        ).forEach { assertNull(it, decoder.decode(it)) }
    }

    @Test
    fun `rejects URLs outside the exact GitHub release prefix`() {
        listOf(
            allowedApkUrl.replace("https://", "http://"),
            allowedApkUrl.replace("github.com", "example.com"),
            "https://github.com/axensz/Moneytrack/releases/download.evil/version/app.apk",
            "https://github.com/other/Moneytrack/releases/download/version/app.apk",
            "$allowedApkUrl?download=1",
            "$allowedApkUrl#fragment",
        ).forEach { rejectedUrl ->
            assertNull(decoder.decode(validManifest.replace(allowedApkUrl, rejectedUrl)))
        }
    }

    @Test
    fun `bounds release notes`() {
        val sixNotes = (1..6).joinToString(prefix = "[", postfix = "]") { "\"Nota $it\"" }
        val longNote = "x".repeat(161)

        assertNull(
            decoder.decode(
                validManifest.replace(
                    "[\"Acceso rápido para registrar gastos\"]",
                    sixNotes,
                ),
            ),
        )
        assertNull(decoder.decode(validManifest.replace("Acceso rápido para registrar gastos", longNote)))
    }

    @Test
    fun `rejects malformed and oversized documents without throwing`() {
        assertNull(decoder.decode("{"))
        assertNull(decoder.decode(" "))
        assertNull(decoder.decode(validManifest + " ".repeat(32 * 1024)))
    }

    @Test
    fun `offers only strictly newer version codes`() {
        assertEquals(UpdateDecision.AVAILABLE, decideUpdate(installedVersionCode = 2, remoteVersionCode = 3))
        assertEquals(UpdateDecision.CURRENT, decideUpdate(installedVersionCode = 2, remoteVersionCode = 2))
        assertEquals(UpdateDecision.CURRENT, decideUpdate(installedVersionCode = 3, remoteVersionCode = 2))
        assertTrue(UpdateDecision.entries.size == 2)
    }

    private companion object {
        const val validSha = "d952d9448995f41faf4521ea4e6ee0bba04e71dbb7bda5f214d518add878dbdc"
        const val allowedApkUrl =
            "https://github.com/axensz/Moneytrack/releases/download/android-quick-expense-0.2.1/" +
                "MoneyTrack-Android-0.2.1.apk"

        val validManifest =
            """
            {
              "schemaVersion": 1,
              "channel": "canary",
              "versionCode": 3,
              "versionName": "0.2.1",
              "apkUrl": "$allowedApkUrl",
              "sha256": "$validSha",
              "sizeBytes": 9942363,
              "releaseNotes": ["Acceso rápido para registrar gastos"]
            }
            """.trimIndent()
    }
}

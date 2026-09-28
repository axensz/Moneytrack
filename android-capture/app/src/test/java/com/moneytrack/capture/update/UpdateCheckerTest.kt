package com.moneytrack.capture.update

import java.util.concurrent.Executor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

class UpdateCheckerTest {
    @Test
    fun `returns an available manifest only for a newer valid version`() {
        val transport = FakeTransport(UpdateTransportResult.Success(validJson))
        val checker = UpdateChecker(
            transport = transport,
            decoder = AndroidUpdateManifestDecoder(),
            installedVersionCode = 2,
        )

        val result = checker.check()

        assertEquals(UpdateCheckResult.Available(validManifest), result)
        assertEquals(listOf(PRIVATE_UPDATE_MANIFEST_URL), transport.requestedUrls)
    }

    @Test
    fun `returns current for equal or older manifests`() {
        val equal = checkerFor(validJson, installedVersionCode = 3).check()
        val older = checkerFor(
            validJson.replace("\"versionCode\": 3", "\"versionCode\": 2"),
            installedVersionCode = 3,
        ).check()

        assertSame(UpdateCheckResult.Current, equal)
        assertSame(UpdateCheckResult.Current, older)
    }

    @Test
    fun `fails closed for invalid JSON and transport failures`() {
        val outcomes = listOf(
            UpdateTransportResult.Success("{"),
            UpdateTransportResult.HttpError(404),
            UpdateTransportResult.TooLarge,
            UpdateTransportResult.Timeout,
            UpdateTransportResult.Failed,
        )

        outcomes.forEach { outcome ->
            val result = UpdateChecker(
                transport = FakeTransport(outcome),
                decoder = AndroidUpdateManifestDecoder(),
                installedVersionCode = 2,
            ).check()

            assertSame(outcome.toString(), UpdateCheckResult.Failed, result)
        }
    }

    @Test
    fun `does not expose thrown transport details`() {
        val transport = UpdateManifestTransport { error("remote body with secret") }

        val result = UpdateChecker(
            transport = transport,
            decoder = AndroidUpdateManifestDecoder(),
            installedVersionCode = 2,
        ).check()

        assertSame(UpdateCheckResult.Failed, result)
        assertEquals(0, UpdateCheckResult.Failed.toString().indexOf("Failed"))
    }

    @Test
    fun `defers network work to the provided executor`() {
        val queued = mutableListOf<Runnable>()
        val executor = Executor(queued::add)
        val transport = FakeTransport(UpdateTransportResult.Success(validJson))
        var delivered: UpdateCheckResult? = null
        val checker = UpdateChecker(
            transport = transport,
            decoder = AndroidUpdateManifestDecoder(),
            installedVersionCode = 2,
        )

        checker.checkAsync(executor) { delivered = it }

        assertEquals(1, queued.size)
        assertEquals(emptyList<String>(), transport.requestedUrls)
        assertNull(delivered)

        queued.single().run()
        assertEquals(listOf(PRIVATE_UPDATE_MANIFEST_URL), transport.requestedUrls)
        assertEquals(UpdateCheckResult.Available(validManifest), delivered)
    }

    private fun checkerFor(body: String, installedVersionCode: Long) = UpdateChecker(
        transport = FakeTransport(UpdateTransportResult.Success(body)),
        decoder = AndroidUpdateManifestDecoder(),
        installedVersionCode = installedVersionCode,
    )

    private class FakeTransport(
        private val outcome: UpdateTransportResult,
    ) : UpdateManifestTransport {
        val requestedUrls = mutableListOf<String>()

        override fun fetch(url: String): UpdateTransportResult {
            requestedUrls += url
            return outcome
        }
    }

    private companion object {
        const val sha = "d952d9448995f41faf4521ea4e6ee0bba04e71dbb7bda5f214d518add878dbdc"
        const val apkUrl =
            "https://github.com/axensz/Moneytrack/releases/download/android-quick-expense-0.2.1/" +
                "MoneyTrack-Android-0.2.1.apk"

        val validManifest = AndroidUpdateManifest(
            schemaVersion = 1,
            channel = "canary",
            versionCode = 3,
            versionName = "0.2.1",
            apkUrl = apkUrl,
            sha256 = sha,
            sizeBytes = 9_942_363,
            releaseNotes = listOf("Acceso rápido para registrar gastos"),
        )

        val validJson =
            """
            {
              "schemaVersion": 1,
              "channel": "canary",
              "versionCode": 3,
              "versionName": "0.2.1",
              "apkUrl": "$apkUrl",
              "sha256": "$sha",
              "sizeBytes": 9942363,
              "releaseNotes": ["Acceso rápido para registrar gastos"]
            }
            """.trimIndent()
    }
}

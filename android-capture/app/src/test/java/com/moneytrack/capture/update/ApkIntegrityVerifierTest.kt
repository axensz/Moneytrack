package com.moneytrack.capture.update

import java.nio.file.Files
import java.security.MessageDigest
import org.junit.Assert.assertEquals
import org.junit.Test

class ApkIntegrityVerifierTest {
    private val verifier = ApkIntegrityVerifier()

    @Test
    fun `accepts only the exact file size and sha256`() {
        val file = Files.createTempFile("moneytrack-update", ".apk").toFile()
        file.writeBytes("verified apk bytes".toByteArray())

        assertEquals(
            IntegrityResult.Verified,
            verifier.verify(file, file.length(), sha256(file.readBytes())),
        )
        assertEquals(
            IntegrityResult.SizeMismatch,
            verifier.verify(file, file.length() + 1, sha256(file.readBytes())),
        )
        assertEquals(
            IntegrityResult.HashMismatch,
            verifier.verify(file, file.length(), "0".repeat(64)),
        )

        file.delete()
    }

    @Test
    fun `rejects missing files and invalid expectations`() {
        val missing = Files.createTempDirectory("moneytrack-missing").resolve("missing.apk").toFile()
        val file = Files.createTempFile("moneytrack-update", ".apk").toFile()
        file.writeText("apk")

        assertEquals(
            IntegrityResult.Missing,
            verifier.verify(missing, 3, "0".repeat(64)),
        )
        listOf("", "0".repeat(63), "g".repeat(64)).forEach { invalidHash ->
            assertEquals(
                invalidHash,
                IntegrityResult.InvalidExpectation,
                verifier.verify(file, file.length(), invalidHash),
            )
        }
        assertEquals(
            IntegrityResult.InvalidExpectation,
            verifier.verify(file, 0, sha256(file.readBytes())),
        )

        file.delete()
    }

    private fun sha256(bytes: ByteArray): String = MessageDigest
        .getInstance("SHA-256")
        .digest(bytes)
        .joinToString("") { "%02x".format(it) }
}

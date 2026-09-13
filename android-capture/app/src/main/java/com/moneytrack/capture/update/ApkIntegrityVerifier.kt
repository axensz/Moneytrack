package com.moneytrack.capture.update

import java.io.File
import java.security.MessageDigest

enum class IntegrityResult {
    Verified,
    Missing,
    InvalidExpectation,
    SizeMismatch,
    HashMismatch,
    ReadError,
}

class ApkIntegrityVerifier {
    fun verify(file: File, expectedSizeBytes: Long, expectedSha256: String): IntegrityResult {
        if (expectedSizeBytes <= 0L || !SHA_256.matches(expectedSha256)) {
            return IntegrityResult.InvalidExpectation
        }
        if (!file.isFile) return IntegrityResult.Missing
        if (file.length() != expectedSizeBytes) return IntegrityResult.SizeMismatch

        return try {
            val digest = MessageDigest.getInstance("SHA-256")
            file.inputStream().buffered(BUFFER_BYTES).use { input ->
                val buffer = ByteArray(BUFFER_BYTES)
                while (true) {
                    val read = input.read(buffer)
                    if (read == -1) break
                    digest.update(buffer, 0, read)
                }
            }
            if (file.length() != expectedSizeBytes) return IntegrityResult.SizeMismatch

            val expected = expectedSha256.chunked(2)
                .map { it.toInt(16).toByte() }
                .toByteArray()
            if (MessageDigest.isEqual(digest.digest(), expected)) {
                IntegrityResult.Verified
            } else {
                IntegrityResult.HashMismatch
            }
        } catch (_: Exception) {
            IntegrityResult.ReadError
        }
    }

    private companion object {
        const val BUFFER_BYTES = 64 * 1024
        val SHA_256 = Regex("[A-Fa-f0-9]{64}")
    }
}

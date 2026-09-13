package com.moneytrack.capture.quickexpense

import java.security.SecureRandom

class QuickExpenseCandidateId(
    private val secureRandom: SecureRandom = SecureRandom(),
) {
    fun generate(): String {
        val bytes = ByteArray(BYTE_COUNT)
        secureRandom.nextBytes(bytes)
        return buildString(BYTE_COUNT * 2) {
            bytes.forEach { byte ->
                val value = byte.toInt() and 0xff
                append(HEX[value ushr 4])
                append(HEX[value and 0x0f])
            }
        }
    }

    private companion object {
        const val BYTE_COUNT = 32
        const val HEX = "0123456789abcdef"
    }
}

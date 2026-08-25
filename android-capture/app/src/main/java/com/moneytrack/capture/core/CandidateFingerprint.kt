package com.moneytrack.capture.core

import java.nio.charset.StandardCharsets
import java.security.MessageDigest

object CandidateFingerprint {
    fun create(
        deviceInstallId: String,
        packageName: String,
        notificationKey: String,
        postedAtEpochMillis: Long,
    ): String {
        require(deviceInstallId.isNotBlank()) { "Missing installation identity" }
        require(packageName.isNotBlank()) { "Missing source package" }
        require(notificationKey.isNotBlank()) { "Missing notification identity" }
        require(postedAtEpochMillis > 0) { "Invalid observed time" }

        val identity = listOf(
            deviceInstallId,
            packageName,
            notificationKey,
            postedAtEpochMillis.toString(),
        ).joinToString("|")
        return MessageDigest.getInstance("SHA-256")
            .digest(identity.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
    }
}

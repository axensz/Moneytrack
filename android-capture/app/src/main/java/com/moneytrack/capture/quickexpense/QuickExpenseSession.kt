package com.moneytrack.capture.quickexpense

import java.nio.charset.StandardCharsets
import java.security.MessageDigest

internal fun quickExpenseOwnerBinding(uid: String, installationId: String): String {
    requireValidQuickExpenseUid(uid)
    require(installationId.isNotBlank() && installationId.length <= 256) {
        "Invalid installation identity"
    }
    return MessageDigest.getInstance("SHA-256")
        .digest("quick-expense-v1:$installationId:$uid".toByteArray(StandardCharsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
}

internal fun canRestoreQuickExpenseState(
    savedOwnerBinding: String?,
    currentUid: String?,
    installationId: String,
): Boolean {
    if (savedOwnerBinding == null || currentUid == null || !OWNER_BINDING.matches(savedOwnerBinding)) {
        return false
    }
    val expected = runCatching {
        quickExpenseOwnerBinding(currentUid, installationId)
    }.getOrNull() ?: return false
    return MessageDigest.isEqual(
        savedOwnerBinding.toByteArray(StandardCharsets.US_ASCII),
        expected.toByteArray(StandardCharsets.US_ASCII),
    )
}

private val OWNER_BINDING = Regex("[a-f0-9]{64}")

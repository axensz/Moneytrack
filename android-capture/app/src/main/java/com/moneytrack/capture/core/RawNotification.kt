package com.moneytrack.capture.core

/**
 * Ephemeral notification input. Callers must not persist or log these fields.
 */
data class RawNotification(
    val packageName: String,
    val notificationKey: String,
    val postedAtEpochMillis: Long,
    val title: String?,
    val text: String?,
    val bigText: String?,
    val subText: String?,
) {
    internal fun combinedText(): String = listOfNotNull(title, text, bigText, subText)
        .map(String::trim)
        .filter(String::isNotEmpty)
        .joinToString(" ")
        .replace(Regex("\\s+"), " ")
}

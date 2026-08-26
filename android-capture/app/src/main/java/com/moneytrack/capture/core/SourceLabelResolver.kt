package com.moneytrack.capture.core

import java.text.Normalizer
import java.util.Locale

object SourceLabelResolver {
    fun resolve(
        packageName: String,
        label: String,
        testSourceLabel: String,
        fallbackLabel: String,
        reservedLabels: Set<String> = emptySet(),
    ): String {
        if (packageName == AvailableCaptureSourceCatalog.DIAGNOSTIC_SHELL_PACKAGE) {
            return testSourceLabel
        }
        val safeLabel = sanitize(label)
        val reservedComparisonLabels = reservedLabels.mapTo(mutableSetOf(), ::comparisonValue)
        return when {
            safeLabel.isBlank() || safeLabel.equals(packageName, ignoreCase = true) -> fallbackLabel
            comparisonValue(safeLabel) in reservedComparisonLabels -> fallbackLabel
            else -> safeLabel
        }
    }

    private fun sanitize(value: String): String = Normalizer
        .normalize(value, Normalizer.Form.NFKC)
        .map { character ->
            when (Character.getType(character)) {
                Character.CONTROL.toInt(), Character.FORMAT.toInt() -> ' '
                else -> character
            }
        }
        .joinToString("")
        .trim()
        .replace(WHITESPACE, " ")
        .take(MAX_LABEL_LENGTH)

    private fun comparisonValue(value: String): String = sanitize(value).lowercase(Locale.ROOT)

    private const val MAX_LABEL_LENGTH = 80
    private val WHITESPACE = Regex("\\s+")
}

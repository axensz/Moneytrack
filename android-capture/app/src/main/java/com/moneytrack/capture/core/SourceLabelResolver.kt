package com.moneytrack.capture.core

object SourceLabelResolver {
    fun resolve(
        packageName: String,
        label: String,
        testSourceLabel: String,
        fallbackLabel: String,
    ): String = when {
        packageName == "com.android.shell" -> testSourceLabel
        label.isBlank() || label == packageName -> fallbackLabel
        else -> label
    }
}

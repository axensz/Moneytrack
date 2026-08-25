package com.moneytrack.capture.core

object SourceSelection {
    fun remove(allowedPackages: Set<String>, packageName: String): Set<String> =
        allowedPackages - packageName
}

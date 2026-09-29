buildscript {
    dependencies {
        // Google ID 1.2.1 publica metadatos Kotlin 2.4.
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.4.20")
    }
}

plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.google.services) apply false
}

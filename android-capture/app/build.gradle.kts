plugins {
    alias(libs.plugins.android.application)
}

val hasGoogleServices = file("google-services.json").exists()
val releaseSigningEnvironment = mapOf(
    "keystorePath" to providers.environmentVariable("MONEYTRACK_ANDROID_KEYSTORE_PATH").orNull,
    "keyAlias" to providers.environmentVariable("MONEYTRACK_ANDROID_KEY_ALIAS").orNull,
    "keystorePassword" to providers.environmentVariable("MONEYTRACK_ANDROID_KEYSTORE_PASSWORD").orNull,
    "keyPassword" to providers.environmentVariable("MONEYTRACK_ANDROID_KEY_PASSWORD").orNull,
)
val hasCompleteReleaseSigning = releaseSigningEnvironment.values.all { !it.isNullOrBlank() }
val requestedReleaseTask = gradle.startParameter.taskNames.any { requestedTask ->
    requestedTask.substringAfterLast(':') in
        setOf("assemble", "assembleRelease", "build", "bundleRelease", "packageRelease")
}

if (requestedReleaseTask && !hasCompleteReleaseSigning) {
    throw GradleException(
        "Release signing is not configured. Provide all MONEYTRACK_ANDROID_* environment variables.",
    )
}

if (hasGoogleServices) {
    apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "com.moneytrack.capture"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.moneytrack.capture"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "0.2.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        if (!hasGoogleServices) {
            resValue("string", "default_web_client_id", "")
        }
    }

    signingConfigs {
        if (hasCompleteReleaseSigning) {
            create("privateRelease") {
                storeFile = file(requireNotNull(releaseSigningEnvironment["keystorePath"]))
                keyAlias = requireNotNull(releaseSigningEnvironment["keyAlias"])
                storePassword = requireNotNull(releaseSigningEnvironment["keystorePassword"])
                keyPassword = requireNotNull(releaseSigningEnvironment["keyPassword"])
            }
        }
    }

    buildTypes {
        release {
            if (hasCompleteReleaseSigning) {
                signingConfig = signingConfigs.getByName("privateRelease")
            }
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
        resValues = true
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)
    implementation(libs.firebase.firestore)
    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services.auth)
    implementation(libs.googleid)

    testImplementation(libs.junit)
    testImplementation(libs.json)
}

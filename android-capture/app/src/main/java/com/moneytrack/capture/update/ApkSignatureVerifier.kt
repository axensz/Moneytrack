package com.moneytrack.capture.update

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import java.io.File
import java.security.MessageDigest
import java.util.Locale

enum class SignatureResult {
    Verified,
    PackageMismatch,
    VersionMismatch,
    DifferentSigner,
    Unreadable,
}

class ApkSignatureVerifier(context: Context) {
    private val packageManager = context.applicationContext.packageManager
    private val packageName = context.applicationContext.packageName

    fun verify(file: File, manifest: AndroidUpdateManifest): SignatureResult {
        return try {
            val installed = packageManager.packageInfo(packageName) ?: return SignatureResult.Unreadable
            val archive = packageManager.getPackageArchiveInfo(file.absolutePath, signatureFlags())
                ?: return SignatureResult.Unreadable
            if (archive.packageName != packageName) return SignatureResult.PackageMismatch
            if (
                !archiveVersionMatchesManifest(
                    installedVersionCode = installed.resolvedVersionCode(),
                    archiveVersionCode = archive.resolvedVersionCode(),
                    archiveVersionName = archive.versionName,
                    manifestVersionCode = manifest.versionCode,
                    manifestVersionName = manifest.versionName,
                )
            ) {
                return SignatureResult.VersionMismatch
            }

            if (sameSigner(installed.signerDigests(), archive.signerDigests())) {
                SignatureResult.Verified
            } else {
                SignatureResult.DifferentSigner
            }
        } catch (_: Exception) {
            SignatureResult.Unreadable
        }
    }

    @Suppress("DEPRECATION")
    private fun PackageManager.packageInfo(name: String): PackageInfo? =
        getPackageInfo(name, signatureFlags())

    @Suppress("DEPRECATION")
    private fun PackageInfo.resolvedVersionCode(): Long =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) longVersionCode else versionCode.toLong()

    @Suppress("DEPRECATION")
    private fun PackageInfo.signerDigests(): Set<String> {
        val signers = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            signingInfo?.apkContentsSigners
        } else {
            signatures
        }.orEmpty()

        return signers.mapTo(mutableSetOf()) { signature ->
            MessageDigest.getInstance("SHA-256")
                .digest(signature.toByteArray())
                .joinToString("") { "%02x".format(it) }
        }
    }

    @Suppress("DEPRECATION")
    private fun signatureFlags(): Int = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        PackageManager.GET_SIGNING_CERTIFICATES
    } else {
        PackageManager.GET_SIGNATURES
    }
}

fun archiveVersionMatchesManifest(
    installedVersionCode: Long,
    archiveVersionCode: Long,
    archiveVersionName: String?,
    manifestVersionCode: Long,
    manifestVersionName: String,
): Boolean = archiveVersionCode > installedVersionCode &&
    archiveVersionCode == manifestVersionCode &&
    archiveVersionName == manifestVersionName

fun sameSigner(installedDigests: Set<String>, archiveDigests: Set<String>): Boolean {
    if (installedDigests.isEmpty() || archiveDigests.isEmpty()) return false
    if ((installedDigests + archiveDigests).any { !SIGNER_DIGEST.matches(it) }) return false

    val installed = installedDigests.mapTo(mutableSetOf()) { it.lowercase(Locale.ROOT) }
    val archive = archiveDigests.mapTo(mutableSetOf()) { it.lowercase(Locale.ROOT) }
    return installed.any(archive::contains)
}

private val SIGNER_DIGEST = Regex("[A-Fa-f0-9]{64}")

package com.moneytrack.capture.update

import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.core.content.FileProvider
import androidx.core.net.toUri
import java.io.File

sealed interface InstallAction {
    data class PermissionRequired(val intent: Intent) : InstallAction
    data class Ready(val intent: Intent) : InstallAction
    data object Rejected : InstallAction
}

class ApkInstaller(context: Context) {
    private val appContext = context.applicationContext

    fun prepare(file: File): InstallAction {
        if (!file.isFile || !isManagedUpdateFile(appContext, file)) return InstallAction.Rejected

        return try {
            if (!appContext.packageManager.canRequestPackageInstalls()) {
                InstallAction.PermissionRequired(
                    Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        "package:${appContext.packageName}".toUri(),
                    ),
                )
            } else {
                val uri = FileProvider.getUriForFile(
                    appContext,
                    "${appContext.packageName}.fileprovider",
                    file,
                )
                InstallAction.Ready(
                    Intent(Intent.ACTION_INSTALL_PACKAGE)
                        .setDataAndType(uri, APK_MIME_TYPE)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),
                )
            }
        } catch (_: Exception) {
            InstallAction.Rejected
        }
    }

    private companion object {
        const val APK_MIME_TYPE = "application/vnd.android.package-archive"
    }
}

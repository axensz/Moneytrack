package com.moneytrack.capture.update

import android.content.ActivityNotFoundException
import android.content.BroadcastReceiver
import android.content.Intent
import android.content.res.ColorStateList
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import androidx.core.widget.TextViewCompat
import com.moneytrack.capture.BuildConfig
import com.moneytrack.capture.R
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

enum class UpdateUiPhase {
    HIDDEN,
    AVAILABLE,
    DOWNLOADING,
    READY_TO_INSTALL,
    PERMISSION_REQUIRED,
    ERROR,
}

data class UpdateUiState(
    val phase: UpdateUiPhase,
    val manifest: AndroidUpdateManifest? = null,
    val file: File? = null,
    val downloadedBytes: Long = 0L,
    val totalBytes: Long = 0L,
)

fun updateUiStateFor(result: UpdateCheckResult): UpdateUiState = when (result) {
    UpdateCheckResult.Current -> UpdateUiState(UpdateUiPhase.HIDDEN)
    is UpdateCheckResult.Available -> UpdateUiState(UpdateUiPhase.AVAILABLE, result.manifest)
    UpdateCheckResult.Failed -> UpdateUiState(UpdateUiPhase.ERROR)
}

fun updateUiStateFor(current: UpdateUiState, download: DownloadState): UpdateUiState {
    val manifest = current.manifest ?: return UpdateUiState(UpdateUiPhase.ERROR)
    return when (download) {
        is DownloadState.Enqueued -> UpdateUiState(UpdateUiPhase.DOWNLOADING, manifest)
        is DownloadState.Downloading -> UpdateUiState(
            phase = UpdateUiPhase.DOWNLOADING,
            manifest = manifest,
            downloadedBytes = download.downloadedBytes,
            totalBytes = download.totalBytes,
        )
        is DownloadState.Ready -> UpdateUiState(UpdateUiPhase.READY_TO_INSTALL, manifest, download.file)
        DownloadState.Failed -> UpdateUiState(UpdateUiPhase.ERROR, manifest)
    }
}

fun verifiedUpdateUiState(
    ready: UpdateUiState,
    integrity: IntegrityResult,
    signature: SignatureResult,
): UpdateUiState = if (
    ready.phase == UpdateUiPhase.READY_TO_INSTALL &&
    integrity == IntegrityResult.Verified &&
    signature == SignatureResult.Verified
) {
    ready
} else {
    UpdateUiState(UpdateUiPhase.ERROR, ready.manifest)
}

fun permissionRequiredUpdateUiState(ready: UpdateUiState): UpdateUiState = UpdateUiState(
    phase = UpdateUiPhase.PERMISSION_REQUIRED,
    manifest = ready.manifest,
    file = ready.file,
)

class UpdateUiController private constructor(
    private val activity: AppCompatActivity,
    private val section: View,
    private val showManualCheck: Boolean,
    private val preferences: UpdatePreferences,
    private val checker: UpdateChecker,
    private val downloader: ApkDownloadManager,
    private val integrityVerifier: ApkIntegrityVerifier,
    private val signatureVerifier: ApkSignatureVerifier,
    private val installer: ApkInstaller,
    private val executor: ExecutorService,
) {
    private val panel: View = section.findViewById(R.id.update_status_panel)
    private val heading: TextView = section.findViewById(R.id.update_heading)
    private val message: TextView = section.findViewById(R.id.update_message)
    private val progress: ProgressBar = section.findViewById(R.id.update_progress)
    private val action: Button = section.findViewById(R.id.update_action)
    private val manualCheck: Button = section.findViewById(R.id.update_manual_check)
    private val manualStatus: TextView = section.findViewById(R.id.update_manual_status)

    private var state = preferences.cachedAvailableManifest()
        ?.takeIf {
            decideUpdate(BuildConfig.VERSION_CODE.toLong(), it.versionCode) == UpdateDecision.AVAILABLE
        }
        ?.let { UpdateUiState(UpdateUiPhase.AVAILABLE, it) }
        ?: UpdateUiState(UpdateUiPhase.HIDDEN)
    private var receiver: BroadcastReceiver? = null
    private var started = false
    private var busy = false
    private var manualStatusText: String? = null
    private var completedDownloadId: Long? = null

    init {
        manualCheck.setOnClickListener { check(manual = true) }
        action.setOnClickListener { performAction() }
        render()
    }

    fun onStart() {
        if (started) return
        started = true
        busy = false
        receiver = runCatching {
            downloader.registerCompletionReceiver(::onDownloadComplete)
        }.getOrNull()

        var cachedManifest = preferences.cachedAvailableManifest()
        if (
            cachedManifest != null &&
            decideUpdate(BuildConfig.VERSION_CODE.toLong(), cachedManifest.versionCode) == UpdateDecision.CURRENT
        ) {
            val obsoleteManifest = cachedManifest
            executor.execute { downloader.discard(obsoleteManifest) }
            preferences.clearAvailableManifest()
            cachedManifest = null
        }
        if (cachedManifest != null && preferences.pendingDownload() != null) {
            refreshDownload(cachedManifest)
        } else if (preferences.shouldCheck(manual = false)) {
            check(manual = false)
        } else {
            state = cachedManifest
                ?.let { UpdateUiState(UpdateUiPhase.AVAILABLE, it) }
                ?: UpdateUiState(UpdateUiPhase.HIDDEN)
            render()
        }
    }

    fun onStop() {
        if (!started) return
        receiver?.let { registered ->
            runCatching { downloader.unregisterCompletionReceiver(registered) }
        }
        receiver = null
        started = false
    }

    fun onDestroy() {
        onStop()
        executor.shutdownNow()
    }

    private fun check(manual: Boolean) {
        if (busy || !preferences.shouldCheck(manual)) return
        busy = true
        manualStatusText = null
        render()
        checker.checkAsync(executor) { result ->
            val previousManifest = preferences.cachedAvailableManifest()
            if (result is UpdateCheckResult.Current && previousManifest != null) {
                downloader.discard(previousManifest)
            }
            preferences.recordSuccessfulCheck(result)
            postToUi {
                busy = false
                state = updateUiStateFor(result)
                manualStatusText = if (manual && result is UpdateCheckResult.Current) {
                    activity.getString(R.string.update_current)
                } else {
                    null
                }
                render()
                consumeCompletedDownload()
            }
        }
    }

    private fun performAction() {
        when (state.phase) {
            UpdateUiPhase.AVAILABLE -> startDownload()
            UpdateUiPhase.READY_TO_INSTALL,
            UpdateUiPhase.PERMISSION_REQUIRED,
            -> verifyAndInstall()
            UpdateUiPhase.ERROR -> {
                val manifest = state.manifest
                if (manifest == null) {
                    check(manual = true)
                } else {
                    state = UpdateUiState(UpdateUiPhase.AVAILABLE, manifest)
                    startDownload(discardExisting = true)
                }
            }
            UpdateUiPhase.HIDDEN,
            UpdateUiPhase.DOWNLOADING,
            -> Unit
        }
    }

    private fun startDownload(discardExisting: Boolean = false) {
        val manifest = state.manifest ?: return
        if (busy) return
        busy = true
        state = UpdateUiState(UpdateUiPhase.DOWNLOADING, manifest)
        render()
        executor.execute {
            if (discardExisting) downloader.discard(manifest)
            val next = updateUiStateFor(
                UpdateUiState(UpdateUiPhase.AVAILABLE, manifest),
                downloader.enqueue(manifest),
            )
            postToUi {
                busy = false
                state = next
                render()
                consumeCompletedDownload()
            }
        }
    }

    private fun onDownloadComplete(downloadId: Long) {
        val pending = preferences.pendingDownload() ?: return
        if (pending.downloadId != downloadId) return
        if (busy) {
            completedDownloadId = downloadId
            return
        }
        state.manifest?.let(::refreshDownload)
    }

    private fun consumeCompletedDownload() {
        val completed = completedDownloadId ?: return
        val pending = preferences.pendingDownload()
        completedDownloadId = null
        if (pending?.downloadId == completed) state.manifest?.let(::refreshDownload)
    }

    private fun refreshDownload(manifest: AndroidUpdateManifest) {
        if (busy) return
        busy = true
        val downloadingState = UpdateUiState(UpdateUiPhase.DOWNLOADING, manifest)
        state = downloadingState
        render()
        executor.execute {
            val queried = updateUiStateFor(downloadingState, downloader.query(manifest))
            val verified = verifyReadyState(queried)
            if (verified.phase == UpdateUiPhase.ERROR) downloader.discard(manifest)
            postToUi {
                busy = false
                state = verified
                render()
            }
        }
    }

    private fun verifyReadyState(candidate: UpdateUiState): UpdateUiState {
        val file = candidate.file ?: return candidate
        val manifest = candidate.manifest ?: return UpdateUiState(UpdateUiPhase.ERROR)
        val integrity = integrityVerifier.verify(file, manifest.sizeBytes, manifest.sha256)
        if (integrity != IntegrityResult.Verified) {
            return verifiedUpdateUiState(candidate, integrity, SignatureResult.Unreadable)
        }
        return verifiedUpdateUiState(
            ready = candidate,
            integrity = integrity,
            signature = signatureVerifier.verify(file),
        )
    }

    private fun verifyAndInstall() {
        val manifest = state.manifest ?: return
        val file = state.file ?: return
        if (busy) return
        busy = true
        render()
        executor.execute {
            val verified = verifyReadyState(
                UpdateUiState(UpdateUiPhase.READY_TO_INSTALL, manifest, file),
            )
            postToUi {
                busy = false
                if (verified.phase == UpdateUiPhase.ERROR) {
                    downloader.discard(manifest)
                    state = verified
                    render()
                } else {
                    launchInstallAction(verified)
                }
            }
        }
    }

    private fun launchInstallAction(ready: UpdateUiState) {
        when (val installAction = installer.prepare(requireNotNull(ready.file))) {
            is InstallAction.PermissionRequired -> {
                state = permissionRequiredUpdateUiState(ready)
                render()
                launch(installAction.intent)
            }
            is InstallAction.Ready -> {
                state = ready
                busy = true
                render()
                launch(installAction.intent)
            }
            InstallAction.Rejected -> {
                ready.manifest?.let { manifest ->
                    executor.execute { downloader.discard(manifest) }
                }
                state = UpdateUiState(UpdateUiPhase.ERROR, ready.manifest)
                render()
            }
        }
    }

    private fun launch(intent: Intent) {
        try {
            activity.startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            state.manifest?.let { manifest ->
                executor.execute { downloader.discard(manifest) }
            }
            state = UpdateUiState(UpdateUiPhase.ERROR, state.manifest)
            busy = false
            render()
        }
    }

    private fun render() {
        val hasPanel = state.phase != UpdateUiPhase.HIDDEN
        section.isVisible = showManualCheck || hasPanel || manualStatusText != null
        panel.isVisible = hasPanel
        manualCheck.isVisible = showManualCheck
        manualCheck.isEnabled = !busy
        manualCheck.alpha = if (manualCheck.isEnabled) 1f else DISABLED_ALPHA
        manualCheck.text = activity.getString(
            if (busy && !hasPanel) R.string.update_checking else R.string.update_manual_action,
        )
        manualStatus.text = manualStatusText.orEmpty()
        manualStatus.isVisible = manualStatusText != null
        if (!hasPanel) return

        val copy = updateCopy(state)
        heading.setText(copy.heading)
        message.text = copy.message
        panel.setBackgroundResource(
            if (state.phase == UpdateUiPhase.ERROR) {
                R.drawable.status_error_panel
            } else {
                R.drawable.status_panel
            },
        )
        heading.setTextColor(
            activity.getColor(
                if (state.phase == UpdateUiPhase.ERROR) {
                    R.color.status_destructive
                } else {
                    R.color.text_primary
                },
            ),
        )
        TextViewCompat.setCompoundDrawableTintList(
            heading,
            ColorStateList.valueOf(
                activity.getColor(
                    if (state.phase == UpdateUiPhase.ERROR) {
                        R.color.status_destructive
                    } else {
                        R.color.brand_violet_dark
                    },
                ),
            ),
        )
        progress.isVisible = state.phase == UpdateUiPhase.DOWNLOADING ||
            (busy && state.phase in INSTALLABLE_PHASES)
        action.isVisible = copy.action != null
        action.isEnabled = !busy && state.phase != UpdateUiPhase.DOWNLOADING
        action.alpha = if (action.isEnabled) 1f else DISABLED_ALPHA
        copy.action?.let(action::setText)
    }

    private fun updateCopy(value: UpdateUiState): UpdateCopy = when (value.phase) {
        UpdateUiPhase.AVAILABLE -> UpdateCopy(
            heading = R.string.update_available_heading,
            message = availableMessage(requireNotNull(value.manifest)),
            action = R.string.update_action,
        )
        UpdateUiPhase.DOWNLOADING -> UpdateCopy(
            heading = R.string.update_downloading_heading,
            message = activity.getString(R.string.update_downloading),
        )
        UpdateUiPhase.READY_TO_INSTALL -> UpdateCopy(
            heading = R.string.update_ready_heading,
            message = activity.getString(R.string.update_ready_explanation),
            action = R.string.update_install_action,
        )
        UpdateUiPhase.PERMISSION_REQUIRED -> UpdateCopy(
            heading = R.string.update_permission_heading,
            message = activity.getString(R.string.update_permission_explanation),
            action = R.string.update_permission_action,
        )
        UpdateUiPhase.ERROR -> UpdateCopy(
            heading = R.string.update_error_heading,
            message = activity.getString(
                if (value.manifest == null) {
                    R.string.update_check_failed
                } else {
                    R.string.update_prepare_failed
                },
            ),
            action = R.string.quick_expense_retry_action,
        )
        UpdateUiPhase.HIDDEN -> error("Hidden updates do not render copy")
    }

    private fun availableMessage(manifest: AndroidUpdateManifest): String {
        val notes = manifest.releaseNotes.joinToString(separator = "\n") { "• $it" }
        return if (notes.isBlank()) {
            activity.getString(R.string.update_available_version, manifest.versionName)
        } else {
            activity.getString(R.string.update_available_notes, manifest.versionName, notes)
        }
    }

    private fun postToUi(block: () -> Unit) {
        activity.runOnUiThread {
            if (!activity.isFinishing && !activity.isDestroyed) block()
        }
    }

    private data class UpdateCopy(
        val heading: Int,
        val message: String,
        val action: Int? = null,
    )

    companion object {
        private const val DISABLED_ALPHA = 0.5f
        private val INSTALLABLE_PHASES = setOf(
            UpdateUiPhase.READY_TO_INSTALL,
            UpdateUiPhase.PERMISSION_REQUIRED,
        )

        fun bind(
            activity: AppCompatActivity,
            root: View,
            showManualCheck: Boolean,
        ): UpdateUiController {
            val preferences = UpdatePreferences.create(activity)
            return UpdateUiController(
                activity = activity,
                section = root,
                showManualCheck = showManualCheck,
                preferences = preferences,
                checker = UpdateChecker(
                    transport = HttpsUpdateManifestTransport(),
                    decoder = AndroidUpdateManifestDecoder(),
                    installedVersionCode = BuildConfig.VERSION_CODE.toLong(),
                ),
                downloader = ApkDownloadManager(activity, preferences),
                integrityVerifier = ApkIntegrityVerifier(),
                signatureVerifier = ApkSignatureVerifier(activity),
                installer = ApkInstaller(activity),
                executor = Executors.newSingleThreadExecutor(),
            )
        }
    }
}

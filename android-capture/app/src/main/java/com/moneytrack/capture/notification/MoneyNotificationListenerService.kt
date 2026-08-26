package com.moneytrack.capture.notification

import android.app.Notification
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.moneytrack.capture.core.AvailableCaptureSourceCatalog
import com.moneytrack.capture.core.CaptureEligibilityState
import com.moneytrack.capture.core.CaptureResultCode
import com.moneytrack.capture.core.NotificationCaptureCoordinator
import com.moneytrack.capture.core.NotificationEventMetadata
import com.moneytrack.capture.core.RawNotification
import com.moneytrack.capture.data.CandidateWriteResult
import com.moneytrack.capture.data.CandidateSyncDispatcher
import com.moneytrack.capture.data.FirebaseCandidateRepository
import com.moneytrack.capture.preferences.ActiveNotificationDelivery
import com.moneytrack.capture.preferences.CandidateSyncState
import com.moneytrack.capture.preferences.CapturePreferences

class MoneyNotificationListenerService : NotificationListenerService() {
    override fun onNotificationPosted(statusBarNotification: StatusBarNotification?) {
        val event = statusBarNotification ?: return
        val sourcePackage = event.packageName
        val preferences = CapturePreferences.create(this)
        if (sourcePackage == AvailableCaptureSourceCatalog.DIAGNOSTIC_SHELL_PACKAGE) {
            record(CaptureResultCode.PACKAGE_NOT_ALLOWED)
            return
        }
        val allowedPackages = AvailableCaptureSourceCatalog.productAllowedPackages(
            preferences.allowedPackages(),
        )

        if (sourcePackage !in allowedPackages) {
            preferences.rememberDiscoveredSource(
                packageName = sourcePackage,
                label = applicationLabel(sourcePackage),
            )
            record(CaptureResultCode.PACKAGE_NOT_ALLOWED)
            return
        }
        if ((event.notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0) {
            record(CaptureResultCode.GROUP_SUMMARY_IGNORED)
            return
        }

        val user = currentUser()
        val syncDispatcher = user?.let { signedInUser ->
            CandidateSyncDispatcher(
                syncScope = signedInUser.uid,
                preferences = preferences,
                saveCandidate = FirebaseCandidateRepository(signedInUser.uid)::save,
            )
        }
        val coordinator = NotificationCaptureCoordinator { candidate, onComplete ->
            val dispatcher = syncDispatcher
            if (dispatcher == null) {
                onComplete(false)
            } else {
                val anchored = preferences.prepareCandidateForDelivery(
                    syncScope = user.uid,
                    packageName = sourcePackage,
                    notificationKey = event.key,
                    candidate = candidate,
                )
                if (anchored == null) {
                    onComplete(false)
                } else if (anchored.state == CandidateSyncState.STORED) {
                    onComplete(true)
                } else {
                    dispatcher.sync(anchored.candidate) { result ->
                        onComplete(result == CandidateWriteResult.STORED)
                    }
                }
            }
        }
        val deliveryStartedAt = preferences.notificationDeliveryStartedAt(
            packageName = sourcePackage,
            notificationKey = event.key,
            postedAtEpochMillis = event.postTime,
        )

        coordinator.process(
            state = CaptureEligibilityState(
                signedIn = user != null,
                captureEnabled = preferences.captureEnabled,
                notificationAccessGranted = NotificationAccess.isGranted(this),
                allowedPackages = allowedPackages,
            ),
            installationId = preferences.installationId(),
            event = NotificationEventMetadata(
                packageName = sourcePackage,
                notificationKey = event.key,
                postedAtEpochMillis = event.postTime,
                deliveryStartedAtEpochMillis = deliveryStartedAt,
            ),
            rawProvider = {
                val extras = event.notification.extras
                RawNotification(
                    packageName = sourcePackage,
                    notificationKey = event.key,
                    postedAtEpochMillis = event.postTime,
                    title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString(),
                    text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString(),
                    bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString(),
                    subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString(),
                )
            },
            onResult = ::record,
        )
    }

    override fun onNotificationRemoved(statusBarNotification: StatusBarNotification?) {
        val event = statusBarNotification ?: return
        CapturePreferences.create(this).forgetNotificationDelivery(
            packageName = event.packageName,
            notificationKey = event.key,
        )
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        val preferences = CapturePreferences.create(this)
        val activeDeliveries = try {
            activeNotifications?.map { notification ->
                ActiveNotificationDelivery(
                    packageName = notification.packageName,
                    notificationKey = notification.key,
                )
            }
        } catch (_: SecurityException) {
            null
        }
        activeDeliveries?.let(preferences::reconcileActiveNotificationDeliveries)
        currentUser()?.let { user ->
            CandidateSyncDispatcher(user.uid, preferences).reconcile()
        }
    }

    private fun record(result: CaptureResultCode) {
        Log.i(LOG_TAG, result.name)
    }

    private fun currentUser() = if (FirebaseApp.getApps(this).isEmpty()) {
        null
    } else {
        FirebaseAuth.getInstance().currentUser
    }

    private fun applicationLabel(packageName: String): String = try {
        val info = applicationInfo(packageName)
        packageManager.getApplicationLabel(info).toString()
    } catch (_: PackageManager.NameNotFoundException) {
        packageName
    } catch (_: SecurityException) {
        packageName
    }

    @Suppress("DEPRECATION")
    private fun applicationInfo(packageName: String): ApplicationInfo =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packageManager.getApplicationInfo(
                packageName,
                android.content.pm.PackageManager.ApplicationInfoFlags.of(0),
            )
        } else {
            packageManager.getApplicationInfo(packageName, 0)
        }

    companion object {
        private const val LOG_TAG = "MoneytrackCapture"
    }
}

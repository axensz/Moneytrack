package com.moneytrack.capture.notification

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationListenerBoundaryContractTest {
    @Test
    fun `group summaries return before delivery identity and raw extras`() {
        val source = listenerSource()
        val summaryFlag = source.indexOf("Notification.FLAG_GROUP_SUMMARY")
        val ignoredResult = source.indexOf("CaptureResultCode.GROUP_SUMMARY_IGNORED", summaryFlag)
        val earlyReturn = source.indexOf("return", ignoredResult)
        val deliveryIdentity = source.indexOf("preferences.notificationDeliveryStartedAt(")
        val installationIdentity = source.indexOf("preferences.installationId()")
        val rawExtras = source.indexOf("event.notification.extras")

        assertTrue(summaryFlag >= 0)
        assertTrue(ignoredResult > summaryFlag)
        assertTrue(earlyReturn > ignoredResult)
        assertTrue(earlyReturn < deliveryIdentity)
        assertTrue(earlyReturn < installationIdentity)
        assertTrue(earlyReturn < rawExtras)
    }

    @Test
    fun `service destruction clears the live listener state`() {
        val source = listenerSource()
        val onDestroy = source.indexOf("override fun onDestroy()")
        val clearState = source.indexOf("NotificationAccess.markListenerConnected(false)", onDestroy)
        val superDestroy = source.indexOf("super.onDestroy()", onDestroy)

        assertTrue(onDestroy >= 0)
        assertTrue(clearState > onDestroy)
        assertTrue(superDestroy > clearState)
    }

    private fun listenerSource(): String {
        val candidates = listOf(
            File(
                "src/main/java/com/moneytrack/capture/notification/" +
                    "MoneyNotificationListenerService.kt",
            ),
            File(
                "app/src/main/java/com/moneytrack/capture/notification/" +
                    "MoneyNotificationListenerService.kt",
            ),
            File(
                "android-capture/app/src/main/java/com/moneytrack/capture/notification/" +
                    "MoneyNotificationListenerService.kt",
            ),
        )
        return candidates.firstOrNull(File::isFile)?.readText()
            ?: error("Unable to locate MoneyNotificationListenerService.kt")
    }
}

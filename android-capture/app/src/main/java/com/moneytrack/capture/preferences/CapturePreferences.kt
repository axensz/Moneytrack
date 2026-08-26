package com.moneytrack.capture.preferences

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import com.moneytrack.capture.core.CaptureResultCode
import com.moneytrack.capture.core.NormalizedPurchaseCandidate
import com.moneytrack.capture.core.PurchaseConfidence
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.Base64
import java.util.UUID

enum class AppThemeMode(val wireValue: String) {
    SYSTEM("system"),
    LIGHT("light"),
    DARK("dark"),
    ;

    companion object {
        fun fromWireValue(value: String?): AppThemeMode =
            entries.firstOrNull { it.wireValue == value } ?: SYSTEM
    }
}

data class DiscoveredNotificationSource(
    val packageName: String,
    val label: String,
)

data class ActiveNotificationDelivery(
    val packageName: String,
    val notificationKey: String,
)

enum class CandidateSyncState(val wireValue: String) {
    ENQUEUED("enqueued"),
    WRITE_FAILED("write_failed"),
    STORED("stored"),
    ;

    companion object {
        fun fromWireValue(value: String): CandidateSyncState? =
            entries.firstOrNull { it.wireValue == value }
    }
}

enum class CandidateSyncOverview {
    IDLE,
    PENDING,
    FAILED,
}

data class CandidateSyncRecord(
    val syncScopeHash: String,
    val candidate: NormalizedPurchaseCandidate,
    val state: CandidateSyncState,
)

class CapturePreferences private constructor(
    private val preferences: SharedPreferences,
) {
    var captureEnabled: Boolean
        get() = preferences.getBoolean(KEY_CAPTURE_ENABLED, false)
        set(value) {
            preferences.edit { putBoolean(KEY_CAPTURE_ENABLED, value) }
        }

    var appThemeMode: AppThemeMode
        get() = AppThemeMode.fromWireValue(preferences.getString(KEY_APP_THEME_MODE, null))
        set(value) {
            preferences.edit { putString(KEY_APP_THEME_MODE, value.wireValue) }
        }

    fun allowedPackages(): Set<String> = preferences
        .getStringSet(KEY_ALLOWED_PACKAGES, emptySet())
        ?.toSet()
        .orEmpty()

    fun setAllowedPackages(packageNames: Set<String>) {
        val validPackages = packageNames.filterTo(mutableSetOf(), ::isValidPackageName)
        preferences.edit { putStringSet(KEY_ALLOWED_PACKAGES, validPackages) }
    }

    @Synchronized
    fun installationId(): String {
        preferences.getString(KEY_INSTALLATION_ID, null)?.let { return it }
        val installationId = UUID.randomUUID().toString()
        preferences.edit(commit = true) {
            putString(KEY_INSTALLATION_ID, installationId)
        }
        return installationId
    }

    fun rememberDiscoveredSource(packageName: String, label: String) {
        if (!isValidPackageName(packageName)) return
        val packages = preferences
            .getStringSet(KEY_DISCOVERED_PACKAGES, emptySet())
            ?.toMutableSet()
            ?: mutableSetOf()
        packages.add(packageName)
        val safeLabel = label.trim().take(MAX_LABEL_LENGTH).ifBlank { packageName }
        preferences.edit {
            putStringSet(KEY_DISCOVERED_PACKAGES, packages)
            putString(sourceLabelKey(packageName), safeLabel)
        }
    }

    fun discoveredSources(): List<DiscoveredNotificationSource> = preferences
        .getStringSet(KEY_DISCOVERED_PACKAGES, emptySet())
        .orEmpty()
        .filter(::isValidPackageName)
        .sorted()
        .map { packageName ->
            DiscoveredNotificationSource(
                packageName = packageName,
                label = preferences.getString(sourceLabelKey(packageName), packageName)
                    ?.take(MAX_LABEL_LENGTH)
                    .orEmpty()
                    .ifBlank { packageName },
            )
        }

    @Synchronized
    fun notificationDeliveryStartedAt(
        packageName: String,
        notificationKey: String,
        postedAtEpochMillis: Long,
    ): Long {
        require(isValidPackageName(packageName)) { "Invalid source package" }
        require(notificationKey.isNotBlank()) { "Missing notification identity" }
        require(postedAtEpochMillis > 0) { "Invalid observed time" }

        val deliveryHash = notificationDeliveryHash(packageName, notificationKey)
        val preferenceKey = notificationDeliveryStartedAtKey(deliveryHash)
        val currentStartedAt = preferences.getLong(preferenceKey, 0L)
        val deliveryHashes = activeDeliveryHashes().toMutableSet().apply { add(deliveryHash) }
        if (currentStartedAt > 0L) {
            preferences.edit(commit = true) {
                putStringSet(KEY_NOTIFICATION_DELIVERY_HASHES, deliveryHashes)
            }
            return currentStartedAt
        }
        preferences.edit(commit = true) {
            putLong(preferenceKey, postedAtEpochMillis)
            putStringSet(KEY_NOTIFICATION_DELIVERY_HASHES, deliveryHashes)
        }
        return postedAtEpochMillis
    }

    @Synchronized
    fun forgetNotificationDelivery(packageName: String, notificationKey: String) {
        if (!isValidPackageName(packageName) || notificationKey.isBlank()) return
        val deliveryHash = notificationDeliveryHash(packageName, notificationKey)
        val candidateRecordKey = preferences.getString(
            notificationDeliveryCandidateKey(deliveryHash),
            null,
        )
        val remainingHashes = activeDeliveryHashes() - deliveryHash
        val remainingActiveRecords = remainingHashes.mapNotNullTo(mutableSetOf()) { hash ->
            preferences.getString(notificationDeliveryCandidateKey(hash), null)
        }
        val records = syncRecordsByKey().toMutableMap()
        candidateRecordKey?.let { recordKey ->
            if (
                records[recordKey]?.state == CandidateSyncState.STORED &&
                recordKey !in remainingActiveRecords
            ) {
                records.remove(recordKey)
            }
        }
        preferences.edit(commit = true) {
            remove(notificationDeliveryStartedAtKey(deliveryHash))
            remove(notificationDeliveryCandidateKey(deliveryHash))
            putStringSet(KEY_NOTIFICATION_DELIVERY_HASHES, remainingHashes)
            putStringSet(KEY_SYNC_CANDIDATE_RECORDS, encodeRecords(records.values))
        }
    }

    @Synchronized
    fun reconcileActiveNotificationDeliveries(activeDeliveries: Collection<ActiveNotificationDelivery>) {
        val observedHashes = activeDeliveries
            .asSequence()
            .filter { isValidPackageName(it.packageName) && it.notificationKey.isNotBlank() }
            .map { notificationDeliveryHash(it.packageName, it.notificationKey) }
            .toSet()
        val knownHashes = activeDeliveryHashes()
        val remainingHashes = knownHashes.intersect(observedHashes)
        val staleHashes = knownHashes - remainingHashes
        val remainingActiveRecords = remainingHashes.mapNotNullTo(mutableSetOf()) { hash ->
            preferences.getString(notificationDeliveryCandidateKey(hash), null)
        }
        val records = syncRecordsByKey()
            .filter { (recordKey, record) ->
                record.state != CandidateSyncState.STORED ||
                    recordKey in remainingActiveRecords
            }

        preferences.edit(commit = true) {
            staleHashes.forEach { hash ->
                remove(notificationDeliveryStartedAtKey(hash))
                remove(notificationDeliveryCandidateKey(hash))
            }
            putStringSet(KEY_NOTIFICATION_DELIVERY_HASHES, remainingHashes)
            putStringSet(KEY_SYNC_CANDIDATE_RECORDS, encodeRecords(records.values))
        }
    }

    @Synchronized
    fun prepareCandidateForDelivery(
        syncScope: String,
        packageName: String,
        notificationKey: String,
        candidate: NormalizedPurchaseCandidate,
    ): CandidateSyncRecord? {
        require(isValidPackageName(packageName)) { "Invalid source package" }
        require(notificationKey.isNotBlank()) { "Missing notification identity" }
        val deliveryHash = notificationDeliveryHash(packageName, notificationKey)
        val recordKey = candidateRecordKey(syncScope, candidate.candidateId)
        val linkedRecordKey = preferences.getString(
            notificationDeliveryCandidateKey(deliveryHash),
            null,
        )
        if (linkedRecordKey != null && linkedRecordKey != recordKey) return null

        val records = syncRecordsByKey().toMutableMap()
        val scopeHash = syncScopeHash(syncScope)
        val anchored = records[recordKey]
            ?: CandidateSyncRecord(scopeHash, candidate, CandidateSyncState.ENQUEUED)
        val nextRecord = if (anchored.state == CandidateSyncState.STORED) {
            anchored
        } else {
            anchored.copy(state = CandidateSyncState.ENQUEUED)
        }
        records[recordKey] = nextRecord
        val deliveryHashes = activeDeliveryHashes().toMutableSet().apply { add(deliveryHash) }
        preferences.edit(commit = true) {
            putString(notificationDeliveryCandidateKey(deliveryHash), recordKey)
            putStringSet(KEY_NOTIFICATION_DELIVERY_HASHES, deliveryHashes)
            putStringSet(KEY_SYNC_CANDIDATE_RECORDS, encodeRecords(records.values))
        }
        return nextRecord
    }

    @Synchronized
    fun markCandidateEnqueued(
        syncScope: String,
        candidateId: String,
    ): NormalizedPurchaseCandidate? {
        val recordKey = candidateRecordKey(syncScope, candidateId)
        val records = syncRecordsByKey().toMutableMap()
        val current = records[recordKey] ?: return null
        if (current.state == CandidateSyncState.STORED) return null
        records[recordKey] = current.copy(state = CandidateSyncState.ENQUEUED)
        preferences.edit(commit = true) {
            putStringSet(KEY_SYNC_CANDIDATE_RECORDS, encodeRecords(records.values))
        }
        return current.candidate
    }

    @Synchronized
    fun recordCandidateWriteResult(
        syncScope: String,
        candidateId: String,
        stored: Boolean,
    ) {
        val recordKey = candidateRecordKey(syncScope, candidateId)
        val records = syncRecordsByKey().toMutableMap()
        val current = records[recordKey] ?: return
        if (current.state == CandidateSyncState.STORED && !stored) return

        if (stored && recordKey !in activeRecordKeys()) {
            records.remove(recordKey)
        } else {
            records[recordKey] = current.copy(
                state = if (stored) CandidateSyncState.STORED else CandidateSyncState.WRITE_FAILED,
            )
        }
        preferences.edit(commit = true) {
            putStringSet(KEY_SYNC_CANDIDATE_RECORDS, encodeRecords(records.values))
        }
    }

    fun candidatesNeedingRetry(syncScope: String): List<NormalizedPurchaseCandidate> {
        val scopeHash = syncScopeHash(syncScope)
        return syncRecordsByKey()
            .values
            .asSequence()
            .filter { it.syncScopeHash == scopeHash }
            .filter { it.state != CandidateSyncState.STORED }
            .map(CandidateSyncRecord::candidate)
            .sortedWith(compareBy(NormalizedPurchaseCandidate::occurredAtEpochMillis)
                .thenBy(NormalizedPurchaseCandidate::candidateId))
            .toList()
    }

    fun candidateSyncOverview(syncScope: String): CandidateSyncOverview {
        val scopeHash = syncScopeHash(syncScope)
        val states = syncRecordsByKey().values
            .filter { it.syncScopeHash == scopeHash }
            .map(CandidateSyncRecord::state)
        return when {
            CandidateSyncState.WRITE_FAILED in states -> CandidateSyncOverview.FAILED
            CandidateSyncState.ENQUEUED in states -> CandidateSyncOverview.PENDING
            else -> CandidateSyncOverview.IDLE
        }
    }

    var lastResultCode: String?
        get() = preferences.getString(KEY_LAST_RESULT, null)
        private set(value) {
            preferences.edit { putString(KEY_LAST_RESULT, value) }
        }

    fun recordCaptureResult(result: CaptureResultCode) {
        preferences.edit(commit = true) {
            putString(KEY_LAST_RESULT, result.name)
        }
    }

    fun registerOnChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener) {
        preferences.registerOnSharedPreferenceChangeListener(listener)
    }

    fun unregisterOnChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener) {
        preferences.unregisterOnSharedPreferenceChangeListener(listener)
    }

    private fun activeDeliveryHashes(): Set<String> = preferences
        .getStringSet(KEY_NOTIFICATION_DELIVERY_HASHES, emptySet())
        ?.filterTo(mutableSetOf()) { DELIVERY_HASH.matches(it) }
        .orEmpty()

    private fun activeRecordKeys(): Set<String> = activeDeliveryHashes().mapNotNullTo(
        mutableSetOf(),
    ) { hash ->
        preferences.getString(notificationDeliveryCandidateKey(hash), null)
            ?.takeIf(SYNC_RECORD_KEY::matches)
    }

    private fun syncRecordsByKey(): Map<String, CandidateSyncRecord> = preferences
        .getStringSet(KEY_SYNC_CANDIDATE_RECORDS, emptySet())
        .orEmpty()
        .mapNotNull(::decodeRecord)
        .associateBy { record ->
            candidateRecordKeyFromHash(record.syncScopeHash, record.candidate.candidateId)
        }

    companion object {
        private const val PREFERENCES_NAME = "moneytrack_capture_private"
        private const val KEY_CAPTURE_ENABLED = "capture_enabled"
        private const val KEY_APP_THEME_MODE = "app_theme_mode"
        private const val KEY_ALLOWED_PACKAGES = "allowed_packages"
        private const val KEY_INSTALLATION_ID = "installation_id"
        private const val KEY_DISCOVERED_PACKAGES = "discovered_packages"
        private const val KEY_LAST_RESULT = "last_result_code"
        private const val KEY_NOTIFICATION_DELIVERY_HASHES = "notification_delivery_hashes"
        private const val KEY_SYNC_CANDIDATE_RECORDS = "sync_candidate_records"
        private const val SOURCE_LABEL_PREFIX = "source_label."
        private const val NOTIFICATION_DELIVERY_PREFIX = "notification_delivery."
        private const val NOTIFICATION_DELIVERY_CANDIDATE_PREFIX =
            "notification_delivery_candidate."
        private const val SYNC_RECORD_VERSION = "2"
        private const val MAX_SYNC_SCOPE_LENGTH = 128
        private const val MAX_PACKAGE_LENGTH = 160
        private const val MAX_LABEL_LENGTH = 80
        private val PACKAGE_NAME = Regex("[A-Za-z0-9._]+")
        private val DELIVERY_HASH = Regex("[a-f0-9]{64}")
        private val SYNC_RECORD_KEY = Regex("[a-f0-9]{64}:[a-f0-9]{64}")

        fun create(context: Context): CapturePreferences = CapturePreferences(
            context.applicationContext.getSharedPreferences(
                PREFERENCES_NAME,
                Context.MODE_PRIVATE,
            ),
        )

        private fun isValidPackageName(value: String): Boolean =
            value.isNotBlank() && value.length <= MAX_PACKAGE_LENGTH && PACKAGE_NAME.matches(value)

        private fun sourceLabelKey(packageName: String) = "$SOURCE_LABEL_PREFIX$packageName"

        private fun notificationDeliveryHash(packageName: String, notificationKey: String): String =
            sha256("$packageName|$notificationKey")

        private fun notificationDeliveryStartedAtKey(deliveryHash: String) =
            "$NOTIFICATION_DELIVERY_PREFIX$deliveryHash"

        private fun notificationDeliveryCandidateKey(deliveryHash: String) =
            "$NOTIFICATION_DELIVERY_CANDIDATE_PREFIX$deliveryHash"

        private fun candidateRecordKey(syncScope: String, candidateId: String): String =
            candidateRecordKeyFromHash(syncScopeHash(syncScope), candidateId)

        private fun candidateRecordKeyFromHash(scopeHash: String, candidateId: String): String {
            require(DELIVERY_HASH.matches(scopeHash)) { "Invalid sync scope hash" }
            return "$scopeHash:$candidateId"
        }

        private fun syncScopeHash(syncScope: String): String {
            require(
                syncScope.isNotBlank() &&
                    syncScope.length <= MAX_SYNC_SCOPE_LENGTH &&
                    '/' !in syncScope,
            ) { "Invalid sync scope" }
            return sha256("sync-scope|$syncScope")
        }

        private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }

        private fun encodeRecords(records: Collection<CandidateSyncRecord>): Set<String> =
            records.mapTo(mutableSetOf(), ::encodeRecord)

        private fun encodeRecord(record: CandidateSyncRecord): String = listOf(
            SYNC_RECORD_VERSION,
            record.syncScopeHash,
            record.candidate.candidateId,
            record.state.wireValue,
            encodeText(record.candidate.sourcePackage),
            record.candidate.occurredAtEpochMillis.toString(),
            record.candidate.amountMinor.toString(),
            encodeText(record.candidate.merchant),
            record.candidate.cardLast4.orEmpty(),
            record.candidate.confidence.wireValue,
        ).joinToString("|")

        private fun decodeRecord(value: String): CandidateSyncRecord? {
            return try {
                val parts = value.split('|')
                if (
                    parts.size != 10 ||
                    parts[0] != SYNC_RECORD_VERSION ||
                    !DELIVERY_HASH.matches(parts[1])
                ) return null
                val state = CandidateSyncState.fromWireValue(parts[3]) ?: return null
                val confidence = PurchaseConfidence.entries
                    .firstOrNull { it.wireValue == parts[9] }
                    ?: return null
                CandidateSyncRecord(
                    syncScopeHash = parts[1],
                    candidate = NormalizedPurchaseCandidate(
                        candidateId = parts[2],
                        sourcePackage = decodeText(parts[4]),
                        occurredAtEpochMillis = parts[5].toLong(),
                        amountMinor = parts[6].toLong(),
                        merchant = decodeText(parts[7]),
                        cardLast4 = parts[8].ifEmpty { null },
                        confidence = confidence,
                    ),
                    state = state,
                )
            } catch (_: IllegalArgumentException) {
                null
            }
        }

        private fun encodeText(value: String): String = Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(value.toByteArray(StandardCharsets.UTF_8))

        private fun decodeText(value: String): String = String(
            Base64.getUrlDecoder().decode(value),
            StandardCharsets.UTF_8,
        )
    }
}

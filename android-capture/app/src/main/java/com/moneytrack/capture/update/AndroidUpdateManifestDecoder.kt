package com.moneytrack.capture.update

import java.net.URI
import java.nio.charset.StandardCharsets
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

class AndroidUpdateManifestDecoder {
    fun decode(text: String): AndroidUpdateManifest? {
        if (text.toByteArray(StandardCharsets.UTF_8).size > MAX_MANIFEST_BYTES) return null

        return runCatching { decodeStrict(text) }.getOrNull()
    }

    private fun decodeStrict(text: String): AndroidUpdateManifest {
        val scannedKeys = scanTopLevelKeys(text) ?: invalidManifest()
        if (scannedKeys.size != scannedKeys.toSet().size) invalidManifest()

        val json = JSONObject(text)
        val parsedKeys = json.keys().asSequence().toSet()
        if (scannedKeys.toSet() != EXPECTED_KEYS || parsedKeys != EXPECTED_KEYS) invalidManifest()

        val schemaVersion = json.strictLong("schemaVersion")
        val channel = json.strictString("channel")
        val versionCode = json.strictLong("versionCode")
        val versionName = json.strictString("versionName")
        val apkUrl = json.strictString("apkUrl")
        val sha256 = json.strictString("sha256")
        val sizeBytes = json.strictLong("sizeBytes")
        val releaseNotes = json.strictReleaseNotes()

        if (schemaVersion != SUPPORTED_SCHEMA.toLong()) invalidManifest()
        if (channel != SUPPORTED_CHANNEL) invalidManifest()
        if (versionCode <= 0L || versionName.isBlank()) invalidManifest()
        if (!isAllowedApkUrl(apkUrl)) invalidManifest()
        if (!SHA_256_PATTERN.matches(sha256)) invalidManifest()
        if (sizeBytes <= 0L) invalidManifest()

        return AndroidUpdateManifest(
            schemaVersion = schemaVersion.toInt(),
            channel = channel,
            versionCode = versionCode,
            versionName = versionName,
            apkUrl = apkUrl,
            sha256 = sha256.lowercase(Locale.ROOT),
            sizeBytes = sizeBytes,
            releaseNotes = releaseNotes,
        )
    }

    private fun JSONObject.strictString(key: String): String =
        (get(key) as? String) ?: invalidManifest()

    private fun JSONObject.strictLong(key: String): Long =
        when (val value = get(key)) {
            is Int -> value.toLong()
            is Long -> value
            else -> invalidManifest()
        }

    private fun JSONObject.strictReleaseNotes(): List<String> {
        val array = get("releaseNotes") as? JSONArray ?: invalidManifest()
        if (array.length() > MAX_RELEASE_NOTES) invalidManifest()

        return List(array.length()) { index ->
            val note = array.get(index) as? String ?: invalidManifest()
            if (note.isBlank() || note.codePointCount(0, note.length) > MAX_RELEASE_NOTE_LENGTH) {
                invalidManifest()
            }
            note
        }
    }

    private fun isAllowedApkUrl(value: String): Boolean {
        if (!value.startsWith(ALLOWED_APK_PREFIX)) return false

        val uri = runCatching { URI(value) }.getOrNull() ?: return false
        return uri.scheme == "https" &&
            uri.host == "github.com" &&
            uri.port == -1 &&
            uri.rawUserInfo == null &&
            uri.rawQuery == null &&
            uri.rawFragment == null &&
            uri.rawPath.startsWith(ALLOWED_APK_PATH_PREFIX)
    }

    private fun scanTopLevelKeys(source: String): List<String>? {
        var index = source.skipWhitespace(0)
        if (source.getOrNull(index) != '{') return null
        index = source.skipWhitespace(index + 1)

        val keys = mutableListOf<String>()
        if (source.getOrNull(index) == '}') {
            return if (source.skipWhitespace(index + 1) == source.length) keys else null
        }

        while (index < source.length) {
            val parsedKey = source.readJsonString(index) ?: return null
            keys += parsedKey.value
            index = source.skipWhitespace(parsedKey.nextIndex)
            if (source.getOrNull(index) != ':') return null

            index = source.skipJsonValue(index + 1) ?: return null
            index = source.skipWhitespace(index)
            when (source.getOrNull(index)) {
                ',' -> index = source.skipWhitespace(index + 1)
                '}' -> {
                    return if (source.skipWhitespace(index + 1) == source.length) keys else null
                }
                else -> return null
            }
        }

        return null
    }

    private fun String.skipWhitespace(start: Int): Int {
        var index = start
        while (index < length && this[index].isWhitespace()) index += 1
        return index
    }

    private fun String.readJsonString(start: Int): ParsedString? {
        if (getOrNull(start) != '"') return null
        val value = StringBuilder()
        var index = start + 1

        while (index < length) {
            val current = this[index++]
            when {
                current == '"' -> return ParsedString(value.toString(), index)
                current == '\\' -> {
                    val escaped = getOrNull(index++) ?: return null
                    when (escaped) {
                        '"', '\\', '/' -> value.append(escaped)
                        'b' -> value.append('\b')
                        'f' -> value.append('\u000C')
                        'n' -> value.append('\n')
                        'r' -> value.append('\r')
                        't' -> value.append('\t')
                        'u' -> {
                            if (index + 4 > length) return null
                            val codePoint = substring(index, index + 4).toIntOrNull(16) ?: return null
                            value.append(codePoint.toChar())
                            index += 4
                        }
                        else -> return null
                    }
                }
                current.code < 0x20 -> return null
                else -> value.append(current)
            }
        }

        return null
    }

    private fun String.skipJsonValue(start: Int): Int? {
        var index = skipWhitespace(start)
        val valueStart = index
        var objectDepth = 0
        var arrayDepth = 0
        var inString = false
        var escaped = false

        while (index < length) {
            val current = this[index]
            if (inString) {
                when {
                    escaped -> escaped = false
                    current == '\\' -> escaped = true
                    current == '"' -> inString = false
                }
                index += 1
                continue
            }

            when (current) {
                '"' -> inString = true
                '{' -> objectDepth += 1
                '[' -> arrayDepth += 1
                '}' -> {
                    if (objectDepth == 0 && arrayDepth == 0) {
                        return index.takeIf { it > valueStart }
                    }
                    objectDepth -= 1
                    if (objectDepth < 0) return null
                }
                ']' -> {
                    arrayDepth -= 1
                    if (arrayDepth < 0) return null
                }
                ',' -> if (objectDepth == 0 && arrayDepth == 0) {
                    return index.takeIf { it > valueStart }
                }
            }
            index += 1
        }

        return null
    }

    private data class ParsedString(
        val value: String,
        val nextIndex: Int,
    )

    private companion object {
        const val MAX_MANIFEST_BYTES = 32 * 1024
        const val MAX_RELEASE_NOTES = 5
        const val MAX_RELEASE_NOTE_LENGTH = 160
        const val SUPPORTED_SCHEMA = 1
        const val SUPPORTED_CHANNEL = "canary"
        const val ALLOWED_APK_PREFIX = "https://github.com/axensz/Moneytrack/releases/download/"
        const val ALLOWED_APK_PATH_PREFIX = "/axensz/Moneytrack/releases/download/"
        val SHA_256_PATTERN = Regex("[A-Fa-f0-9]{64}")
        val EXPECTED_KEYS = setOf(
            "schemaVersion",
            "channel",
            "versionCode",
            "versionName",
            "apkUrl",
            "sha256",
            "sizeBytes",
            "releaseNotes",
        )
    }
}

private fun invalidManifest(): Nothing = throw IllegalArgumentException("Invalid update manifest")

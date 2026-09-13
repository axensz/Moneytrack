package com.moneytrack.capture.update

import com.moneytrack.capture.BuildConfig
import java.io.ByteArrayOutputStream
import java.net.SocketTimeoutException
import java.net.URL
import javax.net.ssl.HttpsURLConnection

fun interface UpdateManifestTransport {
    fun fetch(url: String): UpdateTransportResult
}

sealed interface UpdateTransportResult {
    data class Success(val body: String) : UpdateTransportResult
    data class HttpError(val statusCode: Int) : UpdateTransportResult
    data object TooLarge : UpdateTransportResult
    data object Timeout : UpdateTransportResult
    data object Failed : UpdateTransportResult
}

class HttpsUpdateManifestTransport(
    private val userAgent: String = "MoneyTrack-Android/${BuildConfig.VERSION_NAME}",
) : UpdateManifestTransport {
    override fun fetch(url: String): UpdateTransportResult {
        val endpoint = runCatching { URL(url) }.getOrNull()
            ?.takeIf { it.protocol == "https" }
            ?: return UpdateTransportResult.Failed
        var connection: HttpsURLConnection? = null

        return try {
            connection = endpoint.openConnection() as? HttpsURLConnection
                ?: return UpdateTransportResult.Failed
            connection.connectTimeout = TIMEOUT_MILLIS
            connection.readTimeout = TIMEOUT_MILLIS
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("User-Agent", userAgent)

            val statusCode = connection.responseCode
            if (statusCode != HttpsURLConnection.HTTP_OK) {
                UpdateTransportResult.HttpError(statusCode)
            } else if (connection.contentLengthLong > MAX_BODY_BYTES) {
                UpdateTransportResult.TooLarge
            } else {
                connection.inputStream.use(::readBody)
            }
        } catch (_: SocketTimeoutException) {
            UpdateTransportResult.Timeout
        } catch (_: Exception) {
            UpdateTransportResult.Failed
        } finally {
            connection?.disconnect()
        }
    }

    private fun readBody(input: java.io.InputStream): UpdateTransportResult {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(BUFFER_BYTES)
        var total = 0

        while (true) {
            val read = input.read(buffer)
            if (read == -1) break
            total += read
            if (total > MAX_BODY_BYTES) return UpdateTransportResult.TooLarge
            output.write(buffer, 0, read)
        }

        return UpdateTransportResult.Success(output.toByteArray().toString(Charsets.UTF_8))
    }

    private companion object {
        const val TIMEOUT_MILLIS = 8_000
        const val MAX_BODY_BYTES = 32 * 1024
        const val BUFFER_BYTES = 4 * 1024
    }
}

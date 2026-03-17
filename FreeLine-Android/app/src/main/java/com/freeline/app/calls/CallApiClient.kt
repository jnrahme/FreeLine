package com.freeline.app.calls

import com.freeline.app.config.APIConfiguration
import com.freeline.app.monetization.MonetizationApiException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class CallApiClient(
    private val baseUrl: String = APIConfiguration.baseUrl,
) {
    suspend fun deleteVoicemail(
        accessToken: String,
        voicemailId: String,
    ) {
        withContext(Dispatchers.IO) {
            request(
                path = "/v1/voicemails/$voicemailId",
                method = "DELETE",
                accessToken = accessToken,
            )
        }
    }

    suspend fun listCallHistory(accessToken: String): CallHistoryPayload =
        withContext(Dispatchers.IO) {
            val response = request(
                path = "/v1/calls/history",
                method = "GET",
                accessToken = accessToken,
            )

            CallHistoryPayload(
                allowance = response.getJSONObject("allowance").toCallAllowance(),
                calls = response.getJSONArray("calls").toCallHistoryList(),
                limit = response.getInt("limit"),
                offset = response.getInt("offset"),
            )
        }

    suspend fun listVoicemails(accessToken: String): VoicemailListPayload =
        withContext(Dispatchers.IO) {
            val response = request(
                path = "/v1/voicemails",
                method = "GET",
                accessToken = accessToken,
            )

            VoicemailListPayload(
                limit = response.getInt("limit"),
                offset = response.getInt("offset"),
                voicemails = response.getJSONArray("voicemails").toVoicemailList(),
            )
        }

    suspend fun markVoicemailRead(
        accessToken: String,
        voicemailId: String,
    ): VoicemailReadPayload = withContext(Dispatchers.IO) {
        val response = request(
            path = "/v1/voicemails/$voicemailId/read",
            method = "PATCH",
            accessToken = accessToken,
        )

        VoicemailReadPayload(
            voicemail = response.getJSONObject("voicemail").toVoicemailEntry(),
        )
    }

    suspend fun registerCallPushToken(
        accessToken: String,
        channel: String,
        deviceId: String,
        platform: String,
        token: String,
    ): CallPushTokenPayload = withContext(Dispatchers.IO) {
        val response = request(
            path = "/v1/devices/call-push-token",
            method = "POST",
            accessToken = accessToken,
            jsonBody = mapOf(
                "channel" to channel,
                "deviceId" to deviceId,
                "platform" to platform,
                "token" to token,
            ),
        )

        CallPushTokenPayload(
            pushToken = response.getJSONObject("pushToken").toCallPushTokenRecord(),
        )
    }

    suspend fun registerVoipToken(
        accessToken: String,
        deviceId: String,
        platform: String,
        token: String,
    ): CallPushTokenPayload = withContext(Dispatchers.IO) {
        val response = request(
            path = "/v1/devices/voip-token",
            method = "POST",
            accessToken = accessToken,
            jsonBody = mapOf(
                "deviceId" to deviceId,
                "platform" to platform,
                "token" to token,
            ),
        )

        CallPushTokenPayload(
            pushToken = response.getJSONObject("pushToken").toCallPushTokenRecord(),
        )
    }

    suspend fun requestVoiceToken(accessToken: String): VoiceTokenPayload =
        withContext(Dispatchers.IO) {
            val response = request(
                path = "/v1/calls/token",
                method = "POST",
                accessToken = accessToken,
            )

            VoiceTokenPayload(
                allowance = response.getJSONObject("allowance").toCallAllowance(),
                expiresInSeconds = response.getInt("expiresInSeconds"),
                fromNumber = response.getString("fromNumber"),
                identity = response.getString("identity"),
                token = response.getString("token"),
            )
        }

    private fun request(
        path: String,
        method: String,
        accessToken: String,
        jsonBody: Map<String, String>? = null,
    ): JSONObject {
        val connection = (URL("$baseUrl$path").openConnection() as HttpURLConnection).apply {
            requestMethod = method
            setRequestProperty("Authorization", "Bearer $accessToken")
            if (jsonBody != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                outputStream.bufferedWriter().use { writer ->
                    writer.write(JSONObject(jsonBody).toString())
                }
            }
        }

        try {
            val statusCode = connection.responseCode
            val responseText = if (statusCode in 200..299) {
                connection.inputStream.bufferedReader().use { it.readText() }
            } else {
                connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
            }

            if (statusCode !in 200..299) {
                throw responseText.toApiException("Call request failed.")
            }

            return if (responseText.isBlank()) JSONObject() else JSONObject(responseText)
        } finally {
            connection.disconnect()
        }
    }

    private fun JSONObject.toCallAllowance(): CallAllowance =
        CallAllowance(
            monthlyCapMinutes = getInt("monthlyCapMinutes"),
            monthlyRemainingMinutes = getInt("monthlyRemainingMinutes"),
            monthlyUsedMinutes = getInt("monthlyUsedMinutes"),
        )

    private fun String.toApiException(defaultMessage: String): MonetizationApiException {
        val error = runCatching { JSONObject(this).getJSONObject("error") }.getOrNull()
        val message = error?.optString("message").takeUnless { it.isNullOrBlank() } ?: defaultMessage
        val upgradePrompt = error
            ?.optJSONObject("details")
            ?.optString("upgradePrompt")
            ?.takeUnless { it.isNullOrBlank() }

        return MonetizationApiException(
            message = message,
            upgradePrompt = upgradePrompt,
        )
    }

    private fun JSONObject.toCallPushTokenRecord(): CallPushTokenRecord =
        CallPushTokenRecord(
            channel = getString("channel"),
            createdAt = getString("createdAt"),
            deviceId = getString("deviceId"),
            id = getString("id"),
            platform = getString("platform"),
            token = getString("token"),
            updatedAt = getString("updatedAt"),
            userId = getString("userId"),
        )

    private fun JSONObject.toVoicemailEntry(): VoicemailEntry =
        VoicemailEntry(
            audioUrl = getString("audioUrl"),
            callerNumber = getString("callerNumber"),
            createdAt = getString("createdAt"),
            durationSeconds = getInt("durationSeconds"),
            id = getString("id"),
            isRead = getBoolean("isRead"),
            phoneNumberId = getString("phoneNumberId"),
            providerCallId = getString("providerCallId"),
            transcription = optString("transcription").ifBlank { null },
            updatedAt = getString("updatedAt"),
            userId = getString("userId"),
        )

    private fun org.json.JSONArray.toCallHistoryList(): List<CallHistoryEntry> =
        buildList {
            for (index in 0 until length()) {
                val item = getJSONObject(index)
                add(
                    CallHistoryEntry(
                        createdAt = item.getString("createdAt"),
                        direction = item.getString("direction"),
                        durationSeconds = item.getInt("durationSeconds"),
                        endedAt = item.optString("endedAt").ifBlank { null },
                        id = item.getString("id"),
                        phoneNumberId = item.getString("phoneNumberId"),
                        providerCallId = item.getString("providerCallId"),
                        remoteNumber = item.getString("remoteNumber"),
                        startedAt = item.optString("startedAt").ifBlank { null },
                        status = item.getString("status"),
                        updatedAt = item.getString("updatedAt"),
                        userId = item.getString("userId"),
                    )
                )
            }
        }

    private fun org.json.JSONArray.toVoicemailList(): List<VoicemailEntry> =
        buildList {
            for (index in 0 until length()) {
                add(getJSONObject(index).toVoicemailEntry())
            }
        }
}

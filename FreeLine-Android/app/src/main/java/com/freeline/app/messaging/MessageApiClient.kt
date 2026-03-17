package com.freeline.app.messaging

import com.freeline.app.config.APIConfiguration
import com.freeline.app.monetization.MonetizationApiException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class MessageApiClient(
    private val baseUrl: String = APIConfiguration.baseUrl,
) {
    suspend fun listConversations(accessToken: String): ConversationListPayload =
        withContext(Dispatchers.IO) {
            val response = request(
                path = "/v1/conversations",
                method = "GET",
                accessToken = accessToken,
                body = null,
            )

            ConversationListPayload(
                allowance = response.getJSONObject("allowance").toAllowance(),
                conversations = response.getJSONArray("conversations").toConversationList(),
                limit = response.getInt("limit"),
                offset = response.getInt("offset"),
            )
        }

    suspend fun listMessages(
        accessToken: String,
        conversationId: String,
    ): ConversationThreadPayload = withContext(Dispatchers.IO) {
        val response = request(
            path = "/v1/conversations/$conversationId/messages",
            method = "GET",
            accessToken = accessToken,
            body = null,
        )

        ConversationThreadPayload(
            allowance = response.getJSONObject("allowance").toAllowance(),
            conversation = response.getJSONObject("conversation").toConversation(),
            limit = response.getInt("limit"),
            messages = response.getJSONArray("messages").toMessageList(),
            offset = response.getInt("offset"),
        )
    }

    suspend fun sendMessage(
        accessToken: String,
        to: String,
        body: String,
    ): MessageSendPayload = withContext(Dispatchers.IO) {
        val response = request(
            path = "/v1/messages",
            method = "POST",
            accessToken = accessToken,
            body = mapOf(
                "body" to body,
                "to" to to,
            ),
        )

        MessageSendPayload(
            allowance = response.getJSONObject("allowance").toAllowance(),
            conversation = response.getJSONObject("conversation").toConversation(),
            message = response.getJSONObject("message").toMessage(),
        )
    }

    suspend fun registerPushToken(
        accessToken: String,
        deviceId: String,
        platform: String,
        token: String,
    ) {
        withContext(Dispatchers.IO) {
            request(
                path = "/v1/devices/push-token",
                method = "POST",
                accessToken = accessToken,
                body = mapOf(
                    "deviceId" to deviceId,
                    "platform" to platform,
                    "token" to token,
                ),
            )
        }
    }

    suspend fun markConversationRead(
        accessToken: String,
        conversationId: String,
    ): ConversationSummary = withContext(Dispatchers.IO) {
        val response = request(
            path = "/v1/conversations/$conversationId/read",
            method = "PATCH",
            accessToken = accessToken,
            body = null,
        )

        response.getJSONObject("conversation").toConversation()
    }

    suspend fun blockNumber(
        accessToken: String,
        number: String,
    ) {
        withContext(Dispatchers.IO) {
            request(
                path = "/v1/blocks",
                method = "POST",
                accessToken = accessToken,
                body = mapOf("blockedNumber" to number),
            )
        }
    }

    suspend fun unblockNumber(
        accessToken: String,
        number: String,
    ) {
        withContext(Dispatchers.IO) {
            requestNoContent(
                path = "/v1/blocks/${java.net.URLEncoder.encode(number, Charsets.UTF_8)}",
                method = "DELETE",
                accessToken = accessToken,
                body = null,
            )
        }
    }

    suspend fun reportNumber(
        accessToken: String,
        number: String,
        reason: String,
    ) {
        withContext(Dispatchers.IO) {
            request(
                path = "/v1/reports",
                method = "POST",
                accessToken = accessToken,
                body = mapOf(
                    "reason" to reason,
                    "reportedNumber" to number,
                ),
            )
        }
    }

    private fun request(
        path: String,
        method: String,
        accessToken: String?,
        body: Map<String, String>?,
    ): JSONObject {
        val connection = (URL("$baseUrl$path").openConnection() as HttpURLConnection).apply {
            requestMethod = method
            if (accessToken != null) {
                setRequestProperty("Authorization", "Bearer $accessToken")
            }
            if (body != null) {
                setRequestProperty("Content-Type", "application/json")
                doOutput = true
            }
        }

        try {
            if (body != null) {
                val jsonBody = JSONObject()
                body.forEach { (key, value) ->
                    jsonBody.put(key, value)
                }
                connection.outputStream.use { stream ->
                    stream.write(jsonBody.toString().toByteArray())
                }
            }

            val statusCode = connection.responseCode
            val responseText = if (statusCode in 200..299) {
                connection.inputStream.bufferedReader().use { it.readText() }
            } else {
                connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
            }

            if (statusCode !in 200..299) {
                throw responseText.toApiException("Message request failed.")
            }

            return JSONObject(responseText)
        } finally {
            connection.disconnect()
        }
    }

    private fun requestNoContent(
        path: String,
        method: String,
        accessToken: String?,
        body: Map<String, String>?,
    ) {
        val connection = (URL("$baseUrl$path").openConnection() as HttpURLConnection).apply {
            requestMethod = method
            if (accessToken != null) {
                setRequestProperty("Authorization", "Bearer $accessToken")
            }
            if (body != null) {
                setRequestProperty("Content-Type", "application/json")
                doOutput = true
            }
        }

        try {
            if (body != null) {
                val jsonBody = JSONObject()
                body.forEach { (key, value) ->
                    jsonBody.put(key, value)
                }
                connection.outputStream.use { stream ->
                    stream.write(jsonBody.toString().toByteArray())
                }
            }

            val statusCode = connection.responseCode
            if (statusCode !in 200..299) {
                val responseText = connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
                throw responseText.toApiException("Message request failed.")
            }
        } finally {
            connection.disconnect()
        }
    }

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

    private fun JSONObject.toAllowance(): MessageAllowance =
        MessageAllowance(
            dailyCap = getInt("dailyCap"),
            dailyRemaining = getInt("dailyRemaining"),
            dailyUsed = getInt("dailyUsed"),
            monthlyCap = getInt("monthlyCap"),
            monthlyRemaining = getInt("monthlyRemaining"),
            monthlyUsed = getInt("monthlyUsed"),
        )

    private fun org.json.JSONArray.toConversationList(): List<ConversationSummary> =
        buildList {
            for (index in 0 until length()) {
                add(getJSONObject(index).toConversation())
            }
        }

    private fun org.json.JSONArray.toMessageList(): List<ChatMessage> =
        buildList {
            for (index in 0 until length()) {
                add(getJSONObject(index).toMessage())
            }
        }

    private fun JSONObject.toConversation(): ConversationSummary =
        ConversationSummary(
            createdAt = getString("createdAt"),
            id = getString("id"),
            isOptedOut = getBoolean("isOptedOut"),
            lastMessageAt = optString("lastMessageAt").ifBlank { null },
            lastMessagePreview = optString("lastMessagePreview").ifBlank { null },
            lastMessageStatus = optString("lastMessageStatus").ifBlank { null },
            participantNumber = getString("participantNumber"),
            phoneNumberId = getString("phoneNumberId"),
            unreadCount = getInt("unreadCount"),
            updatedAt = getString("updatedAt"),
            userId = getString("userId"),
        )

    private fun JSONObject.toMessage(): ChatMessage =
        ChatMessage(
            body = getString("body"),
            conversationId = getString("conversationId"),
            createdAt = getString("createdAt"),
            direction = getString("direction"),
            id = getString("id"),
            providerMessageId = optString("providerMessageId").ifBlank { null },
            status = getString("status"),
            updatedAt = getString("updatedAt"),
        )
}

package com.freeline.app.messaging

import com.freeline.app.config.APIConfiguration
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class MessageRealtimeClient(
    private val baseUrl: String = APIConfiguration.baseUrl,
    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build(),
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var connectionJob: Job? = null
    @Volatile
    private var currentAccessToken: String? = null
    @Volatile
    private var webSocket: WebSocket? = null

    fun updateConnection(
        accessToken: String?,
        onEvent: (MessageRealtimeEvent) -> Unit,
    ) {
        if (currentAccessToken == accessToken) {
            return
        }

        disconnect()

        if (accessToken == null) {
            return
        }

        currentAccessToken = accessToken
        connectionJob = scope.launch {
            runConnectionLoop(accessToken, onEvent)
        }
    }

    fun disconnect() {
        currentAccessToken = null
        connectionJob?.cancel()
        connectionJob = null
        webSocket?.close(1000, null)
        webSocket = null
    }

    fun shutdown() {
        disconnect()
        scope.cancel()
    }

    private suspend fun runConnectionLoop(
        accessToken: String,
        onEvent: (MessageRealtimeEvent) -> Unit,
    ) {
        while (scope.isActive && currentAccessToken == accessToken) {
            val closeSignal = kotlinx.coroutines.CompletableDeferred<Unit>()
            val socket = httpClient.newWebSocket(
                buildRequest(accessToken),
                object : WebSocketListener() {
                    override fun onFailure(
                        webSocket: WebSocket,
                        t: Throwable,
                        response: Response?,
                    ) {
                        closeSignal.complete(Unit)
                    }

                    override fun onMessage(
                        webSocket: WebSocket,
                        text: String,
                    ) {
                        val event = text.toRealtimeEvent() ?: return
                        if (event.type != MessageRealtimeEventType.Ready) {
                            onEvent(event)
                        }
                    }

                    override fun onClosed(
                        webSocket: WebSocket,
                        code: Int,
                        reason: String,
                    ) {
                        closeSignal.complete(Unit)
                    }
                },
            )

            webSocket = socket
            closeSignal.await()

            if (webSocket === socket) {
                webSocket = null
            }

            if (!scope.isActive || currentAccessToken != accessToken) {
                break
            }

            delay(2_000)
        }
    }

    private fun buildRequest(accessToken: String): Request = Request.Builder()
        .url(websocketUrl())
        .header("Authorization", "Bearer $accessToken")
        .build()

    private fun websocketUrl(): String {
        val normalizedBaseUrl = baseUrl.trimEnd('/')
        return when {
            normalizedBaseUrl.startsWith("https://") -> normalizedBaseUrl.replaceFirst("https://", "wss://")
            normalizedBaseUrl.startsWith("http://") -> normalizedBaseUrl.replaceFirst("http://", "ws://")
            else -> normalizedBaseUrl
        } + "/v1/realtime/messages"
    }
}

private fun String.toRealtimeEvent(): MessageRealtimeEvent? {
    val payload = JSONObject(this)
    val eventType = MessageRealtimeEventType.fromWireName(payload.optString("type")) ?: return null

    return MessageRealtimeEvent(
        conversation = payload.optJSONObject("conversation")?.toConversation(),
        message = payload.optJSONObject("message")?.toMessage(),
        type = eventType,
    )
}

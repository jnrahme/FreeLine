package com.freeline.app.calls

import com.freeline.app.auth.SessionStore
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class FreeLineFirebaseMessagingService : FirebaseMessagingService() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        val callerNumber = remoteMessage.data["callerNumber"]
            ?: remoteMessage.data["from"]
            ?: return
        val providerCallId = remoteMessage.data["providerCallId"]
            ?: remoteMessage.data["callSid"]
            ?: return

        IncomingCallForegroundService.startIncomingCall(
            context = applicationContext,
            callerNumber = callerNumber,
            providerCallId = providerCallId,
        )
    }

    override fun onNewToken(token: String) {
        val sessionStore = SessionStore(applicationContext)
        val session = sessionStore.loadSession() ?: return
        val fingerprint = sessionStore.getOrCreateFingerprint()

        serviceScope.launch {
            runCatching {
                CallApiClient().registerCallPushToken(
                    accessToken = session.tokens.accessToken,
                    channel = "alert",
                    deviceId = fingerprint,
                    platform = "android",
                    token = token,
                )
            }
        }
    }
}

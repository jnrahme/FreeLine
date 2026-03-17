package com.freeline.app.calls

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.freeline.app.MainActivity
import com.freeline.app.auth.SessionStore
import com.freeline.app.messaging.MessageApiClient
import com.freeline.app.ui.MessageLaunchRoute
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
        val providerCallId = remoteMessage.data["providerCallId"]
            ?: remoteMessage.data["callSid"]

        if (callerNumber != null && providerCallId != null) {
            IncomingCallForegroundService.startIncomingCall(
                context = applicationContext,
                callerNumber = callerNumber,
                providerCallId = providerCallId,
            )
            return
        }

        val route = MessageLaunchRoute.fromMap(remoteMessage.data) ?: return
        showInboundMessageNotification(
            route = route,
            sender = remoteMessage.data["participantNumber"]
                ?: remoteMessage.data["from"]
                ?: remoteMessage.notification?.title
                ?: "New message",
            preview = remoteMessage.data["preview"]
                ?: remoteMessage.data["body"]
                ?: remoteMessage.notification?.body
                ?: "Open FreeLine to read the message.",
        )
    }

    override fun onNewToken(token: String) {
        val sessionStore = SessionStore(applicationContext)
        sessionStore.saveFcmPushToken(token)

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

            runCatching {
                MessageApiClient().registerPushToken(
                    accessToken = session.tokens.accessToken,
                    deviceId = fingerprint,
                    platform = "android",
                    token = token,
                )
            }
        }
    }

    private fun showInboundMessageNotification(
        route: MessageLaunchRoute,
        sender: String,
        preview: String,
    ) {
        ensureMessageNotificationChannel()

        val contentIntent = PendingIntent.getActivity(
            this,
            route.conversationId.hashCode(),
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(MessageLaunchRoute.EXTRA_CONVERSATION_ID, route.conversationId)
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        val notification = NotificationCompat.Builder(this, MESSAGE_NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.sym_action_chat)
            .setContentTitle(sender.formatCallPhoneNumber())
            .setContentText(preview)
            .setStyle(NotificationCompat.BigTextStyle().bigText(preview))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .build()

        val manager = getSystemService(NotificationManager::class.java) ?: return
        manager.notify(route.conversationId.hashCode(), notification)
    }

    private fun ensureMessageNotificationChannel() {
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val existing = manager.getNotificationChannel(MESSAGE_NOTIFICATION_CHANNEL_ID)
        if (existing != null) {
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(
                    MESSAGE_NOTIFICATION_CHANNEL_ID,
                    MESSAGE_NOTIFICATION_CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH,
                ),
            )
        }
    }

    private companion object {
        const val MESSAGE_NOTIFICATION_CHANNEL_ID = "freeline_messages"
        const val MESSAGE_NOTIFICATION_CHANNEL_NAME = "FreeLine messages"
    }
}

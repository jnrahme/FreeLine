package com.freeline.app.calls

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.freeline.app.MainActivity

class IncomingCallForegroundService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(
        intent: Intent?,
        flags: Int,
        startId: Int,
    ): Int {
        val callerNumber = intent?.getStringExtra(IncomingCallContract.EXTRA_CALLER_NUMBER).orEmpty()
        val providerCallId = intent?.getStringExtra(IncomingCallContract.EXTRA_PROVIDER_CALL_ID).orEmpty()

        return when (intent?.action) {
            IncomingCallContract.ACTION_ANSWER -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                START_NOT_STICKY
            }

            IncomingCallContract.ACTION_DECLINE -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                START_NOT_STICKY
            }

            else -> {
                showIncomingCallNotification(
                    callerNumber = callerNumber,
                    providerCallId = providerCallId,
                )
                START_NOT_STICKY
            }
        }
    }

    private fun showIncomingCallNotification(
        callerNumber: String,
        providerCallId: String,
    ) {
        val safeCallerNumber = callerNumber.ifBlank { "Unknown caller" }
        ensureNotificationChannel()

        val contentIntent = PendingIntent.getActivity(
            this,
            providerCallId.hashCode(),
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        val answerIntent = PendingIntent.getBroadcast(
            this,
            providerCallId.hashCode(),
            Intent(this, IncomingCallActionReceiver::class.java).apply {
                action = IncomingCallContract.ACTION_ANSWER
                putExtra(IncomingCallContract.EXTRA_CALLER_NUMBER, safeCallerNumber)
                putExtra(IncomingCallContract.EXTRA_PROVIDER_CALL_ID, providerCallId)
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        val declineIntent = PendingIntent.getBroadcast(
            this,
            providerCallId.hashCode() + 1,
            Intent(this, IncomingCallActionReceiver::class.java).apply {
                action = IncomingCallContract.ACTION_DECLINE
                putExtra(IncomingCallContract.EXTRA_CALLER_NUMBER, safeCallerNumber)
                putExtra(IncomingCallContract.EXTRA_PROVIDER_CALL_ID, providerCallId)
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        val notification = NotificationCompat.Builder(this, IncomingCallContract.NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.sym_call_incoming)
            .setContentTitle("Incoming FreeLine call")
            .setContentText(safeCallerNumber.formatCallPhoneNumber())
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setOngoing(true)
            .setAutoCancel(false)
            .setFullScreenIntent(contentIntent, true)
            .addAction(0, "Decline", declineIntent)
            .addAction(0, "Answer", answerIntent)
            .setContentIntent(contentIntent)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                IncomingCallContract.NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL,
            )
        } else {
            startForeground(IncomingCallContract.NOTIFICATION_ID, notification)
        }
    }

    private fun ensureNotificationChannel() {
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val existing = manager.getNotificationChannel(IncomingCallContract.NOTIFICATION_CHANNEL_ID)
        if (existing != null) {
            return
        }

        manager.createNotificationChannel(
            NotificationChannel(
                IncomingCallContract.NOTIFICATION_CHANNEL_ID,
                IncomingCallContract.NOTIFICATION_CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH,
            ),
        )
    }

    companion object {
        fun startIncomingCall(
            context: Context,
            callerNumber: String,
            providerCallId: String,
        ) {
            val intent = Intent(context, IncomingCallForegroundService::class.java).apply {
                action = IncomingCallContract.ACTION_SHOW
                putExtra(IncomingCallContract.EXTRA_CALLER_NUMBER, callerNumber)
                putExtra(IncomingCallContract.EXTRA_PROVIDER_CALL_ID, providerCallId)
            }

            ContextCompat.startForegroundService(context, intent)
        }
    }
}

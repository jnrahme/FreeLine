package com.freeline.app.calls

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class IncomingCallActionReceiver : BroadcastReceiver() {
    override fun onReceive(
        context: Context,
        intent: Intent,
    ) {
        val extras = intent.extras ?: return
        val serviceIntent = Intent(context, IncomingCallForegroundService::class.java).apply {
            action = intent.action
            putExtras(extras)
        }

        ContextCompat.startForegroundService(context, serviceIntent)
    }
}

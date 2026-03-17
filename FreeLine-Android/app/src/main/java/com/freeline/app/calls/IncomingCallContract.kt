package com.freeline.app.calls

object IncomingCallContract {
    const val ACTION_ANSWER = "com.freeline.app.calls.ACTION_ANSWER"
    const val ACTION_DECLINE = "com.freeline.app.calls.ACTION_DECLINE"
    const val ACTION_SHOW = "com.freeline.app.calls.ACTION_SHOW"

    const val EXTRA_CALLER_NUMBER = "extra_caller_number"
    const val EXTRA_PROVIDER_CALL_ID = "extra_provider_call_id"

    const val NOTIFICATION_CHANNEL_ID = "freeline_incoming_calls"
    const val NOTIFICATION_CHANNEL_NAME = "Incoming calls"
    const val NOTIFICATION_ID = 3101
}

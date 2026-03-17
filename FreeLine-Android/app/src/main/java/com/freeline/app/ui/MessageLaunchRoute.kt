package com.freeline.app.ui

import android.content.Intent

data class MessageLaunchRoute(val conversationId: String) {
    companion object {
        const val EXTRA_CONVERSATION_ID = "conversationId"

        fun fromMap(values: Map<String, String>): MessageLaunchRoute? {
            val directConversationId = values[EXTRA_CONVERSATION_ID]
                ?.trim()
                ?.takeIf { it.isNotEmpty() }
            if (directConversationId != null) {
                return MessageLaunchRoute(directConversationId)
            }

            val snakeConversationId = values["conversation_id"]
                ?.trim()
                ?.takeIf { it.isNotEmpty() }
            return snakeConversationId?.let(::MessageLaunchRoute)
        }

        fun fromIntent(intent: Intent?): MessageLaunchRoute? {
            val extraConversationId = intent
                ?.getStringExtra(EXTRA_CONVERSATION_ID)
                ?.trim()
                ?.takeIf { it.isNotEmpty() }
            if (extraConversationId != null) {
                return MessageLaunchRoute(extraConversationId)
            }

            val data = intent?.data
            if (data?.scheme != "freeline" || data.host != "messages") {
                return null
            }

            val queryConversationId = data.getQueryParameter(EXTRA_CONVERSATION_ID)
                ?.trim()
                ?.takeIf { it.isNotEmpty() }
            if (queryConversationId != null) {
                return MessageLaunchRoute(queryConversationId)
            }

            val pathConversationId = data.pathSegments
                .firstOrNull()
                ?.trim()
                ?.takeIf { it.isNotEmpty() }
            return pathConversationId?.let(::MessageLaunchRoute)
        }
    }
}

package com.freeline.app.messaging

import org.json.JSONObject

data class MessageAllowance(
    val dailyCap: Int,
    val dailyRemaining: Int,
    val dailyUsed: Int,
    val monthlyCap: Int,
    val monthlyRemaining: Int,
    val monthlyUsed: Int,
)

data class ConversationSummary(
    val createdAt: String,
    val id: String,
    val isOptedOut: Boolean,
    val lastMessageAt: String?,
    val lastMessagePreview: String?,
    val lastMessageStatus: String?,
    val lastSpamConfidence: Double?,
    val lastSpamReason: String?,
    val participantNumber: String,
    val phoneNumberId: String,
    val unreadCount: Int,
    val updatedAt: String,
    val userId: String,
) {
    val displayNumber: String
        get() = participantNumber.formatUsPhoneNumber()

    val isLastMessageSpam: Boolean
        get() = (lastSpamConfidence ?: 0.0) >= 0.6
}

data class ChatMessage(
    val body: String,
    val conversationId: String,
    val createdAt: String,
    val direction: String,
    val id: String,
    val providerMessageId: String?,
    val spamConfidence: Double?,
    val spamReason: String?,
    val status: String,
    val updatedAt: String,
) {
    val isOutgoing: Boolean
        get() = direction == "outbound"

    val isLikelySpam: Boolean
        get() = (spamConfidence ?: 0.0) >= 0.6

    val spamBadgeText: String?
        get() {
            val conf = spamConfidence ?: return null
            if (conf < 0.5) return null
            return "Spam ${(conf * 100).toInt()}%"
        }
}

data class ConversationListPayload(
    val allowance: MessageAllowance,
    val conversations: List<ConversationSummary>,
    val limit: Int,
    val offset: Int,
)

data class ConversationThreadPayload(
    val allowance: MessageAllowance,
    val conversation: ConversationSummary,
    val limit: Int,
    val messages: List<ChatMessage>,
    val offset: Int,
)

data class MessageSendPayload(
    val allowance: MessageAllowance,
    val conversation: ConversationSummary,
    val message: ChatMessage,
)

enum class MessageRealtimeEventType(val wireName: String) {
    Ready("realtime:ready"),
    MessageInbound("message:inbound"),
    MessageStatus("message:status");

    companion object {
        fun fromWireName(value: String): MessageRealtimeEventType? = entries.firstOrNull { it.wireName == value }
    }
}

data class MessageRealtimeEvent(
    val conversation: ConversationSummary?,
    val message: ChatMessage?,
    val type: MessageRealtimeEventType,
)

fun normalizeUsPhoneNumber(rawValue: String): String? {
    val digits = rawValue.filter(Char::isDigit)

    return when {
        rawValue.startsWith("+") && digits.length == 11 && digits.startsWith("1") -> "+$digits"
        digits.length == 10 -> "+1$digits"
        digits.length == 11 && digits.startsWith("1") -> "+$digits"
        else -> null
    }
}

fun String.formatUsPhoneNumber(): String {
    val digits = filter(Char::isDigit)

    if (digits.length != 11 || !digits.startsWith("1")) {
        return this
    }

    val areaCode = digits.substring(1, 4)
    val prefix = digits.substring(4, 7)
    val lineNumber = digits.substring(7, 11)
    return "($areaCode) $prefix-$lineNumber"
}

internal fun JSONObject.toConversation(): ConversationSummary =
    ConversationSummary(
        createdAt = getString("createdAt"),
        id = getString("id"),
        isOptedOut = getBoolean("isOptedOut"),
        lastMessageAt = optString("lastMessageAt").ifBlank { null },
        lastMessagePreview = optString("lastMessagePreview").ifBlank { null },
        lastMessageStatus = optString("lastMessageStatus").ifBlank { null },
        lastSpamConfidence = if (has("lastSpamConfidence") && !isNull("lastSpamConfidence")) optDouble("lastSpamConfidence") else null,
        lastSpamReason = if (has("lastSpamReason") && !isNull("lastSpamReason")) optString("lastSpamReason").ifBlank { null } else null,
        participantNumber = getString("participantNumber"),
        phoneNumberId = getString("phoneNumberId"),
        unreadCount = getInt("unreadCount"),
        updatedAt = getString("updatedAt"),
        userId = getString("userId"),
    )

internal fun JSONObject.toMessage(): ChatMessage =
    ChatMessage(
        body = getString("body"),
        conversationId = getString("conversationId"),
        createdAt = getString("createdAt"),
        direction = getString("direction"),
        id = getString("id"),
        providerMessageId = optString("providerMessageId").ifBlank { null },
        spamConfidence = if (has("spamConfidence") && !isNull("spamConfidence")) optDouble("spamConfidence") else null,
        spamReason = if (has("spamReason") && !isNull("spamReason")) optString("spamReason").ifBlank { null } else null,
        status = getString("status"),
        updatedAt = getString("updatedAt"),
    )

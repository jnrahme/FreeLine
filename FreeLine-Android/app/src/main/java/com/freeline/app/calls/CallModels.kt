package com.freeline.app.calls

data class CallAllowance(
    val monthlyCapMinutes: Int,
    val monthlyRemainingMinutes: Int,
    val monthlyUsedMinutes: Int,
)

data class CallHistoryEntry(
    val createdAt: String,
    val direction: String,
    val durationSeconds: Int,
    val endedAt: String?,
    val id: String,
    val phoneNumberId: String,
    val providerCallId: String,
    val remoteNumber: String,
    val startedAt: String?,
    val status: String,
    val updatedAt: String,
    val userId: String,
) {
    val displayNumber: String
        get() = remoteNumber.formatCallPhoneNumber()

    val isOutgoing: Boolean
        get() = direction == "outbound"

    val statusLabel: String
        get() = when (status) {
            "completed" -> if (durationSeconds > 0) formatCallDuration(durationSeconds) else "Completed"
            "missed" -> "Missed"
            "failed" -> "Failed"
            "answered" -> "Answered"
            "ringing" -> "Ringing"
            else -> status.replaceFirstChar(Char::titlecase)
        }
}

data class CallHistoryPayload(
    val allowance: CallAllowance,
    val calls: List<CallHistoryEntry>,
    val limit: Int,
    val offset: Int,
)

data class VoiceTokenPayload(
    val allowance: CallAllowance,
    val expiresInSeconds: Int,
    val fromNumber: String,
    val identity: String,
    val token: String,
)

data class CallPushTokenRecord(
    val channel: String,
    val createdAt: String,
    val deviceId: String,
    val id: String,
    val platform: String,
    val token: String,
    val updatedAt: String,
    val userId: String,
)

data class CallPushTokenPayload(
    val pushToken: CallPushTokenRecord,
)

data class VoicemailEntry(
    val audioUrl: String,
    val callerNumber: String,
    val createdAt: String,
    val durationSeconds: Int,
    val id: String,
    val isRead: Boolean,
    val phoneNumberId: String,
    val providerCallId: String,
    val transcription: String?,
    val updatedAt: String,
    val userId: String,
) {
    val displayNumber: String
        get() = callerNumber.formatCallPhoneNumber()

    val durationLabel: String
        get() = formatCallDuration(durationSeconds)
}

data class VoicemailListPayload(
    val limit: Int,
    val offset: Int,
    val voicemails: List<VoicemailEntry>,
)

data class VoicemailReadPayload(
    val voicemail: VoicemailEntry,
)

data class ActiveCallSession(
    val fromNumber: String,
    val identity: String,
    val remoteNumber: String,
    val startedAtEpochMillis: Long,
    val token: String,
    val connectedAtEpochMillis: Long?,
    val isMuted: Boolean,
    val isSpeakerOn: Boolean,
    val statusText: String,
) {
    val displayNumber: String
        get() = remoteNumber.formatCallPhoneNumber()

    val timerAnchorEpochMillis: Long
        get() = connectedAtEpochMillis ?: startedAtEpochMillis
}

sealed interface VoiceCallEvent {
    data object Connecting : VoiceCallEvent

    data object Ringing : VoiceCallEvent

    data class Connected(
        val connectedAtEpochMillis: Long,
    ) : VoiceCallEvent

    data class Reconnecting(
        val message: String,
    ) : VoiceCallEvent

    data object Reconnected : VoiceCallEvent

    data class Failed(
        val message: String,
    ) : VoiceCallEvent

    data class Disconnected(
        val message: String?,
    ) : VoiceCallEvent
}

enum class DialAction {
    NativeEmergencyDial,
    Voip,
}

fun normalizeDialableUsPhoneNumber(rawValue: String): String? {
    val digits = rawValue.filter(Char::isDigit)

    return when {
        rawValue.startsWith("+") && digits.length == 11 && digits.startsWith("1") -> "+$digits"
        digits.length == 10 -> "+1$digits"
        digits.length == 11 && digits.startsWith("1") -> "+$digits"
        else -> null
    }
}

fun dialActionFor(rawValue: String): DialAction? {
    val digits = rawValue.filter(Char::isDigit)

    return when {
        digits in setOf("911", "112", "999") -> DialAction.NativeEmergencyDial
        normalizeDialableUsPhoneNumber(rawValue) != null -> DialAction.Voip
        else -> null
    }
}

fun formatCallDuration(durationSeconds: Int): String {
    val minutes = durationSeconds / 60
    val seconds = durationSeconds % 60
    return "%d:%02d".format(minutes, seconds)
}

fun String.formatCallPhoneNumber(): String {
    val digits = filter(Char::isDigit)

    if (digits.length != 11 || !digits.startsWith("1")) {
        return this
    }

    val areaCode = digits.substring(1, 4)
    val prefix = digits.substring(4, 7)
    val lineNumber = digits.substring(7, 11)
    return "($areaCode) $prefix-$lineNumber"
}

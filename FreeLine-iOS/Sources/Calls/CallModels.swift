import Foundation

struct CallAllowance: Codable, Equatable {
    let monthlyCapMinutes: Int
    let monthlyRemainingMinutes: Int
    let monthlyUsedMinutes: Int
}

struct CallHistoryEntry: Codable, Equatable, Hashable, Identifiable {
    let createdAt: String
    let direction: String
    let durationSeconds: Int
    let endedAt: String?
    let id: String
    let phoneNumberId: String
    let providerCallId: String
    let remoteNumber: String
    let startedAt: String?
    let status: String
    let updatedAt: String
    let userId: String

    var displayNumber: String {
        remoteNumber.formattedUSPhoneNumber
    }

    var isOutgoing: Bool {
        direction == "outbound"
    }

    var statusLabel: String {
        switch status {
        case "completed":
            return durationSeconds > 0 ? Self.formatDuration(durationSeconds) : "Completed"
        case "missed":
            return "Missed"
        case "failed":
            return "Failed"
        case "answered":
            return "Answered"
        case "ringing":
            return "Ringing"
        default:
            return status.capitalized
        }
    }

    static func formatDuration(_ durationSeconds: Int) -> String {
        let minutes = durationSeconds / 60
        let seconds = durationSeconds % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

struct CallHistoryPayload: Codable, Equatable {
    let allowance: CallAllowance
    let calls: [CallHistoryEntry]
    let limit: Int
    let offset: Int
}

struct VoiceTokenPayload: Codable, Equatable {
    let allowance: CallAllowance
    let expiresInSeconds: Int
    let fromNumber: String
    let identity: String
    let token: String
}

struct CallPushTokenRecord: Codable, Equatable {
    let channel: String
    let createdAt: String
    let deviceId: String
    let id: String
    let platform: String
    let token: String
    let updatedAt: String
    let userId: String
}

struct CallPushTokenPayload: Codable, Equatable {
    let pushToken: CallPushTokenRecord
}

struct VoicemailEntry: Codable, Equatable, Hashable, Identifiable {
    let audioUrl: String
    let callerNumber: String
    let createdAt: String
    let durationSeconds: Int
    let id: String
    let isRead: Bool
    let phoneNumberId: String
    let providerCallId: String
    let transcription: String?
    let updatedAt: String
    let userId: String

    var displayNumber: String {
        callerNumber.formattedUSPhoneNumber
    }

    var durationLabel: String {
        CallHistoryEntry.formatDuration(durationSeconds)
    }
}

struct VoicemailListPayload: Codable, Equatable {
    let limit: Int
    let offset: Int
    let voicemails: [VoicemailEntry]
}

struct VoicemailReadPayload: Codable, Equatable {
    let voicemail: VoicemailEntry
}

struct ActiveCallSession: Equatable, Identifiable {
    let id = UUID()
    let fromNumber: String
    let identity: String
    let remoteNumber: String
    let startedAt: Date
    let token: String
    var connectedAt: Date?
    var isMuted: Bool
    var isSpeakerOn: Bool
    var statusText: String

    var displayNumber: String {
        remoteNumber.formattedUSPhoneNumber
    }

    var timerAnchor: Date {
        connectedAt ?? startedAt
    }
}

enum VoiceCallEvent {
    case connecting
    case ringing
    case connected(Date)
    case reconnecting(String)
    case reconnected
    case failed(String)
    case disconnected(String?)
}

enum DialAction {
    case nativeEmergencyDial
    case voip
}

func normalizeDialableUSPhoneNumber(_ rawValue: String) -> String? {
    let digits = rawValue.filter(\.isNumber)

    if rawValue.hasPrefix("+"), digits.count == 11, digits.first == "1" {
        return "+\(digits)"
    }

    if digits.count == 10 {
        return "+1\(digits)"
    }

    if digits.count == 11, digits.first == "1" {
        return "+\(digits)"
    }

    return nil
}

func dialAction(for rawValue: String) -> DialAction? {
    let digits = rawValue.filter(\.isNumber)

    if ["911", "112", "999"].contains(digits) {
        return .nativeEmergencyDial
    }

    return normalizeDialableUSPhoneNumber(rawValue) == nil ? nil : .voip
}

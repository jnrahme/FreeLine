import Foundation

struct MessageAllowance: Codable, Equatable {
    let dailyCap: Int
    let dailyRemaining: Int
    let dailyUsed: Int
    let monthlyCap: Int
    let monthlyRemaining: Int
    let monthlyUsed: Int
}

struct ConversationSummary: Codable, Equatable, Hashable, Identifiable {
    let createdAt: String
    let id: String
    let isOptedOut: Bool
    let lastMessageAt: String?
    let lastMessagePreview: String?
    let lastMessageStatus: String?
    let lastSpamConfidence: Double?
    let lastSpamReason: String?
    let participantNumber: String
    let phoneNumberId: String
    let unreadCount: Int
    let updatedAt: String
    let userId: String

    var displayNumber: String {
        participantNumber.formattedUSPhoneNumber
    }

    var isLastMessageSpam: Bool {
        (lastSpamConfidence ?? 0) >= 0.6
    }
}

struct ChatMessage: Codable, Equatable, Hashable, Identifiable {
    let body: String
    let conversationId: String
    let createdAt: String
    let direction: String
    let id: String
    let providerMessageId: String?
    let spamConfidence: Double?
    let spamReason: String?
    let status: String
    let updatedAt: String

    var isOutgoing: Bool {
        direction == "outbound"
    }

    var isLikelySpam: Bool {
        (spamConfidence ?? 0) >= 0.6
    }

    var spamBadgeText: String? {
        guard let confidence = spamConfidence, confidence >= 0.5 else { return nil }
        let pct = Int(confidence * 100)
        return "Spam \(pct)%"
    }
}

struct ConversationListPayload: Codable, Equatable {
    let allowance: MessageAllowance
    let conversations: [ConversationSummary]
    let limit: Int
    let offset: Int
}

struct ConversationThreadPayload: Codable, Equatable {
    let allowance: MessageAllowance
    let conversation: ConversationSummary
    let limit: Int
    let messages: [ChatMessage]
    let offset: Int
}

struct MessageSendPayload: Codable, Equatable {
    let allowance: MessageAllowance
    let conversation: ConversationSummary
    let message: ChatMessage
}

struct ConversationReadPayload: Codable, Equatable {
    let conversation: ConversationSummary
}

enum MessageRealtimeEventType: String, Codable, Equatable {
    case ready = "realtime:ready"
    case messageInbound = "message:inbound"
    case messageStatus = "message:status"
}

struct MessageRealtimeEvent: Codable, Equatable {
    let conversation: ConversationSummary?
    let message: ChatMessage?
    let type: MessageRealtimeEventType
}

struct BlockRecord: Codable, Equatable {
    let blockedNumber: String
    let createdAt: String
    let id: String
    let userId: String
}

struct BlockPayload: Codable, Equatable {
    let block: BlockRecord
}

struct ReportRecord: Codable, Equatable {
    let createdAt: String
    let id: String
    let reason: String
    let reportedNumber: String
    let userId: String
}

struct ReportPayload: Codable, Equatable {
    let report: ReportRecord
}

extension String {
    var formattedUSPhoneNumber: String {
        let digits = filter(\.isNumber)

        guard digits.count == 11, digits.first == "1" else {
            return self
        }

        let characters = Array(digits)
        let areaCode = String(characters[1...3])
        let prefix = String(characters[4...6])
        let lineNumber = String(characters[7...10])
        return "(\(areaCode)) \(prefix)-\(lineNumber)"
    }
}

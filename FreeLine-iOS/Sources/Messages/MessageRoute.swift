import Foundation

struct MessageRoute: Equatable {
    let conversationId: String

    init?(conversationId: String) {
        let trimmedConversationId = conversationId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedConversationId.isEmpty else {
            return nil
        }

        self.conversationId = trimmedConversationId
    }

    init?(url: URL) {
        guard url.scheme == "freeline", url.host == "messages" else {
            return nil
        }

        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let queryConversationId = components?.queryItems?.first(where: { $0.name == "conversationId" })?.value
        let pathConversationId = url.pathComponents
            .filter { $0 != "/" && !$0.isEmpty }
            .first
        guard let route = MessageRoute(conversationId: queryConversationId ?? pathConversationId ?? "") else {
            return nil
        }

        self = route
    }

    init?(userInfo: [AnyHashable: Any]) {
        let payloads: [[AnyHashable: Any]] = [
            userInfo,
            userInfo["data"] as? [AnyHashable: Any] ?? [:],
            userInfo["freeline"] as? [AnyHashable: Any] ?? [:]
        ]

        for payload in payloads {
            for key in ["conversationId", "conversation_id"] {
                if let value = payload[key] as? String, let route = MessageRoute(conversationId: value) {
                    self = route
                    return
                }
            }
        }

        return nil
    }
}

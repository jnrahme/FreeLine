import Foundation

enum MessageClientError: LocalizedError {
    case invalidResponse
    case server(MonetizationServerError)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "The messaging service returned an unexpected response."
        case .server(let error):
            return error.message
        }
    }
}

actor MessageClient {
    private let baseURL: URL
    private let session: URLSession
    private let decoder = JSONDecoder()

    init(baseURL: URL = APIConfiguration.baseURL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func listConversations(accessToken: String) async throws -> ConversationListPayload {
        try await send(
            path: "/v1/conversations",
            method: "GET",
            accessToken: accessToken,
            body: nil
        )
    }

    func listMessages(
        accessToken: String,
        conversationId: String
    ) async throws -> ConversationThreadPayload {
        try await send(
            path: "/v1/conversations/\(conversationId)/messages",
            method: "GET",
            accessToken: accessToken,
            body: nil
        )
    }

    func sendMessage(
        accessToken: String,
        to: String,
        body: String
    ) async throws -> MessageSendPayload {
        try await send(
            path: "/v1/messages",
            method: "POST",
            accessToken: accessToken,
            body: [
                "body": body,
                "to": to
            ]
        )
    }

    func markConversationRead(
        accessToken: String,
        conversationId: String
    ) async throws -> ConversationReadPayload {
        try await send(
            path: "/v1/conversations/\(conversationId)/read",
            method: "PATCH",
            accessToken: accessToken,
            body: nil
        )
    }

    func blockNumber(
        accessToken: String,
        number: String
    ) async throws -> BlockPayload {
        try await send(
            path: "/v1/blocks",
            method: "POST",
            accessToken: accessToken,
            body: [
                "blockedNumber": number
            ]
        )
    }

    func unblockNumber(
        accessToken: String,
        number: String
    ) async throws {
        let safeNumber = number.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? number
        try await sendEmpty(
            path: "/v1/blocks/\(safeNumber)",
            method: "DELETE",
            accessToken: accessToken,
            body: nil
        )
    }

    func reportNumber(
        accessToken: String,
        number: String,
        reason: String
    ) async throws -> ReportPayload {
        try await send(
            path: "/v1/reports",
            method: "POST",
            accessToken: accessToken,
            body: [
                "reason": reason,
                "reportedNumber": number
            ]
        )
    }

    private func send<Response: Decodable>(
        path: String,
        method: String,
        accessToken: String,
        body: [String: String]?
    ) async throws -> Response {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw MessageClientError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            if let errorEnvelope = try? decoder.decode(MessageAPIErrorEnvelope.self, from: data) {
                throw MessageClientError.server(
                    MonetizationServerError(
                        code: errorEnvelope.error.code,
                        message: errorEnvelope.error.message,
                        upgradePrompt: errorEnvelope.error.details?.upgradePrompt
                    )
                )
            }

            throw MessageClientError.invalidResponse
        }

        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw MessageClientError.invalidResponse
        }
    }

    private func sendEmpty(
        path: String,
        method: String,
        accessToken: String,
        body: [String: String]?
    ) async throws {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw MessageClientError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            if let errorEnvelope = try? decoder.decode(MessageAPIErrorEnvelope.self, from: data) {
                throw MessageClientError.server(
                    MonetizationServerError(
                        code: errorEnvelope.error.code,
                        message: errorEnvelope.error.message,
                        upgradePrompt: errorEnvelope.error.details?.upgradePrompt
                    )
                )
            }

            throw MessageClientError.invalidResponse
        }
    }
}

private struct MessageAPIErrorEnvelope: Decodable {
    struct APIErrorDetails: Decodable {
        let upgradePrompt: String?
    }

    struct APIError: Decodable {
        let code: String
        let details: APIErrorDetails?
        let message: String
    }

    let error: APIError
}

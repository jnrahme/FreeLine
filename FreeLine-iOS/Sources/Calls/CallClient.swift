import Foundation

enum CallClientError: LocalizedError {
    case invalidResponse
    case server(MonetizationServerError)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "The calling service returned an unexpected response."
        case .server(let error):
            return error.message
        }
    }
}

actor CallClient {
    private let baseURL: URL
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()
    private let session: URLSession

    init(baseURL: URL = APIConfiguration.baseURL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func deleteVoicemail(accessToken: String, voicemailId: String) async throws {
        _ = try await sendRaw(
            path: "/v1/voicemails/\(voicemailId)",
            method: "DELETE",
            accessToken: accessToken
        )
    }

    func listCallHistory(accessToken: String) async throws -> CallHistoryPayload {
        try await send(
            path: "/v1/calls/history",
            method: "GET",
            accessToken: accessToken
        )
    }

    func listVoicemails(accessToken: String) async throws -> VoicemailListPayload {
        try await send(
            path: "/v1/voicemails",
            method: "GET",
            accessToken: accessToken
        )
    }

    func markVoicemailRead(accessToken: String, voicemailId: String) async throws -> VoicemailReadPayload {
        try await send(
            path: "/v1/voicemails/\(voicemailId)/read",
            method: "PATCH",
            accessToken: accessToken
        )
    }

    func registerCallPushToken(
        accessToken: String,
        channel: String,
        deviceId: String,
        platform: String,
        token: String
    ) async throws -> CallPushTokenPayload {
        try await send(
            path: "/v1/devices/call-push-token",
            method: "POST",
            accessToken: accessToken,
            jsonBody: [
                "channel": channel,
                "deviceId": deviceId,
                "platform": platform,
                "token": token
            ]
        )
    }

    func registerVoipToken(
        accessToken: String,
        deviceId: String,
        platform: String,
        token: String
    ) async throws -> CallPushTokenPayload {
        try await send(
            path: "/v1/devices/voip-token",
            method: "POST",
            accessToken: accessToken,
            jsonBody: [
                "deviceId": deviceId,
                "platform": platform,
                "token": token
            ]
        )
    }

    func requestVoiceToken(accessToken: String) async throws -> VoiceTokenPayload {
        try await send(
            path: "/v1/calls/token",
            method: "POST",
            accessToken: accessToken
        )
    }

    private func send<Response: Decodable>(
        path: String,
        method: String,
        accessToken: String,
        jsonBody: [String: String]? = nil
    ) async throws -> Response {
        let (data, _) = try await sendRaw(
            path: path,
            method: method,
            accessToken: accessToken,
            jsonBody: jsonBody
        )

        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw CallClientError.invalidResponse
        }
    }

    private func sendRaw(
        path: String,
        method: String,
        accessToken: String,
        jsonBody: [String: String]? = nil
    ) async throws -> (Data, HTTPURLResponse) {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        if let jsonBody {
            request.httpBody = try encoder.encode(jsonBody)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw CallClientError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            if let errorEnvelope = try? decoder.decode(CallAPIErrorEnvelope.self, from: data) {
                throw CallClientError.server(
                    MonetizationServerError(
                        code: errorEnvelope.error.code,
                        message: errorEnvelope.error.message,
                        upgradePrompt: errorEnvelope.error.details?.upgradePrompt
                    )
                )
            }

            throw CallClientError.invalidResponse
        }

        return (data, httpResponse)
    }
}

private struct CallAPIErrorEnvelope: Decodable {
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

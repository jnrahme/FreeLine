import Foundation

enum AuthClientError: LocalizedError {
    case invalidResponse
    case invalidVerificationLink
    case server(message: String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "The server returned an unexpected response."
        case .invalidVerificationLink:
            return "The verification link did not include a token."
        case .server(let message):
            return message
        }
    }
}

actor AuthClient {
    private let baseURL: URL
    private let session: URLSession
    private let decoder = JSONDecoder()

    init(baseURL: URL = APIConfiguration.baseURL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func startEmailAuth(email: String, password: String) async throws -> PendingEmailVerification {
        let response: EmailStartResponse = try await send(
            path: "/v1/auth/email/start",
            body: [
                "email": email,
                "password": password
            ]
        )

        guard let token = Self.extractVerificationToken(from: response.previewLink) else {
            throw AuthClientError.invalidVerificationLink
        }

        return PendingEmailVerification(
            email: email,
            previewLink: response.previewLink,
            suggestedToken: token
        )
    }

    func verifyEmail(token: String, fingerprint: String) async throws -> AuthSessionPayload {
        try await send(
            path: "/v1/auth/email/verify",
            body: [
                "fingerprint": fingerprint,
                "platform": "ios",
                "token": token
            ]
        )
    }

    func continueWithDevProvider(
        _ provider: DevAuthProvider,
        fingerprint: String
    ) async throws -> AuthSessionPayload {
        let suffix = UUID().uuidString.lowercased()
        let identityToken =
            "dev:\(provider.rawValue)-\(suffix):\(provider.rawValue)+\(suffix)@freeline.dev:\(provider.displayName)"

        return try await send(
            path: "/v1/auth/oauth/\(provider.rawValue)",
            body: [
                "fingerprint": fingerprint,
                "identityToken": identityToken,
                "platform": "ios"
            ]
        )
    }

    static func extractVerificationToken(from previewLink: String) -> String? {
        guard
            let url = URL(string: previewLink),
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        else {
            return nil
        }

        return components.queryItems?.first(where: { $0.name == "token" })?.value
    }

    private func send<Response: Decodable>(
        path: String,
        body: [String: String]
    ) async throws -> Response {
        let requestURL = baseURL.appending(path: path)
        var request = URLRequest(url: requestURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthClientError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            if let errorEnvelope = try? decoder.decode(APIErrorEnvelope.self, from: data) {
                throw AuthClientError.server(message: errorEnvelope.error.message)
            }

            throw AuthClientError.invalidResponse
        }

        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw AuthClientError.invalidResponse
        }
    }
}

private struct EmailStartResponse: Decodable {
    let previewLink: String
}

private struct APIErrorEnvelope: Decodable {
    struct APIError: Decodable {
        let message: String
    }

    let error: APIError
}

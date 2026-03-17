import Foundation

private struct APIErrorDetails: Decodable, Equatable {
    let upgradePrompt: String?
}

private struct APIErrorEnvelope: Decodable, Equatable {
    struct APIError: Decodable, Equatable {
        let code: String
        let details: APIErrorDetails?
        let message: String
    }

    let error: APIError
}

struct MonetizationServerError: Error, Equatable {
    let code: String
    let message: String
    let upgradePrompt: String?
}

enum MonetizationClientError: LocalizedError, Equatable {
    case invalidResponse
    case server(MonetizationServerError)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "The monetization service returned an unexpected response."
        case .server(let error):
            return error.message
        }
    }
}

@MainActor
private final class MonetizationRequestClient {
    let baseURL: URL
    let decoder = JSONDecoder()
    let session: URLSession

    init(baseURL: URL = APIConfiguration.baseURL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func send<Response: Decodable>(
        path: String,
        method: String,
        accessToken: String,
        body: [String: Any]? = nil
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
            throw MonetizationClientError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            if let errorEnvelope = try? decoder.decode(APIErrorEnvelope.self, from: data) {
                throw MonetizationClientError.server(
                    MonetizationServerError(
                        code: errorEnvelope.error.code,
                        message: errorEnvelope.error.message,
                        upgradePrompt: errorEnvelope.error.details?.upgradePrompt
                    )
                )
            }

            throw MonetizationClientError.invalidResponse
        }

        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw MonetizationClientError.invalidResponse
        }
    }

    func sendNoContent(
        path: String,
        method: String,
        accessToken: String,
        body: [String: Any]? = nil
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
            throw MonetizationClientError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            if let errorEnvelope = try? decoder.decode(APIErrorEnvelope.self, from: data) {
                throw MonetizationClientError.server(
                    MonetizationServerError(
                        code: errorEnvelope.error.code,
                        message: errorEnvelope.error.message,
                        upgradePrompt: errorEnvelope.error.details?.upgradePrompt
                    )
                )
            }

            throw MonetizationClientError.invalidResponse
        }
    }
}

@MainActor
final class SubscriptionClient {
    private let requestClient: MonetizationRequestClient

    init(baseURL: URL = APIConfiguration.baseURL, session: URLSession = .shared) {
        self.requestClient = MonetizationRequestClient(baseURL: baseURL, session: session)
    }

    func getStatus(accessToken: String) async throws -> SubscriptionStatusPayload {
        try await requestClient.send(
            path: "/v1/subscriptions/status",
            method: "GET",
            accessToken: accessToken
        )
    }

    func verifyPurchase(
        accessToken: String,
        productId: String,
        platform: String,
        provider: String,
        transactionId: String,
        verificationToken: String
    ) async throws -> SubscriptionVerificationPayload {
        try await requestClient.send(
            path: "/v1/subscriptions/verify",
            method: "POST",
            accessToken: accessToken,
            body: [
                "platform": platform,
                "productId": productId,
                "provider": provider,
                "transactionId": transactionId,
                "verificationToken": verificationToken
            ]
        )
    }
}

@MainActor
final class RewardClient {
    private let requestClient: MonetizationRequestClient

    init(baseURL: URL = APIConfiguration.baseURL, session: URLSession = .shared) {
        self.requestClient = MonetizationRequestClient(baseURL: baseURL, session: session)
    }

    func claimReward(
        accessToken: String,
        rewardType: RewardType
    ) async throws -> RewardClaimPayload {
        try await requestClient.send(
            path: "/v1/rewards/claim",
            method: "POST",
            accessToken: accessToken,
            body: [
                "rewardType": rewardType.rawValue
            ]
        )
    }
}

@MainActor
final class AnalyticsClient {
    private let requestClient: MonetizationRequestClient

    init(baseURL: URL = APIConfiguration.baseURL, session: URLSession = .shared) {
        self.requestClient = MonetizationRequestClient(baseURL: baseURL, session: session)
    }

    func track(
        accessToken: String,
        eventType: String,
        properties: [String: String]
    ) async {
        do {
            try await requestClient.sendNoContent(
                path: "/v1/analytics/events",
                method: "POST",
                accessToken: accessToken,
                body: [
                    "eventType": eventType,
                    "properties": properties
                ]
            )
        } catch {
            return
        }
    }
}

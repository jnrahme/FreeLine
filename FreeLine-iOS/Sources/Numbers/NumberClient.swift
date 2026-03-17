import Foundation

enum NumberClientError: LocalizedError {
    case invalidResponse
    case server(message: String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "The numbers service returned an unexpected response."
        case .server(let message):
            return message
        }
    }
}

actor NumberClient {
    private let baseURL: URL
    private let session: URLSession
    private let decoder = JSONDecoder()

    init(baseURL: URL = APIConfiguration.baseURL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func searchNumbers(areaCode: String) async throws -> [AvailableNumberOption] {
        let requestURL = baseURL.appending(path: "/v1/numbers/search")
        guard var components = URLComponents(url: requestURL, resolvingAgainstBaseURL: false) else {
            throw NumberClientError.invalidResponse
        }

        components.queryItems = [
            URLQueryItem(name: "areaCode", value: areaCode)
        ]

        guard let url = components.url else {
            throw NumberClientError.invalidResponse
        }

        let (data, response) = try await session.data(from: url)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NumberClientError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            throw NumberClientError.invalidResponse
        }

        let decoded = try decoder.decode(SearchNumbersResponse.self, from: data)
        return decoded.numbers
    }

    func getCurrentNumber(accessToken: String) async throws -> AssignedNumber? {
        let response: CurrentNumberResponse = try await send(
            path: "/v1/numbers/me",
            method: "GET",
            accessToken: accessToken,
            body: nil
        )

        return response.number
    }

    func claimNumber(
        accessToken: String,
        number: AvailableNumberOption
    ) async throws -> AssignedNumber {
        let response: ClaimNumberResponse = try await send(
            path: "/v1/numbers/claim",
            method: "POST",
            accessToken: accessToken,
            body: [
                "areaCode": number.areaCode,
                "locality": number.locality,
                "nationalFormat": number.nationalFormat,
                "phoneNumber": number.phoneNumber,
                "region": number.region
            ]
        )

        return response.number
    }

    func releaseNumber(accessToken: String) async throws -> AssignedNumber {
        let response: ClaimNumberResponse = try await send(
            path: "/v1/numbers/release",
            method: "POST",
            accessToken: accessToken,
            body: nil
        )

        return response.number
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
            throw NumberClientError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            if let errorEnvelope = try? decoder.decode(NumberAPIErrorEnvelope.self, from: data) {
                throw NumberClientError.server(message: errorEnvelope.error.message)
            }

            throw NumberClientError.invalidResponse
        }

        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw NumberClientError.invalidResponse
        }
    }
}

private struct SearchNumbersResponse: Decodable {
    let areaCode: String
    let numbers: [AvailableNumberOption]
}

private struct CurrentNumberResponse: Decodable {
    let number: AssignedNumber?
}

private struct ClaimNumberResponse: Decodable {
    let number: AssignedNumber
}

private struct NumberAPIErrorEnvelope: Decodable {
    struct APIError: Decodable {
        let message: String
    }

    let error: APIError
}

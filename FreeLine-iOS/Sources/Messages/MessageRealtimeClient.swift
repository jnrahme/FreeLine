import Foundation

actor MessageRealtimeClient {
    private let baseURL: URL
    private let session: URLSession
    private var connectionTask: Task<Void, Never>?
    private var currentAccessToken: String?
    private var socketTask: URLSessionWebSocketTask?

    init(baseURL: URL = APIConfiguration.baseURL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func updateConnection(
        accessToken: String?,
        onEvent: @MainActor @escaping (MessageRealtimeEvent) async -> Void
    ) {
        guard currentAccessToken != accessToken else {
            return
        }

        disconnect()

        guard let accessToken else {
            return
        }

        currentAccessToken = accessToken
        connectionTask = Task {
            await runConnectionLoop(accessToken: accessToken, onEvent: onEvent)
        }
    }

    func disconnect() {
        currentAccessToken = nil
        connectionTask?.cancel()
        connectionTask = nil
        socketTask?.cancel(with: .goingAway, reason: nil)
        socketTask = nil
    }

    private func runConnectionLoop(
        accessToken: String,
        onEvent: @MainActor @escaping (MessageRealtimeEvent) async -> Void
    ) async {
        while !Task.isCancelled, currentAccessToken == accessToken {
            let socket = session.webSocketTask(with: makeRequest(accessToken: accessToken))
            socketTask = socket
            socket.resume()

            do {
                try await receiveLoop(socket: socket, onEvent: onEvent)
            } catch {
                if Task.isCancelled || currentAccessToken != accessToken {
                    break
                }
            }

            if socketTask === socket {
                socketTask = nil
            }

            guard !Task.isCancelled, currentAccessToken == accessToken else {
                break
            }

            try? await Task.sleep(for: .seconds(2))
        }
    }

    private func receiveLoop(
        socket: URLSessionWebSocketTask,
        onEvent: @MainActor @escaping (MessageRealtimeEvent) async -> Void
    ) async throws {
        let decoder = JSONDecoder()

        while !Task.isCancelled, currentAccessToken != nil {
            let message = try await socket.receive()

            switch message {
            case .string(let text):
                guard let event = decodeEvent(from: Data(text.utf8), using: decoder) else {
                    continue
                }

                if event.type != .ready {
                    await onEvent(event)
                }
            case .data(let data):
                guard let event = decodeEvent(from: data, using: decoder) else {
                    continue
                }

                if event.type != .ready {
                    await onEvent(event)
                }
            @unknown default:
                return
            }
        }
    }

    private func decodeEvent(from data: Data, using decoder: JSONDecoder) -> MessageRealtimeEvent? {
        try? decoder.decode(MessageRealtimeEvent.self, from: data)
    }

    private func makeRequest(accessToken: String) -> URLRequest {
        var request = URLRequest(url: websocketURL)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        return request
    }

    private var websocketURL: URL {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
        components?.scheme = baseURL.scheme == "https" ? "wss" : "ws"
        components?.path = "/v1/realtime/messages"
        return components?.url ?? baseURL
    }
}

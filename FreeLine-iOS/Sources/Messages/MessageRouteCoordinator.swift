import Foundation

@MainActor
final class MessageRouteCoordinator {
    static let shared = MessageRouteCoordinator()

    private var handler: ((MessageRoute) -> Void)?
    private var pendingRoutes: [MessageRoute] = []

    private init() {}

    func register(handler: @escaping (MessageRoute) -> Void) {
        self.handler = handler

        guard !pendingRoutes.isEmpty else {
            return
        }

        let queuedRoutes = pendingRoutes
        pendingRoutes.removeAll()
        for route in queuedRoutes {
            handler(route)
        }
    }

    func enqueue(_ route: MessageRoute) {
        guard let handler else {
            pendingRoutes.append(route)
            return
        }

        handler(route)
    }
}

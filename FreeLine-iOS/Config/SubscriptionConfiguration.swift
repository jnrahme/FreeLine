import Foundation

enum SubscriptionConfiguration {
    static let publicAPIKey = Bundle.main.object(forInfoDictionaryKey: "RevenueCatPublicAPIKey") as? String ?? ""

    static var isConfigured: Bool {
        !publicAPIKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

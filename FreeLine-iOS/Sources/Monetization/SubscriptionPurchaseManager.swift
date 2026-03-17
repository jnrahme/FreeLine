import Foundation
import RevenueCat

struct SubscriptionPurchaseReceipt {
    let provider: String
    let transactionId: String
    let verificationToken: String
}

enum SubscriptionPurchaseError: LocalizedError {
    case notConfigured
    case productUnavailable
    case purchaseCancelled

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "RevenueCat is not configured for this build."
        case .productUnavailable:
            return "This subscription product is not available in the current offering."
        case .purchaseCancelled:
            return "The subscription purchase was cancelled."
        }
    }
}

@MainActor
final class SubscriptionPurchaseManager {
    func purchase(productId: String, userId: String) async throws -> SubscriptionPurchaseReceipt {
        try await ensureConfigured(userId: userId)

        let offerings = try await Purchases.shared.offerings()
        let availablePackages = offerings.all.values.flatMap(\.availablePackages)
        guard let package = availablePackages.first(where: { $0.storeProduct.productIdentifier == productId }) else {
            throw SubscriptionPurchaseError.productUnavailable
        }

        let (transaction, _, userCancelled) = try await Purchases.shared.purchase(package: package)
        if userCancelled {
            throw SubscriptionPurchaseError.purchaseCancelled
        }

        let transactionId = transaction?.transactionIdentifier
            ?? "\(productId)-\(Int(Date().timeIntervalSince1970))"

        return SubscriptionPurchaseReceipt(
            provider: "revenuecat",
            transactionId: transactionId,
            verificationToken: Purchases.shared.appUserID
        )
    }

    private func ensureConfigured(userId: String) async throws {
        let publicAPIKey = SubscriptionConfiguration.publicAPIKey
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !publicAPIKey.isEmpty else {
            throw SubscriptionPurchaseError.notConfigured
        }

        if !Purchases.isConfigured {
            Purchases.configure(withAPIKey: publicAPIKey, appUserID: userId)
            return
        }

        if Purchases.shared.appUserID != userId {
            _ = try await Purchases.shared.logIn(userId)
        }
    }
}

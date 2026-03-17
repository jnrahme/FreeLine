import Foundation

enum AppTab: Hashable {
    case messages
    case calls
    case voicemail
    case settings
}

enum RewardType: String, Codable, CaseIterable, Identifiable {
    case callMinutes = "call_minutes"
    case textEvents = "text_events"

    var id: String { rawValue }

    var buttonTitle: String {
        switch self {
        case .textEvents:
            return "Watch Ad for 10 bonus texts"
        case .callMinutes:
            return "Watch Ad for 5 bonus minutes"
        }
    }

    var rewardDescription: String {
        switch self {
        case .textEvents:
            return "10 bonus texts"
        case .callMinutes:
            return "5 bonus call minutes"
        }
    }
}

struct RewardClaimSummary: Codable, Equatable {
    let callMinutesGranted: Int
    let maxClaims: Int
    let remainingClaims: Int
    let textEventsGranted: Int
    let totalClaims: Int
}

struct RewardClaimPayload: Codable, Equatable {
    let calls: CallAllowance
    let claimedReward: RewardClaimSummary
    let messages: MessageAllowance
    let rewardType: RewardType
    let tier: String
    let trustScore: Int
}

struct SubscriptionCatalogProduct: Codable, Equatable, Identifiable {
    let description: String
    let displayName: String
    let entitlements: [String]
    let id: String
    let monthlyCallCapMinutes: Int
    let monthlySmsCap: Int
    let priceLabel: String
}

struct SubscriptionRecord: Codable, Equatable, Identifiable {
    let createdAt: String
    let entitlementKey: String
    let expiresAt: String?
    let id: String
    let provider: String
    let sourceProductId: String
    let status: String
    let transactionId: String
    let updatedAt: String
    let userId: String
    let verifiedAt: String
}

struct SubscriptionEntitlementState: Codable, Equatable {
    let adFree: Bool
    let activeProducts: [SubscriptionRecord]
    let adsEnabled: Bool
    let displayTier: String
    let numberLock: Bool
    let premiumCaps: Bool
}

struct MonetizationAllowanceBundle: Codable, Equatable {
    let calls: CallAllowance
    let messages: MessageAllowance
}

struct SubscriptionUsagePlan: Codable, Equatable {
    let dailyCallCapMinutes: Int
    let dailySmsCap: Int
    let description: String
    let monthlyCallCapMinutes: Int
    let monthlySmsCap: Int
    let uniqueContactsDailyCap: Int
}

struct SubscriptionStatusPayload: Codable, Equatable {
    let allowances: MonetizationAllowanceBundle
    let catalog: [SubscriptionCatalogProduct]
    let products: [SubscriptionRecord]
    let rewardClaims: RewardClaimSummary
    let status: SubscriptionEntitlementState
    let usagePlan: SubscriptionUsagePlan
}

struct SubscriptionVerificationPayload: Codable, Equatable {
    let allowances: MonetizationAllowanceBundle
    let product: SubscriptionCatalogProduct
    let status: SubscriptionEntitlementState
    let verifiedEntitlements: [SubscriptionRecord]
}

struct UsageSummary {
    let callProgress: Double
    let callsLabel: String
    let messageProgress: Double
    let messagesLabel: String
    let shouldWarn: Bool
}

struct UsagePromptState: Identifiable, Equatable {
    let id = UUID()
    let message: String
    let rewardType: RewardType
}

struct RewardedAdRequest: Identifiable, Equatable {
    let id = UUID()
    let placement: String
    let rewardType: RewardType
}

struct InterstitialAdRequest: Identifiable, Equatable {
    let id = UUID()
    let placement: String
}

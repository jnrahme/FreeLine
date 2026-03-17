import Foundation

struct Phase5ProofSeed {
    let selectedTab: AppTab
    let session: AuthSessionPayload
    let fingerprint: String
    let currentNumber: AssignedNumber
    let conversations: [ConversationSummary]
    let currentConversation: ConversationSummary?
    let currentMessages: [ChatMessage]
    let messageAllowance: MessageAllowance
    let callHistory: [CallHistoryEntry]
    let voicemails: [VoicemailEntry]
    let callAllowance: CallAllowance
    let monetizationStatus: SubscriptionStatusPayload
    let pendingInterstitialAd: InterstitialAdRequest?
    let pendingRewardedAd: RewardedAdRequest?
    let usagePrompt: UsagePromptState?
    let errorMessage: String?
}

enum Phase5ProofScenario: String, CaseIterable {
    case messages
    case messagesPaid = "messages-paid"
    case calls
    case callsPaid = "calls-paid"
    case settingsFree = "settings-free"
    case settingsPaid = "settings-paid"
    case capHit = "cap-hit"
    case interstitial
    case rewarded

    static func current(arguments: [String] = ProcessInfo.processInfo.arguments) -> Self? {
        guard let markerIndex = arguments.firstIndex(of: "-proofScenario") else {
            return nil
        }

        let valueIndex = markerIndex + 1
        guard arguments.indices.contains(valueIndex) else {
            return nil
        }

        return Self(rawValue: arguments[valueIndex])
    }

    var seed: Phase5ProofSeed {
        Phase5ProofFixtures.seed(for: self)
    }
}

private enum Phase5ProofFixtures {
    private static let currentNumber = AssignedNumber(
        assignmentId: "proof-assignment-1",
        assignedAt: "2026-03-17T09:00:00Z",
        activationDeadline: "2026-03-24T09:00:00Z",
        areaCode: "415",
        externalId: "proof-bandwidth-id",
        locality: "San Francisco",
        nationalFormat: "(415) 555-0101",
        phoneNumber: "+14155550101",
        phoneNumberId: "proof-number-1",
        provider: "bandwidth",
        quarantineUntil: nil,
        region: "CA",
        releasedAt: nil,
        status: "active",
        userId: "proof-user-1"
    )

    private static let session = AuthSessionPayload(
        tokens: AuthTokens(
            accessToken: "proof-access-token",
            refreshToken: "proof-refresh-token",
            accessTokenExpiresAt: "2030-03-17T12:00:00Z",
            refreshTokenExpiresAt: "2030-04-17T12:00:00Z"
        ),
        user: AuthenticatedUser(
            id: "proof-user-1",
            email: "proof.user@freeline.dev",
            displayName: "Proof User"
        )
    )

    private static let catalog = [
        SubscriptionCatalogProduct(
            description: "Remove banner, native, interstitial, and rewarded ads while keeping the free beta allowance.",
            displayName: "Ad-Free",
            entitlements: ["ad_free"],
            id: "ad_free_monthly",
            monthlyCallCapMinutes: 15,
            monthlySmsCap: 40,
            priceLabel: "$4.99 / month"
        ),
        SubscriptionCatalogProduct(
            description: "Keep your assigned number even if you go inactive.",
            displayName: "Lock My Number",
            entitlements: ["number_lock"],
            id: "lock_my_number_monthly",
            monthlyCallCapMinutes: 15,
            monthlySmsCap: 40,
            priceLabel: "$1.99 / month"
        ),
        SubscriptionCatalogProduct(
            description: "Ad-free, keep your number, and raise your message and call caps.",
            displayName: "Premium",
            entitlements: ["ad_free", "number_lock", "premium_caps"],
            id: "premium_monthly",
            monthlyCallCapMinutes: 90,
            monthlySmsCap: 250,
            priceLabel: "$9.99 / month"
        )
    ]

    private static let freeConversations = [
        conversation(
            id: "proof-conversation-1",
            participantNumber: "+14155550191",
            preview: "Can you send me the apartment code before I land?",
            status: "delivered",
            unreadCount: 2,
            updatedAt: "2026-03-17T10:14:00Z"
        ),
        conversation(
            id: "proof-conversation-2",
            participantNumber: "+14155550192",
            preview: "Lunch still on for 12:30?",
            status: "read",
            unreadCount: 0,
            updatedAt: "2026-03-17T09:47:00Z"
        ),
        conversation(
            id: "proof-conversation-3",
            participantNumber: "+14155550193",
            preview: "The landlord said the buzzer is fixed now.",
            status: "delivered",
            unreadCount: 1,
            updatedAt: "2026-03-17T09:18:00Z"
        ),
        conversation(
            id: "proof-conversation-4",
            participantNumber: "+14155550194",
            preview: "Your pickup is waiting outside terminal two.",
            status: "sent",
            unreadCount: 0,
            updatedAt: "2026-03-17T08:40:00Z"
        ),
        conversation(
            id: "proof-conversation-5",
            participantNumber: "+14155550195",
            preview: "We can swap shifts if you still need the evening off.",
            status: "delivered",
            unreadCount: 0,
            updatedAt: "2026-03-17T08:03:00Z"
        ),
        conversation(
            id: "proof-conversation-6",
            participantNumber: "+14155550196",
            preview: "The doorman has your package at the desk.",
            status: "delivered",
            unreadCount: 0,
            updatedAt: "2026-03-17T07:41:00Z"
        )
    ]

    private static let callHistory = [
        call(
            id: "proof-call-1",
            remoteNumber: "+14155550201",
            status: "completed",
            durationSeconds: 482,
            updatedAt: "2026-03-17T11:10:00Z"
        ),
        call(
            id: "proof-call-2",
            remoteNumber: "+14155550202",
            status: "missed",
            durationSeconds: 0,
            updatedAt: "2026-03-17T09:22:00Z"
        ),
        call(
            id: "proof-call-3",
            remoteNumber: "+14155550203",
            status: "completed",
            durationSeconds: 173,
            updatedAt: "2026-03-16T20:16:00Z"
        )
    ]

    private static let voicemails = [
        VoicemailEntry(
            audioUrl: "https://example.invalid/voicemail-proof.mp3",
            callerNumber: "+14155550203",
            createdAt: "2026-03-16T20:20:00Z",
            durationSeconds: 47,
            id: "proof-voicemail-1",
            isRead: false,
            phoneNumberId: currentNumber.phoneNumberId,
            providerCallId: "proof-call-3",
            transcription: "Hey, I missed you. Call me when you land.",
            updatedAt: "2026-03-16T20:20:00Z",
            userId: session.user.id
        )
    ]

    private static let freeMessageAllowance = MessageAllowance(
        dailyCap: 10,
        dailyRemaining: 2,
        dailyUsed: 8,
        monthlyCap: 40,
        monthlyRemaining: 7,
        monthlyUsed: 33
    )

    private static let freeCallAllowance = CallAllowance(
        monthlyCapMinutes: 15,
        monthlyRemainingMinutes: 3,
        monthlyUsedMinutes: 12
    )

    private static let premiumMessageAllowance = MessageAllowance(
        dailyCap: 80,
        dailyRemaining: 57,
        dailyUsed: 23,
        monthlyCap: 250,
        monthlyRemaining: 208,
        monthlyUsed: 42
    )

    private static let premiumCallAllowance = CallAllowance(
        monthlyCapMinutes: 90,
        monthlyRemainingMinutes: 72,
        monthlyUsedMinutes: 18
    )

    private static let messageThread = [
        ChatMessage(
            body: "Can you send me the apartment code before I land?",
            conversationId: "proof-conversation-1",
            createdAt: "2026-03-17T10:12:00Z",
            direction: "inbound",
            id: "proof-message-1",
            providerMessageId: "provider-message-1",
            status: "delivered",
            updatedAt: "2026-03-17T10:12:00Z"
        ),
        ChatMessage(
            body: "Sending it now. The sponsored row drops after the fifth thread in this proof inbox.",
            conversationId: "proof-conversation-1",
            createdAt: "2026-03-17T10:13:00Z",
            direction: "outbound",
            id: "proof-message-2",
            providerMessageId: "provider-message-2",
            status: "read",
            updatedAt: "2026-03-17T10:13:00Z"
        )
    ]

    static func seed(for scenario: Phase5ProofScenario) -> Phase5ProofSeed {
        switch scenario {
        case .messages:
            return makeSeed(
                selectedTab: .messages,
                messageAllowance: freeMessageAllowance,
                callAllowance: freeCallAllowance,
                monetizationStatus: freeStatus(),
                usagePrompt: nil,
                pendingInterstitialAd: nil,
                pendingRewardedAd: nil
            )
        case .messagesPaid:
            return makeSeed(
                selectedTab: .messages,
                messageAllowance: premiumMessageAllowance,
                callAllowance: premiumCallAllowance,
                monetizationStatus: premiumStatus(),
                usagePrompt: nil,
                pendingInterstitialAd: nil,
                pendingRewardedAd: nil
            )
        case .calls:
            return makeSeed(
                selectedTab: .calls,
                messageAllowance: freeMessageAllowance,
                callAllowance: freeCallAllowance,
                monetizationStatus: freeStatus(),
                usagePrompt: nil,
                pendingInterstitialAd: nil,
                pendingRewardedAd: nil
            )
        case .callsPaid:
            return makeSeed(
                selectedTab: .calls,
                messageAllowance: premiumMessageAllowance,
                callAllowance: premiumCallAllowance,
                monetizationStatus: premiumStatus(),
                usagePrompt: nil,
                pendingInterstitialAd: nil,
                pendingRewardedAd: nil
            )
        case .settingsFree:
            return makeSeed(
                selectedTab: .settings,
                messageAllowance: freeMessageAllowance,
                callAllowance: freeCallAllowance,
                monetizationStatus: freeStatus(),
                usagePrompt: nil,
                pendingInterstitialAd: nil,
                pendingRewardedAd: nil
            )
        case .settingsPaid:
            return makeSeed(
                selectedTab: .settings,
                messageAllowance: premiumMessageAllowance,
                callAllowance: premiumCallAllowance,
                monetizationStatus: premiumStatus(),
                usagePrompt: nil,
                pendingInterstitialAd: nil,
                pendingRewardedAd: nil
            )
        case .capHit:
            return makeSeed(
                selectedTab: .messages,
                messageAllowance: freeMessageAllowance,
                callAllowance: freeCallAllowance,
                monetizationStatus: freeStatus(),
                usagePrompt: UsagePromptState(
                    message: "Monthly text limit reached. Watch an ad for 10 bonus texts or upgrade to keep sending.",
                    rewardType: .textEvents
                ),
                pendingInterstitialAd: nil,
                pendingRewardedAd: nil
            )
        case .interstitial:
            return makeSeed(
                selectedTab: .calls,
                messageAllowance: freeMessageAllowance,
                callAllowance: freeCallAllowance,
                monetizationStatus: freeStatus(),
                usagePrompt: nil,
                pendingInterstitialAd: InterstitialAdRequest(placement: "post_call"),
                pendingRewardedAd: nil
            )
        case .rewarded:
            return makeSeed(
                selectedTab: .settings,
                messageAllowance: freeMessageAllowance,
                callAllowance: freeCallAllowance,
                monetizationStatus: freeStatus(),
                usagePrompt: nil,
                pendingInterstitialAd: nil,
                pendingRewardedAd: RewardedAdRequest(
                    placement: "settings_earn_more",
                    rewardType: .textEvents
                )
            )
        }
    }

    private static func makeSeed(
        selectedTab: AppTab,
        messageAllowance: MessageAllowance,
        callAllowance: CallAllowance,
        monetizationStatus: SubscriptionStatusPayload,
        usagePrompt: UsagePromptState?,
        pendingInterstitialAd: InterstitialAdRequest?,
        pendingRewardedAd: RewardedAdRequest?
    ) -> Phase5ProofSeed {
        Phase5ProofSeed(
            selectedTab: selectedTab,
            session: session,
            fingerprint: "ios-proof-device",
            currentNumber: currentNumber,
            conversations: freeConversations,
            currentConversation: freeConversations.first,
            currentMessages: messageThread,
            messageAllowance: messageAllowance,
            callHistory: callHistory,
            voicemails: voicemails,
            callAllowance: callAllowance,
            monetizationStatus: monetizationStatus,
            pendingInterstitialAd: pendingInterstitialAd,
            pendingRewardedAd: pendingRewardedAd,
            usagePrompt: usagePrompt,
            errorMessage: nil
        )
    }

    private static func freeStatus() -> SubscriptionStatusPayload {
        let activeProducts: [SubscriptionRecord] = []
        return SubscriptionStatusPayload(
            allowances: MonetizationAllowanceBundle(
                calls: freeCallAllowance,
                messages: freeMessageAllowance
            ),
            catalog: catalog,
            products: activeProducts,
            rewardClaims: RewardClaimSummary(
                callMinutesGranted: 5,
                maxClaims: 4,
                remainingClaims: 2,
                textEventsGranted: 10,
                totalClaims: 2
            ),
            status: SubscriptionEntitlementState(
                adFree: false,
                activeProducts: activeProducts,
                adsEnabled: true,
                displayTier: "free",
                numberLock: false,
                premiumCaps: false
            ),
            usagePlan: SubscriptionUsagePlan(
                dailyCallCapMinutes: 10,
                dailySmsCap: 10,
                description: "Free beta allowance with rewarded unlocks near the cap.",
                monthlyCallCapMinutes: 15,
                monthlySmsCap: 40,
                uniqueContactsDailyCap: 6
            )
        )
    }

    private static func premiumStatus() -> SubscriptionStatusPayload {
        let activeProducts = [
            SubscriptionRecord(
                createdAt: "2026-03-10T12:00:00Z",
                entitlementKey: "premium_caps",
                expiresAt: "2026-04-10T12:00:00Z",
                id: "proof-subscription-1",
                provider: "revenuecat",
                sourceProductId: "premium_monthly",
                status: "active",
                transactionId: "proof-transaction-1",
                updatedAt: "2026-03-10T12:00:00Z",
                userId: session.user.id,
                verifiedAt: "2026-03-10T12:00:01Z"
            )
        ]

        return SubscriptionStatusPayload(
            allowances: MonetizationAllowanceBundle(
                calls: premiumCallAllowance,
                messages: premiumMessageAllowance
            ),
            catalog: catalog,
            products: activeProducts,
            rewardClaims: RewardClaimSummary(
                callMinutesGranted: 5,
                maxClaims: 4,
                remainingClaims: 0,
                textEventsGranted: 10,
                totalClaims: 4
            ),
            status: SubscriptionEntitlementState(
                adFree: true,
                activeProducts: activeProducts,
                adsEnabled: false,
                displayTier: "premium",
                numberLock: true,
                premiumCaps: true
            ),
            usagePlan: SubscriptionUsagePlan(
                dailyCallCapMinutes: 45,
                dailySmsCap: 80,
                description: "Premium keeps the line locked, removes ads, and raises the beta caps.",
                monthlyCallCapMinutes: 90,
                monthlySmsCap: 250,
                uniqueContactsDailyCap: 20
            )
        )
    }

    private static func conversation(
        id: String,
        participantNumber: String,
        preview: String,
        status: String,
        unreadCount: Int,
        updatedAt: String
    ) -> ConversationSummary {
        ConversationSummary(
            createdAt: updatedAt,
            id: id,
            isOptedOut: false,
            lastMessageAt: updatedAt,
            lastMessagePreview: preview,
            lastMessageStatus: status,
            participantNumber: participantNumber,
            phoneNumberId: currentNumber.phoneNumberId,
            unreadCount: unreadCount,
            updatedAt: updatedAt,
            userId: session.user.id
        )
    }

    private static func call(
        id: String,
        remoteNumber: String,
        status: String,
        durationSeconds: Int,
        updatedAt: String
    ) -> CallHistoryEntry {
        CallHistoryEntry(
            createdAt: updatedAt,
            direction: "outbound",
            durationSeconds: durationSeconds,
            endedAt: updatedAt,
            id: id,
            phoneNumberId: currentNumber.phoneNumberId,
            providerCallId: "provider-\(id)",
            remoteNumber: remoteNumber,
            startedAt: updatedAt,
            status: status,
            updatedAt: updatedAt,
            userId: session.user.id
        )
    }
}

package com.freeline.app.ui

import android.content.Intent
import com.freeline.app.auth.AuthSessionPayload
import com.freeline.app.auth.AuthTokens
import com.freeline.app.auth.AuthenticatedUser
import com.freeline.app.calls.CallAllowance
import com.freeline.app.calls.CallHistoryEntry
import com.freeline.app.calls.VoicemailEntry
import com.freeline.app.messaging.ChatMessage
import com.freeline.app.messaging.ConversationSummary
import com.freeline.app.messaging.MessageAllowance
import com.freeline.app.monetization.InterstitialAdRequest
import com.freeline.app.monetization.MonetizationAllowanceBundle
import com.freeline.app.monetization.RewardClaimSummary
import com.freeline.app.monetization.RewardType
import com.freeline.app.monetization.RewardedAdRequest
import com.freeline.app.monetization.SubscriptionCatalogProduct
import com.freeline.app.monetization.SubscriptionEntitlementState
import com.freeline.app.monetization.SubscriptionRecord
import com.freeline.app.monetization.SubscriptionStatusPayload
import com.freeline.app.monetization.SubscriptionUsagePlan
import com.freeline.app.monetization.UsagePromptState
import com.freeline.app.numbers.AssignedNumber

data class Phase5ProofSeed(
    val selectedTab: AppTab,
    val session: AuthSessionPayload,
    val fingerprint: String,
    val currentNumber: AssignedNumber,
    val conversations: List<ConversationSummary>,
    val currentConversation: ConversationSummary?,
    val currentMessages: List<ChatMessage>,
    val messageAllowance: MessageAllowance,
    val callHistory: List<CallHistoryEntry>,
    val voicemails: List<VoicemailEntry>,
    val callAllowance: CallAllowance,
    val monetizationStatus: SubscriptionStatusPayload,
    val pendingInterstitialAd: InterstitialAdRequest?,
    val pendingRewardedAd: RewardedAdRequest?,
    val usagePrompt: UsagePromptState?,
    val errorMessage: String?,
)

enum class Phase5ProofScenario(val wireName: String) {
    Messages("messages"),
    Calls("calls"),
    SettingsFree("settings-free"),
    SettingsPaid("settings-paid"),
    CapHit("cap-hit"),
    Interstitial("interstitial"),
    Rewarded("rewarded"),
    ;

    val seed: Phase5ProofSeed
        get() = Phase5ProofFixtures.seed(this)

    companion object {
        const val EXTRA_NAME = "proofScenario"

        fun fromIntent(intent: Intent?): Phase5ProofScenario? {
            val rawValue = intent?.getStringExtra(EXTRA_NAME) ?: return null
            return entries.firstOrNull { it.wireName == rawValue }
        }
    }
}

private object Phase5ProofFixtures {
    private val currentNumber = AssignedNumber(
        assignmentId = "proof-assignment-1",
        assignedAt = "2026-03-17T09:00:00Z",
        activationDeadline = "2026-03-24T09:00:00Z",
        areaCode = "415",
        externalId = "proof-bandwidth-id",
        locality = "San Francisco",
        nationalFormat = "(415) 555-0101",
        phoneNumber = "+14155550101",
        phoneNumberId = "proof-number-1",
        provider = "bandwidth",
        quarantineUntil = null,
        region = "CA",
        releasedAt = null,
        status = "active",
        userId = "proof-user-1",
    )

    private val session = AuthSessionPayload(
        tokens = AuthTokens(
            accessToken = "proof-access-token",
            refreshToken = "proof-refresh-token",
            accessTokenExpiresAt = "2030-03-17T12:00:00Z",
            refreshTokenExpiresAt = "2030-04-17T12:00:00Z",
        ),
        user = AuthenticatedUser(
            id = "proof-user-1",
            email = "proof.user@freeline.dev",
            displayName = "Proof User",
        ),
    )

    private val catalog = listOf(
        SubscriptionCatalogProduct(
            description = "Remove banner, native, interstitial, and rewarded ads while keeping the free beta allowance.",
            displayName = "Ad-Free",
            entitlements = listOf("ad_free"),
            id = "ad_free_monthly",
            monthlyCallCapMinutes = 15,
            monthlySmsCap = 40,
            priceLabel = "$4.99 / month",
        ),
        SubscriptionCatalogProduct(
            description = "Keep your assigned number even if you go inactive.",
            displayName = "Lock My Number",
            entitlements = listOf("number_lock"),
            id = "lock_my_number_monthly",
            monthlyCallCapMinutes = 15,
            monthlySmsCap = 40,
            priceLabel = "$1.99 / month",
        ),
        SubscriptionCatalogProduct(
            description = "Ad-free, keep your number, and raise your message and call caps.",
            displayName = "Premium",
            entitlements = listOf("ad_free", "number_lock", "premium_caps"),
            id = "premium_monthly",
            monthlyCallCapMinutes = 90,
            monthlySmsCap = 250,
            priceLabel = "$9.99 / month",
        ),
    )

    private val freeConversations = listOf(
        conversation(
            id = "proof-conversation-1",
            participantNumber = "+14155550191",
            preview = "Can you send me the apartment code before I land?",
            status = "delivered",
            unreadCount = 2,
            updatedAt = "2026-03-17T10:14:00Z",
        ),
        conversation(
            id = "proof-conversation-2",
            participantNumber = "+14155550192",
            preview = "Lunch still on for 12:30?",
            status = "read",
            unreadCount = 0,
            updatedAt = "2026-03-17T09:47:00Z",
        ),
        conversation(
            id = "proof-conversation-3",
            participantNumber = "+14155550193",
            preview = "The landlord said the buzzer is fixed now.",
            status = "delivered",
            unreadCount = 1,
            updatedAt = "2026-03-17T09:18:00Z",
        ),
        conversation(
            id = "proof-conversation-4",
            participantNumber = "+14155550194",
            preview = "Your pickup is waiting outside terminal two.",
            status = "sent",
            unreadCount = 0,
            updatedAt = "2026-03-17T08:40:00Z",
        ),
        conversation(
            id = "proof-conversation-5",
            participantNumber = "+14155550195",
            preview = "We can swap shifts if you still need the evening off.",
            status = "delivered",
            unreadCount = 0,
            updatedAt = "2026-03-17T08:03:00Z",
        ),
        conversation(
            id = "proof-conversation-6",
            participantNumber = "+14155550196",
            preview = "The doorman has your package at the desk.",
            status = "delivered",
            unreadCount = 0,
            updatedAt = "2026-03-17T07:41:00Z",
        ),
    )

    private val callHistory = listOf(
        call(
            id = "proof-call-1",
            remoteNumber = "+14155550201",
            status = "completed",
            durationSeconds = 482,
            updatedAt = "2026-03-17T11:10:00Z",
        ),
        call(
            id = "proof-call-2",
            remoteNumber = "+14155550202",
            status = "missed",
            durationSeconds = 0,
            updatedAt = "2026-03-17T09:22:00Z",
        ),
        call(
            id = "proof-call-3",
            remoteNumber = "+14155550203",
            status = "completed",
            durationSeconds = 173,
            updatedAt = "2026-03-16T20:16:00Z",
        ),
    )

    private val voicemails = listOf(
        VoicemailEntry(
            audioUrl = "https://example.invalid/voicemail-proof.mp3",
            callerNumber = "+14155550203",
            createdAt = "2026-03-16T20:20:00Z",
            durationSeconds = 47,
            id = "proof-voicemail-1",
            isRead = false,
            phoneNumberId = currentNumber.phoneNumberId,
            providerCallId = "proof-call-3",
            transcription = "Hey, I missed you. Call me when you land.",
            updatedAt = "2026-03-16T20:20:00Z",
            userId = session.user.id,
        ),
    )

    private val freeMessageAllowance = MessageAllowance(
        dailyCap = 10,
        dailyRemaining = 2,
        dailyUsed = 8,
        monthlyCap = 40,
        monthlyRemaining = 7,
        monthlyUsed = 33,
    )

    private val freeCallAllowance = CallAllowance(
        monthlyCapMinutes = 15,
        monthlyRemainingMinutes = 3,
        monthlyUsedMinutes = 12,
    )

    private val premiumMessageAllowance = MessageAllowance(
        dailyCap = 80,
        dailyRemaining = 57,
        dailyUsed = 23,
        monthlyCap = 250,
        monthlyRemaining = 208,
        monthlyUsed = 42,
    )

    private val premiumCallAllowance = CallAllowance(
        monthlyCapMinutes = 90,
        monthlyRemainingMinutes = 72,
        monthlyUsedMinutes = 18,
    )

    private val messageThread = listOf(
        ChatMessage(
            body = "Can you send me the apartment code before I land?",
            conversationId = "proof-conversation-1",
            createdAt = "2026-03-17T10:12:00Z",
            direction = "inbound",
            id = "proof-message-1",
            providerMessageId = "provider-message-1",
            status = "delivered",
            updatedAt = "2026-03-17T10:12:00Z",
        ),
        ChatMessage(
            body = "Sending it now. The sponsored row drops after the fifth thread in this proof inbox.",
            conversationId = "proof-conversation-1",
            createdAt = "2026-03-17T10:13:00Z",
            direction = "outbound",
            id = "proof-message-2",
            providerMessageId = "provider-message-2",
            status = "read",
            updatedAt = "2026-03-17T10:13:00Z",
        ),
    )

    fun seed(scenario: Phase5ProofScenario): Phase5ProofSeed =
        when (scenario) {
            Phase5ProofScenario.Messages -> makeSeed(
                selectedTab = AppTab.Messages,
                messageAllowance = freeMessageAllowance,
                callAllowance = freeCallAllowance,
                monetizationStatus = freeStatus(),
                usagePrompt = null,
                pendingInterstitialAd = null,
                pendingRewardedAd = null,
            )
            Phase5ProofScenario.Calls -> makeSeed(
                selectedTab = AppTab.Calls,
                messageAllowance = freeMessageAllowance,
                callAllowance = freeCallAllowance,
                monetizationStatus = freeStatus(),
                usagePrompt = null,
                pendingInterstitialAd = null,
                pendingRewardedAd = null,
            )
            Phase5ProofScenario.SettingsFree -> makeSeed(
                selectedTab = AppTab.Settings,
                messageAllowance = freeMessageAllowance,
                callAllowance = freeCallAllowance,
                monetizationStatus = freeStatus(),
                usagePrompt = null,
                pendingInterstitialAd = null,
                pendingRewardedAd = null,
            )
            Phase5ProofScenario.SettingsPaid -> makeSeed(
                selectedTab = AppTab.Settings,
                messageAllowance = premiumMessageAllowance,
                callAllowance = premiumCallAllowance,
                monetizationStatus = premiumStatus(),
                usagePrompt = null,
                pendingInterstitialAd = null,
                pendingRewardedAd = null,
            )
            Phase5ProofScenario.CapHit -> makeSeed(
                selectedTab = AppTab.Messages,
                messageAllowance = freeMessageAllowance,
                callAllowance = freeCallAllowance,
                monetizationStatus = freeStatus(),
                usagePrompt = UsagePromptState(
                    message = "Monthly text limit reached. Watch an ad for 10 bonus texts or upgrade to keep sending.",
                    rewardType = RewardType.TextEvents,
                ),
                pendingInterstitialAd = null,
                pendingRewardedAd = null,
            )
            Phase5ProofScenario.Interstitial -> makeSeed(
                selectedTab = AppTab.Calls,
                messageAllowance = freeMessageAllowance,
                callAllowance = freeCallAllowance,
                monetizationStatus = freeStatus(),
                usagePrompt = null,
                pendingInterstitialAd = InterstitialAdRequest(placement = "post_call"),
                pendingRewardedAd = null,
            )
            Phase5ProofScenario.Rewarded -> makeSeed(
                selectedTab = AppTab.Settings,
                messageAllowance = freeMessageAllowance,
                callAllowance = freeCallAllowance,
                monetizationStatus = freeStatus(),
                usagePrompt = null,
                pendingInterstitialAd = null,
                pendingRewardedAd = RewardedAdRequest(
                    placement = "settings_earn_more",
                    rewardType = RewardType.TextEvents,
                ),
            )
        }

    private fun makeSeed(
        selectedTab: AppTab,
        messageAllowance: MessageAllowance,
        callAllowance: CallAllowance,
        monetizationStatus: SubscriptionStatusPayload,
        usagePrompt: UsagePromptState?,
        pendingInterstitialAd: InterstitialAdRequest?,
        pendingRewardedAd: RewardedAdRequest?,
    ) = Phase5ProofSeed(
        selectedTab = selectedTab,
        session = session,
        fingerprint = "android-proof-device",
        currentNumber = currentNumber,
        conversations = freeConversations,
        currentConversation = freeConversations.first(),
        currentMessages = messageThread,
        messageAllowance = messageAllowance,
        callHistory = callHistory,
        voicemails = voicemails,
        callAllowance = callAllowance,
        monetizationStatus = monetizationStatus,
        pendingInterstitialAd = pendingInterstitialAd,
        pendingRewardedAd = pendingRewardedAd,
        usagePrompt = usagePrompt,
        errorMessage = null,
    )

    private fun freeStatus(): SubscriptionStatusPayload {
        val activeProducts = emptyList<SubscriptionRecord>()
        return SubscriptionStatusPayload(
            allowances = MonetizationAllowanceBundle(
                calls = freeCallAllowance,
                messages = freeMessageAllowance,
            ),
            catalog = catalog,
            products = activeProducts,
            rewardClaims = RewardClaimSummary(
                callMinutesGranted = 5,
                maxClaims = 4,
                remainingClaims = 2,
                textEventsGranted = 10,
                totalClaims = 2,
            ),
            status = SubscriptionEntitlementState(
                activeProducts = activeProducts,
                adFree = false,
                adsEnabled = true,
                displayTier = "free",
                numberLock = false,
                premiumCaps = false,
            ),
            usagePlan = SubscriptionUsagePlan(
                dailyCallCapMinutes = 10,
                dailySmsCap = 10,
                description = "Free beta allowance with rewarded unlocks near the cap.",
                monthlyCallCapMinutes = 15,
                monthlySmsCap = 40,
                uniqueContactsDailyCap = 6,
            ),
        )
    }

    private fun premiumStatus(): SubscriptionStatusPayload {
        val activeProducts = listOf(
            SubscriptionRecord(
                createdAt = "2026-03-10T12:00:00Z",
                entitlementKey = "premium_caps",
                expiresAt = "2026-04-10T12:00:00Z",
                id = "proof-subscription-1",
                provider = "revenuecat",
                sourceProductId = "premium_monthly",
                status = "active",
                transactionId = "proof-transaction-1",
                updatedAt = "2026-03-10T12:00:00Z",
                userId = session.user.id,
                verifiedAt = "2026-03-10T12:00:01Z",
            ),
        )

        return SubscriptionStatusPayload(
            allowances = MonetizationAllowanceBundle(
                calls = premiumCallAllowance,
                messages = premiumMessageAllowance,
            ),
            catalog = catalog,
            products = activeProducts,
            rewardClaims = RewardClaimSummary(
                callMinutesGranted = 5,
                maxClaims = 4,
                remainingClaims = 0,
                textEventsGranted = 10,
                totalClaims = 4,
            ),
            status = SubscriptionEntitlementState(
                activeProducts = activeProducts,
                adFree = true,
                adsEnabled = false,
                displayTier = "premium",
                numberLock = true,
                premiumCaps = true,
            ),
            usagePlan = SubscriptionUsagePlan(
                dailyCallCapMinutes = 45,
                dailySmsCap = 80,
                description = "Premium keeps the line locked, removes ads, and raises the beta caps.",
                monthlyCallCapMinutes = 90,
                monthlySmsCap = 250,
                uniqueContactsDailyCap = 20,
            ),
        )
    }

    private fun conversation(
        id: String,
        participantNumber: String,
        preview: String,
        status: String,
        unreadCount: Int,
        updatedAt: String,
    ) = ConversationSummary(
        createdAt = updatedAt,
        id = id,
        isOptedOut = false,
        lastMessageAt = updatedAt,
        lastMessagePreview = preview,
        lastMessageStatus = status,
        participantNumber = participantNumber,
        phoneNumberId = currentNumber.phoneNumberId,
        unreadCount = unreadCount,
        updatedAt = updatedAt,
        userId = session.user.id,
    )

    private fun call(
        id: String,
        remoteNumber: String,
        status: String,
        durationSeconds: Int,
        updatedAt: String,
    ) = CallHistoryEntry(
        createdAt = updatedAt,
        direction = "outbound",
        durationSeconds = durationSeconds,
        endedAt = updatedAt,
        id = id,
        phoneNumberId = currentNumber.phoneNumberId,
        providerCallId = "provider-$id",
        remoteNumber = remoteNumber,
        startedAt = updatedAt,
        status = status,
        updatedAt = updatedAt,
        userId = session.user.id,
    )
}

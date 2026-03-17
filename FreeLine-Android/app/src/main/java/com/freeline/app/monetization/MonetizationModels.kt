package com.freeline.app.monetization

import com.freeline.app.calls.CallAllowance
import com.freeline.app.messaging.MessageAllowance

enum class RewardType(
    val wireName: String,
    val buttonTitle: String,
    val rewardDescription: String,
) {
    TextEvents(
        wireName = "text_events",
        buttonTitle = "Watch Ad for 10 bonus texts",
        rewardDescription = "10 bonus texts",
    ),
    CallMinutes(
        wireName = "call_minutes",
        buttonTitle = "Watch Ad for 5 bonus minutes",
        rewardDescription = "5 bonus call minutes",
    ),
    ;

    companion object {
        fun fromWireName(value: String): RewardType =
            entries.firstOrNull { it.wireName == value } ?: TextEvents
    }
}

data class RewardClaimSummary(
    val callMinutesGranted: Int,
    val maxClaims: Int,
    val remainingClaims: Int,
    val textEventsGranted: Int,
    val totalClaims: Int,
)

data class RewardClaimPayload(
    val calls: CallAllowance,
    val claimedReward: RewardClaimSummary,
    val messages: MessageAllowance,
    val rewardType: RewardType,
    val tier: String,
    val trustScore: Int,
)

data class SubscriptionCatalogProduct(
    val description: String,
    val displayName: String,
    val entitlements: List<String>,
    val id: String,
    val monthlyCallCapMinutes: Int,
    val monthlySmsCap: Int,
    val priceLabel: String,
)

data class SubscriptionRecord(
    val createdAt: String,
    val entitlementKey: String,
    val expiresAt: String?,
    val id: String,
    val provider: String,
    val sourceProductId: String,
    val status: String,
    val transactionId: String,
    val updatedAt: String,
    val userId: String,
    val verifiedAt: String,
)

data class SubscriptionEntitlementState(
    val activeProducts: List<SubscriptionRecord>,
    val adFree: Boolean,
    val adsEnabled: Boolean,
    val displayTier: String,
    val numberLock: Boolean,
    val premiumCaps: Boolean,
)

data class MonetizationAllowanceBundle(
    val calls: CallAllowance,
    val messages: MessageAllowance,
)

data class SubscriptionUsagePlan(
    val dailyCallCapMinutes: Int,
    val dailySmsCap: Int,
    val description: String,
    val monthlyCallCapMinutes: Int,
    val monthlySmsCap: Int,
    val uniqueContactsDailyCap: Int,
)

data class SubscriptionStatusPayload(
    val allowances: MonetizationAllowanceBundle,
    val catalog: List<SubscriptionCatalogProduct>,
    val products: List<SubscriptionRecord>,
    val rewardClaims: RewardClaimSummary,
    val status: SubscriptionEntitlementState,
    val usagePlan: SubscriptionUsagePlan,
)

data class SubscriptionVerificationPayload(
    val allowances: MonetizationAllowanceBundle,
    val product: SubscriptionCatalogProduct,
    val status: SubscriptionEntitlementState,
    val verifiedEntitlements: List<SubscriptionRecord>,
)

data class UsageSummary(
    val callProgress: Float,
    val callsLabel: String,
    val messageProgress: Float,
    val messagesLabel: String,
    val shouldWarn: Boolean,
)

data class UsagePromptState(
    val message: String,
    val rewardType: RewardType,
)

data class RewardedAdRequest(
    val placement: String,
    val rewardType: RewardType,
)

data class InterstitialAdRequest(
    val placement: String,
)

class MonetizationApiException(
    message: String,
    val upgradePrompt: String? = null,
) : IllegalStateException(message)

package com.freeline.app.monetization

import com.freeline.app.calls.CallAllowance
import com.freeline.app.config.APIConfiguration
import com.freeline.app.messaging.MessageAllowance
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class MonetizationApiClient(
    private val baseUrl: String = APIConfiguration.baseUrl,
) {
    suspend fun claimReward(
        accessToken: String,
        rewardType: RewardType,
    ): RewardClaimPayload = withContext(Dispatchers.IO) {
        val response = request(
            path = "/v1/rewards/claim",
            method = "POST",
            accessToken = accessToken,
            jsonBody = JSONObject().apply {
                put("rewardType", rewardType.wireName)
            },
        )

        RewardClaimPayload(
            calls = response.getJSONObject("calls").toCallAllowance(),
            claimedReward = response.getJSONObject("claimedReward").toRewardClaimSummary(),
            messages = response.getJSONObject("messages").toMessageAllowance(),
            rewardType = RewardType.fromWireName(response.getString("rewardType")),
            tier = response.getString("tier"),
            trustScore = response.getInt("trustScore"),
        )
    }

    suspend fun getSubscriptionStatus(accessToken: String): SubscriptionStatusPayload =
        withContext(Dispatchers.IO) {
            val response = request(
                path = "/v1/subscriptions/status",
                method = "GET",
                accessToken = accessToken,
            )

            SubscriptionStatusPayload(
                allowances = response.getJSONObject("allowances").toMonetizationAllowanceBundle(),
                catalog = response.getJSONArray("catalog").toCatalogProducts(),
                products = response.getJSONArray("products").toSubscriptionRecords(),
                rewardClaims = response.getJSONObject("rewardClaims").toRewardClaimSummary(),
                status = response.getJSONObject("status").toEntitlementState(),
                usagePlan = response.getJSONObject("usagePlan").toUsagePlan(),
            )
        }

    suspend fun trackEvent(
        accessToken: String,
        eventType: String,
        properties: Map<String, Any>,
    ) {
        withContext(Dispatchers.IO) {
            requestNoContent(
                path = "/v1/analytics/events",
                method = "POST",
                accessToken = accessToken,
                jsonBody = JSONObject().apply {
                    put("eventType", eventType)
                    put(
                        "properties",
                        JSONObject().apply {
                            properties.forEach { (key, value) ->
                                put(key, value)
                            }
                        },
                    )
                },
            )
        }
    }

    suspend fun verifyPurchase(
        accessToken: String,
        productId: String,
        platform: String,
    ): SubscriptionVerificationPayload = withContext(Dispatchers.IO) {
        val response = request(
            path = "/v1/subscriptions/verify",
            method = "POST",
            accessToken = accessToken,
            jsonBody = JSONObject().apply {
                put("platform", platform)
                put("productId", productId)
                put("provider", "dev")
                put("transactionId", "$platform-$productId-${System.currentTimeMillis()}")
                put("verificationToken", "dev-$productId")
            },
        )

        SubscriptionVerificationPayload(
            allowances = response.getJSONObject("allowances").toMonetizationAllowanceBundle(),
            product = response.getJSONObject("product").toCatalogProduct(),
            status = response.getJSONObject("status").toEntitlementState(),
            verifiedEntitlements = response.getJSONArray("verifiedEntitlements").toSubscriptionRecords(),
        )
    }

    private fun request(
        path: String,
        method: String,
        accessToken: String,
        jsonBody: JSONObject? = null,
    ): JSONObject {
        val connection = (URL("$baseUrl$path").openConnection() as HttpURLConnection).apply {
            requestMethod = method
            setRequestProperty("Authorization", "Bearer $accessToken")
            if (jsonBody != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                outputStream.bufferedWriter().use { writer ->
                    writer.write(jsonBody.toString())
                }
            }
        }

        try {
            val statusCode = connection.responseCode
            val responseText = if (statusCode in 200..299) {
                connection.inputStream.bufferedReader().use { it.readText() }
            } else {
                connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
            }

            if (statusCode !in 200..299) {
                throw responseText.toMonetizationApiException()
            }

            return if (responseText.isBlank()) JSONObject() else JSONObject(responseText)
        } finally {
            connection.disconnect()
        }
    }

    private fun requestNoContent(
        path: String,
        method: String,
        accessToken: String,
        jsonBody: JSONObject? = null,
    ) {
        val connection = (URL("$baseUrl$path").openConnection() as HttpURLConnection).apply {
            requestMethod = method
            setRequestProperty("Authorization", "Bearer $accessToken")
            if (jsonBody != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                outputStream.bufferedWriter().use { writer ->
                    writer.write(jsonBody.toString())
                }
            }
        }

        try {
            val statusCode = connection.responseCode
            if (statusCode !in 200..299) {
                val responseText = connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
                throw responseText.toMonetizationApiException()
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun String.toMonetizationApiException(): MonetizationApiException {
        val error = runCatching { JSONObject(this).getJSONObject("error") }.getOrNull()
        val message = error?.optString("message").takeUnless { it.isNullOrBlank() } ?: "Monetization request failed."
        val upgradePrompt = error
            ?.optJSONObject("details")
            ?.optString("upgradePrompt")
            ?.takeUnless { it.isNullOrBlank() }

        return MonetizationApiException(
            message = message,
            upgradePrompt = upgradePrompt,
        )
    }

    private fun JSONObject.toCallAllowance(): CallAllowance =
        CallAllowance(
            monthlyCapMinutes = getInt("monthlyCapMinutes"),
            monthlyRemainingMinutes = getInt("monthlyRemainingMinutes"),
            monthlyUsedMinutes = getInt("monthlyUsedMinutes"),
        )

    private fun JSONObject.toCatalogProduct(): SubscriptionCatalogProduct =
        SubscriptionCatalogProduct(
            description = getString("description"),
            displayName = getString("displayName"),
            entitlements = getJSONArray("entitlements").toStringList(),
            id = getString("id"),
            monthlyCallCapMinutes = getInt("monthlyCallCapMinutes"),
            monthlySmsCap = getInt("monthlySmsCap"),
            priceLabel = getString("priceLabel"),
        )

    private fun JSONArray.toCatalogProducts(): List<SubscriptionCatalogProduct> =
        buildList {
            for (index in 0 until length()) {
                add(getJSONObject(index).toCatalogProduct())
            }
        }

    private fun JSONObject.toEntitlementState(): SubscriptionEntitlementState =
        SubscriptionEntitlementState(
            activeProducts = getJSONArray("activeProducts").toSubscriptionRecords(),
            adFree = getBoolean("adFree"),
            adsEnabled = getBoolean("adsEnabled"),
            displayTier = getString("displayTier"),
            numberLock = getBoolean("numberLock"),
            premiumCaps = getBoolean("premiumCaps"),
        )

    private fun JSONObject.toMessageAllowance(): MessageAllowance =
        MessageAllowance(
            dailyCap = getInt("dailyCap"),
            dailyRemaining = getInt("dailyRemaining"),
            dailyUsed = getInt("dailyUsed"),
            monthlyCap = getInt("monthlyCap"),
            monthlyRemaining = getInt("monthlyRemaining"),
            monthlyUsed = getInt("monthlyUsed"),
        )

    private fun JSONObject.toMonetizationAllowanceBundle(): MonetizationAllowanceBundle =
        MonetizationAllowanceBundle(
            calls = getJSONObject("calls").toCallAllowance(),
            messages = getJSONObject("messages").toMessageAllowance(),
        )

    private fun JSONObject.toRewardClaimSummary(): RewardClaimSummary =
        RewardClaimSummary(
            callMinutesGranted = getInt("callMinutesGranted"),
            maxClaims = getInt("maxClaims"),
            remainingClaims = getInt("remainingClaims"),
            textEventsGranted = getInt("textEventsGranted"),
            totalClaims = getInt("totalClaims"),
        )

    private fun JSONObject.toSubscriptionRecord(): SubscriptionRecord =
        SubscriptionRecord(
            createdAt = getString("createdAt"),
            entitlementKey = getString("entitlementKey"),
            expiresAt = optString("expiresAt").ifBlank { null },
            id = getString("id"),
            provider = getString("provider"),
            sourceProductId = getString("sourceProductId"),
            status = getString("status"),
            transactionId = getString("transactionId"),
            updatedAt = getString("updatedAt"),
            userId = getString("userId"),
            verifiedAt = getString("verifiedAt"),
        )

    private fun JSONArray.toStringList(): List<String> =
        buildList {
            for (index in 0 until length()) {
                add(getString(index))
            }
        }

    private fun JSONArray.toSubscriptionRecords(): List<SubscriptionRecord> =
        buildList {
            for (index in 0 until length()) {
                add(getJSONObject(index).toSubscriptionRecord())
            }
        }

    private fun JSONObject.toUsagePlan(): SubscriptionUsagePlan =
        SubscriptionUsagePlan(
            dailyCallCapMinutes = getInt("dailyCallCapMinutes"),
            dailySmsCap = getInt("dailySmsCap"),
            description = getString("description"),
            monthlyCallCapMinutes = getInt("monthlyCallCapMinutes"),
            monthlySmsCap = getInt("monthlySmsCap"),
            uniqueContactsDailyCap = getInt("uniqueContactsDailyCap"),
        )
}

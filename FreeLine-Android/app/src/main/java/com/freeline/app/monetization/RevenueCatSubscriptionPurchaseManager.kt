package com.freeline.app.monetization

import android.app.Activity
import android.content.Context
import com.freeline.app.BuildConfig
import com.revenuecat.purchases.CustomerInfo
import com.revenuecat.purchases.Offerings
import com.revenuecat.purchases.PurchaseParams
import com.revenuecat.purchases.Purchases
import com.revenuecat.purchases.PurchasesConfiguration
import com.revenuecat.purchases.PurchasesError
import com.revenuecat.purchases.interfaces.LogInCallback
import com.revenuecat.purchases.interfaces.PurchaseCallback
import com.revenuecat.purchases.interfaces.ReceiveOfferingsCallback
import com.revenuecat.purchases.models.StoreTransaction
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

data class SubscriptionPurchaseReceipt(
    val provider: String,
    val transactionId: String,
    val verificationToken: String,
)

class RevenueCatSubscriptionPurchaseManager(
    private val context: Context,
) {
    suspend fun purchase(
        activity: Activity,
        productId: String,
        userId: String,
    ): SubscriptionPurchaseReceipt {
        ensureConfigured(userId)

        val offerings = awaitOfferings()
        val availablePackages = offerings.all.values.flatMap { it.availablePackages }
        val rcPackage = availablePackages.firstOrNull { rcPackage ->
            rcPackage.product.id == productId
        } ?: throw MonetizationApiException(
            message = "This subscription product is not available in the current offering.",
        )

        val transaction = awaitPurchase(
            purchaseParams = PurchaseParams.Builder(activity, rcPackage).build(),
        )

        return SubscriptionPurchaseReceipt(
            provider = "revenuecat",
            transactionId = transaction.orderId ?: transaction.purchaseToken,
            verificationToken = Purchases.sharedInstance.appUserID,
        )
    }

    private suspend fun ensureConfigured(userId: String) {
        val publicApiKey = BuildConfig.REVENUECAT_PUBLIC_API_KEY.trim()
        if (publicApiKey.isBlank()) {
            throw MonetizationApiException(
                message = "RevenueCat is not configured for this build.",
            )
        }

        if (!Purchases.isConfigured) {
            Purchases.configure(
                PurchasesConfiguration.Builder(context, publicApiKey)
                    .appUserID(userId)
                    .build(),
            )
            return
        }

        if (Purchases.sharedInstance.appUserID != userId) {
            awaitLogIn(userId)
        }
    }

    private suspend fun awaitLogIn(userId: String) {
        suspendCancellableCoroutine<Unit> { continuation ->
            Purchases.sharedInstance.logIn(
                userId,
                object : LogInCallback {
                    override fun onReceived(customerInfo: CustomerInfo, created: Boolean) {
                        if (continuation.isActive) {
                            continuation.resume(Unit)
                        }
                    }

                    override fun onError(error: PurchasesError) {
                        if (continuation.isActive) {
                            continuation.resumeWithException(
                                MonetizationApiException(
                                    message = error.message,
                                ),
                            )
                        }
                    }
                },
            )
        }
    }

    private suspend fun awaitOfferings(): Offerings =
        suspendCancellableCoroutine { continuation ->
            Purchases.sharedInstance.getOfferings(
                object : ReceiveOfferingsCallback {
                    override fun onReceived(offerings: Offerings) {
                        if (continuation.isActive) {
                            continuation.resume(offerings)
                        }
                    }

                    override fun onError(error: PurchasesError) {
                        if (continuation.isActive) {
                            continuation.resumeWithException(
                                MonetizationApiException(
                                    message = error.message,
                                ),
                            )
                        }
                    }
                },
            )
        }

    private suspend fun awaitPurchase(
        purchaseParams: PurchaseParams,
    ): StoreTransaction =
        suspendCancellableCoroutine { continuation ->
            Purchases.sharedInstance.purchase(
                purchaseParams,
                object : PurchaseCallback {
                    override fun onCompleted(
                        storeTransaction: StoreTransaction,
                        customerInfo: CustomerInfo,
                    ) {
                        if (continuation.isActive) {
                            continuation.resume(storeTransaction)
                        }
                    }

                    override fun onError(error: PurchasesError, userCancelled: Boolean) {
                        if (!continuation.isActive) {
                            return
                        }

                        continuation.resumeWithException(
                            MonetizationApiException(
                                message = if (userCancelled) {
                                    "The subscription purchase was cancelled."
                                } else {
                                    error.message
                                },
                            ),
                        )
                    }
                },
            )
        }
}

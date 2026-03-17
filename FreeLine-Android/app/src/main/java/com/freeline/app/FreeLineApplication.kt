package com.freeline.app

import android.app.Application
import com.google.android.gms.ads.MobileAds
import com.revenuecat.purchases.Purchases
import com.revenuecat.purchases.PurchasesConfiguration

class FreeLineApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        MobileAds.initialize(this)

        if (!BuildConfig.REVENUECAT_PUBLIC_API_KEY.isBlank() && !Purchases.isConfigured) {
            Purchases.configure(
                PurchasesConfiguration.Builder(this, BuildConfig.REVENUECAT_PUBLIC_API_KEY).build(),
            )
        }
    }
}

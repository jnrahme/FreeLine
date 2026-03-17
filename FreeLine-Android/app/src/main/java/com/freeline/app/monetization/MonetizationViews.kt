package com.freeline.app.monetization

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.widget.Button as AndroidButton
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.core.view.isVisible
import com.freeline.app.config.AdConfiguration
import com.google.android.gms.ads.AdListener
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.AdLoader
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.gms.ads.nativead.NativeAd
import com.google.android.gms.ads.nativead.NativeAdOptions
import com.google.android.gms.ads.nativead.NativeAdView
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback

@Composable
fun UsageOverviewCard(
    summary: UsageSummary,
    remainingRewardClaims: Int,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(
            containerColor = if (summary.shouldWarn) {
                MaterialTheme.colorScheme.tertiaryContainer
            } else {
                MaterialTheme.colorScheme.surfaceContainerHigh
            },
        ),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "Usage Overview",
                    style = MaterialTheme.typography.titleMedium,
                )
                Spacer(modifier = Modifier.weight(1f))
                if (remainingRewardClaims > 0) {
                    Text(
                        text = "$remainingRewardClaims ad unlocks left",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Text(summary.messagesLabel, style = MaterialTheme.typography.bodyMedium)
            LinearProgressIndicator(
                progress = { summary.messageProgress },
                modifier = Modifier.fillMaxWidth(),
                color = if (summary.shouldWarn) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.primary,
            )

            Text(summary.callsLabel, style = MaterialTheme.typography.bodyMedium)
            LinearProgressIndicator(
                progress = { summary.callProgress },
                modifier = Modifier.fillMaxWidth(),
                color = if (summary.shouldWarn) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.secondary,
            )

            if (summary.shouldWarn) {
                Text(
                    text = "You are close to your beta cap.",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onTertiaryContainer,
                )
            }
        }
    }
}

@Composable
fun BannerAdCard(
    placement: String,
    isHidden: Boolean,
    onImpression: () -> Unit,
    onTap: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (isHidden) {
        return
    }

    val context = LocalContext.current
    val bannerWidth = LocalConfiguration.current.screenWidthDp.coerceAtLeast(320)
    val latestOnImpression by rememberUpdatedState(onImpression)
    val latestOnTap by rememberUpdatedState(onTap)
    val adView = remember(context, placement) {
        com.google.android.gms.ads.AdView(context).apply {
            adUnitId = AdConfiguration.BANNER_UNIT_ID
            adListener = object : AdListener() {
                override fun onAdImpression() {
                    latestOnImpression()
                }

                override fun onAdClicked() {
                    latestOnTap()
                }
            }
        }
    }

    DisposableEffect(adView, bannerWidth) {
        adView.setAdSize(
            AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(
                context,
                bannerWidth,
            ),
        )
        adView.loadAd(AdRequest.Builder().build())
        onDispose {
            adView.destroy()
        }
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        ),
    ) {
        AndroidView(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 10.dp),
            factory = { adView },
        )
    }
}

@Composable
fun SponsoredConversationAdCard(
    onImpression: () -> Unit,
    onTap: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val latestOnImpression by rememberUpdatedState(onImpression)
    val latestOnTap by rememberUpdatedState(onTap)
    var nativeAd by remember { mutableStateOf<NativeAd?>(null) }
    var didAttemptLoad by remember { mutableStateOf(false) }

    DisposableEffect(context) {
        val adLoader = AdLoader.Builder(context, AdConfiguration.NATIVE_UNIT_ID)
            .forNativeAd { loadedAd ->
                nativeAd?.destroy()
                nativeAd = loadedAd
                didAttemptLoad = true
            }
            .withNativeAdOptions(NativeAdOptions.Builder().build())
            .withAdListener(
                object : AdListener() {
                    override fun onAdImpression() {
                        latestOnImpression()
                    }

                    override fun onAdClicked() {
                        latestOnTap()
                    }

                    override fun onAdFailedToLoad(error: LoadAdError) {
                        didAttemptLoad = true
                    }
                },
            )
            .build()

        adLoader.loadAd(AdRequest.Builder().build())

        onDispose {
            nativeAd?.destroy()
            nativeAd = null
        }
    }

    when {
        nativeAd != null -> {
            AndroidView(
                modifier = modifier.fillMaxWidth(),
                factory = { createConversationNativeAdView(it) },
                update = { view ->
                    bindConversationNativeAdView(view, nativeAd!!)
                },
            )
        }
        !didAttemptLoad -> {
            Card(
                modifier = modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                ),
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = "Sponsored",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = "Loading sponsored message...",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
    }
}

@Composable
fun UsageCapDialog(
    prompt: UsagePromptState,
    canUseRewardedAds: Boolean,
    onDismiss: () -> Unit,
    onWatchAd: () -> Unit,
    onUpgrade: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Usage limit reached") },
        text = { Text(prompt.message) },
        confirmButton = {
            Button(onClick = onUpgrade) {
                Text("Upgrade")
            }
        },
        dismissButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (canUseRewardedAds) {
                    OutlinedButton(onClick = onWatchAd) {
                        Text(prompt.rewardType.buttonTitle)
                    }
                }
                TextButton(onClick = onDismiss) {
                    Text("Not now")
                }
            }
        },
    )
}

@Composable
fun InterstitialAdHost(
    request: InterstitialAdRequest?,
    onDismiss: () -> Unit,
    onUnavailable: () -> Unit,
    onImpression: () -> Unit,
    onTap: () -> Unit,
) {
    val activity = LocalContext.current.findActivity()
    val latestOnDismiss by rememberUpdatedState(onDismiss)
    val latestOnUnavailable by rememberUpdatedState(onUnavailable)
    val latestOnImpression by rememberUpdatedState(onImpression)
    val latestOnTap by rememberUpdatedState(onTap)

    DisposableEffect(request?.id, activity) {
        val pendingRequest = request
        if (pendingRequest == null || activity == null) {
            if (pendingRequest != null) {
                latestOnUnavailable()
            }
            onDispose { }
        } else {
            InterstitialAd.load(
                activity,
                AdConfiguration.INTERSTITIAL_UNIT_ID,
                AdRequest.Builder().build(),
                object : InterstitialAdLoadCallback() {
                    override fun onAdLoaded(interstitialAd: InterstitialAd) {
                        interstitialAd.fullScreenContentCallback = object : FullScreenContentCallback() {
                            override fun onAdImpression() {
                                latestOnImpression()
                            }

                            override fun onAdClicked() {
                                latestOnTap()
                            }

                            override fun onAdDismissedFullScreenContent() {
                                latestOnDismiss()
                            }

                            override fun onAdFailedToShowFullScreenContent(adError: com.google.android.gms.ads.AdError) {
                                latestOnUnavailable()
                            }
                        }

                        interstitialAd.show(activity)
                    }

                    override fun onAdFailedToLoad(error: LoadAdError) {
                        latestOnUnavailable()
                    }
                },
            )

            onDispose { }
        }
    }
}

@Composable
fun RewardedAdHost(
    request: RewardedAdRequest?,
    onAbandon: () -> Unit,
    onComplete: () -> Unit,
    onImpression: () -> Unit,
    onUnavailable: (String) -> Unit,
) {
    val activity = LocalContext.current.findActivity()
    val latestOnAbandon by rememberUpdatedState(onAbandon)
    val latestOnComplete by rememberUpdatedState(onComplete)
    val latestOnImpression by rememberUpdatedState(onImpression)
    val latestOnUnavailable by rememberUpdatedState(onUnavailable)

    DisposableEffect(request?.id, activity) {
        val pendingRequest = request
        if (pendingRequest == null || activity == null) {
            if (pendingRequest != null) {
                latestOnUnavailable("No ads available right now. Try again later.")
            }
            onDispose { }
        } else {
            RewardedAd.load(
                activity,
                AdConfiguration.REWARDED_UNIT_ID,
                AdRequest.Builder().build(),
                object : RewardedAdLoadCallback() {
                    override fun onAdLoaded(rewardedAd: RewardedAd) {
                        var didEarnReward = false

                        rewardedAd.fullScreenContentCallback = object : FullScreenContentCallback() {
                            override fun onAdImpression() {
                                latestOnImpression()
                            }

                            override fun onAdDismissedFullScreenContent() {
                                if (!didEarnReward) {
                                    latestOnAbandon()
                                }
                            }

                            override fun onAdFailedToShowFullScreenContent(adError: com.google.android.gms.ads.AdError) {
                                latestOnUnavailable("No ads available right now. Try again later.")
                            }
                        }

                        rewardedAd.show(activity) {
                            didEarnReward = true
                            latestOnComplete()
                        }
                    }

                    override fun onAdFailedToLoad(error: LoadAdError) {
                        latestOnUnavailable("No ads available right now. Try again later.")
                    }
                },
            )

            onDispose { }
        }
    }
}

private const val NativeHeadlineTag = "headline"
private const val NativeBodyTag = "body"
private const val NativeSponsorTag = "sponsor"
private const val NativeCallToActionTag = "call_to_action"
private const val NativeIconTag = "icon"

private fun createConversationNativeAdView(context: Context): NativeAdView {
    val sponsorLabel = TextView(context).apply {
        tag = NativeSponsorTag
        text = "Sponsored"
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(ContextCompat.getColor(context, android.R.color.darker_gray))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
    }
    val headlineLabel = TextView(context).apply {
        tag = NativeHeadlineTag
        setTextColor(ContextCompat.getColor(context, android.R.color.black))
        setTypeface(typeface, Typeface.BOLD)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        maxLines = 2
        ellipsize = TextUtils.TruncateAt.END
        text = "Loading sponsored message..."
    }
    val bodyLabel = TextView(context).apply {
        tag = NativeBodyTag
        setTextColor(ContextCompat.getColor(context, android.R.color.darker_gray))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        maxLines = 3
        ellipsize = TextUtils.TruncateAt.END
        isVisible = false
    }
    val callToActionButton = AndroidButton(context).apply {
        tag = NativeCallToActionTag
        isAllCaps = false
        text = "Learn more"
        isClickable = false
        isVisible = false
    }
    val appIconView = ImageView(context).apply {
        tag = NativeIconTag
        layoutParams = LinearLayout.LayoutParams(context.dp(44f), context.dp(44f))
        scaleType = ImageView.ScaleType.CENTER_CROP
        isVisible = false
    }

    val textColumn = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER_VERTICAL
        addView(sponsorLabel)
        addView(headlineLabel)
        addView(bodyLabel)
    }

    val row = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        addView(
            appIconView,
            LinearLayout.LayoutParams(context.dp(44f), context.dp(44f)).apply {
                marginEnd = context.dp(12f)
            },
        )
        addView(
            textColumn,
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f),
        )
        addView(
            callToActionButton,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                marginStart = context.dp(12f)
            },
        )
    }

    return NativeAdView(context).apply {
        background = GradientDrawable().apply {
            cornerRadius = context.dp(18f).toFloat()
            setColor(ContextCompat.getColor(context, android.R.color.white))
            setStroke(context.dp(1f), ContextCompat.getColor(context, android.R.color.darker_gray))
        }
        val horizontalPadding = context.dp(16f)
        val verticalPadding = context.dp(14f)
        setPadding(horizontalPadding, verticalPadding, horizontalPadding, verticalPadding)
        addView(
            row,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
            ),
        )
        headlineView = headlineLabel
        bodyView = bodyLabel
        callToActionView = callToActionButton
        iconView = appIconView
    }
}

private fun bindConversationNativeAdView(view: NativeAdView, ad: NativeAd) {
    val headlineLabel = view.findViewWithTag<TextView>(NativeHeadlineTag)
    val bodyLabel = view.findViewWithTag<TextView>(NativeBodyTag)
    val callToActionButton = view.findViewWithTag<AndroidButton>(NativeCallToActionTag)
    val appIconView = view.findViewWithTag<ImageView>(NativeIconTag)

    headlineLabel.text = ad.headline
    bodyLabel.text = ad.body.orEmpty()
    bodyLabel.isVisible = !ad.body.isNullOrBlank()
    callToActionButton.text = ad.callToAction ?: "Learn more"
    callToActionButton.isVisible = !ad.callToAction.isNullOrBlank()
    val iconDrawable = ad.icon?.drawable
    appIconView.setImageDrawable(iconDrawable)
    appIconView.isVisible = iconDrawable != null
    view.setNativeAd(ad)
}

private fun Context.findActivity(): Activity? =
    when (this) {
        is Activity -> this
        is ContextWrapper -> baseContext.findActivity()
        else -> null
    }

private fun Context.dp(value: Float): Int =
    TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        value,
        resources.displayMetrics,
    ).toInt()

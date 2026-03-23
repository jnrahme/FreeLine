package com.freeline.app.ui

import android.app.Activity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Email
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Logout
import androidx.compose.material.icons.rounded.ManageAccounts
import androidx.compose.material.icons.rounded.MarkEmailUnread
import androidx.compose.material.icons.rounded.MonetizationOn
import androidx.compose.material.icons.rounded.Phone
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Security
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.VerifiedUser
import androidx.compose.material.icons.rounded.WavingHand
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.freeline.app.auth.AuthApiClient
import com.freeline.app.auth.AuthScreen
import com.freeline.app.auth.DevAuthProvider
import com.freeline.app.auth.PendingEmailVerification
import com.freeline.app.auth.SessionStore
import com.freeline.app.calls.CallApiClient
import com.freeline.app.calls.TwilioVoiceTransport
import com.freeline.app.config.APIConfiguration
import com.freeline.app.messaging.MessageApiClient
import com.freeline.app.messaging.MessageRealtimeClient
import com.freeline.app.monetization.BannerAdCard
import com.freeline.app.monetization.InterstitialAdHost
import com.freeline.app.monetization.MonetizationApiClient
import com.freeline.app.monetization.RevenueCatSubscriptionPurchaseManager
import com.freeline.app.monetization.RewardType
import com.freeline.app.monetization.RewardedAdHost
import com.freeline.app.monetization.UsageCapDialog
import com.freeline.app.monetization.UsageOverviewCard
import com.freeline.app.numbers.AvailableNumberOption
import com.freeline.app.numbers.NumberApiClient
import kotlinx.coroutines.launch

@Composable
fun FreeLineApp(
    proofScenario: Phase5ProofScenario? = null,
    launchRoute: MessageLaunchRoute? = null,
) {
    val context = LocalContext.current
    val appState = remember(proofScenario) {
        FreeLineAppState(
            authApiClient = AuthApiClient(),
            callApiClient = CallApiClient(),
            messageApiClient = MessageApiClient(),
            messageRealtimeClient = MessageRealtimeClient(),
            monetizationApiClient = MonetizationApiClient(),
            numberApiClient = NumberApiClient(),
            subscriptionPurchaseManager = RevenueCatSubscriptionPurchaseManager(context.applicationContext),
            sessionStore = SessionStore(context.applicationContext),
            voiceTransport = TwilioVoiceTransport(context.applicationContext),
            proofScenario = proofScenario,
        )
    }

    LaunchedEffect(appState.session?.tokens?.accessToken) {
        if (!appState.isProofMode) {
            appState.syncMessageRealtime()
            appState.syncCachedPushTokens()
        }
    }

    LaunchedEffect(launchRoute?.conversationId) {
        if (launchRoute != null) {
            appState.handleMessageLaunchRoute(launchRoute)
        }
    }

    if (appState.isAuthenticated) {
        LaunchedEffect(appState.session?.tokens?.accessToken) {
            if (!appState.hasResolvedCurrentNumber) {
                appState.loadCurrentNumber()
            }
        }

        when {
            !appState.hasResolvedCurrentNumber -> LoadingNumberScreen()
            appState.currentNumber == null -> NumberClaimScreen(appState = appState)
            else -> AuthenticatedShell(appState = appState)
        }
    } else {
        AuthFlow(appState = appState)
    }
}

@Composable
private fun AuthFlow(appState: FreeLineAppState) {
    val coroutineScope = rememberCoroutineScope()

    when {
        appState.pendingVerification != null -> EmailVerificationScreen(
            appState = appState,
            pendingVerification = appState.pendingVerification!!,
            onVerify = { token ->
                coroutineScope.launch {
                    appState.verifyEmail(token)
                }
            },
        )
        appState.authScreen == AuthScreen.Email -> EmailAuthScreen(
            appState = appState,
            onSubmit = { email, password ->
                coroutineScope.launch {
                    appState.startEmailAuth(email, password)
                }
            },
        )
        else -> WelcomeScreen(
            appState = appState,
            onProviderSelected = { provider ->
                coroutineScope.launch {
                    appState.continueWithDevProvider(provider)
                }
            },
        )
    }
}

@Composable
private fun WelcomeScreen(
    appState: FreeLineAppState,
    onProviderSelected: (DevAuthProvider) -> Unit,
) {
    FreeLineScreen {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .systemBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            FreeLineGlassCard {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(18.dp),
                ) {
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        FreeLineSectionTitle(
                            eyebrow = "Free U.S. line",
                            title = "FreeLine",
                            subtitle = "A polished second-number app for calls and texts, with strict cost controls and a clean native shell.",
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FreeLinePill(
                                text = "US only",
                                icon = Icons.Rounded.Shield,
                            )
                            FreeLinePill(
                                text = "1 line per user",
                                icon = Icons.Rounded.VerifiedUser,
                                tint = MaterialTheme.colorScheme.secondary,
                            )
                        }
                    }

                    FreeLineHeroIcon(icon = Icons.Rounded.Phone)
                }
            }

            FreeLineGlassCard {
                Text(
                    text = "MVP rules",
                    style = MaterialTheme.typography.titleMedium,
                )
                listOf(
                    "One free number per user, with a 24-hour activation window.",
                    "Personal communication only. Bulk sending and spam are blocked.",
                    "OTP support is not guaranteed, and emergency calls stay on the native dialer.",
                ).forEach { rule ->
                    Text(
                        text = "\u2022 $rule",
                        style = MaterialTheme.typography.bodyMedium.copy(
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        ),
                    )
                }
            }

            FreeLinePrimaryButton(
                onClick = { appState.showEmailAuth() },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(
                    imageVector = Icons.Rounded.Email,
                    contentDescription = null,
                )
                Spacer(modifier = Modifier.size(10.dp))
                Text("Sign up with email")
            }

            FreeLineSecondaryButton(
                onClick = { onProviderSelected(DevAuthProvider.Apple) },
                modifier = Modifier.fillMaxWidth(),
                enabled = !appState.isLoading,
            ) {
                Icon(
                    imageVector = Icons.Rounded.AutoAwesome,
                    contentDescription = null,
                )
                Spacer(modifier = Modifier.size(10.dp))
                Text(DevAuthProvider.Apple.buttonTitle)
            }

            FreeLineSecondaryButton(
                onClick = { onProviderSelected(DevAuthProvider.Google) },
                modifier = Modifier.fillMaxWidth(),
                enabled = !appState.isLoading,
            ) {
                Icon(
                    imageVector = Icons.Rounded.AccountCircle,
                    contentDescription = null,
                )
                Spacer(modifier = Modifier.size(10.dp))
                Text(DevAuthProvider.Google.buttonTitle)
            }

            if (appState.errorMessage != null) {
                FreeLineNoticeCard(
                    title = "Sign-in problem",
                    message = appState.errorMessage.orEmpty(),
                    icon = Icons.Rounded.Security,
                )
            }

            FreeLineGlassCard(tone = MaterialTheme.colorScheme.freeLineSuccessTone()) {
                Text(
                    text = "Development endpoint",
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    text = APIConfiguration.baseUrl,
                    style = MaterialTheme.typography.bodyMedium.copy(
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    ),
                )
            }
        }
    }
}

@Composable
private fun EmailAuthScreen(
    appState: FreeLineAppState,
    onSubmit: (String, String) -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    FreeLineScreen {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .systemBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            FreeLineGlassCard {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(18.dp),
                ) {
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        FreeLineSectionTitle(
                            eyebrow = "Account setup",
                            title = "Create your FreeLine account",
                            subtitle = "Start with email and password. The dev mailbox will hand back a preview verification link so the full auth flow stays testable locally.",
                        )
                    }
                    FreeLineHeroIcon(icon = Icons.Rounded.MarkEmailUnread)
                }
            }

            FreeLineGlassCard {
                FreeLineTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = "Email",
                    leadingIcon = Icons.Rounded.Email,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                )

                FreeLineTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = "Password",
                    leadingIcon = Icons.Rounded.Lock,
                    visualTransformation = PasswordVisualTransformation(),
                )

                FreeLinePrimaryButton(
                    onClick = { onSubmit(email, password) },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !appState.isLoading,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Key,
                        contentDescription = null,
                    )
                    Spacer(modifier = Modifier.size(10.dp))
                    Text("Send verification link")
                }

                FreeLineSecondaryButton(
                    onClick = { appState.showWelcome() },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Back")
                }
            }

            if (appState.errorMessage != null) {
                FreeLineNoticeCard(
                    title = "Auth failed",
                    message = appState.errorMessage.orEmpty(),
                    icon = Icons.Rounded.Security,
                )
            }
        }
    }
}

@Composable
private fun EmailVerificationScreen(
    appState: FreeLineAppState,
    pendingVerification: PendingEmailVerification,
    onVerify: (String) -> Unit,
) {
    var token by remember(pendingVerification.suggestedToken) {
        mutableStateOf(pendingVerification.suggestedToken)
    }

    FreeLineScreen {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .systemBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            FreeLineGlassCard {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(18.dp),
                ) {
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        FreeLineSectionTitle(
                            eyebrow = "Verification",
                            title = "Verify your email",
                            subtitle = "The backend is still in dev mailbox mode. Use the preview link or pasted token below to complete the flow without a live email provider.",
                        )
                        FreeLinePill(
                            text = pendingVerification.email,
                            icon = Icons.Rounded.CheckCircle,
                            tint = MaterialTheme.colorScheme.secondary,
                        )
                    }
                    FreeLineHeroIcon(icon = Icons.Rounded.VerifiedUser)
                }
            }

            FreeLineGlassCard {
                Text(
                    text = "Preview link",
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    text = pendingVerification.previewLink,
                    style = MaterialTheme.typography.bodySmall,
                )
                FreeLineTextField(
                    value = token,
                    onValueChange = { token = it },
                    label = "Verification token",
                    leadingIcon = Icons.Rounded.Key,
                )
                FreeLinePrimaryButton(
                    onClick = { onVerify(token) },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !appState.isLoading,
                ) {
                    Text("Verify and continue")
                }
                FreeLineSecondaryButton(
                    onClick = { appState.showEmailAuth() },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Start over")
                }
            }

            if (appState.errorMessage != null) {
                FreeLineNoticeCard(
                    title = "Verification problem",
                    message = appState.errorMessage.orEmpty(),
                    icon = Icons.Rounded.Security,
                )
            }
        }
    }
}

@Composable
private fun LoadingNumberScreen() {
    FreeLineScreen {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .systemBarsPadding()
                .padding(24.dp),
            contentAlignment = Alignment.Center,
        ) {
            FreeLineGlassCard(
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(18.dp),
                ) {
                    FreeLineHeroIcon(icon = Icons.Rounded.Phone)
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Text(
                            text = "Loading your line",
                            style = MaterialTheme.typography.headlineSmall,
                        )
                        Text(
                            text = "Checking your assigned number, usage plan, and message state before the shell appears.",
                            style = MaterialTheme.typography.bodyMedium.copy(
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            ),
                        )
                        CircularProgressIndicator(
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun NumberClaimScreen(appState: FreeLineAppState) {
    val coroutineScope = rememberCoroutineScope()
    var areaCode by remember { mutableStateOf("415") }

    FreeLineScreen {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .systemBarsPadding(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                start = 24.dp,
                top = 24.dp,
                end = 24.dp,
                bottom = 36.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                FreeLineGlassCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(18.dp),
                    ) {
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(14.dp),
                        ) {
                            FreeLineSectionTitle(
                                eyebrow = "Number claim",
                                title = "Choose your free number",
                                subtitle = "Search U.S. inventory by area code, then claim one line. A new number must be activated within 24 hours.",
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                FreeLinePill(
                                    text = "US only",
                                    icon = Icons.Rounded.Shield,
                                )
                                FreeLinePill(
                                    text = "24h activation",
                                    icon = Icons.Rounded.Star,
                                    tint = MaterialTheme.colorScheme.tertiary,
                                )
                            }
                        }
                        FreeLineHeroIcon(icon = Icons.Rounded.Search)
                    }
                }
            }

            item {
                FreeLineGlassCard {
                    FreeLineTextField(
                        value = areaCode,
                        onValueChange = { areaCode = it },
                        label = "Area code",
                        leadingIcon = Icons.Rounded.Phone,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    )
                    FreeLinePrimaryButton(
                        onClick = {
                            coroutineScope.launch {
                                appState.searchNumbers(areaCode)
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !appState.isLoading,
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Search,
                            contentDescription = null,
                        )
                        Spacer(modifier = Modifier.size(10.dp))
                        Text("Search numbers")
                    }
                }
            }

            if (appState.availableNumbers.isEmpty()) {
                item {
                    FreeLineNoticeCard(
                        title = "No results yet",
                        message = "Run a search to see claimable numbers from the active provider.",
                        icon = Icons.Rounded.Tune,
                        tone = MaterialTheme.colorScheme.freeLineSuccessTone(),
                    )
                }
            } else {
                items(
                    items = appState.availableNumbers,
                    key = { option -> option.phoneNumber },
                ) { number ->
                    NumberCard(
                        number = number,
                        isLoading = appState.isLoading,
                        onClaim = {
                            coroutineScope.launch {
                                appState.claimNumber(number)
                            }
                        },
                    )
                }
            }

            if (appState.errorMessage != null) {
                item {
                    FreeLineNoticeCard(
                        title = "Claim failed",
                        message = appState.errorMessage.orEmpty(),
                        icon = Icons.Rounded.Security,
                    )
                }
            }
        }
    }

    LaunchedEffect(Unit) {
        if (appState.availableNumbers.isEmpty()) {
            appState.searchNumbers(areaCode)
        }
    }
}

@Composable
private fun NumberCard(
    number: AvailableNumberOption,
    isLoading: Boolean,
    onClaim: () -> Unit,
) {
    FreeLineGlassCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            FreeLineHeroIcon(
                icon = Icons.Rounded.Phone,
                modifier = Modifier.size(74.dp),
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = number.nationalFormat,
                    style = MaterialTheme.typography.headlineSmall,
                )
                Text(
                    text = "${number.locality}, ${number.region}",
                    style = MaterialTheme.typography.bodyMedium.copy(
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    ),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FreeLinePill(
                        text = number.provider.replaceFirstChar(Char::titlecase),
                        icon = Icons.Rounded.ManageAccounts,
                    )
                    FreeLinePill(
                        text = "Area ${number.areaCode}",
                        icon = Icons.Rounded.Search,
                        tint = MaterialTheme.colorScheme.secondary,
                    )
                }
            }
        }

        FreeLinePrimaryButton(
            onClick = onClaim,
            modifier = Modifier.fillMaxWidth(),
            enabled = !isLoading,
        ) {
            Text("Claim this number")
        }
    }
}

@Composable
private fun AuthenticatedShell(appState: FreeLineAppState) {
    val coroutineScope = rememberCoroutineScope()
    val tabs = AppTab.entries

    FreeLineScreen {
        Scaffold(
            containerColor = androidx.compose.ui.graphics.Color.Transparent,
            bottomBar = {
                FreeLineTabBar(
                    tabs = tabs,
                    selectedTab = appState.selectedTab,
                    onSelect = { appState.selectTab(it) },
                )
            },
        ) { paddingValues ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentAlignment = Alignment.Center,
            ) {
                when (appState.selectedTab) {
                    AppTab.Messages -> MessagesTabScreen(appState = appState)
                    AppTab.Calls -> CallsTabScreen(appState = appState)
                    AppTab.Voicemail -> VoicemailTabScreen(appState = appState)
                    AppTab.Settings -> SettingsScreen(appState = appState)
                }

                appState.usagePrompt?.let { prompt ->
                    UsageCapDialog(
                        prompt = prompt,
                        canUseRewardedAds = appState.canUseRewardedAds,
                        onDismiss = { appState.dismissUsagePrompt() },
                        onWatchAd = {
                            appState.beginRewardedUnlock(prompt.rewardType, placement = "cap_hit_prompt")
                        },
                        onUpgrade = {
                            appState.openSubscriptionManagement()
                        },
                    )
                }

                appState.pendingInterstitialAd?.let { request ->
                    InterstitialAdHost(
                        request = request,
                        onDismiss = { appState.dismissInterstitial() },
                        onUnavailable = { appState.dismissInterstitial(markShown = false) },
                        onImpression = {
                            coroutineScope.launch {
                                appState.trackAdImpression(
                                    adType = "interstitial",
                                    placement = request.placement,
                                    adUnitId = com.freeline.app.config.AdConfiguration.INTERSTITIAL_UNIT_ID,
                                )
                            }
                        },
                        onTap = {
                            coroutineScope.launch {
                                appState.trackAdClick(
                                    adType = "interstitial",
                                    placement = request.placement,
                                )
                            }
                        },
                    )
                }

                appState.pendingRewardedAd?.let { request ->
                    RewardedAdHost(
                        request = request,
                        onAbandon = {
                            coroutineScope.launch {
                                appState.abandonRewardedUnlock()
                            }
                        },
                        onComplete = {
                            coroutineScope.launch {
                                appState.completeRewardedUnlock()
                            }
                        },
                        onImpression = {
                            coroutineScope.launch {
                                appState.trackAdImpression(
                                    adType = "rewarded",
                                    placement = request.placement,
                                    adUnitId = com.freeline.app.config.AdConfiguration.REWARDED_UNIT_ID,
                                )
                            }
                        },
                        onUnavailable = { message ->
                            appState.failRewardedUnlock(message)
                        },
                    )
                }
            }
        }
    }

    LaunchedEffect(appState.session?.tokens?.accessToken) {
        appState.refreshMonetizationState()
    }
}

@Composable
private fun SettingsScreen(appState: FreeLineAppState) {
    val coroutineScope = rememberCoroutineScope()
    val activity = LocalContext.current as? Activity

    Scaffold(
        containerColor = androidx.compose.ui.graphics.Color.Transparent,
        bottomBar = {
            BannerAdCard(
                placement = "settings_bottom_banner",
                isHidden = !appState.adsEnabled,
                onImpression = {
                    coroutineScope.launch {
                        appState.trackAdImpression(
                            adType = "banner",
                            placement = "settings_bottom_banner",
                            adUnitId = com.freeline.app.config.AdConfiguration.BANNER_UNIT_ID,
                        )
                    }
                },
                onTap = {
                    coroutineScope.launch {
                        appState.trackAdClick(
                            adType = "banner",
                            placement = "settings_bottom_banner",
                        )
                    }
                },
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
        },
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = 16.dp),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                top = 20.dp,
                bottom = 100.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                FreeLineGlassCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(18.dp),
                    ) {
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(14.dp),
                        ) {
                            FreeLineSectionTitle(
                                eyebrow = "Account and plan",
                                title = "Settings",
                                subtitle = "Manage your line, view usage, and tune monetization without breaking the free-tier guardrails.",
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                FreeLinePill(
                                    text = appState.currentPlanTitle,
                                    icon = Icons.Rounded.MonetizationOn,
                                )
                                FreeLinePill(
                                    text = appState.currentNumber?.status ?: "No line",
                                    icon = Icons.Rounded.CheckCircle,
                                    tint = MaterialTheme.colorScheme.secondary,
                                )
                            }
                        }
                        FreeLineHeroIcon(icon = Icons.Rounded.ManageAccounts)
                    }
                }
            }

            item {
                appState.usageSummary?.let { summary ->
                    UsageOverviewCard(
                        summary = summary,
                        remainingRewardClaims = appState.remainingRewardClaims,
                    )
                }
            }

            item {
                FreeLineGlassCard {
                    Text(
                        text = "Account",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text("Email: ${appState.currentUserEmail}")
                    Text("Number: ${appState.currentNumber?.phoneNumber ?: "not assigned"}")
                    Text(
                        text = "API: ${APIConfiguration.baseUrl}",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }

            item {
                FreeLineGlassCard {
                    Text(
                        text = "Plan",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text("Current tier: ${appState.currentPlanTitle}")
                    appState.monetizationStatus?.usagePlan?.let { plan ->
                        Text(
                            text = plan.description,
                            style = MaterialTheme.typography.bodyMedium.copy(
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            ),
                        )
                        FreeLinePill(
                            text = "${plan.monthlySmsCap} texts / ${plan.monthlyCallCapMinutes} min",
                            icon = Icons.Rounded.Star,
                            tint = MaterialTheme.colorScheme.secondary,
                        )
                    }
                }
            }

            appState.monetizationStatus?.catalog?.takeIf { it.isNotEmpty() }?.let { catalog ->
                items(
                    items = catalog,
                    key = { product -> product.id },
                ) { product ->
                    val isActive = appState.monetizationStatus?.status?.activeProducts
                        ?.any { it.sourceProductId == product.id } == true

                    FreeLineGlassCard {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Text(
                                    text = product.displayName,
                                    style = MaterialTheme.typography.titleMedium,
                                )
                                Text(
                                    text = product.priceLabel,
                                    style = MaterialTheme.typography.titleSmall.copy(
                                        color = MaterialTheme.colorScheme.primary,
                                    ),
                                )
                                Text(
                                    text = product.description,
                                    style = MaterialTheme.typography.bodyMedium.copy(
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    ),
                                )
                            }

                            FreeLinePill(
                                text = if (isActive) "Active" else "Available",
                                icon = if (isActive) Icons.Rounded.CheckCircle else Icons.Rounded.Star,
                                tint = if (isActive) {
                                    MaterialTheme.colorScheme.secondary
                                } else {
                                    MaterialTheme.colorScheme.primary
                                },
                            )
                        }

                        if (!isActive) {
                            FreeLinePrimaryButton(
                                onClick = {
                                    if (activity != null) {
                                        coroutineScope.launch {
                                            appState.verifySubscriptionPurchase(product.id, activity)
                                        }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                                enabled = !appState.isLoading && activity != null,
                            ) {
                                Text("Enable")
                            }
                        }
                    }
                }

                item {
                    FreeLineSecondaryButton(
                        onClick = {
                            coroutineScope.launch {
                                appState.refreshMonetizationState()
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !appState.isLoading,
                    ) {
                        Text("Refresh subscription state")
                    }
                }
            }

            item {
                FreeLineGlassCard {
                    Text(
                        text = "Earn more",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    if (appState.adsEnabled) {
                        Text(
                            text = "Rewarded ads unlock extra usage without forcing an upgrade.",
                            style = MaterialTheme.typography.bodyMedium.copy(
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            ),
                        )
                        RewardType.entries.forEach { rewardType ->
                            FreeLineSecondaryButton(
                                onClick = {
                                    appState.beginRewardedUnlock(
                                        rewardType = rewardType,
                                        placement = "settings_earn_more",
                                    )
                                },
                                modifier = Modifier.fillMaxWidth(),
                                enabled = appState.canUseRewardedAds,
                            ) {
                                Text(rewardType.buttonTitle)
                            }
                        }
                    } else {
                        Text(
                            text = "Rewarded ad unlocks are hidden on your current paid tier.",
                            style = MaterialTheme.typography.bodyMedium.copy(
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            ),
                        )
                    }
                }
            }

            item {
                FreeLineGlassCard {
                    Text(
                        text = "Line",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text("Status: ${appState.currentNumber?.status ?: "none"}")
                    FreeLinePrimaryButton(
                        onClick = {
                            coroutineScope.launch {
                                appState.releaseCurrentNumber()
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !appState.isLoading && appState.currentNumber != null,
                    ) {
                        Text("Release number")
                    }
                }
            }

            item {
                FreeLineSecondaryButton(
                    onClick = { appState.signOut() },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Logout,
                        contentDescription = null,
                    )
                    Spacer(modifier = Modifier.size(10.dp))
                    Text("Sign out")
                }
            }
        }
    }
}

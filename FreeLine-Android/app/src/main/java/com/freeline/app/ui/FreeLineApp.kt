package com.freeline.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import com.freeline.app.calls.CallApiClient
import com.freeline.app.calls.TwilioVoiceTransport
import com.freeline.app.auth.AuthApiClient
import com.freeline.app.auth.AuthScreen
import com.freeline.app.auth.DevAuthProvider
import com.freeline.app.auth.PendingEmailVerification
import com.freeline.app.auth.SessionStore
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
fun FreeLineApp() {
    val context = LocalContext.current.applicationContext
    val appState = remember {
        FreeLineAppState(
            authApiClient = AuthApiClient(),
            callApiClient = CallApiClient(),
            messageApiClient = MessageApiClient(),
            messageRealtimeClient = MessageRealtimeClient(),
            monetizationApiClient = MonetizationApiClient(),
            numberApiClient = NumberApiClient(),
            subscriptionPurchaseManager = RevenueCatSubscriptionPurchaseManager(context),
            sessionStore = SessionStore(context),
            voiceTransport = TwilioVoiceTransport(context),
        )
    }

    LaunchedEffect(appState.session?.tokens?.accessToken) {
        appState.syncMessageRealtime()
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
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = "FreeLine",
            style = MaterialTheme.typography.headlineLarge,
        )
        Text(
            text = "Get a free U.S. number for calls and texts.",
            style = MaterialTheme.typography.titleMedium,
        )
        Text(
            text = "This build wires the first real auth path: email sign-up, verification, dev OAuth, secure token storage, and a signed-in shell.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Card {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("MVP rules", style = MaterialTheme.typography.titleSmall)
                Text("1 free number per user")
                Text("24-hour activation required")
                Text("Dev auth is enabled while native Apple and Google SDKs are still pending")
            }
        }
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = { appState.showEmailAuth() },
        ) {
            Text("Sign up with email")
        }
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = { onProviderSelected(DevAuthProvider.Apple) },
            enabled = !appState.isLoading,
        ) {
            Text(DevAuthProvider.Apple.buttonTitle)
        }
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = { onProviderSelected(DevAuthProvider.Google) },
            enabled = !appState.isLoading,
        ) {
            Text(DevAuthProvider.Google.buttonTitle)
        }
        if (appState.errorMessage != null) {
            Text(
                text = appState.errorMessage.orEmpty(),
                color = MaterialTheme.colorScheme.error,
            )
        }
        Text(
            text = "API: ${APIConfiguration.baseUrl}",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun EmailAuthScreen(
    appState: FreeLineAppState,
    onSubmit: (String, String) -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = "Create your FreeLine account",
            style = MaterialTheme.typography.headlineSmall,
        )
        Text(
            text = "Start with email and password. The backend returns a dev preview link right now so we can verify the flow locally.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            modifier = Modifier.fillMaxWidth(),
            visualTransformation = PasswordVisualTransformation(),
        )
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = { onSubmit(email, password) },
            enabled = !appState.isLoading,
        ) {
            Text("Send verification link")
        }
        TextButton(onClick = { appState.showWelcome() }) {
            Text("Back")
        }
        if (appState.errorMessage != null) {
            Text(
                text = appState.errorMessage.orEmpty(),
                color = MaterialTheme.colorScheme.error,
            )
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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = "Verify your email",
            style = MaterialTheme.typography.headlineSmall,
        )
        Text("Account: ${pendingVerification.email}")
        Text(
            text = "The backend is running in dev mailbox mode. The preview link and extracted token are shown below so we can complete the auth flow without an email provider.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Card {
            Text(
                text = pendingVerification.previewLink,
                modifier = Modifier.padding(16.dp),
            )
        }
        OutlinedTextField(
            value = token,
            onValueChange = { token = it },
            label = { Text("Verification token") },
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = { onVerify(token) },
            enabled = !appState.isLoading,
        ) {
            Text("Verify and continue")
        }
        TextButton(onClick = { appState.showEmailAuth() }) {
            Text("Start over")
        }
        if (appState.errorMessage != null) {
            Text(
                text = appState.errorMessage.orEmpty(),
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}

@Composable
private fun LoadingNumberScreen() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Text("Loading your line")
    }
}

@Composable
private fun NumberClaimScreen(appState: FreeLineAppState) {
    val coroutineScope = rememberCoroutineScope()
    var areaCode by remember { mutableStateOf("415") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = "Choose your free number",
            style = MaterialTheme.typography.headlineSmall,
        )
        Text(
            text = "Search by area code, then claim one available number. Your line has to be activated within 24 hours.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedTextField(
            value = areaCode,
            onValueChange = { areaCode = it },
            label = { Text("Area code") },
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        )
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                coroutineScope.launch {
                    appState.searchNumbers(areaCode)
                }
            },
            enabled = !appState.isLoading,
        ) {
            Text("Search numbers")
        }
        if (appState.availableNumbers.isEmpty()) {
            Text(
                text = "Run a search to see claimable numbers from the provider.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            appState.availableNumbers.forEach { number ->
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
            Text(
                text = appState.errorMessage.orEmpty(),
                color = MaterialTheme.colorScheme.error,
            )
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
    Card {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(number.nationalFormat, style = MaterialTheme.typography.titleMedium)
            Text("${number.locality}, ${number.region}")
            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = onClaim,
                enabled = !isLoading,
            ) {
                Text("Claim this number")
            }
        }
    }
}

@Composable
private fun AuthenticatedShell(appState: FreeLineAppState) {
    val coroutineScope = rememberCoroutineScope()
    val tabs = AppTab.entries

    Scaffold(
        bottomBar = {
            NavigationBar {
                tabs.forEach { tab ->
                    NavigationBarItem(
                        selected = appState.selectedTab == tab,
                        onClick = { appState.selectTab(tab) },
                        icon = { Text(tab.iconLabel) },
                        label = { Text(tab.label) },
                    )
                }
            }
        }
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

    LaunchedEffect(appState.session?.tokens?.accessToken) {
        appState.refreshMonetizationState()
    }
}

@Composable
private fun SettingsScreen(appState: FreeLineAppState) {
    val coroutineScope = rememberCoroutineScope()
    val activity = LocalContext.current as? android.app.Activity

    Scaffold(
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
        Column(
            modifier = Modifier
                .padding(paddingValues)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Settings", style = MaterialTheme.typography.headlineSmall)

            appState.usageSummary?.let { summary ->
                UsageOverviewCard(
                    summary = summary,
                    remainingRewardClaims = appState.remainingRewardClaims,
                )
            }

            Card {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("Account", style = MaterialTheme.typography.titleSmall)
                    Text("Email: ${appState.currentUserEmail}")
                    Text("Number: ${appState.currentNumber?.phoneNumber ?: "not assigned"}")
                    Text("API: ${APIConfiguration.baseUrl}")
                }
            }

            Card {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("Plan", style = MaterialTheme.typography.titleSmall)
                    Text("Current tier: ${appState.currentPlanTitle}")
                    appState.monetizationStatus?.usagePlan?.let { plan ->
                        Text(
                            text = plan.description,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            text = "${plan.monthlySmsCap} texts / ${plan.monthlyCallCapMinutes} call minutes",
                            style = MaterialTheme.typography.labelLarge,
                        )
                    }
                }
            }

            appState.monetizationStatus?.catalog?.takeIf { it.isNotEmpty() }?.let { catalog ->
                Card {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text("Manage Subscription", style = MaterialTheme.typography.titleSmall)
                        catalog.forEach { product ->
                            val isActive = appState.monetizationStatus?.status?.activeProducts
                                ?.any { it.sourceProductId == product.id } == true

                            Card(
                                colors = CardDefaults.cardColors(
                                    containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                                ),
                            ) {
                                Column(
                                    modifier = Modifier.padding(14.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Text(product.displayName, style = MaterialTheme.typography.titleMedium)
                                    Text(product.priceLabel, style = MaterialTheme.typography.labelLarge)
                                    Text(
                                        product.description,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                    if (isActive) {
                                        Text(
                                            text = "Active",
                                            color = MaterialTheme.colorScheme.primary,
                                            style = MaterialTheme.typography.labelLarge,
                                        )
                                    } else {
                                        Button(
                                            onClick = {
                                                if (activity != null) {
                                                    coroutineScope.launch {
                                                        appState.verifySubscriptionPurchase(product.id, activity)
                                                    }
                                                }
                                            },
                                            enabled = !appState.isLoading && activity != null,
                                        ) {
                                            Text("Enable")
                                        }
                                    }
                                }
                            }
                        }

                        TextButton(
                            onClick = {
                                coroutineScope.launch {
                                    appState.refreshMonetizationState()
                                }
                            },
                            enabled = !appState.isLoading,
                        ) {
                            Text("Refresh subscription state")
                        }
                    }
                }
            }

            Card {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("Earn More", style = MaterialTheme.typography.titleSmall)
                    if (appState.adsEnabled) {
                        Text(
                            text = "Rewarded ads unlock bonus usage without forcing a plan upgrade.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        RewardType.entries.forEach { rewardType ->
                            Button(
                                onClick = {
                                    appState.beginRewardedUnlock(
                                        rewardType = rewardType,
                                        placement = "settings_earn_more",
                                    )
                                },
                                enabled = appState.canUseRewardedAds,
                            ) {
                                Text(rewardType.buttonTitle)
                            }
                        }
                    } else {
                        Text(
                            text = "Rewarded ad unlocks are hidden on your current paid tier.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            Card {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("Line", style = MaterialTheme.typography.titleSmall)
                    Text("Status: ${appState.currentNumber?.status ?: "none"}")
                    Button(
                        onClick = {
                            coroutineScope.launch {
                                appState.releaseCurrentNumber()
                            }
                        },
                        enabled = !appState.isLoading && appState.currentNumber != null,
                    ) {
                        Text("Release number")
                    }
                }
            }

            Button(onClick = { appState.signOut() }) {
                Text("Sign out")
            }
        }
    }
}

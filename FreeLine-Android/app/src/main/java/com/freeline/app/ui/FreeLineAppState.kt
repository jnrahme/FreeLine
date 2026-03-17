package com.freeline.app.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.freeline.app.calls.ActiveCallSession
import com.freeline.app.calls.CallAllowance
import com.freeline.app.calls.CallApiClient
import com.freeline.app.calls.CallHistoryEntry
import com.freeline.app.calls.TwilioVoiceTransport
import com.freeline.app.calls.VoicemailEntry
import com.freeline.app.calls.VoiceCallEvent
import com.freeline.app.calls.normalizeDialableUsPhoneNumber
import com.freeline.app.auth.AuthApiClient
import com.freeline.app.auth.AuthScreen
import com.freeline.app.auth.AuthSessionPayload
import com.freeline.app.auth.DevAuthProvider
import com.freeline.app.auth.PendingEmailVerification
import com.freeline.app.auth.SessionStore
import com.freeline.app.messaging.ChatMessage
import com.freeline.app.messaging.ConversationSummary
import com.freeline.app.messaging.MessageAllowance
import com.freeline.app.messaging.MessageApiClient
import com.freeline.app.messaging.MessageRealtimeClient
import com.freeline.app.messaging.MessageRealtimeEvent
import com.freeline.app.messaging.MessageRealtimeEventType
import com.freeline.app.messaging.normalizeUsPhoneNumber
import com.freeline.app.monetization.InterstitialAdRequest
import com.freeline.app.monetization.MonetizationApiClient
import com.freeline.app.monetization.MonetizationApiException
import com.freeline.app.monetization.RevenueCatSubscriptionPurchaseManager
import com.freeline.app.monetization.RewardType
import com.freeline.app.monetization.RewardedAdRequest
import com.freeline.app.monetization.SubscriptionStatusPayload
import com.freeline.app.monetization.SubscriptionUsagePlan
import com.freeline.app.monetization.UsagePromptState
import com.freeline.app.monetization.UsageSummary
import com.freeline.app.numbers.AssignedNumber
import com.freeline.app.numbers.AvailableNumberOption
import com.freeline.app.numbers.NumberApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class FreeLineAppState(
    private val authApiClient: AuthApiClient,
    private val callApiClient: CallApiClient,
    private val messageApiClient: MessageApiClient,
    private val messageRealtimeClient: MessageRealtimeClient,
    private val monetizationApiClient: MonetizationApiClient,
    private val numberApiClient: NumberApiClient,
    private val subscriptionPurchaseManager: RevenueCatSubscriptionPurchaseManager,
    private val sessionStore: SessionStore,
    private val voiceTransport: TwilioVoiceTransport,
    private val proofScenario: Phase5ProofScenario? = null,
) {
    private val mainScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val proofSeed = proofScenario?.seed

    var authScreen by mutableStateOf(AuthScreen.Welcome)
        private set

    var selectedTab by mutableStateOf(AppTab.Messages)
        private set

    var session by mutableStateOf(proofSeed?.session ?: sessionStore.loadSession())
        private set

    var pendingVerification by mutableStateOf<PendingEmailVerification?>(null)
        private set

    var currentNumber by mutableStateOf<AssignedNumber?>(null)
        private set

    var availableNumbers by mutableStateOf<List<AvailableNumberOption>>(emptyList())
        private set

    var conversations by mutableStateOf<List<ConversationSummary>>(emptyList())
        private set

    var currentConversation by mutableStateOf<ConversationSummary?>(null)
        private set

    var currentMessages by mutableStateOf<List<ChatMessage>>(emptyList())
        private set

    var messageAllowance by mutableStateOf<MessageAllowance?>(null)
        private set

    var callHistory by mutableStateOf<List<CallHistoryEntry>>(emptyList())
        private set

    var voicemails by mutableStateOf<List<VoicemailEntry>>(emptyList())
        private set

    var callAllowance by mutableStateOf<CallAllowance?>(null)
        private set

    var activeCallSession by mutableStateOf<ActiveCallSession?>(null)
        private set

    var monetizationStatus by mutableStateOf<SubscriptionStatusPayload?>(null)
        private set

    var pendingInterstitialAd by mutableStateOf<InterstitialAdRequest?>(null)
        private set

    var pendingRewardedAd by mutableStateOf<RewardedAdRequest?>(null)
        private set

    var usagePrompt by mutableStateOf<UsagePromptState?>(null)
        private set

    var isClaimingReward by mutableStateOf(false)
        private set

    var hasResolvedCurrentNumber by mutableStateOf(false)
        private set

    var errorMessage by mutableStateOf<String?>(null)
        private set

    var isLoading by mutableStateOf(false)
        private set

    val fingerprint: String = proofSeed?.fingerprint ?: sessionStore.getOrCreateFingerprint()

    val currentUserEmail: String
        get() = session?.user?.email ?: "Not signed in"

    private var lastInterstitialShownAt: Long? = null

    val isAuthenticated: Boolean
        get() = session != null

    val isProofMode: Boolean
        get() = proofScenario != null

    val adsEnabled: Boolean
        get() = monetizationStatus?.status?.adsEnabled ?: true

    val canUseRewardedAds: Boolean
        get() = adsEnabled && remainingRewardClaims > 0

    val currentPlanTitle: String
        get() = when (monetizationStatus?.status?.displayTier) {
            "ad_free" -> "Ad-Free"
            "lock_my_number" -> "Lock My Number"
            "premium" -> "Premium"
            "custom" -> "Custom Bundle"
            else -> "Free"
        }

    val remainingRewardClaims: Int
        get() = monetizationStatus?.rewardClaims?.remainingClaims ?: 0

    init {
        proofSeed?.let(::applyProofSeed)
    }

    val usageSummary: UsageSummary?
        get() {
            val messages = messageAllowance ?: return null
            val calls = callAllowance ?: return null

            val messageProgress = if (messages.monthlyCap == 0) {
                0f
            } else {
                messages.monthlyUsed.toFloat() / messages.monthlyCap.toFloat()
            }
            val callProgress = if (calls.monthlyCapMinutes == 0) {
                0f
            } else {
                calls.monthlyUsedMinutes.toFloat() / calls.monthlyCapMinutes.toFloat()
            }

            return UsageSummary(
                callProgress = callProgress,
                callsLabel = "${calls.monthlyUsedMinutes} of ${calls.monthlyCapMinutes} call minutes used",
                messageProgress = messageProgress,
                messagesLabel = "${messages.monthlyUsed} of ${messages.monthlyCap} texts used",
                shouldWarn = maxOf(messageProgress, callProgress) >= 0.8f,
            )
        }

    fun showWelcome() {
        authScreen = AuthScreen.Welcome
        errorMessage = null
        pendingVerification = null
    }

    fun showEmailAuth() {
        authScreen = AuthScreen.Email
        errorMessage = null
    }

    fun selectTab(tab: AppTab) {
        selectedTab = tab
    }

    fun dismissInterstitial(markShown: Boolean = true) {
        if (markShown) {
            lastInterstitialShownAt = System.currentTimeMillis()
        }
        pendingInterstitialAd = null
    }

    fun dismissUsagePrompt() {
        usagePrompt = null
    }

    fun openSubscriptionManagement() {
        selectedTab = AppTab.Settings
        usagePrompt = null
    }

    suspend fun refreshMonetizationState() {
        if (isProofMode) {
            return
        }

        val accessToken = session?.tokens?.accessToken
        if (accessToken == null) {
            monetizationStatus = null
            return
        }

        runCatching {
            monetizationApiClient.getSubscriptionStatus(accessToken)
        }.onSuccess { payload ->
            monetizationStatus = payload
            messageAllowance = payload.allowances.messages
            callAllowance = payload.allowances.calls
        }.onFailure { error ->
            if (errorMessage == null) {
                errorMessage = error.message ?: "Unable to load your plan."
            }
        }
    }

    fun beginRewardedUnlock(
        rewardType: RewardType,
        placement: String,
    ) {
        if (!adsEnabled) {
            errorMessage = "Rewarded ads are disabled on your current plan."
            return
        }

        if (remainingRewardClaims <= 0) {
            errorMessage = "No ads available right now. Try again later."
            return
        }

        usagePrompt = null
        pendingRewardedAd = RewardedAdRequest(
            placement = placement,
            rewardType = rewardType,
        )
    }

    suspend fun completeRewardedUnlock() {
        if (isProofMode) {
            pendingRewardedAd = null
            return
        }

        val accessToken = session?.tokens?.accessToken
        val rewardedRequest = pendingRewardedAd
        if (accessToken == null || rewardedRequest == null) {
            return
        }

        isClaimingReward = true

        trackAnalytics(
            eventType = "rewarded_video_complete",
            properties = mapOf(
                "adType" to "rewarded",
                "placement" to rewardedRequest.placement,
                "rewardType" to rewardedRequest.rewardType.wireName,
            ),
        )

        runCatching {
            monetizationApiClient.claimReward(accessToken, rewardedRequest.rewardType)
        }.onSuccess { payload ->
            messageAllowance = payload.messages
            callAllowance = payload.calls
            pendingRewardedAd = null
            refreshMonetizationState()
        }.onFailure { error ->
            errorMessage = error.message ?: "Unable to claim the reward."
        }

        isClaimingReward = false
    }

    suspend fun abandonRewardedUnlock() {
        if (isProofMode) {
            pendingRewardedAd = null
            return
        }

        val rewardedRequest = pendingRewardedAd ?: return

        trackAnalytics(
            eventType = "rewarded_video_abandoned",
            properties = mapOf(
                "adType" to "rewarded",
                "placement" to rewardedRequest.placement,
                "rewardType" to rewardedRequest.rewardType.wireName,
                "secondsWatched" to 0,
            ),
        )
        pendingRewardedAd = null
    }

    fun failRewardedUnlock(message: String) {
        pendingRewardedAd = null
        errorMessage = message
    }

    suspend fun verifySubscriptionPurchase(
        productId: String,
        activity: android.app.Activity,
    ) {
        if (isProofMode) {
            errorMessage = "Proof mode does not perform live purchases."
            return
        }

        val currentSession = session ?: return

        isLoading = true
        errorMessage = null

        runCatching {
            val receipt = subscriptionPurchaseManager.purchase(
                activity = activity,
                productId = productId,
                userId = currentSession.user.id,
            )
            monetizationApiClient.verifyPurchase(
                accessToken = currentSession.tokens.accessToken,
                productId = productId,
                platform = "android",
                provider = receipt.provider,
                transactionId = receipt.transactionId,
                verificationToken = receipt.verificationToken,
            )
        }.onSuccess { payload ->
            monetizationStatus = SubscriptionStatusPayload(
                allowances = payload.allowances,
                catalog = monetizationStatus?.catalog.orEmpty(),
                products = payload.status.activeProducts,
                rewardClaims = monetizationStatus?.rewardClaims ?: com.freeline.app.monetization.RewardClaimSummary(
                    callMinutesGranted = 0,
                    maxClaims = 0,
                    remainingClaims = 0,
                    textEventsGranted = 0,
                    totalClaims = 0,
                ),
                status = payload.status,
                usagePlan = monetizationStatus?.usagePlan ?: SubscriptionUsagePlan(
                    dailyCallCapMinutes = payload.allowances.calls.monthlyCapMinutes,
                    dailySmsCap = payload.allowances.messages.dailyCap,
                    description = payload.product.description,
                    monthlyCallCapMinutes = payload.allowances.calls.monthlyCapMinutes,
                    monthlySmsCap = payload.allowances.messages.monthlyCap,
                    uniqueContactsDailyCap = payload.allowances.messages.dailyCap,
                ),
            )
            messageAllowance = payload.allowances.messages
            callAllowance = payload.allowances.calls
            refreshMonetizationState()
        }.onFailure { error ->
            errorMessage = error.message ?: "Unable to verify the purchase."
        }

        isLoading = false
    }

    suspend fun trackAdImpression(
        adType: String,
        placement: String,
        adUnitId: String,
    ) {
        trackAnalytics(
            eventType = "ad_impression",
            properties = mapOf(
                "adType" to adType,
                "placement" to placement,
                "adUnitId" to adUnitId,
            ),
        )
    }

    suspend fun trackAdClick(
        adType: String,
        placement: String,
    ) {
        trackAnalytics(
            eventType = "ad_click",
            properties = mapOf(
                "adType" to adType,
                "placement" to placement,
            ),
        )
    }

    suspend fun startEmailAuth(
        email: String,
        password: String,
    ) {
        val trimmedEmail = email.trim()
        val trimmedPassword = password.trim()

        if (trimmedEmail.isEmpty() || trimmedPassword.length < 8) {
            errorMessage = "Enter a valid email and a password with at least 8 characters."
            return
        }

        isLoading = true
        errorMessage = null

        runCatching {
            authApiClient.startEmailAuth(trimmedEmail, trimmedPassword)
        }.onSuccess { result ->
            pendingVerification = result
        }.onFailure { error ->
            errorMessage = error.message ?: "Unable to start email sign-up."
        }

        isLoading = false
    }

    suspend fun verifyEmail(token: String) {
        val trimmedToken = token.trim()
        if (trimmedToken.isEmpty()) {
            errorMessage = "Enter the verification token before continuing."
            return
        }

        isLoading = true
        errorMessage = null

        runCatching {
            authApiClient.verifyEmail(trimmedToken, fingerprint)
        }.onSuccess { payload ->
            completeSignIn(payload)
        }.onFailure { error ->
            errorMessage = error.message ?: "Unable to verify email."
        }

        isLoading = false
    }

    suspend fun continueWithDevProvider(provider: DevAuthProvider) {
        isLoading = true
        errorMessage = null

        runCatching {
            authApiClient.continueWithDevProvider(provider, fingerprint)
        }.onSuccess { payload ->
            completeSignIn(payload)
        }.onFailure { error ->
            errorMessage = error.message ?: "Unable to continue with ${provider.routeName}."
        }

        isLoading = false
    }

    suspend fun loadCurrentNumber() {
        if (isProofMode) {
            hasResolvedCurrentNumber = true
            return
        }

        val accessToken = session?.tokens?.accessToken
        if (accessToken == null) {
            currentNumber = null
            resetLineState()
            monetizationStatus = null
            hasResolvedCurrentNumber = true
            return
        }

        isLoading = true
        errorMessage = null

        runCatching {
            numberApiClient.getCurrentNumber(accessToken)
        }.onSuccess { number ->
            currentNumber = number
            hasResolvedCurrentNumber = true
        }.onFailure { error ->
            currentNumber = null
            resetLineState()
            hasResolvedCurrentNumber = true
            errorMessage = error.message ?: "Unable to load your current number."
        }

        isLoading = false
        refreshMonetizationState()
    }

    suspend fun searchNumbers(areaCode: String) {
        val trimmedAreaCode = areaCode.trim()
        if (trimmedAreaCode.length != 3 || trimmedAreaCode.any { !it.isDigit() }) {
            errorMessage = "Enter a 3-digit U.S. area code."
            return
        }

        isLoading = true
        errorMessage = null

        runCatching {
            numberApiClient.searchNumbers(trimmedAreaCode)
        }.onSuccess { numbers ->
            availableNumbers = numbers
        }.onFailure { error ->
            errorMessage = error.message ?: "Unable to search numbers."
        }

        isLoading = false
    }

    suspend fun claimNumber(number: AvailableNumberOption) {
        val accessToken = session?.tokens?.accessToken
        if (accessToken == null) {
            errorMessage = "You must be signed in before claiming a number."
            return
        }

        isLoading = true
        errorMessage = null

        runCatching {
            numberApiClient.claimNumber(accessToken, number)
        }.onSuccess { assigned ->
            currentNumber = assigned
            resetLineState()
            selectedTab = AppTab.Messages
            hasResolvedCurrentNumber = true
        }.onFailure { error ->
            errorMessage = error.message ?: "Unable to claim a number."
        }

        isLoading = false
        refreshMonetizationState()
    }

    suspend fun releaseCurrentNumber() {
        val accessToken = session?.tokens?.accessToken
        if (accessToken == null) {
            errorMessage = "You must be signed in before releasing a number."
            return
        }

        isLoading = true
        errorMessage = null

        runCatching {
            numberApiClient.releaseNumber(accessToken)
        }.onSuccess {
            currentNumber = null
            resetLineState()
            hasResolvedCurrentNumber = true
        }.onFailure { error ->
            errorMessage = error.message ?: "Unable to release the number."
        }

        isLoading = false
        refreshMonetizationState()
    }

    fun signOut() {
        session = null
        pendingVerification = null
        currentNumber = null
        resetLineState()
        monetizationStatus = null
        pendingInterstitialAd = null
        pendingRewardedAd = null
        usagePrompt = null
        isClaimingReward = false
        hasResolvedCurrentNumber = false
        errorMessage = null
        authScreen = AuthScreen.Welcome
        selectedTab = AppTab.Messages
        sessionStore.clearSession()
        messageRealtimeClient.disconnect()
        voiceTransport.shutdown()
    }

    fun syncMessageRealtime() {
        if (isProofMode) {
            return
        }

        messageRealtimeClient.updateConnection(session?.tokens?.accessToken) { event ->
            mainScope.launch {
                handleMessageRealtimeEvent(event)
            }
        }
    }

    suspend fun loadConversations() {
        if (isProofMode) {
            return
        }

        val accessToken = session?.tokens?.accessToken
        if (accessToken == null) {
            errorMessage = "You must be signed in before loading messages."
            return
        }

        isLoading = true
        errorMessage = null

        runCatching {
            messageApiClient.listConversations(accessToken)
        }.onSuccess { payload ->
            conversations = payload.conversations
            messageAllowance = payload.allowance
            val selectedConversation = currentConversation
            if (selectedConversation != null) {
                currentConversation = payload.conversations.firstOrNull { it.id == selectedConversation.id }
                    ?: selectedConversation
            }
        }.onFailure { error ->
            errorMessage = error.message ?: "Unable to load conversations."
        }

        isLoading = false
    }

    suspend fun openConversation(conversation: ConversationSummary) {
        currentConversation = conversation
        loadCurrentConversationMessages(markRead = true)
    }

    fun clearCurrentConversation() {
        currentConversation = null
        currentMessages = emptyList()
    }

    suspend fun loadCurrentConversationMessages(markRead: Boolean = false) {
        val accessToken = session?.tokens?.accessToken
        val selectedConversation = currentConversation
        if (accessToken == null || selectedConversation == null) {
            return
        }

        isLoading = true
        errorMessage = null

        runCatching {
            messageApiClient.listMessages(accessToken, selectedConversation.id)
        }.onSuccess { payload ->
            currentConversation = payload.conversation
            currentMessages = payload.messages
            messageAllowance = payload.allowance
            if (markRead && payload.conversation.unreadCount > 0) {
                runCatching {
                    messageApiClient.markConversationRead(accessToken, payload.conversation.id)
                }.onSuccess { updatedConversation ->
                    currentConversation = updatedConversation
                    conversations = conversations.map { conversation ->
                        if (conversation.id == updatedConversation.id) updatedConversation else conversation
                    }
                }.onFailure { error ->
                    errorMessage = error.message ?: "Unable to mark the conversation as read."
                }
            }
        }.onFailure { error ->
            errorMessage = error.message ?: "Unable to load messages."
        }

        isLoading = false
    }

    suspend fun sendMessage(
        rawRecipient: String,
        rawBody: String,
    ): ConversationSummary? {
        if (isProofMode) {
            errorMessage = "Proof mode does not send live messages."
            return null
        }

        val accessToken = session?.tokens?.accessToken
        if (accessToken == null) {
            errorMessage = "You must be signed in before sending messages."
            return null
        }

        val recipient = normalizeUsPhoneNumber(rawRecipient)
        if (recipient == null) {
            errorMessage = "Enter a valid U.S. phone number."
            return null
        }

        val body = rawBody.trim()
        if (body.isEmpty()) {
            errorMessage = "Enter a message before sending."
            return null
        }

        isLoading = true
        errorMessage = null

        var resultConversation: ConversationSummary? = null

        runCatching {
            messageApiClient.sendMessage(
                accessToken = accessToken,
                to = recipient,
                body = body,
            )
        }.onSuccess { payload ->
            messageAllowance = payload.allowance
            usagePrompt = null
            resultConversation = payload.conversation

            if (currentConversation?.id == payload.conversation.id) {
                currentConversation = payload.conversation
                currentMessages = currentMessages + payload.message
            } else {
                currentConversation = payload.conversation
                currentMessages = listOf(payload.message)
            }
        }.onFailure { error ->
            errorMessage = error.message ?: "Unable to send the message."
            if (error is MonetizationApiException && error.upgradePrompt != null) {
                usagePrompt = UsagePromptState(
                    message = error.upgradePrompt,
                    rewardType = RewardType.TextEvents,
                )
            }
        }

        if (resultConversation != null) {
            runCatching {
                messageApiClient.listConversations(accessToken)
            }.onSuccess { payload ->
                conversations = payload.conversations
                messageAllowance = payload.allowance
            }.onFailure { error ->
                errorMessage = error.message ?: "Unable to refresh conversations."
            }
        }

        isLoading = false
        return resultConversation
    }

    suspend fun blockCurrentConversation(): Boolean {
        val accessToken = session?.tokens?.accessToken
        val selectedConversation = currentConversation
        if (accessToken == null || selectedConversation == null) {
            errorMessage = "Open a conversation before blocking it."
            return false
        }

        isLoading = true
        errorMessage = null

        var blocked = false

        runCatching {
            messageApiClient.blockNumber(accessToken, selectedConversation.participantNumber)
        }.onSuccess {
            blocked = true
            loadConversations()
        }.onFailure { error ->
            errorMessage = error.message ?: "Unable to block this number."
        }

        isLoading = false
        return blocked
    }

    suspend fun reportCurrentConversation(reason: String = "spam"): Boolean {
        val accessToken = session?.tokens?.accessToken
        val selectedConversation = currentConversation
        if (accessToken == null || selectedConversation == null) {
            errorMessage = "Open a conversation before reporting it."
            return false
        }

        isLoading = true
        errorMessage = null

        var reported = false

        runCatching {
            messageApiClient.reportNumber(
                accessToken = accessToken,
                number = selectedConversation.participantNumber,
                reason = reason,
            )
        }.onSuccess {
            reported = true
        }.onFailure { error ->
            errorMessage = error.message ?: "Unable to report this number."
        }

        isLoading = false
        return reported
    }

    suspend fun loadCallHistory() {
        if (isProofMode) {
            return
        }

        val accessToken = session?.tokens?.accessToken
        if (accessToken == null) {
            errorMessage = "You must be signed in before loading calls."
            return
        }

        isLoading = true
        errorMessage = null

        runCatching {
            callApiClient.listCallHistory(accessToken)
        }.onSuccess { payload ->
            callHistory = payload.calls
            callAllowance = payload.allowance
        }.onFailure { error ->
            errorMessage = error.message ?: "Unable to load call history."
        }

        isLoading = false
    }

    suspend fun loadVoicemails() {
        if (isProofMode) {
            return
        }

        val accessToken = session?.tokens?.accessToken
        if (accessToken == null) {
            errorMessage = "You must be signed in before loading voicemails."
            return
        }

        isLoading = true
        errorMessage = null

        runCatching {
            callApiClient.listVoicemails(accessToken)
        }.onSuccess { payload ->
            voicemails = payload.voicemails
        }.onFailure { error ->
            errorMessage = error.message ?: "Unable to load voicemails."
        }

        isLoading = false
    }

    suspend fun markVoicemailRead(voicemail: VoicemailEntry) {
        val accessToken = session?.tokens?.accessToken
        if (accessToken == null) {
            errorMessage = "You must be signed in before reading voicemails."
            return
        }

        runCatching {
            callApiClient.markVoicemailRead(accessToken, voicemail.id)
        }.onSuccess { payload ->
            voicemails = voicemails.map { existing ->
                if (existing.id == payload.voicemail.id) payload.voicemail else existing
            }
        }.onFailure { error ->
            errorMessage = error.message ?: "Unable to mark the voicemail as read."
        }
    }

    suspend fun deleteVoicemail(voicemail: VoicemailEntry): Boolean {
        val accessToken = session?.tokens?.accessToken
        if (accessToken == null) {
            errorMessage = "You must be signed in before deleting voicemails."
            return false
        }

        return runCatching {
            callApiClient.deleteVoicemail(accessToken, voicemail.id)
        }.map {
            voicemails = voicemails.filterNot { existing -> existing.id == voicemail.id }
            true
        }.getOrElse { error ->
            errorMessage = error.message ?: "Unable to delete the voicemail."
            false
        }
    }

    suspend fun registerCallPushToken(channel: String, token: String) {
        if (isProofMode) {
            return
        }

        val accessToken = session?.tokens?.accessToken ?: return

        runCatching {
            callApiClient.registerCallPushToken(
                accessToken = accessToken,
                channel = channel,
                deviceId = fingerprint,
                platform = "android",
                token = token,
            )
        }.onFailure { error ->
            errorMessage = error.message ?: "Unable to register the call push token."
        }
    }

    suspend fun registerVoipToken(token: String) {
        if (isProofMode) {
            return
        }

        val accessToken = session?.tokens?.accessToken ?: return

        runCatching {
            callApiClient.registerVoipToken(
                accessToken = accessToken,
                deviceId = fingerprint,
                platform = "android",
                token = token,
            )
        }.onFailure { error ->
            errorMessage = error.message ?: "Unable to register the VoIP token."
        }
    }

    suspend fun startOutgoingCall(rawNumber: String): Boolean {
        if (isProofMode) {
            errorMessage = "Proof mode does not place live calls."
            return false
        }

        val accessToken = session?.tokens?.accessToken
        if (accessToken == null) {
            errorMessage = "You must be signed in before making calls."
            return false
        }

        val normalizedNumber = normalizeDialableUsPhoneNumber(rawNumber)
        if (normalizedNumber == null) {
            errorMessage = "Enter a valid U.S. phone number."
            return false
        }

        isLoading = true
        errorMessage = null

        var didStart = false

        runCatching {
            callApiClient.requestVoiceToken(accessToken)
        }.onSuccess { payload ->
            callAllowance = payload.allowance
            usagePrompt = null
            activeCallSession = ActiveCallSession(
                fromNumber = payload.fromNumber,
                identity = payload.identity,
                remoteNumber = normalizedNumber,
                startedAtEpochMillis = System.currentTimeMillis(),
                token = payload.token,
                connectedAtEpochMillis = null,
                isMuted = false,
                isSpeakerOn = false,
                statusText = "Connecting",
            )
            runCatching {
                voiceTransport.startOutgoingCall(
                    token = payload.token,
                    to = normalizedNumber,
                ) { event ->
                    handleVoiceCallEvent(event)
                }
            }.onSuccess {
                didStart = true
            }.onFailure { error ->
                activeCallSession = null
                errorMessage = error.message ?: "Unable to start the call."
            }
        }.onFailure { error ->
            activeCallSession = null
            errorMessage = error.message ?: "Unable to start the call."
            if (error is MonetizationApiException && error.upgradePrompt != null) {
                usagePrompt = UsagePromptState(
                    message = error.upgradePrompt,
                    rewardType = RewardType.CallMinutes,
                )
            }
        }

        isLoading = false
        return didStart
    }

    suspend fun endActiveCall() {
        voiceTransport.endActiveCall()
        activeCallSession = null
        loadCallHistory()
        queueInterstitialIfEligible()
    }

    fun toggleMuteActiveCall() {
        val session = activeCallSession ?: return
        val nextState = !session.isMuted
        voiceTransport.setMuted(nextState)
        activeCallSession = session.copy(isMuted = nextState)
    }

    fun toggleSpeakerActiveCall() {
        val session = activeCallSession ?: return
        val nextState = !session.isSpeakerOn
        voiceTransport.setSpeakerEnabled(nextState)
        activeCallSession = session.copy(isSpeakerOn = nextState)
    }

    fun sendDigitsToActiveCall(digits: String) {
        voiceTransport.sendDigits(digits)
    }

    private suspend fun completeSignIn(payload: AuthSessionPayload) {
        session = payload
        pendingVerification = null
        currentNumber = null
        resetLineState()
        monetizationStatus = null
        pendingInterstitialAd = null
        pendingRewardedAd = null
        usagePrompt = null
        isClaimingReward = false
        selectedTab = AppTab.Messages
        hasResolvedCurrentNumber = false
        authScreen = AuthScreen.Welcome
        errorMessage = null
        sessionStore.saveSession(payload)
        loadCurrentNumber()
    }

    private fun handleVoiceCallEvent(event: VoiceCallEvent) {
        when (event) {
            VoiceCallEvent.Connecting -> {
                updateActiveCallSession { session ->
                    session.copy(statusText = "Connecting")
                }
            }
            VoiceCallEvent.Ringing -> {
                updateActiveCallSession { session ->
                    session.copy(statusText = "Ringing")
                }
            }
            is VoiceCallEvent.Connected -> {
                updateActiveCallSession { session ->
                    session.copy(
                        connectedAtEpochMillis = event.connectedAtEpochMillis,
                        isSpeakerOn = true,
                        statusText = "Connected",
                    )
                }
            }
            is VoiceCallEvent.Reconnecting -> {
                updateActiveCallSession { session ->
                    session.copy(
                        statusText = if (event.message.isBlank()) "Reconnecting" else "Reconnecting: ${event.message}",
                    )
                }
            }
            VoiceCallEvent.Reconnected -> {
                updateActiveCallSession { session ->
                    session.copy(statusText = "Connected")
                }
            }
            is VoiceCallEvent.Failed -> {
                activeCallSession = null
                errorMessage = event.message
                queueInterstitialIfEligible()
                mainScope.launch { loadCallHistory() }
            }
            is VoiceCallEvent.Disconnected -> {
                activeCallSession = null
                if (!event.message.isNullOrBlank()) {
                    errorMessage = event.message
                }
                queueInterstitialIfEligible()
                mainScope.launch { loadCallHistory() }
            }
        }
    }

    private fun queueInterstitialIfEligible() {
        if (!adsEnabled) {
            return
        }

        if (pendingInterstitialAd != null) {
            return
        }

        val lastShownAt = lastInterstitialShownAt
        if (lastShownAt != null && System.currentTimeMillis() - lastShownAt < 30 * 60 * 1000L) {
            return
        }

        pendingInterstitialAd = InterstitialAdRequest(placement = "post_call")
    }

    private fun resetLineState() {
        availableNumbers = emptyList()
        conversations = emptyList()
        currentConversation = null
        currentMessages = emptyList()
        messageAllowance = null
        callHistory = emptyList()
        voicemails = emptyList()
        callAllowance = null
        activeCallSession = null
    }

    private suspend fun handleMessageRealtimeEvent(event: MessageRealtimeEvent) {
        val conversation = event.conversation ?: return
        val message = event.message ?: return

        conversations = upsertConversation(conversation, conversations)

        if (currentConversation?.id != conversation.id) {
            return
        }

        currentConversation = conversation
        currentMessages = upsertMessage(message, currentMessages)

        if (event.type != MessageRealtimeEventType.MessageInbound) {
            return
        }

        val accessToken = session?.tokens?.accessToken ?: return
        runCatching {
            messageApiClient.markConversationRead(accessToken, conversation.id)
        }.onSuccess { updatedConversation ->
            currentConversation = updatedConversation
            conversations = upsertConversation(updatedConversation, conversations)
        }.onFailure { error ->
            errorMessage = error.message ?: "Unable to mark the conversation as read."
        }
    }

    private fun upsertConversation(
        conversation: ConversationSummary,
        existing: List<ConversationSummary>,
    ): List<ConversationSummary> = (existing.filter { it.id != conversation.id } + conversation).sortedWith(
        compareByDescending<ConversationSummary> { it.updatedAt }.thenBy { it.id },
    )

    private fun upsertMessage(
        message: ChatMessage,
        existing: List<ChatMessage>,
    ): List<ChatMessage> = (existing.filter { it.id != message.id } + message).sortedWith(
        compareBy<ChatMessage> { it.createdAt }.thenBy { it.id },
    )

    private suspend fun trackAnalytics(
        eventType: String,
        properties: Map<String, Any>,
    ) {
        if (isProofMode) {
            return
        }

        val accessToken = session?.tokens?.accessToken ?: return

        runCatching {
            monetizationApiClient.trackEvent(
                accessToken = accessToken,
                eventType = eventType,
                properties = properties,
            )
        }
    }

    private fun updateActiveCallSession(
        update: (ActiveCallSession) -> ActiveCallSession,
    ) {
        val session = activeCallSession ?: return
        activeCallSession = update(session)
    }

    private fun applyProofSeed(seed: Phase5ProofSeed) {
        authScreen = AuthScreen.Welcome
        session = seed.session
        currentNumber = seed.currentNumber
        availableNumbers = emptyList()
        conversations = seed.conversations
        currentConversation = seed.currentConversation
        currentMessages = seed.currentMessages
        messageAllowance = seed.messageAllowance
        callHistory = seed.callHistory
        voicemails = seed.voicemails
        callAllowance = seed.callAllowance
        monetizationStatus = seed.monetizationStatus
        pendingInterstitialAd = seed.pendingInterstitialAd
        pendingRewardedAd = seed.pendingRewardedAd
        usagePrompt = seed.usagePrompt
        errorMessage = seed.errorMessage
        hasResolvedCurrentNumber = true
        selectedTab = seed.selectedTab
        isClaimingReward = false
        isLoading = false
    }
}

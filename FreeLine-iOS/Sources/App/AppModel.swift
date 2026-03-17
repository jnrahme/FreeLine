import Foundation

@MainActor
final class AppModel: ObservableObject {
    @Published var authScreen: AuthScreen = .welcome
    @Published var selectedTab: AppTab = .messages
    @Published private(set) var session: AuthSessionPayload?
    @Published private(set) var pendingVerification: PendingEmailVerification?
    @Published private(set) var currentNumber: AssignedNumber?
    @Published private(set) var availableNumbers: [AvailableNumberOption] = []
    @Published private(set) var conversations: [ConversationSummary] = []
    @Published private(set) var currentConversation: ConversationSummary?
    @Published private(set) var currentMessages: [ChatMessage] = []
    @Published private(set) var messageAllowance: MessageAllowance?
    @Published private(set) var callHistory: [CallHistoryEntry] = []
    @Published private(set) var voicemails: [VoicemailEntry] = []
    @Published private(set) var callAllowance: CallAllowance?
    @Published private(set) var activeCallSession: ActiveCallSession?
    @Published private(set) var monetizationStatus: SubscriptionStatusPayload?
    @Published private(set) var pendingInterstitialAd: InterstitialAdRequest?
    @Published private(set) var pendingRewardedAd: RewardedAdRequest?
    @Published private(set) var usagePrompt: UsagePromptState?
    @Published var isPresentingMessageComposer = false
    @Published var composerRecipientDraft = ""
    @Published var composerBodyDraft = ""
    @Published private(set) var isClaimingReward = false
    @Published private(set) var hasResolvedCurrentNumber = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var isLoading = false

    private let analyticsClient: AnalyticsClient
    private let authClient: AuthClient
    private let callClient: CallClient
    private let messageClient: MessageClient
    private let messageRealtimeClient: MessageRealtimeClient
    private let numberClient: NumberClient
    private let rewardClient: RewardClient
    private let subscriptionClient: SubscriptionClient
    private let subscriptionPurchaseManager: SubscriptionPurchaseManager
    private let voiceTransport: TwilioVoiceTransport
    private let proofScenario: Phase5ProofScenario?
    private let keychain = KeychainStore(service: "com.freeline.ios")
    private let sessionAccount = "auth-session"
    private let fingerprintAccount = "device-fingerprint"
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private var lastInterstitialShownAt: Date?
    private var pendingConversationRouteId: String?
    private var proofMessageThreads: [String: [ChatMessage]] = [:]
    private var proofRealtimeTasks: [Task<Void, Never>] = []
    private var proofAutomationTasks: [Task<Void, Never>] = []

    private(set) var fingerprint: String

    init(
        analyticsClient: AnalyticsClient = AnalyticsClient(),
        authClient: AuthClient = AuthClient(),
        callClient: CallClient = CallClient(),
        messageClient: MessageClient = MessageClient(),
        messageRealtimeClient: MessageRealtimeClient = MessageRealtimeClient(),
        numberClient: NumberClient = NumberClient(),
        rewardClient: RewardClient = RewardClient(),
        subscriptionClient: SubscriptionClient = SubscriptionClient(),
        subscriptionPurchaseManager: SubscriptionPurchaseManager = SubscriptionPurchaseManager(),
        voiceTransport: TwilioVoiceTransport = TwilioVoiceTransport(),
        proofScenario: Phase5ProofScenario? = Phase5ProofScenario.current()
    ) {
        self.analyticsClient = analyticsClient
        self.authClient = authClient
        self.callClient = callClient
        self.messageClient = messageClient
        self.messageRealtimeClient = messageRealtimeClient
        self.numberClient = numberClient
        self.rewardClient = rewardClient
        self.subscriptionClient = subscriptionClient
        self.subscriptionPurchaseManager = subscriptionPurchaseManager
        self.voiceTransport = voiceTransport
        self.proofScenario = proofScenario
        self.fingerprint = "ios-device"
        self.session = nil

        if let proofScenario {
            let seed = proofScenario.seed
            self.fingerprint = seed.fingerprint
            self.session = seed.session
            applyProofSeed(seed)
        } else {
            self.fingerprint = loadOrCreateFingerprint()
            self.session = loadStoredSession()
        }
    }

    var isAuthenticated: Bool {
        session != nil
    }

    var isProofMode: Bool {
        proofScenario != nil
    }

    var currentUserEmail: String {
        session?.user.email ?? "Not signed in"
    }

    var adsEnabled: Bool {
        monetizationStatus?.status.adsEnabled ?? true
    }

    var canUseRewardedAds: Bool {
        adsEnabled && (monetizationStatus?.rewardClaims.remainingClaims ?? 0) > 0
    }

    var currentPlanTitle: String {
        switch monetizationStatus?.status.displayTier {
        case "ad_free":
            return "Ad-Free"
        case "lock_my_number":
            return "Lock My Number"
        case "premium":
            return "Premium"
        case "custom":
            return "Custom Bundle"
        default:
            return "Free"
        }
    }

    var remainingRewardClaims: Int {
        monetizationStatus?.rewardClaims.remainingClaims ?? 0
    }

    var usageSummary: UsageSummary? {
        guard let messageAllowance, let callAllowance else {
            return nil
        }

        let messageProgress = messageAllowance.monthlyCap == 0
            ? 0
            : Double(messageAllowance.monthlyUsed) / Double(messageAllowance.monthlyCap)
        let callProgress = callAllowance.monthlyCapMinutes == 0
            ? 0
            : Double(callAllowance.monthlyUsedMinutes) / Double(callAllowance.monthlyCapMinutes)

        return UsageSummary(
            callProgress: callProgress,
            callsLabel: "\(callAllowance.monthlyUsedMinutes) of \(callAllowance.monthlyCapMinutes) call minutes used",
            messageProgress: messageProgress,
            messagesLabel: "\(messageAllowance.monthlyUsed) of \(messageAllowance.monthlyCap) texts used",
            shouldWarn: max(messageProgress, callProgress) >= 0.8
        )
    }

    func showWelcome() {
        authScreen = .welcome
        clearTransientState()
    }

    func showEmailAuth() {
        authScreen = .email
        errorMessage = nil
    }

    func startEmailAuth(email: String, password: String) async {
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedPassword = password.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmedEmail.isEmpty, trimmedPassword.count >= 8 else {
            errorMessage = "Enter a valid email and a password with at least 8 characters."
            return
        }

        isLoading = true
        errorMessage = nil

        defer {
            isLoading = false
        }

        do {
            pendingVerification = try await authClient.startEmailAuth(
                email: trimmedEmail,
                password: trimmedPassword
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func verifyEmail(token: String) async {
        let trimmedToken = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedToken.isEmpty else {
            errorMessage = "Enter the verification token before continuing."
            return
        }

        isLoading = true
        errorMessage = nil

        defer {
            isLoading = false
        }

        do {
            let payload = try await authClient.verifyEmail(
                token: trimmedToken,
                fingerprint: fingerprint
            )
            try await completeAuthenticatedSession(payload)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func continueWithDevProvider(_ provider: DevAuthProvider) async {
        isLoading = true
        errorMessage = nil

        defer {
            isLoading = false
        }

        do {
            let payload = try await authClient.continueWithDevProvider(
                provider,
                fingerprint: fingerprint
            )
            try await completeAuthenticatedSession(payload)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadCurrentNumber() async {
        guard !isProofMode else {
            hasResolvedCurrentNumber = true
            await processPendingConversationRouteIfNeeded()
            return
        }

        guard let accessToken = session?.tokens.accessToken else {
            currentNumber = nil
            resetLineState()
            monetizationStatus = nil
            hasResolvedCurrentNumber = true
            return
        }

        isLoading = true
        errorMessage = nil

        defer {
            isLoading = false
        }

        do {
            currentNumber = try await numberClient.getCurrentNumber(accessToken: accessToken)
            hasResolvedCurrentNumber = true
            await refreshMonetizationState()
            await processPendingConversationRouteIfNeeded()
        } catch {
            currentNumber = nil
            callHistory = []
            voicemails = []
            callAllowance = nil
            activeCallSession = nil
            hasResolvedCurrentNumber = true
            errorMessage = error.localizedDescription
            await refreshMonetizationState()
        }
    }

    func syncMessageRealtime() async {
        guard !isProofMode else {
            return
        }

        await messageRealtimeClient.updateConnection(accessToken: session?.tokens.accessToken) {
            [weak self] event in
            guard let self else {
                return
            }

            await self.handleMessageRealtimeEvent(event)
        }
    }

    func handleMessageRoute(_ route: MessageRoute) async {
        pendingConversationRouteId = route.conversationId
        selectedTab = .messages
        await processPendingConversationRouteIfNeeded()
    }

    func searchNumbers(areaCode: String) async {
        let trimmedAreaCode = areaCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmedAreaCode.count == 3, trimmedAreaCode.allSatisfy(\.isNumber) else {
            errorMessage = "Enter a 3-digit U.S. area code."
            return
        }

        isLoading = true
        errorMessage = nil

        defer {
            isLoading = false
        }

        do {
            availableNumbers = try await numberClient.searchNumbers(areaCode: trimmedAreaCode)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func showMessageComposer(
        prefillRecipient: String = "",
        prefillBody: String = ""
    ) {
        selectedTab = .messages
        currentConversation = nil
        currentMessages = []
        composerRecipientDraft = prefillRecipient
        composerBodyDraft = prefillBody
        isPresentingMessageComposer = true
    }

    func dismissMessageComposer(resetDrafts: Bool = true) {
        isPresentingMessageComposer = false
        if resetDrafts {
            composerRecipientDraft = ""
            composerBodyDraft = ""
        }
    }

    func claimNumber(_ number: AvailableNumberOption) async {
        guard let accessToken = session?.tokens.accessToken else {
            errorMessage = "You must be signed in before claiming a number."
            return
        }

        isLoading = true
        errorMessage = nil

        defer {
            isLoading = false
        }

        do {
            let assignedNumber = try await numberClient.claimNumber(
                accessToken: accessToken,
                number: number
            )
            resetLineState()
            currentNumber = assignedNumber
            selectedTab = .messages
            hasResolvedCurrentNumber = true
            await refreshMonetizationState()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func releaseCurrentNumber() async {
        guard let accessToken = session?.tokens.accessToken else {
            errorMessage = "You must be signed in before releasing a number."
            return
        }

        isLoading = true
        errorMessage = nil

        defer {
            isLoading = false
        }

        do {
            _ = try await numberClient.releaseNumber(accessToken: accessToken)
            currentNumber = nil
            resetLineState()
            hasResolvedCurrentNumber = true
            await refreshMonetizationState()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadConversations() async {
        guard !isProofMode else {
            return
        }

        guard let accessToken = session?.tokens.accessToken else {
            errorMessage = "You must be signed in before loading messages."
            return
        }

        isLoading = true
        errorMessage = nil

        defer {
            isLoading = false
        }

        do {
            let payload = try await messageClient.listConversations(accessToken: accessToken)
            conversations = payload.conversations
            messageAllowance = payload.allowance
            if
                let selectedConversation = currentConversation,
                let refreshedConversation = payload.conversations.first(where: { $0.id == selectedConversation.id })
            {
                currentConversation = refreshedConversation
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func presentConversation(_ conversation: ConversationSummary) {
        selectedTab = .messages
        currentConversation = conversation
    }

    func openConversation(_ conversation: ConversationSummary) async {
        if isProofMode {
            selectedTab = .messages
            openProofConversation(conversationId: conversation.id, markRead: true)
            return
        }

        currentConversation = conversation
        await loadCurrentConversationMessages(markRead: true)
    }

    func clearCurrentConversation() {
        currentConversation = nil
        currentMessages = []
    }

    func loadCurrentConversationMessages(markRead: Bool = false) async {
        if isProofMode {
            guard let currentConversation else {
                return
            }

            openProofConversation(
                conversationId: currentConversation.id,
                markRead: markRead
            )
            return
        }

        guard
            let accessToken = session?.tokens.accessToken,
            let currentConversation
        else {
            return
        }

        isLoading = true
        errorMessage = nil

        defer {
            isLoading = false
        }

        do {
            let payload = try await messageClient.listMessages(
                accessToken: accessToken,
                conversationId: currentConversation.id
            )
            self.currentConversation = payload.conversation
            currentMessages = payload.messages
            messageAllowance = payload.allowance
            if markRead, payload.conversation.unreadCount > 0 {
                try await markConversationRead(
                    accessToken: accessToken,
                    conversationId: payload.conversation.id
                )
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func blockCurrentConversation() async -> Bool {
        guard
            let accessToken = session?.tokens.accessToken,
            let conversation = currentConversation
        else {
            errorMessage = "Open a conversation before blocking it."
            return false
        }

        isLoading = true
        errorMessage = nil

        defer {
            isLoading = false
        }

        do {
            _ = try await messageClient.blockNumber(
                accessToken: accessToken,
                number: conversation.participantNumber
            )
            await loadConversations()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func reportCurrentConversation(reason: String = "spam") async -> Bool {
        guard
            let accessToken = session?.tokens.accessToken,
            let conversation = currentConversation
        else {
            errorMessage = "Open a conversation before reporting it."
            return false
        }

        isLoading = true
        errorMessage = nil

        defer {
            isLoading = false
        }

        do {
            _ = try await messageClient.reportNumber(
                accessToken: accessToken,
                number: conversation.participantNumber,
                reason: reason
            )
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func loadCallHistory() async {
        guard !isProofMode else {
            return
        }

        guard let accessToken = session?.tokens.accessToken else {
            errorMessage = "You must be signed in before loading calls."
            return
        }

        isLoading = true
        errorMessage = nil

        defer {
            isLoading = false
        }

        do {
            let payload = try await callClient.listCallHistory(accessToken: accessToken)
            callHistory = payload.calls
            callAllowance = payload.allowance
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadVoicemails() async {
        guard !isProofMode else {
            return
        }

        guard let accessToken = session?.tokens.accessToken else {
            errorMessage = "You must be signed in before loading voicemails."
            return
        }

        isLoading = true
        errorMessage = nil

        defer {
            isLoading = false
        }

        do {
            let payload = try await callClient.listVoicemails(accessToken: accessToken)
            voicemails = payload.voicemails
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func markVoicemailRead(_ voicemail: VoicemailEntry) async {
        guard let accessToken = session?.tokens.accessToken else {
            errorMessage = "You must be signed in before reading voicemails."
            return
        }

        do {
            let payload = try await callClient.markVoicemailRead(
                accessToken: accessToken,
                voicemailId: voicemail.id
            )
            voicemails = voicemails.map { existing in
                existing.id == payload.voicemail.id ? payload.voicemail : existing
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteVoicemail(_ voicemail: VoicemailEntry) async -> Bool {
        guard let accessToken = session?.tokens.accessToken else {
            errorMessage = "You must be signed in before deleting voicemails."
            return false
        }

        do {
            try await callClient.deleteVoicemail(
                accessToken: accessToken,
                voicemailId: voicemail.id
            )
            voicemails.removeAll { $0.id == voicemail.id }
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func registerCallPushToken(channel: String, token: String) async {
        guard !isProofMode else {
            return
        }

        guard let accessToken = session?.tokens.accessToken else {
            return
        }

        do {
            _ = try await callClient.registerCallPushToken(
                accessToken: accessToken,
                channel: channel,
                deviceId: fingerprint,
                platform: "ios",
                token: token
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func registerMessagePushToken(_ token: String) async {
        guard !isProofMode else {
            return
        }

        guard let accessToken = session?.tokens.accessToken else {
            return
        }

        do {
            try await messageClient.registerPushToken(
                accessToken: accessToken,
                deviceId: fingerprint,
                platform: "ios",
                token: token
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func registerVoipToken(_ token: String) async {
        guard !isProofMode else {
            return
        }

        guard let accessToken = session?.tokens.accessToken else {
            return
        }

        do {
            _ = try await callClient.registerVoipToken(
                accessToken: accessToken,
                deviceId: fingerprint,
                platform: "ios",
                token: token
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func startOutgoingCall(to rawNumber: String) async -> Bool {
        guard !isProofMode else {
            errorMessage = "Proof mode does not place live calls."
            return false
        }

        guard let accessToken = session?.tokens.accessToken else {
            errorMessage = "You must be signed in before making calls."
            return false
        }

        guard let normalizedNumber = normalizeDialableUSPhoneNumber(rawNumber) else {
            errorMessage = "Enter a valid U.S. phone number."
            return false
        }

        isLoading = true
        errorMessage = nil

        defer {
            isLoading = false
        }

        do {
            let payload = try await callClient.requestVoiceToken(accessToken: accessToken)
            callAllowance = payload.allowance
            usagePrompt = nil
            activeCallSession = ActiveCallSession(
                fromNumber: payload.fromNumber,
                identity: payload.identity,
                remoteNumber: normalizedNumber,
                startedAt: Date(),
                token: payload.token,
                connectedAt: nil,
                isMuted: false,
                isSpeakerOn: false,
                statusText: "Connecting"
            )
            try await voiceTransport.startOutgoingCall(
                token: payload.token,
                to: normalizedNumber
            ) { [weak self] event in
                Task { @MainActor in
                    await self?.handleVoiceCallEvent(event)
                }
            }
            return true
        } catch let CallClientError.server(serverError) {
            activeCallSession = nil
            errorMessage = serverError.message
            if serverError.upgradePrompt != nil {
                usagePrompt = UsagePromptState(
                    message: serverError.upgradePrompt ?? serverError.message,
                    rewardType: .callMinutes
                )
            }
            return false
        } catch {
            activeCallSession = nil
            errorMessage = error.localizedDescription
            return false
        }
    }

    func endActiveCall() async {
        voiceTransport.endActiveCall()
        activeCallSession = nil
        await loadCallHistory()
        queueInterstitialIfEligible()
    }

    func toggleMuteActiveCall() {
        guard var session = activeCallSession else {
            return
        }

        session.isMuted.toggle()
        voiceTransport.setMuted(session.isMuted)
        activeCallSession = session
    }

    func toggleSpeakerActiveCall() {
        guard var session = activeCallSession else {
            return
        }

        session.isSpeakerOn.toggle()
        voiceTransport.setSpeakerEnabled(session.isSpeakerOn)
        activeCallSession = session
    }

    func sendDigitsToActiveCall(_ digits: String) {
        voiceTransport.sendDigits(digits)
    }

    func sendMessage(to rawRecipient: String, body rawBody: String) async -> ConversationSummary? {
        if isProofMode {
            return sendProofMessage(to: rawRecipient, body: rawBody)
        }

        guard let accessToken = session?.tokens.accessToken else {
            errorMessage = "You must be signed in before sending messages."
            return nil
        }

        guard let normalizedRecipient = Self.normalizeUSPhoneNumber(rawRecipient) else {
            errorMessage = "Enter a valid U.S. phone number."
            return nil
        }

        let trimmedBody = rawBody.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedBody.isEmpty else {
            errorMessage = "Enter a message before sending."
            return nil
        }

        isLoading = true
        errorMessage = nil

        defer {
            isLoading = false
        }

        do {
            let payload = try await messageClient.sendMessage(
                accessToken: accessToken,
                to: normalizedRecipient,
                body: trimmedBody
            )

            messageAllowance = payload.allowance
            usagePrompt = nil
            let conversation = payload.conversation

            if currentConversation?.id == conversation.id {
                currentConversation = conversation
                currentMessages.append(payload.message)
            } else {
                currentConversation = conversation
                currentMessages = [payload.message]
            }

            let refreshed = try await messageClient.listConversations(accessToken: accessToken)
            conversations = refreshed.conversations
            messageAllowance = refreshed.allowance
            return conversation
        } catch let MessageClientError.server(serverError) {
            errorMessage = serverError.message
            if serverError.upgradePrompt != nil {
                usagePrompt = UsagePromptState(
                    message: serverError.upgradePrompt ?? serverError.message,
                    rewardType: .textEvents
                )
            }
            return nil
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func dismissInterstitial(markShown: Bool = true) {
        if markShown {
            lastInterstitialShownAt = Date()
        }
        pendingInterstitialAd = nil
    }

    func dismissUsagePrompt() {
        usagePrompt = nil
    }

    func openSubscriptionManagement() {
        selectedTab = .settings
        usagePrompt = nil
    }

    func refreshMonetizationState() async {
        guard !isProofMode else {
            return
        }

        guard let accessToken = session?.tokens.accessToken else {
            monetizationStatus = nil
            return
        }

        do {
            let payload = try await subscriptionClient.getStatus(accessToken: accessToken)
            monetizationStatus = payload
            messageAllowance = payload.allowances.messages
            callAllowance = payload.allowances.calls
        } catch {
            if errorMessage == nil {
                errorMessage = error.localizedDescription
            }
        }
    }

    func beginRewardedUnlock(_ rewardType: RewardType, placement: String) {
        guard adsEnabled else {
            errorMessage = "Rewarded ads are disabled on your current plan."
            return
        }

        guard remainingRewardClaims > 0 else {
            errorMessage = "No ads available right now. Try again later."
            return
        }

        usagePrompt = nil
        pendingRewardedAd = RewardedAdRequest(
            placement: placement,
            rewardType: rewardType
        )
    }

    func completeRewardedUnlock() async {
        if isProofMode {
            self.pendingRewardedAd = nil
            return
        }

        guard
            let accessToken = session?.tokens.accessToken,
            let pendingRewardedAd
        else {
            return
        }

        isClaimingReward = true
        defer {
            isClaimingReward = false
        }

        await trackAnalytics(
            eventType: "rewarded_video_complete",
            properties: [
                "adType": "rewarded",
                "placement": pendingRewardedAd.placement,
                "rewardType": pendingRewardedAd.rewardType.rawValue
            ]
        )

        do {
            let payload = try await rewardClient.claimReward(
                accessToken: accessToken,
                rewardType: pendingRewardedAd.rewardType
            )
            messageAllowance = payload.messages
            callAllowance = payload.calls
            self.pendingRewardedAd = nil
            await refreshMonetizationState()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func abandonRewardedUnlock() async {
        if isProofMode {
            self.pendingRewardedAd = nil
            return
        }

        guard let pendingRewardedAd else {
            return
        }

        await trackAnalytics(
            eventType: "rewarded_video_abandoned",
            properties: [
                "adType": "rewarded",
                "placement": pendingRewardedAd.placement,
                "rewardType": pendingRewardedAd.rewardType.rawValue,
                "secondsWatched": "0"
            ]
        )
        self.pendingRewardedAd = nil
    }

    func failRewardedUnlock(_ message: String) {
        pendingRewardedAd = nil
        errorMessage = message
    }

    func verifySubscriptionPurchase(productId: String) async {
        guard !isProofMode else {
            errorMessage = "Proof mode does not perform live purchases."
            return
        }

        guard let session else {
            return
        }

        isLoading = true
        errorMessage = nil

        defer {
            isLoading = false
        }

        do {
            let receipt = try await subscriptionPurchaseManager.purchase(
                productId: productId,
                userId: session.user.id
            )
            let payload = try await subscriptionClient.verifyPurchase(
                accessToken: session.tokens.accessToken,
                productId: productId,
                platform: "ios",
                provider: receipt.provider,
                transactionId: receipt.transactionId,
                verificationToken: receipt.verificationToken
            )
            monetizationStatus = SubscriptionStatusPayload(
                allowances: payload.allowances,
                catalog: monetizationStatus?.catalog ?? [],
                products: payload.status.activeProducts,
                rewardClaims: monetizationStatus?.rewardClaims ?? RewardClaimSummary(
                    callMinutesGranted: 0,
                    maxClaims: 0,
                    remainingClaims: 0,
                    textEventsGranted: 0,
                    totalClaims: 0
                ),
                status: payload.status,
                usagePlan: monetizationStatus?.usagePlan ?? SubscriptionUsagePlan(
                    dailyCallCapMinutes: payload.allowances.calls.monthlyCapMinutes,
                    dailySmsCap: payload.allowances.messages.dailyCap,
                    description: payload.product.description,
                    monthlyCallCapMinutes: payload.allowances.calls.monthlyCapMinutes,
                    monthlySmsCap: payload.allowances.messages.monthlyCap,
                    uniqueContactsDailyCap: payload.allowances.messages.dailyCap
                )
            )
            messageAllowance = payload.allowances.messages
            callAllowance = payload.allowances.calls
            await refreshMonetizationState()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func trackAdImpression(adType: String, placement: String, adUnitId: String) async {
        await trackAnalytics(
            eventType: "ad_impression",
            properties: [
                "adType": adType,
                "placement": placement,
                "adUnitId": adUnitId
            ]
        )
    }

    func trackAdClick(adType: String, placement: String) async {
        await trackAnalytics(
            eventType: "ad_click",
            properties: [
                "adType": adType,
                "placement": placement
            ]
        )
    }

    func handleIncomingURL(_ url: URL) {
        if let route = MessageRoute(url: url) {
            Task { @MainActor in
                await handleMessageRoute(route)
            }
            return
        }

        guard
            url.scheme == "freeline",
            url.host == "verify-email",
            let token = AuthClient.extractVerificationToken(from: url.absoluteString)
        else {
            return
        }

        pendingVerification = PendingEmailVerification(
            email: pendingVerification?.email ?? "",
            previewLink: url.absoluteString,
            suggestedToken: token
        )
        authScreen = .email
        errorMessage = nil
    }

    func signOut() {
        session = nil
        currentNumber = nil
        resetLineState()
        monetizationStatus = nil
        pendingInterstitialAd = nil
        pendingRewardedAd = nil
        usagePrompt = nil
        selectedTab = .messages
        hasResolvedCurrentNumber = false
        clearTransientState()
        try? keychain.delete(account: sessionAccount)
    }

    private func clearTransientState() {
        errorMessage = nil
        pendingVerification = nil
        isClaimingReward = false
        isLoading = false
    }

    private func handleVoiceCallEvent(_ event: VoiceCallEvent) async {
        switch event {
        case .connecting:
            updateActiveCallSession {
                $0.statusText = "Connecting"
            }
        case .ringing:
            updateActiveCallSession {
                $0.statusText = "Ringing"
            }
        case .connected(let connectedAt):
            updateActiveCallSession {
                $0.connectedAt = connectedAt
                $0.isSpeakerOn = true
                $0.statusText = "Connected"
            }
        case .reconnecting(let reason):
            updateActiveCallSession {
                $0.statusText = reason.isEmpty ? "Reconnecting" : "Reconnecting: \(reason)"
            }
        case .reconnected:
            updateActiveCallSession {
                $0.statusText = "Connected"
            }
        case .failed(let message):
            activeCallSession = nil
            errorMessage = message
            await loadCallHistory()
            queueInterstitialIfEligible()
        case .disconnected(let message):
            activeCallSession = nil
            if let message, !message.isEmpty {
                errorMessage = message
            }
            await loadCallHistory()
            queueInterstitialIfEligible()
        }
    }

    private func updateActiveCallSession(_ update: (inout ActiveCallSession) -> Void) {
        guard var session = activeCallSession else {
            return
        }

        update(&session)
        activeCallSession = session
    }

    private func handleMessageRealtimeEvent(_ event: MessageRealtimeEvent) async {
        guard let conversation = event.conversation, let message = event.message else {
            return
        }

        if isProofMode {
            let existingMessages = proofMessageThreads[conversation.id] ?? currentMessages
            proofMessageThreads[conversation.id] = upsertMessage(message, in: existingMessages)
        }

        conversations = upsertConversation(conversation, in: conversations)

        guard currentConversation?.id == conversation.id else {
            return
        }

        currentConversation = conversation
        currentMessages = upsertMessage(message, in: currentMessages)

        guard
            event.type == .messageInbound
        else {
            return
        }

        if isProofMode {
            markProofConversationRead(conversationId: conversation.id)
            return
        }

        guard let accessToken = session?.tokens.accessToken else {
            return
        }

        try? await markConversationRead(
            accessToken: accessToken,
            conversationId: conversation.id
        )
    }

    private func upsertConversation(
        _ conversation: ConversationSummary,
        in existing: [ConversationSummary]
    ) -> [ConversationSummary] {
        let remaining = existing.filter { $0.id != conversation.id }
        return (remaining + [conversation]).sorted { lhs, rhs in
            if lhs.updatedAt == rhs.updatedAt {
                return lhs.id < rhs.id
            }

            return lhs.updatedAt > rhs.updatedAt
        }
    }

    private func upsertMessage(
        _ message: ChatMessage,
        in existing: [ChatMessage]
    ) -> [ChatMessage] {
        let remaining = existing.filter { $0.id != message.id }
        return (remaining + [message]).sorted { lhs, rhs in
            if lhs.createdAt == rhs.createdAt {
                return lhs.id < rhs.id
            }

            return lhs.createdAt < rhs.createdAt
        }
    }

    private func markConversationRead(
        accessToken: String,
        conversationId: String
    ) async throws {
        let payload = try await messageClient.markConversationRead(
            accessToken: accessToken,
            conversationId: conversationId
        )
        currentConversation = payload.conversation
        conversations = conversations.map { conversation in
            conversation.id == payload.conversation.id ? payload.conversation : conversation
        }
    }

    private func persistSession(_ payload: AuthSessionPayload) throws {
        let data = try encoder.encode(payload)
        try keychain.save(data, account: sessionAccount)
    }

    private func completeAuthenticatedSession(_ payload: AuthSessionPayload) async throws {
        session = payload
        pendingVerification = nil
        currentNumber = nil
        monetizationStatus = nil
        pendingInterstitialAd = nil
        pendingRewardedAd = nil
        usagePrompt = nil
        selectedTab = .messages
        resetLineState()
        hasResolvedCurrentNumber = false
        authScreen = .welcome
        try persistSession(payload)
        await loadCurrentNumber()
        if !isProofMode {
            await IncomingCallRuntime.shared.syncCachedPushTokens()
        }
    }

    private func queueInterstitialIfEligible() {
        guard adsEnabled else {
            return
        }

        guard pendingInterstitialAd == nil else {
            return
        }

        if let lastInterstitialShownAt,
           Date().timeIntervalSince(lastInterstitialShownAt) < 30 * 60 {
            return
        }

        pendingInterstitialAd = InterstitialAdRequest(placement: "post_call")
    }

    private func resetLineState() {
        availableNumbers = []
        conversations = []
        currentConversation = nil
        currentMessages = []
        dismissMessageComposer()
        pendingConversationRouteId = nil
        proofMessageThreads = [:]
        cancelProofRealtimeEvents()
        cancelProofScenarioAutomation()
        messageAllowance = nil
        callHistory = []
        voicemails = []
        callAllowance = nil
        activeCallSession = nil
    }

    private func trackAnalytics(eventType: String, properties: [String: String]) async {
        guard !isProofMode else {
            return
        }

        guard let accessToken = session?.tokens.accessToken else {
            return
        }

        await analyticsClient.track(
            accessToken: accessToken,
            eventType: eventType,
            properties: properties
        )
    }

    private func processPendingConversationRouteIfNeeded() async {
        guard let pendingConversationRouteId else {
            return
        }

        guard hasResolvedCurrentNumber, currentNumber != nil else {
            return
        }

        if isProofMode {
            openProofConversation(conversationId: pendingConversationRouteId, markRead: true)
            self.pendingConversationRouteId = nil
            return
        }

        if let conversation = conversations.first(where: { $0.id == pendingConversationRouteId }) {
            self.pendingConversationRouteId = nil
            await openConversation(conversation)
            return
        }

        await loadConversations()

        guard let conversation = conversations.first(where: { $0.id == pendingConversationRouteId }) else {
            errorMessage = "Unable to open the requested conversation."
            return
        }

        self.pendingConversationRouteId = nil
        await openConversation(conversation)
    }

    private func openProofConversation(
        conversationId: String,
        markRead: Bool
    ) {
        guard let conversation = conversations.first(where: { $0.id == conversationId }) else {
            errorMessage = "Unable to open the requested conversation."
            return
        }

        let updatedConversation = proofConversation(
            from: conversation,
            unreadCount: markRead ? 0 : conversation.unreadCount
        )
        let threadMessages = proofMessageThreads[conversationId] ?? []

        conversations = upsertConversation(updatedConversation, in: conversations)
        currentConversation = updatedConversation
        currentMessages = threadMessages
        errorMessage = nil
    }

    private func markProofConversationRead(conversationId: String) {
        guard let conversation = conversations.first(where: { $0.id == conversationId }) else {
            return
        }

        let updatedConversation = proofConversation(from: conversation, unreadCount: 0)
        conversations = upsertConversation(updatedConversation, in: conversations)
        currentConversation = updatedConversation
    }

    private func proofConversation(
        from conversation: ConversationSummary,
        unreadCount: Int
    ) -> ConversationSummary {
        ConversationSummary(
            createdAt: conversation.createdAt,
            id: conversation.id,
            isOptedOut: conversation.isOptedOut,
            lastMessageAt: conversation.lastMessageAt,
            lastMessagePreview: conversation.lastMessagePreview,
            lastMessageStatus: conversation.lastMessageStatus,
            participantNumber: conversation.participantNumber,
            phoneNumberId: conversation.phoneNumberId,
            unreadCount: unreadCount,
            updatedAt: conversation.updatedAt,
            userId: conversation.userId
        )
    }

    private func cancelProofRealtimeEvents() {
        proofRealtimeTasks.forEach { $0.cancel() }
        proofRealtimeTasks.removeAll()
    }

    private func cancelProofScenarioAutomation() {
        proofAutomationTasks.forEach { $0.cancel() }
        proofAutomationTasks.removeAll()
    }

    private func scheduleProofRealtimeEvents(_ events: [ScheduledProofRealtimeEvent]) {
        cancelProofRealtimeEvents()

        guard !events.isEmpty else {
            return
        }

        proofRealtimeTasks = events.map { event in
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: event.delayMilliseconds * 1_000_000)
                guard !Task.isCancelled else {
                    return
                }

                await handleMessageRealtimeEvent(event.event)
            }
        }
    }

    private func scheduleProofScenarioAutomation() {
        cancelProofScenarioAutomation()

        guard let proofScenario else {
            return
        }

        switch proofScenario {
        case .threadSend:
            proofAutomationTasks = [
                Task { @MainActor [weak self] in
                    try? await Task.sleep(nanoseconds: 2_600_000_000)
                    guard let self, !Task.isCancelled else {
                        return
                    }

                    self.openProofConversation(
                        conversationId: "proof-conversation-1",
                        markRead: true
                    )
                },
                Task { @MainActor [weak self] in
                    try? await Task.sleep(nanoseconds: 4_200_000_000)
                    guard let self, !Task.isCancelled else {
                        return
                    }

                    _ = self.sendProofMessage(
                        to: "+14155550191",
                        body: "The keypad is 4820. Buzz me if the app asks again.",
                        messageId: "proof-message-thread-send-1",
                        providerMessageId: "provider-thread-send-1",
                        createdAt: "2026-03-17T10:16:00Z"
                    )
                }
            ]
        case .composeSend:
            proofAutomationTasks = [
                Task { @MainActor [weak self] in
                    try? await Task.sleep(nanoseconds: 1_200_000_000)
                    guard let self, !Task.isCancelled else {
                        return
                    }

                    self.showMessageComposer(
                        prefillRecipient: "(415) 555-0208",
                        prefillBody: "I found the listing. Can we tour at 6 tonight?"
                    )
                },
                Task { @MainActor [weak self] in
                    try? await Task.sleep(nanoseconds: 4_400_000_000)
                    guard let self, !Task.isCancelled else {
                        return
                    }

                    _ = self.sendProofMessage(
                        to: self.composerRecipientDraft,
                        body: self.composerBodyDraft,
                        messageId: "proof-message-compose-send-1",
                        providerMessageId: "provider-compose-send-1",
                        createdAt: "2026-03-17T10:18:00Z"
                    )
                }
            ]
        default:
            break
        }
    }

    private func applyProofSeed(_ seed: Phase5ProofSeed) {
        authScreen = .welcome
        session = seed.session
        currentNumber = seed.currentNumber
        availableNumbers = []
        conversations = seed.conversations
        currentConversation = seed.currentConversation
        currentMessages = seed.currentMessages
        proofMessageThreads = seed.messageThreads
        messageAllowance = seed.messageAllowance
        callHistory = seed.callHistory
        voicemails = seed.voicemails
        callAllowance = seed.callAllowance
        monetizationStatus = seed.monetizationStatus
        pendingInterstitialAd = seed.pendingInterstitialAd
        pendingRewardedAd = seed.pendingRewardedAd
        usagePrompt = seed.usagePrompt
        isPresentingMessageComposer = false
        composerRecipientDraft = ""
        composerBodyDraft = ""
        errorMessage = seed.errorMessage
        hasResolvedCurrentNumber = true
        selectedTab = seed.selectedTab
        isClaimingReward = false
        isLoading = false
        scheduleProofRealtimeEvents(seed.scheduledRealtimeEvents)
        scheduleProofScenarioAutomation()
    }

    private func sendProofMessage(
        to rawRecipient: String,
        body rawBody: String,
        messageId: String? = nil,
        providerMessageId: String? = nil,
        createdAt: String? = nil
    ) -> ConversationSummary? {
        guard let normalizedRecipient = Self.normalizeUSPhoneNumber(rawRecipient) else {
            errorMessage = "Enter a valid U.S. phone number."
            return nil
        }

        let trimmedBody = rawBody.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedBody.isEmpty else {
            errorMessage = "Enter a message before sending."
            return nil
        }

        let timestamp = createdAt ?? ISO8601DateFormatter().string(from: Date())
        let existingConversation = conversations.first { $0.participantNumber == normalizedRecipient }
        let conversationId = existingConversation?.id ?? proofConversationId(for: normalizedRecipient)
        let sentMessage = ChatMessage(
            body: trimmedBody,
            conversationId: conversationId,
            createdAt: timestamp,
            direction: "outbound",
            id: messageId ?? "proof-message-\(UUID().uuidString.lowercased())",
            providerMessageId: providerMessageId,
            status: "sent",
            updatedAt: timestamp
        )

        let previousMessages = proofMessageThreads[conversationId] ?? []
        let updatedConversation = ConversationSummary(
            createdAt: existingConversation?.createdAt ?? timestamp,
            id: conversationId,
            isOptedOut: false,
            lastMessageAt: timestamp,
            lastMessagePreview: trimmedBody,
            lastMessageStatus: "sent",
            participantNumber: normalizedRecipient,
            phoneNumberId: currentNumber?.phoneNumberId ?? "proof-number-1",
            unreadCount: 0,
            updatedAt: timestamp,
            userId: session?.user.id ?? "proof-user-1"
        )

        proofMessageThreads[conversationId] = upsertMessage(sentMessage, in: previousMessages)
        conversations = upsertConversation(updatedConversation, in: conversations)
        currentConversation = updatedConversation
        currentMessages = proofMessageThreads[conversationId] ?? [sentMessage]
        messageAllowance = decrementProofMessageAllowance(messageAllowance)
        usagePrompt = nil
        errorMessage = nil
        if isPresentingMessageComposer {
            dismissMessageComposer()
        }
        return updatedConversation
    }

    private func decrementProofMessageAllowance(_ allowance: MessageAllowance?) -> MessageAllowance? {
        guard let allowance else {
            return nil
        }

        return MessageAllowance(
            dailyCap: allowance.dailyCap,
            dailyRemaining: max(allowance.dailyRemaining - 1, 0),
            dailyUsed: allowance.dailyUsed + 1,
            monthlyCap: allowance.monthlyCap,
            monthlyRemaining: max(allowance.monthlyRemaining - 1, 0),
            monthlyUsed: allowance.monthlyUsed + 1
        )
    }

    private func proofConversationId(for normalizedRecipient: String) -> String {
        let suffix = normalizedRecipient.filter(\.isNumber).suffix(4)
        return "proof-conversation-\(suffix)"
    }

    private func loadStoredSession() -> AuthSessionPayload? {
        guard let data = try? keychain.load(account: sessionAccount) else {
            return nil
        }

        return try? decoder.decode(AuthSessionPayload.self, from: data)
    }

    private func loadOrCreateFingerprint() -> String {
        if
            let data = try? keychain.load(account: fingerprintAccount),
            let value = String(data: data, encoding: .utf8),
            !value.isEmpty
        {
            return value
        }

        let value = UUID().uuidString.lowercased()
        try? keychain.save(Data(value.utf8), account: fingerprintAccount)
        return value
    }

    static func normalizeUSPhoneNumber(_ rawValue: String) -> String? {
        let digits = rawValue.filter(\.isNumber)

        if rawValue.hasPrefix("+"), digits.count == 11, digits.first == "1" {
            return "+\(digits)"
        }

        if digits.count == 10 {
            return "+1\(digits)"
        }

        if digits.count == 11, digits.first == "1" {
            return "+\(digits)"
        }

        return nil
    }
}

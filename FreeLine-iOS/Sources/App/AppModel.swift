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
    private let voiceTransport: TwilioVoiceTransport
    private let keychain = KeychainStore(service: "com.freeline.ios")
    private let sessionAccount = "auth-session"
    private let fingerprintAccount = "device-fingerprint"
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private var lastInterstitialShownAt: Date?

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
        voiceTransport: TwilioVoiceTransport = TwilioVoiceTransport()
    ) {
        self.analyticsClient = analyticsClient
        self.authClient = authClient
        self.callClient = callClient
        self.messageClient = messageClient
        self.messageRealtimeClient = messageRealtimeClient
        self.numberClient = numberClient
        self.rewardClient = rewardClient
        self.subscriptionClient = subscriptionClient
        self.voiceTransport = voiceTransport
        self.fingerprint = "ios-device"
        self.fingerprint = loadOrCreateFingerprint()
        self.session = loadStoredSession()
    }

    var isAuthenticated: Bool {
        session != nil
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
        await messageRealtimeClient.updateConnection(accessToken: session?.tokens.accessToken) {
            [weak self] event in
            guard let self else {
                return
            }

            await self.handleMessageRealtimeEvent(event)
        }
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

    func openConversation(_ conversation: ConversationSummary) async {
        currentConversation = conversation
        await loadCurrentConversationMessages(markRead: true)
    }

    func clearCurrentConversation() {
        currentConversation = nil
        currentMessages = []
    }

    func loadCurrentConversationMessages(markRead: Bool = false) async {
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

    func registerVoipToken(_ token: String) async {
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

    func dismissInterstitial() {
        lastInterstitialShownAt = Date()
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

    func verifySubscriptionPurchase(productId: String) async {
        guard let accessToken = session?.tokens.accessToken else {
            return
        }

        isLoading = true
        errorMessage = nil

        defer {
            isLoading = false
        }

        do {
            let payload = try await subscriptionClient.verifyPurchase(
                accessToken: accessToken,
                productId: productId,
                platform: "ios"
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

        conversations = upsertConversation(conversation, in: conversations)

        guard currentConversation?.id == conversation.id else {
            return
        }

        currentConversation = conversation
        currentMessages = upsertMessage(message, in: currentMessages)

        guard
            event.type == .messageInbound,
            let accessToken = session?.tokens.accessToken
        else {
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
        messageAllowance = nil
        callHistory = []
        voicemails = []
        callAllowance = nil
        activeCallSession = nil
    }

    private func trackAnalytics(eventType: String, properties: [String: String]) async {
        guard let accessToken = session?.tokens.accessToken else {
            return
        }

        await analyticsClient.track(
            accessToken: accessToken,
            eventType: eventType,
            properties: properties
        )
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

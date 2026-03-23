import SwiftUI

struct CallsView: View {
    @Environment(\.openURL) private var openURL
    @EnvironmentObject private var appModel: AppModel
    @State private var dialedNumber = ""
    @State private var note: String?
    @State private var showDialPad = false
    @State private var showAuraDemo = false

    var body: some View {
        NavigationStack {
            FreeLineScreen {
                Group {
                    if let activeCallSession = appModel.activeCallSession {
                        ActiveCallView(
                            session: activeCallSession,
                            onEnd: {
                                Task {
                                    await appModel.endActiveCall()
                                }
                            }
                        )
                    } else {
                        ZStack(alignment: .bottomTrailing) {
                            recentsContent

                            Button {
                                showDialPad = true
                            } label: {
                                Image(systemName: "circle.grid.3x3.fill")
                                    .font(.system(size: 24, weight: .semibold))
                                    .foregroundStyle(.white)
                                    .frame(width: 60, height: 60)
                                    .freeLineFloatingActionSurface()
                            }
                            .padding(.trailing, 20)
                            .padding(.bottom, appModel.adsEnabled ? 80 : 24)
                        }
                        .sheet(isPresented: $showDialPad) {
                            DialPadSheet(
                                dialedNumber: $dialedNumber,
                                note: $note,
                                onCall: handleCallTapped,
                                isLoading: appModel.isLoading
                            )
                            .presentationDetents([.large])
                            .presentationDragIndicator(.visible)
                            .presentationCornerRadius(32)
                        }
                        .safeAreaInset(edge: .bottom) {
                            BannerAdPlacementView(
                                placement: "calls_bottom_banner",
                                isHidden: !appModel.adsEnabled,
                                onImpression: {
                                    Task {
                                        await appModel.trackAdImpression(
                                            adType: "banner",
                                            placement: "calls_bottom_banner",
                                            adUnitId: AdConfiguration.bannerUnitID
                                        )
                                    }
                                },
                                onTap: {
                                    Task {
                                        await appModel.trackAdClick(
                                            adType: "banner",
                                            placement: "calls_bottom_banner"
                                        )
                                    }
                                }
                            )
                            .padding(.horizontal)
                            .padding(.top, 8)
                            .freeLineBottomInsetBackdrop()
                        }
                    }
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .task {
                await appModel.loadCallHistory()
                if appModel.shouldAutoPresentAuraDemo {
                    showAuraDemo = true
                }
            }
            .fullScreenCover(isPresented: $showAuraDemo) {
                AuraReceptionistDemoView {
                    showAuraDemo = false
                }
            }
        }
    }

    private var recentsContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                headerCard
                auraPreviewCard

                if let summary = appModel.usageSummary {
                    UsageOverviewCard(
                        summary: summary,
                        remainingRewardClaims: appModel.remainingRewardClaims
                    )
                }

                if let allowance = appModel.callAllowance {
                    FreeLineGlassCard(padding: 16) {
                        HStack(spacing: 16) {
                            FreeLineStatStrip(
                                title: "Remaining",
                                value: "\(allowance.monthlyRemainingMinutes) min",
                                tint: FreeLineTheme.mint
                            )
                            FreeLineStatStrip(
                                title: "Used",
                                value: "\(allowance.monthlyUsedMinutes) min",
                                tint: FreeLineTheme.accentDeep
                            )
                        }
                    }
                }

                if let errorMessage = appModel.errorMessage {
                    FreeLineGlassCard(padding: 16) {
                        Text(errorMessage)
                            .font(FreeLineTheme.body(14, weight: .semibold))
                            .foregroundStyle(FreeLineTheme.coral)
                    }
                }

                VStack(alignment: .leading, spacing: 14) {
                    Text("Recent Calls")
                        .font(FreeLineTheme.body(20, weight: .bold))
                        .foregroundStyle(FreeLineTheme.textPrimary)

                    if appModel.callHistory.isEmpty {
                        FreeLineGlassCard {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("No calls yet")
                                    .font(FreeLineTheme.body(20, weight: .bold))
                                    .foregroundStyle(FreeLineTheme.textPrimary)
                                Text("Tap the keypad button to make your first call.")
                                    .font(FreeLineTheme.body(15, weight: .medium))
                                    .foregroundStyle(FreeLineTheme.textSecondary)
                            }
                        }
                    } else {
                        ForEach(appModel.callHistory) { call in
                            Button {
                                dialedNumber = call.remoteNumber
                                showDialPad = true
                            } label: {
                                CallHistoryRow(call: call)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 140)
        }
        .refreshable {
            await appModel.loadCallHistory()
        }
    }

    private var headerCard: some View {
        FreeLineGlassCard {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Calls")
                            .font(FreeLineTheme.title(34))
                            .foregroundStyle(FreeLineTheme.textPrimary)
                        Text(appModel.currentNumber?.nationalFormat ?? "No number assigned")
                            .font(FreeLineTheme.body(16, weight: .semibold))
                            .foregroundStyle(FreeLineTheme.accentDeep)
                    }

                    Spacer()

                    FreeLineHeroIcon(systemImage: "phone.fill")
                        .scaleEffect(0.82)
                }

                FreeLineGlassGroup(spacing: 12) {
                    HStack(spacing: 12) {
                        FreeLinePill(
                            icon: "phone.arrow.up.right.fill",
                            text: appModel.currentPlanTitle,
                            tint: appModel.adsEnabled ? FreeLineTheme.warning : FreeLineTheme.mint
                        )
                        FreeLinePill(icon: "cross.case.fill", text: "911 uses dialer", tint: FreeLineTheme.coral)
                    }
                }
            }
        }
    }

    private var auraPreviewCard: some View {
        FreeLineGlassCard {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top, spacing: 16) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Aura AI Receptionist")
                            .font(FreeLineTheme.body(24, weight: .bold))
                            .foregroundStyle(FreeLineTheme.textPrimary)
                        Text("Let Aura answer unknown callers first, extract why they’re calling, and tee up the best next move before you join.")
                            .font(FreeLineTheme.body(15, weight: .medium))
                            .foregroundStyle(FreeLineTheme.textSecondary)
                    }

                    Spacer()

                    FreeLineHeroIcon(systemImage: "sparkles")
                        .scaleEffect(0.82)
                }

                FreeLineGlassGroup(spacing: 10) {
                    HStack(spacing: 10) {
                        FreeLinePill(icon: "phone.badge.checkmark", text: "Screen unknown calls", tint: FreeLineTheme.warning)
                        FreeLinePill(icon: "message.fill", text: "Draft replies", tint: FreeLineTheme.mint)
                    }
                }

                Button {
                    showAuraDemo = true
                } label: {
                    Label("Preview Aura", systemImage: "waveform.badge.mic")
                }
                .buttonStyle(FreeLinePrimaryButtonStyle())
            }
        }
    }

    private var formattedDialedNumber: String {
        if let normalized = normalizeDialableUSPhoneNumber(dialedNumber) {
            return normalized.formattedUSPhoneNumber
        }

        return dialedNumber
    }

    private func handleCallTapped() {
        switch dialAction(for: dialedNumber) {
        case .nativeEmergencyDial:
            note = "Emergency calls use your phone's built-in dialer."
            if let url = URL(string: "tel://911") {
                openURL(url)
            }
        case .voip:
            Task {
                let didStart = await appModel.startOutgoingCall(to: dialedNumber)
                if didStart {
                    note = nil
                    dialedNumber = ""
                    showDialPad = false
                } else {
                    note = appModel.errorMessage
                }
            }
        case nil:
            note = "Enter a valid U.S. phone number."
        }
    }
}

private struct DialPadSheet: View {
    @Binding var dialedNumber: String
    @Binding var note: String?
    let onCall: () -> Void
    let isLoading: Bool

    var body: some View {
        FreeLineScreen {
            ScrollView(showsIndicators: false) {
                VStack(spacing: 20) {
                    VStack(spacing: 8) {
                        Text(dialedNumber.isEmpty ? "Enter a number" : formattedDialedNumber)
                            .font(FreeLineTheme.title(34, weight: .bold))
                            .foregroundStyle(FreeLineTheme.textPrimary)
                            .frame(maxWidth: .infinity)
                            .frame(minHeight: 44)
                            .contentTransition(.numericText())
                            .animation(.snappy(duration: 0.15), value: dialedNumber)
                    }

                    DialPadView(
                        dialedNumber: $dialedNumber,
                        onBackspace: {
                            guard !dialedNumber.isEmpty else { return }
                            dialedNumber.removeLast()
                        },
                        onClear: {
                            dialedNumber = ""
                        },
                        onDigit: nil
                    )

                    Button(action: onCall) {
                        Image(systemName: "phone.fill")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 72, height: 72)
                            .background(
                                Circle()
                                    .fill(dialedNumber.isEmpty
                                          ? Color.gray.opacity(0.4)
                                          : Color.green)
                            )
                            .shadow(
                                color: dialedNumber.isEmpty ? .clear : Color.green.opacity(0.3),
                                radius: 12, x: 0, y: 6
                            )
                    }
                    .disabled(dialedNumber.isEmpty || isLoading)

                    if let note {
                        Text(note)
                            .font(FreeLineTheme.body(13, weight: .semibold))
                            .foregroundStyle(FreeLineTheme.textSecondary)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 24)
                .padding(.bottom, 40)
            }
        }
    }

    private var formattedDialedNumber: String {
        if let normalized = normalizeDialableUSPhoneNumber(dialedNumber) {
            return normalized.formattedUSPhoneNumber
        }
        return dialedNumber
    }
}

private struct DialPadView: View {
    @Binding var dialedNumber: String

    let onBackspace: () -> Void
    let onClear: () -> Void
    let onDigit: ((String) -> Void)?

    private let rows = [
        ["1", "2", "3"],
        ["4", "5", "6"],
        ["7", "8", "9"],
        ["*", "0", "#"]
    ]

    var body: some View {
        VStack(spacing: 12) {
            ForEach(rows, id: \.self) { row in
                HStack(spacing: 12) {
                    ForEach(row, id: \.self) { key in
                        Button {
                            dialedNumber.append(key)
                            onDigit?(key)
                        } label: {
                            Text(key)
                                .font(FreeLineTheme.title(24, weight: .bold))
                                .foregroundStyle(FreeLineTheme.textPrimary)
                                .frame(maxWidth: .infinity, minHeight: 64)
                                .background(
                                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                                        .fill(.white.opacity(0.66))
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                                        .stroke(Color.white.opacity(0.78), lineWidth: 1)
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            HStack(spacing: 12) {
                Button("Clear", role: .destructive, action: onClear)
                    .buttonStyle(FreeLineSecondaryButtonStyle())
                    .frame(maxWidth: .infinity)

                Button {
                    onBackspace()
                } label: {
                    Label("Delete", systemImage: "delete.left")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(FreeLineSecondaryButtonStyle())
            }
        }
    }
}

private struct ActiveCallView: View {
    @EnvironmentObject private var appModel: AppModel
    let session: ActiveCallSession
    let onEnd: () -> Void

    @State private var isShowingKeypad = false
    @State private var dtmfDigits = ""

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 22) {
                FreeLineHeroIcon(systemImage: "phone.fill")

                FreeLineGlassCard {
                    VStack(spacing: 14) {
                        Text(session.displayNumber)
                            .font(FreeLineTheme.title(34))
                            .foregroundStyle(FreeLineTheme.textPrimary)
                            .multilineTextAlignment(.center)

                        Text("Calling from \(session.fromNumber.formattedUSPhoneNumber)")
                            .font(FreeLineTheme.body(15, weight: .medium))
                            .foregroundStyle(FreeLineTheme.textSecondary)

                        TimelineView(.periodic(from: .now, by: 1)) { context in
                            Text(durationString(now: context.date))
                                .font(FreeLineTheme.title(28, weight: .bold))
                                .foregroundStyle(FreeLineTheme.accentDeep)
                        }

                        Text(session.statusText)
                            .font(FreeLineTheme.body(14, weight: .medium))
                            .foregroundStyle(FreeLineTheme.textSecondary)
                            .multilineTextAlignment(.center)
                    }
                }

                HStack(spacing: 12) {
                    ToggleButton(title: "Mute", icon: "mic.slash.fill", isOn: session.isMuted) {
                        appModel.toggleMuteActiveCall()
                    }
                    ToggleButton(title: "Speaker", icon: "speaker.wave.3.fill", isOn: session.isSpeakerOn) {
                        appModel.toggleSpeakerActiveCall()
                    }
                    ToggleButton(title: "Keypad", icon: "circle.grid.3x3.fill", isOn: isShowingKeypad) {
                        isShowingKeypad.toggle()
                    }
                }

                if isShowingKeypad {
                    FreeLineGlassCard {
                        DialPadView(
                            dialedNumber: $dtmfDigits,
                            onBackspace: {
                                guard !dtmfDigits.isEmpty else { return }
                                dtmfDigits.removeLast()
                            },
                            onClear: {
                                dtmfDigits = ""
                            },
                            onDigit: { digit in
                                appModel.sendDigitsToActiveCall(digit)
                            }
                        )
                    }
                }

                Button(role: .destructive, action: onEnd) {
                    Label("End Call", systemImage: "phone.down.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(FreeLinePrimaryButtonStyle())
                .tint(.red)
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 40)
        }
    }

    private func durationString(now: Date) -> String {
        let duration = max(Int(now.timeIntervalSince(session.timerAnchor)), 0)
        return CallHistoryEntry.formatDuration(duration)
    }
}

private struct ToggleButton: View {
    let title: String
    let icon: String
    let isOn: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .semibold))
                Text(title)
                    .font(FreeLineTheme.body(13, weight: .semibold))
            }
            .foregroundStyle(isOn ? FreeLineTheme.accentDeep : FreeLineTheme.textPrimary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(isOn ? FreeLineTheme.accent.opacity(0.18) : .white.opacity(0.62))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(Color.white.opacity(0.78), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

private struct CallHistoryRow: View {
    let call: CallHistoryEntry

    var body: some View {
        FreeLineGlassCard {
            HStack(spacing: 14) {
                Circle()
                    .fill(call.isOutgoing ? FreeLineTheme.mint.opacity(0.9) : FreeLineTheme.accent.opacity(0.88))
                    .frame(width: 44, height: 44)
                    .overlay(
                        Image(systemName: call.isOutgoing ? "arrow.up.right" : "arrow.down.left")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.white)
                    )

                VStack(alignment: .leading, spacing: 4) {
                    Text(call.displayNumber)
                        .font(FreeLineTheme.body(18, weight: .bold))
                        .foregroundStyle(FreeLineTheme.textPrimary)
                    Text(call.statusLabel)
                        .font(FreeLineTheme.body(14, weight: .medium))
                        .foregroundStyle(FreeLineTheme.textSecondary)
                }

                Spacer()

                if let timestamp = formattedTimestamp(call.endedAt ?? call.startedAt ?? call.createdAt) {
                    Text(timestamp)
                        .font(FreeLineTheme.body(12, weight: .semibold))
                        .foregroundStyle(FreeLineTheme.textSecondary)
                }
            }
        }
    }

    private func formattedTimestamp(_ iso8601: String?) -> String? {
        guard
            let iso8601,
            let date = ISO8601DateFormatter().date(from: iso8601)
        else {
            return nil
        }

        return date.formatted(date: .abbreviated, time: .shortened)
    }
}

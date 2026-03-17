import SwiftUI

struct CallsView: View {
    @Environment(\.openURL) private var openURL
    @EnvironmentObject private var appModel: AppModel
    @State private var dialedNumber = ""
    @State private var note: String?

    var body: some View {
        NavigationStack {
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
                    List {
                        if let summary = appModel.usageSummary {
                            Section {
                                UsageOverviewCard(
                                    summary: summary,
                                    remainingRewardClaims: appModel.remainingRewardClaims
                                )
                            }
                        }

                        if let allowance = appModel.callAllowance {
                            Section("Call Minutes") {
                                Text("\(allowance.monthlyRemainingMinutes) of \(allowance.monthlyCapMinutes) min remaining")
                                Text("\(allowance.monthlyUsedMinutes) minutes used this month")
                                    .foregroundStyle(.secondary)
                            }
                        }

                        if let errorMessage = appModel.errorMessage {
                            Section("Call Status") {
                                Text(errorMessage)
                                    .foregroundStyle(.red)
                            }
                        }

                        Section("Dial Pad") {
                            Text(dialedNumber.isEmpty ? "Enter a number" : formattedDialedNumber)
                                .font(.title2.monospacedDigit())
                                .frame(maxWidth: .infinity, alignment: .center)

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

                            Button {
                                handleCallTapped()
                            } label: {
                                Label("Call", systemImage: "phone.fill")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(dialedNumber.isEmpty || appModel.isLoading)

                            if let note {
                                Text(note)
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                        }

                        Section("Recent Calls") {
                            if appModel.callHistory.isEmpty {
                                Text("No calls yet")
                                Text("Device fingerprint: \(appModel.fingerprint)")
                                    .font(.footnote.monospaced())
                                    .foregroundStyle(.secondary)
                            } else {
                                ForEach(appModel.callHistory) { call in
                                    Button {
                                        dialedNumber = call.remoteNumber
                                    } label: {
                                        CallHistoryRow(call: call)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                    .refreshable {
                        await appModel.loadCallHistory()
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
                        .background(.ultraThinMaterial)
                    }
                }
            }
            .navigationTitle("Calls")
            .task {
                await appModel.loadCallHistory()
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
                } else {
                    note = appModel.errorMessage
                }
            }
        case nil:
            note = "Enter a valid U.S. phone number."
        }
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
                                .font(.title2.weight(.semibold))
                                .frame(maxWidth: .infinity, minHeight: 54)
                        }
                        .buttonStyle(.bordered)
                    }
                }
            }

            HStack(spacing: 12) {
                Button("Clear", role: .destructive, action: onClear)
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)

                Button {
                    onBackspace()
                } label: {
                    Label("Delete", systemImage: "delete.left")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
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
        VStack(spacing: 20) {
            Spacer()

            Text(session.displayNumber)
                .font(.largeTitle.weight(.semibold))
                .multilineTextAlignment(.center)

            Text("Calling from \(session.fromNumber.formattedUSPhoneNumber)")
                .foregroundStyle(.secondary)

            TimelineView(.periodic(from: .now, by: 1)) { context in
                Text(durationString(now: context.date))
                    .font(.title.monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            Text(session.statusText)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            HStack(spacing: 16) {
                ToggleButton(title: "Mute", isOn: session.isMuted) {
                    appModel.toggleMuteActiveCall()
                }
                ToggleButton(title: "Speaker", isOn: session.isSpeakerOn) {
                    appModel.toggleSpeakerActiveCall()
                }
                ToggleButton(title: "Keypad", isOn: isShowingKeypad) {
                    isShowingKeypad.toggle()
                }
            }

            if isShowingKeypad {
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

            Button(role: .destructive, action: onEnd) {
                Label("End Call", systemImage: "phone.down.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.red)

            Spacer()
        }
        .padding()
    }

    private func durationString(now: Date) -> String {
        let duration = max(Int(now.timeIntervalSince(session.timerAnchor)), 0)
        return CallHistoryEntry.formatDuration(duration)
    }
}

private struct ToggleButton: View {
    let title: String
    let isOn: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.medium))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(isOn ? Color.accentColor.opacity(0.18) : Color(uiColor: .secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

private struct CallHistoryRow: View {
    let call: CallHistoryEntry

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: call.isOutgoing ? "arrow.up.right" : "arrow.down.left")
                .foregroundStyle(call.isOutgoing ? .green : .blue)

            VStack(alignment: .leading, spacing: 4) {
                Text(call.displayNumber)
                    .font(.headline)
                Text(call.statusLabel)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if let timestamp = formattedTimestamp(call.endedAt ?? call.startedAt ?? call.createdAt) {
                Text(timestamp)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
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

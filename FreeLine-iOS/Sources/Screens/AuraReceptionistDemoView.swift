import SwiftUI

struct AuraReceptionistDemoView: View {
    let onClose: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var visibleTranscriptCount = 0
    @State private var selectedAction: AuraDemoAction = .replyByText

    private let transcript = AuraDemoScript.deliveryDriver

    var body: some View {
        FreeLineScreen {
            VStack(spacing: 16) {
                topBar

                heroCard

                transcriptCard

                actionsCard
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 24)
        }
        .task {
            await playScript()
        }
    }

    private var topBar: some View {
        HStack(spacing: 12) {
            Button(action: onClose) {
                HStack(spacing: 8) {
                    Image(systemName: "chevron.left")
                    Text("Calls")
                }
                .font(FreeLineTheme.body(15, weight: .semibold))
                .foregroundStyle(FreeLineTheme.textPrimary)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .freeLineInputSurface(cornerRadius: 999, tint: Color.white.opacity(0.08))
            }
            .buttonStyle(.plain)

            Spacer()

            FreeLinePill(icon: "sparkles", text: "Aura live", tint: FreeLineTheme.accentDeep)
        }
    }

    private var heroCard: some View {
        FreeLineGlassCard {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .top, spacing: 16) {
                    VStack(alignment: .leading, spacing: 10) {
                        FreeLineSectionTitle(
                            eyebrow: "AI Receptionist",
                            title: "Aura",
                            subtitle: "Screen unknown callers live, understand why they called, and decide what happens next before you answer."
                        )

                        FreeLineGlassGroup(spacing: 10) {
                            HStack(spacing: 10) {
                                FreeLinePill(icon: "phone.badge.checkmark", text: "Unknown caller", tint: FreeLineTheme.warning)
                                FreeLinePill(icon: "shield.lefthalf.filled", text: "Low risk", tint: FreeLineTheme.mint)
                            }
                        }
                    }

                    Spacer()
                }

                HStack(alignment: .center, spacing: 16) {
                    Spacer(minLength: 0)

                    AuraOrbView(
                        isAnimating: visibleTranscriptCount < transcript.count,
                        tone: orbTone
                    )

                    VStack(alignment: .leading, spacing: 12) {
                        AuraSummaryRow(
                            title: "Name",
                            value: "Mike from FedEx",
                            tint: FreeLineTheme.textPrimary
                        )
                        AuraSummaryRow(
                            title: "Reason",
                            value: "Delivery access",
                            tint: FreeLineTheme.accentDeep
                        )
                        AuraSummaryRow(
                            title: "Urgency",
                            value: "Medium",
                            tint: FreeLineTheme.warning
                        )
                        AuraSummaryRow(
                            title: "Recommended",
                            value: selectedAction.displayTitle,
                            tint: selectedAction.tint
                        )
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                HStack(spacing: 14) {
                    FreeLineStatStrip(
                        title: "Spam Confidence",
                        value: "14%",
                        tint: FreeLineTheme.mint
                    )
                    FreeLineStatStrip(
                        title: "Live Reply Time",
                        value: "< 2 sec",
                        tint: FreeLineTheme.accentDeep
                    )
                }
            }
        }
    }

    private var transcriptCard: some View {
        FreeLineGlassCard(padding: 18) {
            HStack {
                Text("Live Transcript")
                    .font(FreeLineTheme.body(20, weight: .bold))
                    .foregroundStyle(FreeLineTheme.textPrimary)
                Spacer()
                FreeLinePill(
                    icon: "waveform",
                    text: "\(visibleTranscriptCount)/\(transcript.count) moments",
                    tint: FreeLineTheme.accentDeep
                )
            }

            VStack(spacing: 10) {
                ForEach(Array(transcript.prefix(visibleTranscriptCount))) { entry in
                    AuraTranscriptCard(entry: entry)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(.spring(response: 0.42, dampingFraction: 0.88), value: visibleTranscriptCount)
        }
    }

    private var actionsCard: some View {
        FreeLineGlassCard(padding: 18) {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Next move")
                            .font(FreeLineTheme.body(20, weight: .bold))
                            .foregroundStyle(FreeLineTheme.textPrimary)
                        Text(selectedAction.supportingText)
                            .font(FreeLineTheme.body(14, weight: .medium))
                            .foregroundStyle(FreeLineTheme.textSecondary)
                    }
                    Spacer()
                    FreeLinePill(
                        icon: selectedAction.symbolName,
                        text: selectedAction.shortLabel,
                        tint: selectedAction.tint
                    )
                }

                LazyVGrid(
                    columns: [
                        GridItem(.flexible(), spacing: 10),
                        GridItem(.flexible(), spacing: 10)
                    ],
                    alignment: .leading,
                    spacing: 10
                ) {
                    ForEach(AuraDemoAction.allCases) { action in
                        AuraActionChip(
                            action: action,
                            isSelected: action == selectedAction,
                            onTap: {
                                selectedAction = action
                            }
                        )
                    }
                }

                VStack(alignment: .leading, spacing: 10) {
                    Text("Drafted follow-up")
                        .font(FreeLineTheme.body(13, weight: .semibold))
                        .foregroundStyle(FreeLineTheme.textSecondary)

                    Text(selectedAction.replyPreview)
                        .font(FreeLineTheme.body(16, weight: .medium))
                        .foregroundStyle(FreeLineTheme.textPrimary)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .freeLineInputSurface(cornerRadius: 22, tint: selectedAction.tint.opacity(0.08))
                }

                Button {
                    selectedAction = .replyByText
                } label: {
                    Label("Make Aura my unknown-caller default", systemImage: "sparkles")
                }
                .buttonStyle(FreeLinePrimaryButtonStyle())
            }
        }
    }

    private var orbTone: Color {
        selectedAction.tint
    }

    private func playScript() async {
        visibleTranscriptCount = 0

        for index in 0..<transcript.count {
            if !reduceMotion {
                try? await Task.sleep(for: .milliseconds(850))
            }
            await MainActor.run {
                withAnimation(.spring(response: 0.42, dampingFraction: 0.9)) {
                    visibleTranscriptCount = index + 1
                }
            }
        }
    }
}

private struct AuraOrbView: View {
    let isAnimating: Bool
    let tone: Color

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false

    var body: some View {
        ZStack {
            Circle()
                .fill(tone.opacity(0.14))
                .frame(width: 168, height: 168)
                .scaleEffect(pulse ? 1.08 : 0.92)
                .blur(radius: 20)

            Circle()
                .stroke(tone.opacity(0.22), lineWidth: 18)
                .frame(width: 136, height: 136)
                .scaleEffect(pulse ? 1.02 : 0.94)

            Circle()
                .fill(
                    LinearGradient(
                        colors: [tone, FreeLineTheme.accentDeep],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 108, height: 108)

            Image(systemName: "waveform.badge.mic")
                .font(.system(size: 38, weight: .bold))
                .foregroundStyle(.white)
        }
        .frame(width: 168, height: 168)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: isAnimating ? 1.2 : 2.2).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
    }
}

private struct AuraTranscriptCard: View {
    let entry: AuraTranscriptEntry

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(entry.tint.opacity(0.18))
                .frame(width: 36, height: 36)
                .overlay(
                    Image(systemName: entry.symbolName)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(entry.tint)
                )

            VStack(alignment: .leading, spacing: 6) {
                Text(entry.speaker)
                    .font(FreeLineTheme.body(12, weight: .semibold))
                    .foregroundStyle(entry.tint)
                Text(entry.text)
                    .font(FreeLineTheme.body(15, weight: .medium))
                    .foregroundStyle(FreeLineTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .freeLineInputSurface(cornerRadius: 22, tint: entry.tint.opacity(0.06))
    }
}

private struct AuraActionChip: View {
    let action: AuraDemoAction
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 10) {
                Image(systemName: action.symbolName)
                    .font(.system(size: 14, weight: .bold))
                Text(action.shortLabel)
                    .font(FreeLineTheme.body(14, weight: .semibold))
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .foregroundStyle(isSelected ? .white : action.tint)
            .padding(.horizontal, 14)
            .padding(.vertical, 13)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(
                        isSelected
                            ? AnyShapeStyle(action.tint.gradient)
                            : AnyShapeStyle(
                                LinearGradient(
                                    colors: [Color.white.opacity(0.66), Color.white.opacity(0.48)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(isSelected ? action.tint.opacity(0.2) : Color.white.opacity(0.72), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

private struct AuraSummaryRow: View {
    let title: String
    let value: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title.uppercased())
                .font(FreeLineTheme.body(11, weight: .semibold))
                .kerning(1.0)
                .foregroundStyle(FreeLineTheme.textSecondary)
            Text(value)
                .font(FreeLineTheme.body(15, weight: .semibold))
                .foregroundStyle(tint)
        }
    }
}

private enum AuraDemoAction: String, CaseIterable, Identifiable {
    case takeOver
    case askOneMore
    case replyByText
    case voicemail

    var id: String { rawValue }

    var displayTitle: String {
        switch self {
        case .takeOver:
            return "Take over now"
        case .askOneMore:
            return "Ask one more question"
        case .replyByText:
            return "Reply by text"
        case .voicemail:
            return "Send to voicemail"
        }
    }

    var shortLabel: String {
        switch self {
        case .takeOver:
            return "Take over"
        case .askOneMore:
            return "Ask more"
        case .replyByText:
            return "Text instead"
        case .voicemail:
            return "Voicemail"
        }
    }

    var symbolName: String {
        switch self {
        case .takeOver:
            return "phone.fill"
        case .askOneMore:
            return "questionmark.bubble.fill"
        case .replyByText:
            return "message.fill"
        case .voicemail:
            return "waveform.badge.mic"
        }
    }

    var tint: Color {
        switch self {
        case .takeOver:
            return FreeLineTheme.accentDeep
        case .askOneMore:
            return FreeLineTheme.warning
        case .replyByText:
            return FreeLineTheme.mint
        case .voicemail:
            return FreeLineTheme.coral
        }
    }

    var supportingText: String {
        switch self {
        case .takeOver:
            return "Jump into the live call yourself once Aura confirms who is calling."
        case .askOneMore:
            return "Let Aura clarify the exact reason for the call before you commit."
        case .replyByText:
            return "Keep control and answer with a drafted text while the caller is still at the door."
        case .voicemail:
            return "Move the call aside without losing context or transcript history."
        }
    }

    var replyPreview: String {
        switch self {
        case .takeOver:
            return "Joining the call live now. Keep the transcript visible as a sidecar summary."
        case .askOneMore:
            return "Aura follow-up: “Can you confirm the exact entrance and how long you’ll be there?”"
        case .replyByText:
            return "I’m on my way down now. If I miss you, please leave it with the front desk."
        case .voicemail:
            return "Send this caller to voicemail and keep the recap card pinned in Recents."
        }
    }
}

private struct AuraTranscriptEntry: Identifiable {
    let id: Int
    let speaker: String
    let text: String
    let symbolName: String
    let tint: Color
}

private enum AuraDemoScript {
    static let deliveryDriver = [
        AuraTranscriptEntry(
            id: 0,
            speaker: "Aura",
            text: "Hi, this line uses call screening. Please say your name and why you’re calling.",
            symbolName: "sparkles",
            tint: FreeLineTheme.accentDeep
        ),
        AuraTranscriptEntry(
            id: 1,
            speaker: "Caller",
            text: "Hey, this is Mike from FedEx. I’m downstairs and need the gate code for your delivery.",
            symbolName: "phone.down.fill",
            tint: FreeLineTheme.warning
        ),
        AuraTranscriptEntry(
            id: 2,
            speaker: "Aura",
            text: "Got it. Are you at the building now, and should I let them know you’re coming down?",
            symbolName: "bubble.left.and.exclamationmark.bubble.right.fill",
            tint: FreeLineTheme.accentDeep
        ),
        AuraTranscriptEntry(
            id: 3,
            speaker: "Caller",
            text: "Yes, I’m by the loading entrance right now.",
            symbolName: "location.fill",
            tint: FreeLineTheme.mint
        )
    ]
}

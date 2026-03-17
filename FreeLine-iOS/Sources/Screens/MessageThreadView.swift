import SwiftUI

struct MessageThreadView: View {
    @EnvironmentObject private var appModel: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var draft = ""

    let conversation: ConversationSummary

    var body: some View {
        ScrollViewReader { proxy in
            FreeLineScreen {
                VStack(spacing: 0) {
                    if appModel.isLoading && appModel.currentMessages.isEmpty {
                        Spacer()
                        ProgressView("Loading messages")
                            .tint(FreeLineTheme.accentDeep)
                            .foregroundStyle(FreeLineTheme.textPrimary)
                        Spacer()
                    } else {
                        ScrollView(showsIndicators: false) {
                            VStack(alignment: .leading, spacing: 18) {
                                conversationHeader

                                if let errorMessage = appModel.errorMessage {
                                    FreeLineGlassCard(padding: 16) {
                                        Text(errorMessage)
                                            .font(FreeLineTheme.body(14, weight: .semibold))
                                            .foregroundStyle(FreeLineTheme.coral)
                                    }
                                }

                                if appModel.currentMessages.isEmpty {
                                    FreeLineGlassCard {
                                        VStack(alignment: .leading, spacing: 8) {
                                            Text("Start the thread")
                                                .font(FreeLineTheme.body(19, weight: .bold))
                                                .foregroundStyle(FreeLineTheme.textPrimary)
                                            Text("Your first message appears here with delivery status and time stamps in a calm, readable layout.")
                                                .font(FreeLineTheme.body(15, weight: .medium))
                                                .foregroundStyle(FreeLineTheme.textSecondary)
                                        }
                                    }
                                } else {
                                    LazyVStack(spacing: 14) {
                                        ForEach(appModel.currentMessages) { message in
                                            MessageBubbleView(message: message)
                                                .id(message.id)
                                        }
                                    }
                                    .padding(.top, 4)
                                }
                            }
                            .padding(.horizontal, 20)
                            .padding(.top, 16)
                            .padding(.bottom, 32)
                        }
                        .onChange(of: appModel.currentMessages.last?.id) { _, newValue in
                            guard let newValue else { return }
                            withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
                                proxy.scrollTo(newValue, anchor: .bottom)
                            }
                        }
                    }

                    composerBar
                }
            }
            .navigationTitle(conversation.displayNumber)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        Task {
                            await appModel.loadCurrentConversationMessages()
                        }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }

                    Menu {
                        Button("Report Spam") {
                            Task {
                                _ = await appModel.reportCurrentConversation()
                            }
                        }

                        Button("Block Number", role: .destructive) {
                            Task {
                                if await appModel.blockCurrentConversation() {
                                    dismiss()
                                }
                            }
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .task {
                await appModel.openConversation(conversation)
            }
            .onDisappear {
                appModel.clearCurrentConversation()
            }
        }
    }

    private var conversationHeader: some View {
        FreeLineGlassCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(conversation.displayNumber)
                            .font(FreeLineTheme.title(30))
                            .foregroundStyle(FreeLineTheme.textPrimary)
                        Text("Private line conversation")
                            .font(FreeLineTheme.body(15, weight: .medium))
                            .foregroundStyle(FreeLineTheme.textSecondary)
                    }

                    Spacer()

                    FreeLineHeroIcon(
                        systemImage: conversationStateIsOptedOut ? "hand.raised.fill" : "message.badge.fill"
                    )
                    .scaleEffect(0.78)
                }

                HStack(spacing: 12) {
                    FreeLinePill(
                        icon: conversationStateIsOptedOut ? "hand.raised.fill" : "checkmark.seal.fill",
                        text: conversationStateIsOptedOut ? "Replies paused" : "Messaging enabled",
                        tint: conversationStateIsOptedOut ? FreeLineTheme.warning : FreeLineTheme.mint
                    )
                    FreeLinePill(
                        icon: "text.bubble.fill",
                        text: "\(appModel.currentMessages.count) messages",
                        tint: FreeLineTheme.accentDeep
                    )
                }
            }
        }
    }

    private var composerBar: some View {
        VStack(spacing: 0) {
            if conversationStateIsOptedOut {
                Label(
                    "This contact opted out. Outbound messaging is disabled.",
                    systemImage: "hand.raised.fill"
                )
                .font(FreeLineTheme.body(13, weight: .semibold))
                .foregroundStyle(FreeLineTheme.warning)
                .padding(.horizontal, 20)
                .padding(.top, 6)
                .padding(.bottom, 10)
            }

            FreeLineGlassCard(padding: 14) {
                HStack(alignment: .bottom, spacing: 12) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Message")
                            .font(FreeLineTheme.body(12, weight: .semibold))
                            .foregroundStyle(FreeLineTheme.textSecondary)

                        TextField("Write a message", text: $draft, axis: .vertical)
                            .font(FreeLineTheme.body(16, weight: .medium))
                            .foregroundStyle(FreeLineTheme.textPrimary)
                            .lineLimit(1...4)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .fill(.white.opacity(0.74))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .stroke(Color.white.opacity(0.78), lineWidth: 1)
                    )

                    Button {
                        Task {
                            let sentConversation = await appModel.sendMessage(
                                to: conversation.participantNumber,
                                body: draft
                            )
                            if sentConversation != nil {
                                draft = ""
                            }
                        }
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 38, weight: .semibold))
                            .foregroundStyle(sendButtonColor)
                    }
                    .disabled(
                        draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                        conversationStateIsOptedOut
                    )
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 12)
        }
        .background(.ultraThinMaterial)
    }

    private var conversationStateIsOptedOut: Bool {
        appModel.currentConversation?.isOptedOut ?? conversation.isOptedOut
    }

    private var sendButtonColor: Color {
        draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || conversationStateIsOptedOut
            ? Color.secondary.opacity(0.45)
            : FreeLineTheme.accentDeep
    }
}

private struct MessageBubbleView: View {
    let message: ChatMessage

    var body: some View {
        HStack {
            if message.isOutgoing {
                Spacer(minLength: 48)
            }

            VStack(
                alignment: message.isOutgoing ? .trailing : .leading,
                spacing: 8
            ) {
                Text(message.body)
                    .font(FreeLineTheme.body(16, weight: .medium))
                    .frame(maxWidth: 290, alignment: message.isOutgoing ? .trailing : .leading)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .fill(
                                message.isOutgoing
                                    ? AnyShapeStyle(FreeLineTheme.primaryGradient)
                                    : AnyShapeStyle(Color.white.opacity(0.78))
                            )
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .stroke(message.isOutgoing ? Color.clear : Color.white.opacity(0.84), lineWidth: 1)
                    )
                    .shadow(
                        color: message.isOutgoing ? FreeLineTheme.accent.opacity(0.16) : FreeLineTheme.shadow.opacity(0.6),
                        radius: 12,
                        x: 0,
                        y: 8
                    )
                    .foregroundStyle(message.isOutgoing ? .white : FreeLineTheme.textPrimary)

                Text("\(message.status.capitalized) • \(formattedTime(message.createdAt))")
                    .font(FreeLineTheme.body(11, weight: .medium))
                    .foregroundStyle(FreeLineTheme.textSecondary)
                    .padding(.horizontal, 4)
            }

            if !message.isOutgoing {
                Spacer(minLength: 48)
            }
        }
    }

    private func formattedTime(_ iso8601: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: iso8601) else {
            return iso8601
        }

        return date.formatted(date: .omitted, time: .shortened)
    }
}

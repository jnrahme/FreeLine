import SwiftUI

struct ConversationsView: View {
    @EnvironmentObject private var appModel: AppModel

    var body: some View {
        NavigationStack {
            FreeLineScreen {
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 20) {
                        headerCard

                        if let summary = appModel.usageSummary {
                            UsageOverviewCard(
                                summary: summary,
                                remainingRewardClaims: appModel.remainingRewardClaims
                            )
                        }

                        if appModel.conversations.isEmpty {
                            emptyStateCard
                        } else {
                            VStack(alignment: .leading, spacing: 14) {
                                Text("Inbox")
                                    .font(FreeLineTheme.body(20, weight: .bold))
                                    .foregroundStyle(FreeLineTheme.textPrimary)

                                ForEach(Array(appModel.conversations.enumerated()), id: \.element.id) { index, conversation in
                                    Button {
                                        appModel.presentConversation(conversation)
                                    } label: {
                                        ConversationRowView(conversation: conversation)
                                    }
                                    .buttonStyle(.plain)

                                    if appModel.adsEnabled, (index + 1).isMultiple(of: 5) {
                                        FreeLineGlassCard(padding: 12) {
                                            VStack(alignment: .leading, spacing: 12) {
                                                Text("Sponsored")
                                                    .font(FreeLineTheme.body(12, weight: .semibold))
                                                    .foregroundStyle(FreeLineTheme.textSecondary)

                                                SponsoredConversationAdRow(
                                                    onImpression: {
                                                        Task {
                                                            await appModel.trackAdImpression(
                                                                adType: "native",
                                                                placement: "messages_inbox_native",
                                                                adUnitId: AdConfiguration.nativeUnitID
                                                            )
                                                        }
                                                    },
                                                    onTap: {
                                                        Task {
                                                            await appModel.trackAdClick(
                                                                adType: "native",
                                                                placement: "messages_inbox_native"
                                                            )
                                                        }
                                                    }
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 140)
                }
                .refreshable {
                    await appModel.loadConversations()
                }
                .safeAreaInset(edge: .bottom) {
                    BannerAdPlacementView(
                        placement: "messages_bottom_banner",
                        isHidden: !appModel.adsEnabled,
                        onImpression: {
                            Task {
                                await appModel.trackAdImpression(
                                    adType: "banner",
                                    placement: "messages_bottom_banner",
                                    adUnitId: AdConfiguration.bannerUnitID
                                )
                            }
                        },
                        onTap: {
                            Task {
                                await appModel.trackAdClick(
                                    adType: "banner",
                                    placement: "messages_bottom_banner"
                                )
                            }
                        }
                    )
                    .padding(.horizontal)
                    .padding(.top, 8)
                    .freeLineBottomInsetBackdrop()
                }
                .overlay(alignment: .bottomTrailing) {
                    Button {
                        appModel.showMessageComposer()
                    } label: {
                        Image(systemName: "square.and.pencil")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(20)
                            .freeLineFloatingActionSurface(tint: FreeLineTheme.accentDeep)
                    }
                    .padding(.trailing, 20)
                    .padding(.bottom, 82)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .task {
                await appModel.loadConversations()
            }
            .navigationDestination(item: activeConversation) { conversation in
                MessageThreadView(conversation: conversation)
            }
            .sheet(isPresented: composerPresentation) {
                NewMessageView()
                    .environmentObject(appModel)
            }
        }
    }

    private var headerCard: some View {
        FreeLineGlassCard {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Messages")
                            .font(FreeLineTheme.title(34))
                            .foregroundStyle(FreeLineTheme.textPrimary)

                        Text(appModel.currentNumber?.nationalFormat ?? "No number assigned")
                            .font(FreeLineTheme.body(16, weight: .semibold))
                            .foregroundStyle(FreeLineTheme.accentDeep)

                        Text("Keep personal and side-project conversations in one focused inbox.")
                            .font(FreeLineTheme.body(15, weight: .medium))
                            .foregroundStyle(FreeLineTheme.textSecondary)
                    }

                    Spacer()

                    FreeLinePill(
                        icon: "bubble.left.and.bubble.right.fill",
                        text: "\(appModel.conversations.count) threads",
                        tint: FreeLineTheme.accentDeep
                    )
                }

                FreeLineGlassGroup(spacing: 12) {
                    HStack(spacing: 12) {
                        FreeLinePill(icon: "person.fill", text: appModel.currentUserEmail, tint: FreeLineTheme.textSecondary)
                        if appModel.adsEnabled {
                            FreeLinePill(icon: "megaphone.fill", text: "Ad-supported", tint: FreeLineTheme.warning)
                        } else {
                            FreeLinePill(icon: "crown.fill", text: appModel.currentPlanTitle, tint: FreeLineTheme.mint)
                        }
                    }
                }
            }
        }
    }

    private var emptyStateCard: some View {
        FreeLineGlassCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    FreeLineHeroIcon(systemImage: "message.badge.waveform.fill")
                        .scaleEffect(0.74)
                    Spacer()
                }

                Text("No conversations yet")
                    .font(FreeLineTheme.body(22, weight: .bold))
                    .foregroundStyle(FreeLineTheme.textPrimary)

                Text("Signed in as \(appModel.currentUserEmail). Your line will start filling once you send or receive your first message.")
                    .font(FreeLineTheme.body(15, weight: .medium))
                    .foregroundStyle(FreeLineTheme.textSecondary)
            }
        }
    }

    private var activeConversation: Binding<ConversationSummary?> {
        Binding(
            get: { appModel.currentConversation },
            set: { conversation in
                if conversation == nil {
                    appModel.clearCurrentConversation()
                }
            }
        )
    }

    private var composerPresentation: Binding<Bool> {
        Binding(
            get: { appModel.isPresentingMessageComposer },
            set: { isPresented in
                if !isPresented {
                    appModel.dismissMessageComposer()
                }
            }
        )
    }
}

private struct ConversationRowView: View {
    let conversation: ConversationSummary

    var body: some View {
        FreeLineGlassCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 14) {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [FreeLineTheme.accent.opacity(0.92), FreeLineTheme.mint.opacity(0.72)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 46, height: 46)
                        .overlay(
                            Image(systemName: "person.wave.2.fill")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(.white)
                        )

                    VStack(alignment: .leading, spacing: 6) {
                        HStack(alignment: .top) {
                            Text(conversation.displayNumber)
                                .font(FreeLineTheme.body(18, weight: .bold))
                                .foregroundStyle(FreeLineTheme.textPrimary)

                            Spacer()

                            VStack(alignment: .trailing, spacing: 8) {
                                if let timestamp = formattedTimestamp(conversation.lastMessageAt) {
                                    Text(timestamp)
                                        .font(FreeLineTheme.body(12, weight: .semibold))
                                        .foregroundStyle(FreeLineTheme.textSecondary)
                                }

                                if conversation.unreadCount > 0 {
                                    Text("\(min(conversation.unreadCount, 99))")
                                        .font(FreeLineTheme.body(12, weight: .bold))
                                        .foregroundStyle(.white)
                                        .padding(.horizontal, 9)
                                        .padding(.vertical, 5)
                                        .background(FreeLineTheme.accent, in: Capsule())
                                }
                            }
                        }

                        Text(conversation.lastMessagePreview ?? "No messages yet")
                            .font(FreeLineTheme.body(15, weight: .medium))
                            .foregroundStyle(FreeLineTheme.textSecondary)
                            .lineLimit(2)

                        if let status = conversation.lastMessageStatus {
                            Text(status.capitalized)
                                .font(FreeLineTheme.body(12, weight: .semibold))
                                .foregroundStyle(FreeLineTheme.textSecondary)
                        }
                    }
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

        return date.formatted(date: .omitted, time: .shortened)
    }
}

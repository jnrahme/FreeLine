import SwiftUI

struct ConversationsView: View {
    @EnvironmentObject private var appModel: AppModel
    @State private var isPresentingComposer = false

    var body: some View {
        NavigationStack {
            List {
                if let summary = appModel.usageSummary {
                    Section {
                        UsageOverviewCard(
                            summary: summary,
                            remainingRewardClaims: appModel.remainingRewardClaims
                        )
                    }
                }

                if appModel.conversations.isEmpty {
                    Section("Inbox") {
                        Text("No conversations yet")
                        Text("Signed in as \(appModel.currentUserEmail)")
                            .foregroundStyle(.secondary)
                        Text("Line: \(appModel.currentNumber?.nationalFormat ?? "Not assigned")")
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Section("Inbox") {
                        ForEach(Array(appModel.conversations.enumerated()), id: \.element.id) { index, conversation in
                            NavigationLink {
                                MessageThreadView(conversation: conversation)
                            } label: {
                                ConversationRowView(conversation: conversation)
                            }

                            if appModel.adsEnabled, (index + 1).isMultiple(of: 5) {
                                SponsoredConversationRow(
                                    onImpression: {
                                        Task {
                                            await appModel.trackAdImpression(
                                                adType: "native",
                                                placement: "messages_inbox_native",
                                                adUnitId: AdConfiguration.bannerUnitID
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
            .navigationTitle("Messages")
            .overlay(alignment: .bottomTrailing) {
                Button {
                    isPresentingComposer = true
                } label: {
                    Image(systemName: "square.and.pencil")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(18)
                        .background(Color.accentColor, in: Circle())
                        .shadow(radius: 8, y: 4)
                }
                .padding()
            }
            .refreshable {
                await appModel.loadConversations()
            }
            .task {
                await appModel.loadConversations()
            }
            .sheet(isPresented: $isPresentingComposer) {
                NewMessageView()
                    .environmentObject(appModel)
            }
            .safeAreaInset(edge: .bottom) {
                DevBannerAdView(
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
                .background(.ultraThinMaterial)
            }
        }
    }
}

private struct ConversationRowView: View {
    let conversation: ConversationSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(conversation.displayNumber)
                    .font(.headline)

                Spacer()

                if conversation.unreadCount > 0 {
                    Text("\(min(conversation.unreadCount, 99))")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.accentColor, in: Capsule())
                }

                if let timestamp = formattedTimestamp(conversation.lastMessageAt) {
                    Text(timestamp)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Text(conversation.lastMessagePreview ?? "No messages yet")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)

            if let status = conversation.lastMessageStatus {
                Text(status.capitalized)
                    .font(.caption2.weight(.medium))
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

        return date.formatted(date: .omitted, time: .shortened)
    }
}

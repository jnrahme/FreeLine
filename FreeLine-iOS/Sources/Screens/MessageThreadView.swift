import SwiftUI

struct MessageThreadView: View {
    @EnvironmentObject private var appModel: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var draft = ""

    let conversation: ConversationSummary

    var body: some View {
        ScrollViewReader { proxy in
            VStack(spacing: 0) {
                if appModel.isLoading && appModel.currentMessages.isEmpty {
                    Spacer()
                    ProgressView("Loading messages")
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(appModel.currentMessages) { message in
                                MessageBubbleView(message: message)
                                    .id(message.id)
                            }
                        }
                        .padding()
                    }
                    .background(Color(uiColor: .systemGroupedBackground))
                    .onChange(of: appModel.currentMessages.last?.id) { _, newValue in
                        guard let newValue else { return }
                        withAnimation {
                            proxy.scrollTo(newValue, anchor: .bottom)
                        }
                    }

                    if appModel.currentConversation?.isOptedOut ?? conversation.isOptedOut {
                        Label(
                            "This contact opted out. Outbound messaging is disabled.",
                            systemImage: "hand.raised.fill"
                        )
                        .font(.footnote)
                        .foregroundStyle(.orange)
                        .padding(.horizontal)
                        .padding(.bottom, 8)
                    }
                }

                Divider()

                HStack(alignment: .bottom, spacing: 12) {
                    TextField("Message", text: $draft, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(1...4)

                    Button("Send") {
                        Task {
                            let sentConversation = await appModel.sendMessage(
                                to: conversation.participantNumber,
                                body: draft
                            )
                            if sentConversation != nil {
                                draft = ""
                            }
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(
                        draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                        (appModel.currentConversation?.isOptedOut ?? conversation.isOptedOut)
                    )
                }
                .padding()
                .background(.ultraThinMaterial)
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
                spacing: 6
            ) {
                Text(message.body)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        message.isOutgoing ? Color.accentColor : Color(uiColor: .secondarySystemBackground),
                        in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                    )
                    .foregroundStyle(message.isOutgoing ? .white : .primary)

                Text("\(message.status.capitalized) • \(formattedTime(message.createdAt))")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
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

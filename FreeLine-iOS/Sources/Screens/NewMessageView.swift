import SwiftUI

struct NewMessageView: View {
    @EnvironmentObject private var appModel: AppModel

    var body: some View {
        NavigationStack {
            FreeLineScreen {
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 20) {
                        FreeLineGlassCard {
                            VStack(alignment: .leading, spacing: 16) {
                                HStack(alignment: .top) {
                                    VStack(alignment: .leading, spacing: 8) {
                                        Text("New Message")
                                            .font(FreeLineTheme.title(34))
                                            .foregroundStyle(FreeLineTheme.textPrimary)
                                        Text("Start a fresh conversation with a U.S. number using your FreeLine message allowance.")
                                            .font(FreeLineTheme.body(15, weight: .medium))
                                            .foregroundStyle(FreeLineTheme.textSecondary)
                                    }

                                    Spacer()

                                    FreeLineHeroIcon(systemImage: "square.and.pencil")
                                        .scaleEffect(0.82)
                                }

                                HStack(spacing: 12) {
                                    FreeLinePill(icon: "message.fill", text: "SMS only", tint: FreeLineTheme.accentDeep)
                                    FreeLinePill(icon: "lock.shield.fill", text: "Private line", tint: FreeLineTheme.mint)
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

                        FreeLineGlassCard {
                            VStack(alignment: .leading, spacing: 16) {
                                FreeLineField(
                                    label: "Recipient",
                                    icon: "phone.fill",
                                    caption: "Enter a full U.S. phone number."
                                ) {
                                    TextField("U.S. phone number", text: $appModel.composerRecipientDraft)
                                        .keyboardType(.phonePad)
                                        .textInputAutocapitalization(.never)
                                        .textContentType(.telephoneNumber)
                                }

                                FreeLineField(
                                    label: "Message",
                                    icon: "ellipsis.bubble.fill",
                                    caption: "Keep it clear and concise. Messages count toward your monthly allowance."
                                ) {
                                    ZStack(alignment: .topLeading) {
                                        if appModel.composerBodyDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                            Text("Type your message")
                                                .font(FreeLineTheme.body(17, weight: .medium))
                                                .foregroundStyle(FreeLineTheme.textSecondary.opacity(0.78))
                                                .padding(.horizontal, 20)
                                                .padding(.vertical, 18)
                                        }

                                        TextEditor(text: $appModel.composerBodyDraft)
                                            .font(FreeLineTheme.body(17, weight: .medium))
                                            .foregroundStyle(FreeLineTheme.textPrimary)
                                            .frame(minHeight: 150)
                                            .padding(.horizontal, 12)
                                            .padding(.vertical, 8)
                                            .scrollContentBackground(.hidden)
                                            .background(Color.clear)
                                    }
                                }
                            }
                        }

                        if let allowance = appModel.messageAllowance {
                            FreeLineGlassCard {
                                VStack(alignment: .leading, spacing: 14) {
                                    Text("Allowance")
                                        .font(FreeLineTheme.body(20, weight: .bold))
                                        .foregroundStyle(FreeLineTheme.textPrimary)

                                    HStack(spacing: 16) {
                                        FreeLineStatStrip(
                                            title: "Today",
                                            value: "\(allowance.dailyRemaining) left",
                                            tint: FreeLineTheme.accentDeep
                                        )
                                        FreeLineStatStrip(
                                            title: "Month",
                                            value: "\(allowance.monthlyRemaining) left",
                                            tint: FreeLineTheme.mint
                                        )
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 140)
                }
                .safeAreaInset(edge: .bottom) {
                    FreeLineGlassCard(padding: 14) {
                        Button("Send Message") {
                            Task {
                                let conversation = await appModel.sendMessage(
                                    to: appModel.composerRecipientDraft,
                                    body: appModel.composerBodyDraft
                                )
                                if conversation != nil {
                                    appModel.dismissMessageComposer()
                                }
                            }
                        }
                        .buttonStyle(FreeLinePrimaryButtonStyle())
                        .disabled(
                            appModel.composerRecipientDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                            appModel.composerBodyDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        )
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 12)
                    .background(.ultraThinMaterial)
                }
            }
            .navigationTitle("Compose")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        appModel.dismissMessageComposer()
                    }
                }
            }
        }
    }
}

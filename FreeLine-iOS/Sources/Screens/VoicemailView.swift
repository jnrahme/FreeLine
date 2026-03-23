import SwiftUI

struct VoicemailView: View {
    @EnvironmentObject private var appModel: AppModel
    @StateObject private var playbackController = VoicemailPlaybackController()
    private var unreadCount: Int {
        appModel.voicemails.filter { !$0.isRead }.count
    }

    var body: some View {
        NavigationStack {
            FreeLineScreen {
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 20) {
                        FreeLineGlassCard {
                            VStack(alignment: .leading, spacing: 16) {
                                HStack(alignment: .top) {
                                    VStack(alignment: .leading, spacing: 8) {
                                        Text("Voicemail")
                                            .font(FreeLineTheme.title(34))
                                            .foregroundStyle(FreeLineTheme.textPrimary)
                                        Text("Listen back, read transcriptions, and keep missed conversations from falling through the cracks.")
                                            .font(FreeLineTheme.body(15, weight: .medium))
                                            .foregroundStyle(FreeLineTheme.textSecondary)
                                    }

                                    Spacer(minLength: 16)

                                    FreeLineHeroIcon(systemImage: "waveform.badge.mic")
                                        .scaleEffect(0.82)
                                }

                                FreeLineGlassGroup(spacing: 12) {
                                    HStack(spacing: 12) {
                                        FreeLinePill(icon: "waveform", text: "Archived audio", tint: FreeLineTheme.accentDeep)
                                        if unreadCount > 0 {
                                            FreeLinePill(icon: "circle.fill", text: "\(unreadCount) unread", tint: FreeLineTheme.mint)
                                        } else {
                                            FreeLinePill(icon: "checkmark.circle.fill", text: "All caught up", tint: FreeLineTheme.mint)
                                        }
                                    }
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

                        if appModel.voicemails.isEmpty {
                            FreeLineGlassCard {
                                VStack(alignment: .leading, spacing: 12) {
                                    HStack {
                                        FreeLineHeroIcon(systemImage: "waveform")
                                            .scaleEffect(0.72)
                                        Spacer()
                                    }

                                    Text("No voicemails yet")
                                        .font(FreeLineTheme.body(21, weight: .bold))
                                        .foregroundStyle(FreeLineTheme.textPrimary)
                                    Text("New recordings and transcripts will appear here.")
                                        .font(FreeLineTheme.body(15, weight: .medium))
                                        .foregroundStyle(FreeLineTheme.textSecondary)
                                }
                            }
                        } else {
                            VStack(alignment: .leading, spacing: 14) {
                                Text("Inbox")
                                    .font(FreeLineTheme.body(20, weight: .bold))
                                    .foregroundStyle(FreeLineTheme.textPrimary)

                                ForEach(appModel.voicemails) { voicemail in
                                    VoicemailRow(
                                        playbackController: playbackController,
                                        voicemail: voicemail,
                                        onDelete: {
                                            Task {
                                                _ = await appModel.deleteVoicemail(voicemail)
                                            }
                                        },
                                        onRead: {
                                            Task {
                                                await appModel.markVoicemailRead(voicemail)
                                            }
                                        }
                                    )
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 40)
                }
                .refreshable {
                    await appModel.loadVoicemails()
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .task {
                await appModel.loadVoicemails()
            }
            .onDisappear {
                playbackController.stop()
            }
        }
    }
}

private struct VoicemailRow: View {
    @ObservedObject var playbackController: VoicemailPlaybackController
    let voicemail: VoicemailEntry
    let onDelete: () -> Void
    let onRead: () -> Void

    var body: some View {
        FreeLineGlassCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    HStack(alignment: .top, spacing: 14) {
                        FreeLineHeroIcon(systemImage: "waveform")
                            .scaleEffect(0.62)

                        VStack(alignment: .leading, spacing: 6) {
                            Text(voicemail.displayNumber)
                                .font(FreeLineTheme.body(18, weight: .bold))
                                .foregroundStyle(FreeLineTheme.textPrimary)
                            Text(voicemail.transcription?.isEmpty == false ? voicemail.transcription! : "Recording available")
                                .font(FreeLineTheme.body(14, weight: .medium))
                                .foregroundStyle(FreeLineTheme.textSecondary)
                                .lineLimit(2)
                        }
                    }

                    Spacer()

                    VStack(alignment: .trailing, spacing: 8) {
                        Text(voicemail.durationLabel)
                            .font(FreeLineTheme.body(12, weight: .semibold))
                            .foregroundStyle(FreeLineTheme.textSecondary)
                        if !voicemail.isRead {
                            FreeLinePill(icon: "circle.fill", text: "Unread", tint: FreeLineTheme.accentDeep)
                        }
                    }
                }

                HStack(spacing: 12) {
                    Button {
                        playbackController.togglePlayback(for: voicemail)
                    } label: {
                        Label(
                            playbackController.isPlaying(voicemail) ? "Pause" : "Play",
                            systemImage: playbackController.isPlaying(voicemail) ? "pause.circle.fill" : "play.circle.fill"
                        )
                    }
                    .buttonStyle(FreeLinePrimaryButtonStyle())

                    if !voicemail.isRead {
                        Button("Mark Read", action: onRead)
                            .buttonStyle(FreeLineSecondaryButtonStyle())
                    }

                    Button("Delete", role: .destructive, action: onDelete)
                        .buttonStyle(FreeLineSecondaryButtonStyle())
                }

                Text(voicemail.createdAt)
                    .font(FreeLineTheme.body(12, weight: .medium))
                    .foregroundStyle(FreeLineTheme.textSecondary)
            }
        }
    }
}

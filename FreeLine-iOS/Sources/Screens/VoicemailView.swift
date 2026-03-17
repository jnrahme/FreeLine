import SwiftUI

struct VoicemailView: View {
    @EnvironmentObject private var appModel: AppModel
    @StateObject private var playbackController = VoicemailPlaybackController()

    var body: some View {
        NavigationStack {
            List {
                if let errorMessage = appModel.errorMessage {
                    Section("Status") {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }
                }

                if appModel.voicemails.isEmpty {
                    Section("Inbox") {
                        Text("No voicemails yet")
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Section("Inbox") {
                        ForEach(appModel.voicemails) { voicemail in
                            VoicemailRow(
                                playbackController: playbackController,
                                voicemail: voicemail
                            )
                                .swipeActions(edge: .trailing) {
                                    Button(role: .destructive) {
                                        Task {
                                            _ = await appModel.deleteVoicemail(voicemail)
                                        }
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                                .swipeActions(edge: .leading) {
                                    if !voicemail.isRead {
                                        Button {
                                            Task {
                                                await appModel.markVoicemailRead(voicemail)
                                            }
                                        } label: {
                                            Label("Read", systemImage: "checkmark")
                                        }
                                        .tint(.green)
                                    }
                                }
                        }
                    }
                }
            }
            .navigationTitle("Voicemail")
            .task {
                await appModel.loadVoicemails()
            }
            .onDisappear {
                playbackController.stop()
            }
            .refreshable {
                await appModel.loadVoicemails()
            }
        }
    }
}

private struct VoicemailRow: View {
    @ObservedObject var playbackController: VoicemailPlaybackController
    let voicemail: VoicemailEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(voicemail.displayNumber)
                    .font(.headline)
                Spacer()
                Text(voicemail.durationLabel)
                    .foregroundStyle(.secondary)
            }

            Text(voicemail.transcription?.isEmpty == false ? voicemail.transcription! : "Recording available")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)

            Button {
                playbackController.togglePlayback(for: voicemail)
            } label: {
                Label(
                    playbackController.isPlaying(voicemail) ? "Pause Recording" : "Play Recording",
                    systemImage: playbackController.isPlaying(voicemail) ? "pause.circle.fill" : "play.circle.fill"
                )
            }
            .buttonStyle(.borderless)

            HStack {
                Text(voicemail.createdAt)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                if !voicemail.isRead {
                    Text("Unread")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.blue)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

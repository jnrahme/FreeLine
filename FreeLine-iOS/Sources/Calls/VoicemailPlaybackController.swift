import AVFoundation
import Foundation

@MainActor
final class VoicemailPlaybackController: ObservableObject {
    @Published private(set) var activeVoicemailId: String?

    private var completionObserver: NSObjectProtocol?
    private var player: AVPlayer?

    func isPlaying(_ voicemail: VoicemailEntry) -> Bool {
        activeVoicemailId == voicemail.id && player?.timeControlStatus != .paused
    }

    func togglePlayback(for voicemail: VoicemailEntry) {
        if isPlaying(voicemail) {
            pause()
            return
        }

        play(voicemail)
    }

    func pause() {
        player?.pause()
    }

    func stop() {
        player?.pause()
        player = nil
        activeVoicemailId = nil

        if let completionObserver {
            NotificationCenter.default.removeObserver(completionObserver)
            self.completionObserver = nil
        }
    }

    private func play(_ voicemail: VoicemailEntry) {
        guard let url = URL(string: voicemail.audioUrl) else {
            stop()
            return
        }

        stop()

        let player = AVPlayer(url: url)
        self.player = player
        activeVoicemailId = voicemail.id
        completionObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: player.currentItem,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.stop()
            }
        }
        player.play()
    }
}

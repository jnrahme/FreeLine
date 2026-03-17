import AVFoundation
import Foundation
import TwilioVoice

enum VoiceTransportError: LocalizedError {
    case microphonePermissionDenied
    case providerNotConfigured

    var errorDescription: String? {
        switch self {
        case .microphonePermissionDenied:
            return "Microphone access is required before placing a call."
        case .providerNotConfigured:
            return "Voice provider is not configured yet. Add Twilio voice credentials to the backend first."
        }
    }
}

@MainActor
final class TwilioVoiceTransport: NSObject {
    private let audioDevice = DefaultAudioDevice()
    private var currentCall: Call?
    private var eventHandler: ((VoiceCallEvent) -> Void)?

    override init() {
        super.init()
        TwilioVoiceSDK.audioDevice = audioDevice
    }

    func startOutgoingCall(
        token: String,
        to remoteNumber: String,
        eventHandler: @escaping (VoiceCallEvent) -> Void
    ) async throws {
        guard token.split(separator: ".").count == 3 else {
            throw VoiceTransportError.providerNotConfigured
        }

        try await ensureMicrophonePermission()
        self.eventHandler = eventHandler
        eventHandler(.connecting)

        let connectOptions = ConnectOptions(accessToken: token) { builder in
            builder.params = ["to": remoteNumber]
        }

        currentCall = TwilioVoiceSDK.connect(options: connectOptions, delegate: self)
    }

    func endActiveCall() {
        currentCall?.disconnect()
        currentCall = nil
    }

    func setMuted(_ isMuted: Bool) {
        currentCall?.isMuted = isMuted
    }

    func setSpeakerEnabled(_ isEnabled: Bool) {
        audioDevice.block = {
            do {
                try AVAudioSession.sharedInstance().overrideOutputAudioPort(
                    isEnabled ? .speaker : .none
                )
            } catch {
                NSLog("Failed to toggle speaker route: \(error.localizedDescription)")
            }
        }

        audioDevice.block()
    }

    func sendDigits(_ digits: String) {
        guard !digits.isEmpty else {
            return
        }

        currentCall?.sendDigits(digits)
    }

    private func ensureMicrophonePermission() async throws {
        switch AVAudioApplication.shared.recordPermission {
        case .granted:
            return
        case .denied:
            throw VoiceTransportError.microphonePermissionDenied
        case .undetermined:
            let granted = await withCheckedContinuation { continuation in
                AVAudioApplication.requestRecordPermission { didGrant in
                    continuation.resume(returning: didGrant)
                }
            }

            guard granted else {
                throw VoiceTransportError.microphonePermissionDenied
            }
        @unknown default:
            throw VoiceTransportError.microphonePermissionDenied
        }
    }
}

extension TwilioVoiceTransport: @MainActor CallDelegate {
    func callDidStartRinging(call: Call) {
        eventHandler?(.ringing)
    }

    func callDidConnect(call: Call) {
        currentCall = call
        setSpeakerEnabled(true)
        eventHandler?(.connected(Date()))
    }

    func callIsReconnecting(call: Call, error: Error) {
        eventHandler?(.reconnecting(error.localizedDescription))
    }

    func callDidReconnect(call: Call) {
        eventHandler?(.reconnected)
    }

    func callDidFailToConnect(call: Call, error: Error) {
        currentCall = nil
        eventHandler?(.failed(error.localizedDescription))
    }

    func callDidDisconnect(call: Call, error: Error?) {
        currentCall = nil
        eventHandler?(.disconnected(error?.localizedDescription))
    }
}

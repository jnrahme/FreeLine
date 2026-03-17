import CallKit
import PushKit
import UIKit
import UserNotifications

struct IncomingCallPayload: Equatable {
    let callerName: String?
    let callerNumber: String
    let providerCallId: String
}

@MainActor
final class IncomingCallRuntime: NSObject {
    static let shared = IncomingCallRuntime()

    private weak var appModel: AppModel?
    private var hasStarted = false
    private var latestAlertPushToken: String?
    private var latestVoipPushToken: String?
    private var pushRegistry: PKPushRegistry?
    private var callUUIDByProviderCallId: [String: UUID] = [:]
    private var payloadByCallUUID: [UUID: IncomingCallPayload] = [:]

    private lazy var provider: CXProvider = {
        let configuration = CXProviderConfiguration(localizedName: "FreeLine")
        configuration.includesCallsInRecents = true
        configuration.maximumCallsPerCallGroup = 1
        configuration.maximumCallGroups = 1
        configuration.supportedHandleTypes = [.phoneNumber]
        configuration.supportsVideo = false
        configuration.iconTemplateImageData = nil
        return CXProvider(configuration: configuration)
    }()

    private override init() {
        super.init()
    }

    func start(appModel: AppModel) {
        self.appModel = appModel

        guard !hasStarted else {
            Task {
                await syncCachedPushTokens()
            }
            return
        }

        hasStarted = true
        provider.setDelegate(self, queue: nil)
        requestAlertNotificationAuthorization()

        let registry = PKPushRegistry(queue: .main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        pushRegistry = registry

        Task {
            await syncCachedPushTokens()
        }
    }

    func updateAlertPushToken(_ deviceToken: Data) {
        let token = hexString(from: deviceToken)
        latestAlertPushToken = token

        Task {
            await appModel?.registerCallPushToken(channel: "alert", token: token)
            await appModel?.registerMessagePushToken(token)
        }
    }

    func syncCachedPushTokens() async {
        if let latestAlertPushToken {
            await appModel?.registerCallPushToken(channel: "alert", token: latestAlertPushToken)
            await appModel?.registerMessagePushToken(latestAlertPushToken)
        }

        if let latestVoipPushToken {
            await appModel?.registerVoipToken(latestVoipPushToken)
        }
    }

    private func requestAlertNotificationAuthorization() {
        UNUserNotificationCenter.current().requestAuthorization(
            options: [.alert, .badge, .sound]
        ) { granted, error in
            if let error {
                NSLog("FreeLine notification authorization failed: \(error.localizedDescription)")
            }

            guard granted else {
                return
            }

            Task { @MainActor in
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    private func reportIncomingCall(_ payload: IncomingCallPayload) {
        let callUUID = callUUIDByProviderCallId[payload.providerCallId] ?? UUID()
        callUUIDByProviderCallId[payload.providerCallId] = callUUID
        payloadByCallUUID[callUUID] = payload

        let update = CXCallUpdate()
        update.localizedCallerName = payload.callerName
        update.remoteHandle = CXHandle(
            type: .phoneNumber,
            value: payload.callerNumber.formattedUSPhoneNumber
        )
        update.hasVideo = false
        update.supportsDTMF = true
        update.supportsHolding = false
        update.supportsGrouping = false
        update.supportsUngrouping = false

        provider.reportNewIncomingCall(with: callUUID, update: update) { error in
            if let error {
                NSLog("FreeLine failed to report incoming call: \(error.localizedDescription)")
            }
        }
    }

    private func clearCall(uuid: UUID) {
        if let payload = payloadByCallUUID.removeValue(forKey: uuid) {
            callUUIDByProviderCallId.removeValue(forKey: payload.providerCallId)
        }
    }

    private func payload(from dictionaryPayload: [AnyHashable: Any]) -> IncomingCallPayload? {
        let nestedPayloads = [
            dictionaryPayload,
            dictionaryPayload["data"] as? [AnyHashable: Any] ?? [:],
            dictionaryPayload["freeline"] as? [AnyHashable: Any] ?? [:]
        ]

        func value(for keys: [String]) -> String? {
            for payload in nestedPayloads {
                for key in keys {
                    if let direct = payload[key] as? String, !direct.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        return direct.trimmingCharacters(in: .whitespacesAndNewlines)
                    }
                }
            }

            return nil
        }

        guard
            let providerCallId = value(for: ["providerCallId", "callSid", "call_id"]),
            let callerNumber = value(for: ["callerNumber", "from", "caller_number"])
        else {
            return nil
        }

        return IncomingCallPayload(
            callerName: value(for: ["callerName", "caller_name"]),
            callerNumber: callerNumber,
            providerCallId: providerCallId
        )
    }

    private func hexString(from data: Data) -> String {
        data.map { String(format: "%02x", $0) }.joined()
    }
}

extension IncomingCallRuntime: @MainActor CXProviderDelegate {
    func providerDidReset(_ provider: CXProvider) {
        callUUIDByProviderCallId.removeAll()
        payloadByCallUUID.removeAll()
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        clearCall(uuid: action.callUUID)
        action.fulfill()
    }
}

extension IncomingCallRuntime: @MainActor PKPushRegistryDelegate {
    func pushRegistry(
        _ registry: PKPushRegistry,
        didInvalidatePushTokenFor type: PKPushType
    ) {
        guard type == .voIP else {
            return
        }

        NSLog("FreeLine invalidated the VoIP push token.")
    }

    func pushRegistry(
        _ registry: PKPushRegistry,
        didReceiveIncomingPushWith payload: PKPushPayload,
        for type: PKPushType,
        completion: @escaping () -> Void
    ) {
        defer {
            completion()
        }

        guard type == .voIP, let parsedPayload = self.payload(from: payload.dictionaryPayload) else {
            return
        }

        reportIncomingCall(parsedPayload)
    }

    func pushRegistry(
        _ registry: PKPushRegistry,
        didUpdate pushCredentials: PKPushCredentials,
        for type: PKPushType
    ) {
        guard type == .voIP else {
            return
        }

        let token = hexString(from: pushCredentials.token)
        latestVoipPushToken = token
        Task {
            await appModel?.registerVoipToken(token)
        }
    }
}

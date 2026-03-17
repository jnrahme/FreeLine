import SwiftUI

@main
struct FreeLineApp: App {
    @UIApplicationDelegateAdaptor(FreeLineAppDelegate.self) private var appDelegate
    @StateObject private var appModel = AppModel()

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environmentObject(appModel)
                .task {
                    if !appModel.isProofMode {
                        IncomingCallRuntime.shared.start(appModel: appModel)
                    }
                }
                .task(id: appModel.session?.tokens.accessToken) {
                    if !appModel.isProofMode {
                        await appModel.syncMessageRealtime()
                    }
                }
                .onOpenURL { url in
                    appModel.handleIncomingURL(url)
                }
        }
    }
}

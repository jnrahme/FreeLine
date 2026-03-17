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
                    IncomingCallRuntime.shared.start(appModel: appModel)
                }
                .task(id: appModel.session?.tokens.accessToken) {
                    await appModel.syncMessageRealtime()
                }
                .onOpenURL { url in
                    appModel.handleIncomingURL(url)
                }
        }
    }
}

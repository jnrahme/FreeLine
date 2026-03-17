import GoogleMobileAds
import UIKit
import UserNotifications

final class FreeLineAppDelegate: NSObject, UIApplicationDelegate, @preconcurrency UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self

        if AdConfiguration.isConfigured {
            MobileAds.shared.start(completionHandler: nil)
        } else {
            NSLog("FreeLine skipped Google Mobile Ads startup because GADApplicationIdentifier is missing.")
        }

        if
            let remoteNotification = launchOptions?[.remoteNotification] as? [AnyHashable: Any],
            let route = MessageRoute(userInfo: remoteNotification)
        {
            MessageRouteCoordinator.shared.enqueue(route)
        }

        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor in
            IncomingCallRuntime.shared.updateAlertPushToken(deviceToken)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        NSLog("FreeLine failed to register for remote notifications: \(error.localizedDescription)")
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        defer {
            completionHandler()
        }

        guard let route = MessageRoute(userInfo: response.notification.request.content.userInfo) else {
            return
        }

        MessageRouteCoordinator.shared.enqueue(route)
    }
}

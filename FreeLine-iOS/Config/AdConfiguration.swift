import Foundation

enum AdConfiguration {
    static let applicationID = Bundle.main.object(forInfoDictionaryKey: "GADApplicationIdentifier") as? String
    static let nativeUnitID = "ca-app-pub-3940256099942544/3986624511"
    static let bannerUnitID = "ca-app-pub-3940256099942544/2934735716"
    static let interstitialUnitID = "ca-app-pub-3940256099942544/4411468910"
    static let rewardedUnitID = "ca-app-pub-3940256099942544/1712485313"

    static var isConfigured: Bool {
        !(applicationID?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
    }
}

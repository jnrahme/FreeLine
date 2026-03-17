@preconcurrency import GoogleMobileAds
import SwiftUI
import UIKit

struct UsageOverviewCard: View {
    let summary: UsageSummary
    let remainingRewardClaims: Int

    var body: some View {
        FreeLineGlassCard(padding: 18) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Usage Overview")
                            .font(FreeLineTheme.body(19, weight: .bold))
                            .foregroundStyle(FreeLineTheme.textPrimary)

                        Text(summary.shouldWarn ? "Your free line is nearing the monthly cap." : "Track your free plan before you run out.")
                            .font(FreeLineTheme.body(14, weight: .medium))
                            .foregroundStyle(FreeLineTheme.textSecondary)
                    }

                    Spacer()

                    if remainingRewardClaims > 0 {
                        FreeLinePill(
                            icon: "sparkles.rectangle.stack.fill",
                            text: "\(remainingRewardClaims) ad unlocks left",
                            tint: FreeLineTheme.accentDeep
                        )
                    }
                }

                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 16) {
                        FreeLineStatStrip(
                            title: "Texts",
                            value: usageValue(summary.messagesLabel),
                            tint: summary.shouldWarn ? FreeLineTheme.warning : FreeLineTheme.accentDeep
                        )
                        FreeLineStatStrip(
                            title: "Calls",
                            value: usageValue(summary.callsLabel),
                            tint: summary.shouldWarn ? FreeLineTheme.warning : FreeLineTheme.mint
                        )
                    }

                    Text(summary.messagesLabel)
                        .font(FreeLineTheme.body(14, weight: .medium))
                        .foregroundStyle(FreeLineTheme.textSecondary)
                    ProgressView(value: summary.messageProgress)
                        .tint(summary.shouldWarn ? FreeLineTheme.warning : FreeLineTheme.accent)

                    Text(summary.callsLabel)
                        .font(FreeLineTheme.body(14, weight: .medium))
                        .foregroundStyle(FreeLineTheme.textSecondary)
                    ProgressView(value: summary.callProgress)
                        .tint(summary.shouldWarn ? FreeLineTheme.warning : FreeLineTheme.mint)
                }

                if summary.shouldWarn {
                    Label("You are close to your beta cap.", systemImage: "exclamationmark.triangle.fill")
                        .font(FreeLineTheme.body(13, weight: .semibold))
                        .foregroundStyle(FreeLineTheme.warning)
                }
            }
        }
    }

    private func usageValue(_ label: String) -> String {
        label.components(separatedBy: " used").first ?? label
    }
}

struct BannerAdPlacementView: View {
    let placement: String
    let isHidden: Bool
    let onImpression: () -> Void
    let onTap: () -> Void

    var body: some View {
        if !isHidden {
            BannerAdContainer(
                placement: placement,
                onImpression: onImpression,
                onTap: onTap
            )
            .frame(maxWidth: .infinity)
            .frame(height: 60)
        }
    }
}

struct SponsoredConversationAdRow: View {
    let onImpression: () -> Void
    let onTap: () -> Void

    var body: some View {
        NativeConversationAdContainer(
            onImpression: onImpression,
            onTap: onTap
        )
        .frame(maxWidth: .infinity)
        .frame(minHeight: 104)
    }
}

struct InterstitialAdHost: UIViewControllerRepresentable {
    let request: InterstitialAdRequest?
    let onDismiss: () -> Void
    let onUnavailable: () -> Void
    let onImpression: () -> Void
    let onTap: () -> Void

    func makeCoordinator() -> InterstitialAdCoordinator {
        InterstitialAdCoordinator(parent: self)
    }

    func makeUIViewController(context: Context) -> UIViewController {
        UIViewController()
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {
        context.coordinator.parent = self
        context.coordinator.update(request: request)
    }
}

struct RewardedAdHost: UIViewControllerRepresentable {
    let request: RewardedAdRequest?
    let onAbandon: () -> Void
    let onComplete: () -> Void
    let onImpression: () -> Void
    let onUnavailable: (String) -> Void

    func makeCoordinator() -> RewardedAdCoordinator {
        RewardedAdCoordinator(parent: self)
    }

    func makeUIViewController(context: Context) -> UIViewController {
        UIViewController()
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {
        context.coordinator.parent = self
        context.coordinator.update(request: request)
    }
}

private struct BannerAdContainer: UIViewRepresentable {
    let placement: String
    let onImpression: () -> Void
    let onTap: () -> Void

    func makeCoordinator() -> BannerCoordinator {
        BannerCoordinator(onImpression: onImpression, onTap: onTap)
    }

    func makeUIView(context: Context) -> BannerView {
        let adSize = largeAnchoredAdaptiveBanner(
            width: max(UIScreen.main.bounds.width - 32, 320)
        )
        let bannerView = BannerView(adSize: adSize)
        bannerView.adUnitID = AdConfiguration.bannerUnitID
        bannerView.delegate = context.coordinator
        bannerView.load(Request())
        return bannerView
    }

    func updateUIView(_ uiView: BannerView, context: Context) {}
}

private final class BannerCoordinator: NSObject, BannerViewDelegate {
    private let onImpression: () -> Void
    private let onTap: () -> Void

    init(onImpression: @escaping () -> Void, onTap: @escaping () -> Void) {
        self.onImpression = onImpression
        self.onTap = onTap
    }

    func bannerViewDidRecordImpression(_ bannerView: BannerView) {
        onImpression()
    }

    func bannerViewDidRecordClick(_ bannerView: BannerView) {
        onTap()
    }
}

private struct NativeConversationAdContainer: UIViewRepresentable {
    let onImpression: () -> Void
    let onTap: () -> Void

    func makeCoordinator() -> NativeConversationCoordinator {
        NativeConversationCoordinator(onImpression: onImpression, onTap: onTap)
    }

    func makeUIView(context: Context) -> ConversationNativeAdView {
        let view = ConversationNativeAdView()
        context.coordinator.attach(view: view)
        context.coordinator.load()
        return view
    }

    func updateUIView(_ uiView: ConversationNativeAdView, context: Context) {}
}

private final class NativeConversationCoordinator: NSObject, AdLoaderDelegate, NativeAdLoaderDelegate, NativeAdDelegate {
    private let onImpression: () -> Void
    private let onTap: () -> Void
    private var adLoader: AdLoader?
    private weak var view: ConversationNativeAdView?

    init(onImpression: @escaping () -> Void, onTap: @escaping () -> Void) {
        self.onImpression = onImpression
        self.onTap = onTap
    }

    func attach(view: ConversationNativeAdView) {
        self.view = view
    }

    func load() {
        let loader = AdLoader(
            adUnitID: AdConfiguration.nativeUnitID,
            rootViewController: nil,
            adTypes: [.native],
            options: nil
        )
        loader.delegate = self
        adLoader = loader
        loader.load(Request())
    }

    func adLoader(_ adLoader: AdLoader, didReceive nativeAd: NativeAd) {
        nativeAd.delegate = self
        view?.bind(nativeAd)
    }

    func adLoader(_ adLoader: AdLoader, didFailToReceiveAdWithError error: Error) {
        view?.showPlaceholder("Sponsored content unavailable right now.")
    }

    func nativeAdDidRecordImpression(_ nativeAd: NativeAd) {
        onImpression()
    }

    func nativeAdDidRecordClick(_ nativeAd: NativeAd) {
        onTap()
    }
}

private final class ConversationNativeAdView: NativeAdView {
    private let sponsorLabel = UILabel()
    private let headlineLabel = UILabel()
    private let bodyLabel = UILabel()
    private let callToActionButton = UIButton(type: .system)
    private let iconViewImage = UIImageView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        configureViewHierarchy()
        showPlaceholder("Loading sponsored message...")
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func bind(_ nativeAd: NativeAd) {
        sponsorLabel.text = "Sponsored"
        headlineLabel.text = nativeAd.headline
        bodyLabel.text = nativeAd.body
        bodyLabel.isHidden = (nativeAd.body ?? "").isEmpty
        callToActionButton.setTitle(nativeAd.callToAction ?? "Learn more", for: .normal)
        callToActionButton.isHidden = (nativeAd.callToAction ?? "").isEmpty
        callToActionButton.isUserInteractionEnabled = false

        if let icon = nativeAd.icon?.image {
            iconViewImage.image = icon
            iconViewImage.isHidden = false
        } else {
            iconViewImage.image = nil
            iconViewImage.isHidden = true
        }

        self.nativeAd = nativeAd
    }

    func showPlaceholder(_ message: String) {
        sponsorLabel.text = "Sponsored"
        headlineLabel.text = message
        bodyLabel.text = nil
        bodyLabel.isHidden = true
        callToActionButton.isHidden = true
        iconViewImage.isHidden = true
    }

    private func configureViewHierarchy() {
        backgroundColor = .secondarySystemBackground
        layer.cornerRadius = 18
        layer.cornerCurve = .continuous
        clipsToBounds = true
        translatesAutoresizingMaskIntoConstraints = false

        sponsorLabel.font = .preferredFont(forTextStyle: .caption2).bold()
        sponsorLabel.textColor = .secondaryLabel

        headlineLabel.font = .preferredFont(forTextStyle: .subheadline).bold()
        headlineLabel.textColor = .label
        headlineLabel.numberOfLines = 2

        bodyLabel.font = .preferredFont(forTextStyle: .caption1)
        bodyLabel.textColor = .secondaryLabel
        bodyLabel.numberOfLines = 3

        callToActionButton.setContentHuggingPriority(.required, for: .horizontal)

        iconViewImage.translatesAutoresizingMaskIntoConstraints = false
        iconViewImage.contentMode = .scaleAspectFill
        iconViewImage.layer.cornerRadius = 10
        iconViewImage.clipsToBounds = true

        let textStack = UIStackView(arrangedSubviews: [sponsorLabel, headlineLabel, bodyLabel])
        textStack.axis = .vertical
        textStack.spacing = 6
        textStack.translatesAutoresizingMaskIntoConstraints = false

        let row = UIStackView(arrangedSubviews: [iconViewImage, textStack, callToActionButton])
        row.axis = .horizontal
        row.alignment = .center
        row.spacing = 12
        row.translatesAutoresizingMaskIntoConstraints = false

        addSubview(row)

        NSLayoutConstraint.activate([
            iconViewImage.widthAnchor.constraint(equalToConstant: 44),
            iconViewImage.heightAnchor.constraint(equalToConstant: 44),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
            row.topAnchor.constraint(equalTo: topAnchor, constant: 14),
            row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -14)
        ])

        headlineView = headlineLabel
        bodyView = bodyLabel
        callToActionView = callToActionButton
        iconView = iconViewImage
    }
}

final class InterstitialAdCoordinator: NSObject, FullScreenContentDelegate {
    var parent: InterstitialAdHost
    private var currentRequestID: UUID?
    private var isLoading = false
    private var interstitialAd: InterstitialAd?

    init(parent: InterstitialAdHost) {
        self.parent = parent
    }

    func update(request: InterstitialAdRequest?) {
        guard let request else {
            currentRequestID = nil
            isLoading = false
            interstitialAd = nil
            return
        }

        guard currentRequestID != request.id, !isLoading else {
            return
        }

        currentRequestID = request.id
        isLoading = true

        InterstitialAd.load(
            with: AdConfiguration.interstitialUnitID,
            request: Request()
        ) { [weak self] ad, error in
            guard let self else {
                return
            }

            guard let ad else {
                parent.onUnavailable()
                isLoading = false
                return
            }

            guard error == nil else {
                parent.onUnavailable()
                isLoading = false
                return
            }

            guard let presenter = UIApplication.topMostViewController() else {
                parent.onUnavailable()
                isLoading = false
                return
            }

            interstitialAd = ad
            ad.fullScreenContentDelegate = self
            isLoading = false
            ad.present(from: presenter)
        }
    }

    func adDidRecordImpression(_ ad: FullScreenPresentingAd) {
        parent.onImpression()
    }

    func adDidRecordClick(_ ad: FullScreenPresentingAd) {
        parent.onTap()
    }

    func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        interstitialAd = nil
        parent.onDismiss()
    }

    func ad(
        _ ad: FullScreenPresentingAd,
        didFailToPresentFullScreenContentWithError error: Error
    ) {
        interstitialAd = nil
        parent.onUnavailable()
    }
}

final class RewardedAdCoordinator: NSObject, FullScreenContentDelegate {
    var parent: RewardedAdHost
    private var currentRequestID: UUID?
    private var isLoading = false
    private var rewardedAd: RewardedAd?
    private var didEarnReward = false

    init(parent: RewardedAdHost) {
        self.parent = parent
    }

    func update(request: RewardedAdRequest?) {
        guard let request else {
            currentRequestID = nil
            isLoading = false
            rewardedAd = nil
            didEarnReward = false
            return
        }

        guard currentRequestID != request.id, !isLoading else {
            return
        }

        currentRequestID = request.id
        isLoading = true
        didEarnReward = false

        RewardedAd.load(
            with: AdConfiguration.rewardedUnitID,
            request: Request()
        ) { [weak self] ad, error in
            guard let self else {
                return
            }

            guard let ad else {
                isLoading = false
                parent.onUnavailable("No ads available right now. Try again later.")
                return
            }

            guard error == nil else {
                isLoading = false
                parent.onUnavailable("No ads available right now. Try again later.")
                return
            }

            guard let presenter = UIApplication.topMostViewController() else {
                parent.onUnavailable("No ads available right now. Try again later.")
                isLoading = false
                return
            }

            rewardedAd = ad
            ad.fullScreenContentDelegate = self
            isLoading = false
            ad.present(from: presenter) { [weak self] in
                guard let self else {
                    return
                }

                didEarnReward = true
                parent.onComplete()
            }
        }
    }

    func adDidRecordImpression(_ ad: FullScreenPresentingAd) {
        parent.onImpression()
    }

    func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        rewardedAd = nil
        if !didEarnReward {
            parent.onAbandon()
        }
    }

    func ad(
        _ ad: FullScreenPresentingAd,
        didFailToPresentFullScreenContentWithError error: Error
    ) {
        rewardedAd = nil
        parent.onUnavailable("No ads available right now. Try again later.")
    }
}

private extension UIFont {
    func bold() -> UIFont {
        let descriptor = fontDescriptor.withSymbolicTraits(.traitBold) ?? fontDescriptor
        return UIFont(descriptor: descriptor, size: pointSize)
    }
}

private extension UIApplication {
    static func topMostViewController(
        base: UIViewController? = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?
            .rootViewController
    ) -> UIViewController? {
        if let navigationController = base as? UINavigationController {
            return topMostViewController(base: navigationController.visibleViewController)
        }

        if let tabBarController = base as? UITabBarController,
           let selected = tabBarController.selectedViewController {
            return topMostViewController(base: selected)
        }

        if let presented = base?.presentedViewController {
            return topMostViewController(base: presented)
        }

        return base
    }
}

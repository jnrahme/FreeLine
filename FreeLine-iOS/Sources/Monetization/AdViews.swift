import SwiftUI

struct UsageOverviewCard: View {
    let summary: UsageSummary
    let remainingRewardClaims: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Usage Overview")
                    .font(.headline)
                Spacer()
                if remainingRewardClaims > 0 {
                    Text("\(remainingRewardClaims) ad unlocks left")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }

            Text(summary.messagesLabel)
                .font(.subheadline)
            ProgressView(value: summary.messageProgress)
                .tint(summary.shouldWarn ? .orange : .accentColor)

            Text(summary.callsLabel)
                .font(.subheadline)
            ProgressView(value: summary.callProgress)
                .tint(summary.shouldWarn ? .orange : .green)

            if summary.shouldWarn {
                Label("You are close to your beta cap.", systemImage: "exclamationmark.triangle.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
            }
        }
        .padding(16)
        .background(summary.shouldWarn ? Color.orange.opacity(0.10) : Color(uiColor: .secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

struct DevBannerAdView: View {
    let placement: String
    let isHidden: Bool
    let onImpression: () -> Void
    let onTap: () -> Void

    @State private var hasTrackedImpression = false

    var body: some View {
        if !isHidden {
            Button(action: onTap) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("Sponsored")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text(AdConfiguration.bannerUnitID)
                            .font(.caption2.monospaced())
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Text("FreeLine beta is ad-supported. Tap to preview the banner action for \(placement).")
                        .font(.footnote)
                        .multilineTextAlignment(.leading)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    LinearGradient(
                        colors: [Color.yellow.opacity(0.18), Color.orange.opacity(0.12)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                )
            }
            .buttonStyle(.plain)
            .task {
                guard !hasTrackedImpression else { return }
                hasTrackedImpression = true
                onImpression()
            }
        }
    }
}

struct SponsoredConversationRow: View {
    let onImpression: () -> Void
    let onTap: () -> Void

    @State private var hasTrackedImpression = false

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("Sponsored")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text("Native")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Text("Unlock more reach with the same clean second-line setup FreeLine uses internally.")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.primary)
                    Text("Placement: inbox_native • \(AdConfiguration.bannerUnitID)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "megaphone.fill")
                    .font(.title3)
                    .foregroundStyle(.orange)
            }
            .padding(.vertical, 6)
        }
        .buttonStyle(.plain)
        .task {
            guard !hasTrackedImpression else { return }
            hasTrackedImpression = true
            onImpression()
        }
    }
}

struct InterstitialAdExperienceView: View {
    let request: InterstitialAdRequest
    let onDismiss: () -> Void
    let onImpression: () -> Void
    let onTap: () -> Void

    @State private var hasTrackedImpression = false

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.orange.opacity(0.92), Color.yellow.opacity(0.72)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    Text("Sponsored")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(.thinMaterial, in: Capsule())
                    Spacer()
                    Text("Interstitial")
                        .font(.headline)
                }

                Text("FreeLine stays free because short, well-timed ad breaks cover part of the line cost.")
                    .font(.largeTitle.weight(.semibold))

                Text("Placement: \(request.placement)")
                    .font(.title3.monospaced())
                    .foregroundStyle(.secondary)

                Button("Preview sponsor action", action: onTap)
                    .buttonStyle(.borderedProminent)

                Button("Close", action: onDismiss)
                    .buttonStyle(.bordered)
            }
            .padding(28)
            .frame(maxWidth: 520)
        }
        .task {
            guard !hasTrackedImpression else { return }
            hasTrackedImpression = true
            onImpression()
        }
    }
}

struct RewardedAdExperienceView: View {
    let request: RewardedAdRequest
    let isClaiming: Bool
    let onAbandon: () -> Void
    let onComplete: () -> Void
    let onImpression: () -> Void

    @State private var hasTrackedImpression = false
    @State private var secondsRemaining = 5

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.blue.opacity(0.92), Color.cyan.opacity(0.65)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 18) {
                Text("Rewarded Ad")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.85))

                Text(request.rewardType.rewardDescription)
                    .font(.largeTitle.weight(.bold))
                    .foregroundStyle(.white)

                Text("Stay on this screen for \(secondsRemaining)s to unlock the reward.")
                    .font(.title3)
                    .foregroundStyle(.white.opacity(0.88))

                ProgressView(value: Double(5 - secondsRemaining), total: 5)
                    .tint(.white)

                Button {
                    onComplete()
                } label: {
                    if isClaiming {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .tint(.white)
                    } else {
                        Text(secondsRemaining == 0 ? "Claim \(request.rewardType.rewardDescription)" : "Keep watching")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(secondsRemaining > 0 || isClaiming)

                Button("Not now", action: onAbandon)
                    .buttonStyle(.bordered)
                    .tint(.white)
            }
            .padding(28)
        }
        .task {
            guard !hasTrackedImpression else { return }
            hasTrackedImpression = true
            onImpression()
            while secondsRemaining > 0 {
                try? await Task.sleep(for: .seconds(1))
                secondsRemaining -= 1
            }
        }
    }
}

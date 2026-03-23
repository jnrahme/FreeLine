import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var appModel: AppModel

    var body: some View {
        NavigationStack {
            FreeLineScreen {
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 20) {
                        headerCard

                        if let summary = appModel.usageSummary {
                            UsageOverviewCard(
                                summary: summary,
                                remainingRewardClaims: appModel.remainingRewardClaims
                            )
                        }

                        accountCard
                        planCard
                        subscriptionCard
                        earnMoreCard
                        lineCard
                        sessionCard
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 140)
                }
                .safeAreaInset(edge: .bottom) {
                    BannerAdPlacementView(
                        placement: "settings_bottom_banner",
                        isHidden: !appModel.adsEnabled,
                        onImpression: {
                            Task {
                                await appModel.trackAdImpression(
                                    adType: "banner",
                                    placement: "settings_bottom_banner",
                                    adUnitId: AdConfiguration.bannerUnitID
                                )
                            }
                        },
                        onTap: {
                            Task {
                                await appModel.trackAdClick(
                                    adType: "banner",
                                    placement: "settings_bottom_banner"
                                )
                            }
                        }
                    )
                    .padding(.horizontal)
                    .padding(.top, 8)
                    .freeLineBottomInsetBackdrop()
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .task {
                await appModel.refreshMonetizationState()
            }
        }
    }

    private var headerCard: some View {
        FreeLineGlassCard {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Settings")
                            .font(FreeLineTheme.title(34))
                            .foregroundStyle(FreeLineTheme.textPrimary)
                        Text(appModel.currentPlanTitle)
                            .font(FreeLineTheme.body(16, weight: .semibold))
                            .foregroundStyle(appModel.adsEnabled ? FreeLineTheme.warning : FreeLineTheme.mint)
                        Text("Keep your number, plan, ad state, and reward unlocks under one roof.")
                            .font(FreeLineTheme.body(15, weight: .medium))
                            .foregroundStyle(FreeLineTheme.textSecondary)
                    }

                    Spacer()

                    FreeLineHeroIcon(systemImage: "slider.horizontal.3")
                        .scaleEffect(0.82)
                }

                FreeLineGlassGroup(spacing: 12) {
                    HStack(spacing: 12) {
                        FreeLinePill(
                            icon: appModel.adsEnabled ? "megaphone.fill" : "crown.fill",
                            text: appModel.currentPlanTitle,
                            tint: appModel.adsEnabled ? FreeLineTheme.warning : FreeLineTheme.mint
                        )
                        FreeLinePill(icon: "phone.connection.fill", text: appModel.currentNumber?.status ?? "No line", tint: FreeLineTheme.accentDeep)
                    }
                }
            }
        }
    }

    private var accountCard: some View {
        FreeLineGlassCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("Account")
                    .font(FreeLineTheme.body(20, weight: .bold))
                    .foregroundStyle(FreeLineTheme.textPrimary)

                SettingsDetailRow(title: "Email", value: appModel.currentUserEmail)
                SettingsDetailRow(title: "Number", value: appModel.currentNumber?.phoneNumber ?? "not assigned")
                SettingsDetailRow(title: "API", value: APIConfiguration.baseURL.absoluteString, isMonospaced: true)
            }
        }
    }

    private var planCard: some View {
        FreeLineGlassCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("Plan")
                    .font(FreeLineTheme.body(20, weight: .bold))
                    .foregroundStyle(FreeLineTheme.textPrimary)

                SettingsDetailRow(title: "Current tier", value: appModel.currentPlanTitle)

                if let usagePlan = appModel.monetizationStatus?.usagePlan {
                    Text(usagePlan.description)
                        .font(FreeLineTheme.body(15, weight: .medium))
                        .foregroundStyle(FreeLineTheme.textSecondary)

                    HStack(spacing: 12) {
                        FreeLinePill(icon: "message.fill", text: "\(usagePlan.monthlySmsCap) texts", tint: FreeLineTheme.accentDeep)
                        FreeLinePill(icon: "phone.fill", text: "\(usagePlan.monthlyCallCapMinutes) call min", tint: FreeLineTheme.mint)
                    }
                }
            }
        }
    }

    private var subscriptionCard: some View {
        FreeLineGlassCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("Manage Subscription")
                    .font(FreeLineTheme.body(20, weight: .bold))
                    .foregroundStyle(FreeLineTheme.textPrimary)

                if let catalog = appModel.monetizationStatus?.catalog {
                    ForEach(catalog) { product in
                        FreeLineGlassCard(padding: 16) {
                            VStack(alignment: .leading, spacing: 10) {
                                HStack(alignment: .top) {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(product.displayName)
                                            .font(FreeLineTheme.body(18, weight: .bold))
                                            .foregroundStyle(FreeLineTheme.textPrimary)
                                        Text(product.priceLabel)
                                            .font(FreeLineTheme.body(14, weight: .semibold))
                                            .foregroundStyle(FreeLineTheme.textSecondary)
                                    }

                                    Spacer()

                                    if appModel.monetizationStatus?.status.activeProducts.contains(where: { $0.sourceProductId == product.id }) == true {
                                        FreeLinePill(icon: "checkmark.circle.fill", text: "Active", tint: FreeLineTheme.mint)
                                    } else {
                                        Button("Enable") {
                                            Task {
                                                await appModel.verifySubscriptionPurchase(productId: product.id)
                                            }
                                        }
                                        .buttonStyle(FreeLineSecondaryButtonStyle())
                                        .disabled(appModel.isLoading)
                                    }
                                }

                                Text(product.description)
                                    .font(FreeLineTheme.body(14, weight: .medium))
                                    .foregroundStyle(FreeLineTheme.textSecondary)
                            }
                        }
                    }
                }

                Button("Refresh subscription state") {
                    Task {
                        await appModel.refreshMonetizationState()
                    }
                }
                .buttonStyle(FreeLineSecondaryButtonStyle())
                .disabled(appModel.isLoading)
            }
        }
    }

    private var earnMoreCard: some View {
        FreeLineGlassCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("Earn More")
                    .font(FreeLineTheme.body(20, weight: .bold))
                    .foregroundStyle(FreeLineTheme.textPrimary)

                if appModel.adsEnabled {
                    Text("Rewarded ads unlock bonus usage without forcing a plan upgrade.")
                        .font(FreeLineTheme.body(15, weight: .medium))
                        .foregroundStyle(FreeLineTheme.textSecondary)

                    ForEach(RewardType.allCases) { rewardType in
                        Button(rewardType.buttonTitle) {
                            appModel.beginRewardedUnlock(rewardType, placement: "settings_earn_more")
                        }
                        .buttonStyle(FreeLinePrimaryButtonStyle())
                        .disabled(!appModel.canUseRewardedAds)
                    }
                } else {
                    Text("Rewarded ad unlocks are hidden on your current paid tier.")
                        .font(FreeLineTheme.body(15, weight: .medium))
                        .foregroundStyle(FreeLineTheme.textSecondary)
                }
            }
        }
    }

    private var lineCard: some View {
        FreeLineGlassCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("Line")
                    .font(FreeLineTheme.body(20, weight: .bold))
                    .foregroundStyle(FreeLineTheme.textPrimary)

                SettingsDetailRow(title: "Status", value: appModel.currentNumber?.status ?? "none")

                Button("Release Number", role: .destructive) {
                    Task {
                        await appModel.releaseCurrentNumber()
                    }
                }
                .buttonStyle(FreeLineSecondaryButtonStyle())
                .disabled(appModel.isLoading || appModel.currentNumber == nil)
            }
        }
    }

    private var sessionCard: some View {
        FreeLineGlassCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("Session")
                    .font(FreeLineTheme.body(20, weight: .bold))
                    .foregroundStyle(FreeLineTheme.textPrimary)

                Button("Sign Out", role: .destructive) {
                    appModel.signOut()
                }
                .buttonStyle(FreeLineSecondaryButtonStyle())
            }
        }
    }
}

private struct SettingsDetailRow: View {
    let title: String
    let value: String
    var isMonospaced = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased())
                .font(FreeLineTheme.body(11, weight: .semibold))
                .kerning(1.0)
                .foregroundStyle(FreeLineTheme.textSecondary)
            if isMonospaced {
                Text(value)
                    .font(.footnote.monospaced())
                    .foregroundStyle(FreeLineTheme.textPrimary)
                    .textSelection(.enabled)
            } else {
                Text(value)
                    .font(FreeLineTheme.body(15, weight: .semibold))
                    .foregroundStyle(FreeLineTheme.textPrimary)
                    .textSelection(.disabled)
            }
        }
    }
}

import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var appModel: AppModel

    var body: some View {
        NavigationStack {
            List {
                if let summary = appModel.usageSummary {
                    Section {
                        UsageOverviewCard(
                            summary: summary,
                            remainingRewardClaims: appModel.remainingRewardClaims
                        )
                    }
                }

                Section("Account") {
                    Text("Email: \(appModel.currentUserEmail)")
                    Text("Number: \(appModel.currentNumber?.phoneNumber ?? "not assigned")")
                    Text("API: \(APIConfiguration.baseURL.absoluteString)")
                }

                Section("Plan") {
                    LabeledContent("Current tier", value: appModel.currentPlanTitle)
                    if let usagePlan = appModel.monetizationStatus?.usagePlan {
                        Text(usagePlan.description)
                            .foregroundStyle(.secondary)
                        Text("\(usagePlan.monthlySmsCap) texts / \(usagePlan.monthlyCallCapMinutes) call minutes")
                            .font(.footnote.weight(.semibold))
                    }
                }

                if let catalog = appModel.monetizationStatus?.catalog {
                    Section("Manage Subscription") {
                        ForEach(catalog) { product in
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(product.displayName)
                                            .font(.headline)
                                        Text(product.priceLabel)
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if appModel.monetizationStatus?.status.activeProducts.contains(where: { $0.sourceProductId == product.id }) == true {
                                        Text("Active")
                                            .font(.caption.weight(.semibold))
                                            .padding(.horizontal, 10)
                                            .padding(.vertical, 5)
                                            .background(Color.green.opacity(0.18), in: Capsule())
                                    } else {
                                        Button("Enable") {
                                            Task {
                                                await appModel.verifySubscriptionPurchase(productId: product.id)
                                            }
                                        }
                                        .buttonStyle(.borderedProminent)
                                        .disabled(appModel.isLoading)
                                    }
                                }

                                Text(product.description)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 4)
                        }

                        Button("Refresh subscription state") {
                            Task {
                                await appModel.refreshMonetizationState()
                            }
                        }
                        .disabled(appModel.isLoading)
                    }
                }

                Section("Earn More") {
                    if appModel.adsEnabled {
                        Text("Rewarded ads unlock bonus usage without forcing a plan upgrade.")
                            .foregroundStyle(.secondary)
                        ForEach(RewardType.allCases) { rewardType in
                            Button(rewardType.buttonTitle) {
                                appModel.beginRewardedUnlock(rewardType, placement: "settings_earn_more")
                            }
                            .disabled(!appModel.canUseRewardedAds)
                        }
                    } else {
                        Text("Rewarded ad unlocks are hidden on your current paid tier.")
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Line") {
                    Text("Status: \(appModel.currentNumber?.status ?? "none")")

                    Button("Release Number", role: .destructive) {
                        Task {
                            await appModel.releaseCurrentNumber()
                        }
                    }
                    .disabled(appModel.isLoading || appModel.currentNumber == nil)
                }

                Section("Session") {
                    Button("Sign Out", role: .destructive) {
                        appModel.signOut()
                    }
                }
            }
            .navigationTitle("Settings")
            .task {
                await appModel.refreshMonetizationState()
            }
            .safeAreaInset(edge: .bottom) {
                DevBannerAdView(
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
                .background(.ultraThinMaterial)
            }
        }
    }
}

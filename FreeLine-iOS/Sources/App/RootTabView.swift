import SwiftUI

struct RootTabView: View {
    @EnvironmentObject private var appModel: AppModel

    var body: some View {
        Group {
            if appModel.isAuthenticated {
                if !appModel.hasResolvedCurrentNumber {
                    FreeLineScreen {
                        VStack(spacing: 22) {
                            FreeLineHeroIcon(systemImage: "wave.3.right.circle.fill")

                            FreeLineGlassCard {
                                VStack(spacing: 12) {
                                    Text("Loading your line")
                                        .font(FreeLineTheme.body(24, weight: .bold))
                                        .foregroundStyle(FreeLineTheme.textPrimary)

                                    Text("Checking your assigned number, usage plan, and message state before the shell appears.")
                                        .font(FreeLineTheme.body(15, weight: .medium))
                                        .foregroundStyle(FreeLineTheme.textSecondary)
                                        .multilineTextAlignment(.center)

                                    ProgressView()
                                        .tint(FreeLineTheme.accent)
                                }
                            }
                            .frame(maxWidth: 360)
                        }
                        .padding(24)
                    }
                    .task {
                        await appModel.loadCurrentNumber()
                    }
                } else if appModel.currentNumber == nil {
                    NumberClaimView()
                } else {
                    TabView(selection: $appModel.selectedTab) {
                        ConversationsView()
                            .tag(AppTab.messages)
                            .tabItem {
                                Label("Messages", systemImage: "message")
                            }

                        CallsView()
                            .tag(AppTab.calls)
                            .tabItem {
                                Label("Calls", systemImage: "phone")
                            }

                        VoicemailView()
                            .tag(AppTab.voicemail)
                            .tabItem {
                                Label("Voicemail", systemImage: "waveform")
                            }

                        SettingsView()
                            .tag(AppTab.settings)
                            .tabItem {
                                Label("Settings", systemImage: "gearshape")
                            }
                    }
                    .tint(FreeLineTheme.accentDeep)
                    .freeLineTabBarChrome()
                    .confirmationDialog(
                        "Usage limit reached",
                        isPresented: Binding(
                            get: { appModel.usagePrompt != nil },
                            set: { presented in
                                if !presented {
                                    appModel.dismissUsagePrompt()
                                }
                            }
                        ),
                        titleVisibility: .visible
                    ) {
                        if let rewardType = appModel.usagePrompt?.rewardType, appModel.canUseRewardedAds {
                            Button(rewardType.buttonTitle) {
                                appModel.beginRewardedUnlock(rewardType, placement: "cap_hit_prompt")
                            }
                        }
                        Button("Upgrade") {
                            appModel.openSubscriptionManagement()
                        }
                        Button("Not now", role: .cancel) {
                            appModel.dismissUsagePrompt()
                        }
                    } message: {
                        Text(appModel.usagePrompt?.message ?? "")
                    }
                    .overlay {
                        InterstitialAdHost(
                            request: appModel.pendingInterstitialAd,
                            onDismiss: {
                                appModel.dismissInterstitial()
                            },
                            onUnavailable: {
                                appModel.dismissInterstitial(markShown: false)
                            },
                            onImpression: {
                                Task {
                                    await appModel.trackAdImpression(
                                        adType: "interstitial",
                                        placement: appModel.pendingInterstitialAd?.placement ?? "post_call",
                                        adUnitId: AdConfiguration.interstitialUnitID
                                    )
                                }
                            },
                            onTap: {
                                Task {
                                    await appModel.trackAdClick(
                                        adType: "interstitial",
                                        placement: appModel.pendingInterstitialAd?.placement ?? "post_call"
                                    )
                                }
                            }
                        )
                        .frame(width: 0, height: 0)

                        RewardedAdHost(
                            request: appModel.pendingRewardedAd,
                            onAbandon: {
                                Task {
                                    await appModel.abandonRewardedUnlock()
                                }
                            },
                            onComplete: {
                                Task {
                                    await appModel.completeRewardedUnlock()
                                }
                            },
                            onImpression: {
                                Task {
                                    await appModel.trackAdImpression(
                                        adType: "rewarded",
                                        placement: appModel.pendingRewardedAd?.placement ?? "settings_earn_more",
                                        adUnitId: AdConfiguration.rewardedUnitID
                                    )
                                }
                            },
                            onUnavailable: { message in
                                appModel.failRewardedUnlock(message)
                            }
                        )
                        .frame(width: 0, height: 0)
                    }
                }
            } else {
                WelcomeView()
            }
        }
        .animation(.default, value: appModel.currentNumber?.phoneNumber)
    }
}

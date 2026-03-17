import SwiftUI

struct RootTabView: View {
    @EnvironmentObject private var appModel: AppModel

    var body: some View {
        Group {
            if appModel.isAuthenticated {
                if !appModel.hasResolvedCurrentNumber {
                    ProgressView("Loading your line")
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
                    .fullScreenCover(item: Binding(
                        get: { appModel.pendingInterstitialAd },
                        set: { newValue in
                            if newValue == nil {
                                appModel.dismissInterstitial()
                            }
                        }
                    )) { request in
                        InterstitialAdExperienceView(
                            request: request,
                            onDismiss: {
                                appModel.dismissInterstitial()
                            },
                            onImpression: {
                                Task {
                                    await appModel.trackAdImpression(
                                        adType: "interstitial",
                                        placement: request.placement,
                                        adUnitId: AdConfiguration.interstitialUnitID
                                    )
                                }
                            },
                            onTap: {
                                Task {
                                    await appModel.trackAdClick(
                                        adType: "interstitial",
                                        placement: request.placement
                                    )
                                }
                            }
                        )
                    }
                    .fullScreenCover(item: Binding(
                        get: { appModel.pendingRewardedAd },
                        set: { newValue in
                            if newValue == nil {
                                Task {
                                    await appModel.abandonRewardedUnlock()
                                }
                            }
                        }
                    )) { request in
                        RewardedAdExperienceView(
                            request: request,
                            isClaiming: appModel.isClaimingReward,
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
                                        placement: request.placement,
                                        adUnitId: AdConfiguration.rewardedUnitID
                                    )
                                }
                            }
                        )
                    }
                }
            } else {
                WelcomeView()
            }
        }
        .animation(.default, value: appModel.currentNumber?.phoneNumber)
    }
}

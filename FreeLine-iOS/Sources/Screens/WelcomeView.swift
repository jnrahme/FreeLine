import SwiftUI

struct WelcomeView: View {
    @EnvironmentObject private var appModel: AppModel

    var body: some View {
        NavigationStack {
            Group {
                if let pendingVerification = appModel.pendingVerification {
                    EmailVerificationView(pendingVerification: pendingVerification)
                } else if appModel.authScreen == .email {
                    EmailAuthView()
                } else {
                    FreeLineScreen {
                        ScrollView(showsIndicators: false) {
                            VStack(alignment: .leading, spacing: 24) {
                                HStack(alignment: .center) {
                                    FreeLineHeroIcon(systemImage: "phone.connection.fill")
                                    Spacer()
                                    FreeLinePill(icon: "bolt.horizontal.circle.fill", text: "Wi-Fi first")
                                }

                                FreeLineSectionTitle(
                                    eyebrow: "Free second line",
                                    title: "A cleaner, calmer way to get a U.S. number.",
                                    subtitle: "Call and text from one elegant place, keep your personal number private, and stay in control of usage before costs get out of hand."
                                )

                                HStack(spacing: 12) {
                                    FreeLinePill(icon: "person.badge.key.fill", text: "1 number per user", tint: FreeLineTheme.accentDeep)
                                    FreeLinePill(icon: "timer", text: "24h activation", tint: FreeLineTheme.warning)
                                }

                                HStack(spacing: 12) {
                                    FreeLinePill(icon: "checkmark.shield.fill", text: "Spam controls", tint: FreeLineTheme.mint)
                                    FreeLinePill(icon: "sparkles", text: "Apple-native", tint: FreeLineTheme.coral)
                                }

                                FreeLineGlassCard {
                                    VStack(alignment: .leading, spacing: 18) {
                                        Text("What this build already proves")
                                            .font(FreeLineTheme.body(19, weight: .bold))
                                            .foregroundStyle(FreeLineTheme.textPrimary)

                                        Text("Email sign-up, verification, dev OAuth, secure token storage, number claim, messaging, calling, voicemail, subscriptions, and ad-backed usage controls are all wired into the same shell.")
                                            .font(FreeLineTheme.body(16, weight: .medium))
                                            .foregroundStyle(FreeLineTheme.textSecondary)

                                        HStack(spacing: 16) {
                                            FreeLineStatStrip(title: "Surfaces", value: "Calls + Texts", tint: FreeLineTheme.accentDeep)
                                            FreeLineStatStrip(title: "Promise", value: "US only", tint: FreeLineTheme.mint)
                                        }
                                    }
                                }

                                VStack(spacing: 14) {
                                    Button("Sign up with email") {
                                        appModel.showEmailAuth()
                                    }
                                    .buttonStyle(FreeLinePrimaryButtonStyle())

                                    Button {
                                        Task {
                                            await appModel.continueWithDevProvider(.apple)
                                        }
                                    } label: {
                                        if appModel.isLoading {
                                            ProgressView()
                                                .tint(FreeLineTheme.textPrimary)
                                                .frame(maxWidth: .infinity)
                                        } else {
                                            Label(DevAuthProvider.apple.buttonTitle, systemImage: "apple.logo")
                                                .frame(maxWidth: .infinity)
                                        }
                                    }
                                    .buttonStyle(FreeLineSecondaryButtonStyle())
                                    .disabled(appModel.isLoading)

                                    Button {
                                        Task {
                                            await appModel.continueWithDevProvider(.google)
                                        }
                                    } label: {
                                        if appModel.isLoading {
                                            ProgressView()
                                                .tint(FreeLineTheme.textPrimary)
                                                .frame(maxWidth: .infinity)
                                        } else {
                                            Label(DevAuthProvider.google.buttonTitle, systemImage: "globe")
                                                .frame(maxWidth: .infinity)
                                        }
                                    }
                                    .buttonStyle(FreeLineSecondaryButtonStyle())
                                    .disabled(appModel.isLoading)
                                }

                                if let errorMessage = appModel.errorMessage {
                                    FreeLineGlassCard(padding: 16) {
                                        Text(errorMessage)
                                            .font(FreeLineTheme.body(14, weight: .semibold))
                                            .foregroundStyle(FreeLineTheme.coral)
                                    }
                                }

                                FreeLineGlassCard(padding: 16) {
                                    VStack(alignment: .leading, spacing: 8) {
                                        Text("Preview stack")
                                            .font(FreeLineTheme.body(13, weight: .semibold))
                                            .foregroundStyle(FreeLineTheme.textSecondary)
                                        Text(APIConfiguration.baseURL.absoluteString)
                                            .font(.footnote.monospaced())
                                            .foregroundStyle(FreeLineTheme.textPrimary)
                                            .textSelection(.enabled)
                                    }
                                }
                            }
                            .padding(.horizontal, 20)
                            .padding(.top, 20)
                            .padding(.bottom, 32)
                        }
                    }
                }
            }
            .toolbar(.hidden, for: .navigationBar)
        }
    }
}

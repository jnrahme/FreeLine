import SwiftUI

struct EmailAuthView: View {
    @EnvironmentObject private var appModel: AppModel
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        FreeLineScreen {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 20) {
                    FreeLineGlassCard {
                        VStack(alignment: .leading, spacing: 16) {
                            HStack(alignment: .top) {
                                FreeLineSectionTitle(
                                    eyebrow: "Email sign up",
                                    title: "Create your line in under a minute.",
                                    subtitle: "Start with email and password. This local build returns a preview verification link so the full path can be tested without a mail provider."
                                )

                                Spacer(minLength: 16)

                                FreeLineHeroIcon(systemImage: "envelope.badge.shield.half.filled")
                                    .scaleEffect(0.82)
                            }

                            FreeLineGlassGroup(spacing: 12) {
                                HStack(spacing: 12) {
                                    FreeLinePill(icon: "shield.lefthalf.filled", text: "Secure token storage", tint: FreeLineTheme.accentDeep)
                                    FreeLinePill(icon: "link.badge.plus", text: "Signed preview link", tint: FreeLineTheme.mint)
                                }
                            }
                        }
                    }

                    FreeLineGlassCard {
                        VStack(alignment: .leading, spacing: 18) {
                            FreeLineField(
                                label: "Email",
                                icon: "envelope.fill",
                                caption: "Use any inbox you control."
                            ) {
                                TextField("name@company.com", text: $email)
                                    .keyboardType(.emailAddress)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                            }

                            FreeLineField(
                                label: "Password",
                                icon: "lock.fill",
                                caption: "Use at least 8 characters for the local auth flow."
                            ) {
                                SecureField("Choose a password", text: $password)
                            }

                            if let errorMessage = appModel.errorMessage {
                                Text(errorMessage)
                                    .font(FreeLineTheme.body(14, weight: .semibold))
                                    .foregroundStyle(FreeLineTheme.coral)
                            }

                            Button {
                                Task {
                                    await appModel.startEmailAuth(email: email, password: password)
                                }
                            } label: {
                                if appModel.isLoading {
                                    ProgressView()
                                        .tint(.white)
                                        .frame(maxWidth: .infinity)
                                } else {
                                    Text("Send verification link")
                                        .frame(maxWidth: .infinity)
                                }
                            }
                            .buttonStyle(FreeLinePrimaryButtonStyle())
                            .disabled(appModel.isLoading)

                            Button("Back") {
                                appModel.showWelcome()
                            }
                            .buttonStyle(FreeLineSecondaryButtonStyle())
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 32)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
    }
}

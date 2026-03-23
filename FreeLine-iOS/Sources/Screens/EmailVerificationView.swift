import SwiftUI

struct EmailVerificationView: View {
    @EnvironmentObject private var appModel: AppModel
    let pendingVerification: PendingEmailVerification

    @State private var token = ""

    var body: some View {
        FreeLineScreen {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 24) {
                    FreeLineSectionTitle(
                        eyebrow: "Verify email",
                        title: "Confirm the account and unlock your line.",
                        subtitle: "The dev mailbox mode exposes the preview link and token below so the entire auth loop stays visible while the provider integration is still pending."
                    )

                    FreeLineGlassCard {
                        VStack(alignment: .leading, spacing: 18) {
                            FreeLinePill(icon: "person.crop.circle.badge.checkmark", text: pendingVerification.email, tint: FreeLineTheme.accentDeep)

                            VStack(alignment: .leading, spacing: 8) {
                                Text("Preview link")
                                    .font(FreeLineTheme.body(13, weight: .semibold))
                                    .foregroundStyle(FreeLineTheme.textSecondary)

                                Text(pendingVerification.previewLink)
                                    .font(.footnote.monospaced())
                                    .foregroundStyle(FreeLineTheme.textPrimary)
                                    .textSelection(.enabled)
                                    .padding(16)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .freeLineInputSurface(cornerRadius: 18, tint: FreeLineTheme.accent.opacity(0.08))
                            }

                            FreeLineField(
                                label: "Verification token",
                                icon: "checkmark.seal.fill",
                                caption: "The suggested token is prefilled for this local workflow."
                            ) {
                                TextField("Paste the token", text: $token)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                            }

                            if let errorMessage = appModel.errorMessage {
                                Text(errorMessage)
                                    .font(FreeLineTheme.body(14, weight: .semibold))
                                    .foregroundStyle(FreeLineTheme.coral)
                            }

                            Button {
                                Task {
                                    await appModel.verifyEmail(token: token)
                                }
                            } label: {
                                if appModel.isLoading {
                                    ProgressView()
                                        .tint(.white)
                                        .frame(maxWidth: .infinity)
                                } else {
                                    Text("Verify and continue")
                                        .frame(maxWidth: .infinity)
                                }
                            }
                            .buttonStyle(FreeLinePrimaryButtonStyle())
                            .disabled(appModel.isLoading)

                            Button("Start over") {
                                appModel.showEmailAuth()
                            }
                            .buttonStyle(FreeLineSecondaryButtonStyle())
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 24)
                .padding(.bottom, 32)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .onAppear {
            if token.isEmpty {
                token = pendingVerification.suggestedToken
            }
        }
    }
}

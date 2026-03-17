import SwiftUI

struct EmailVerificationView: View {
    @EnvironmentObject private var appModel: AppModel
    let pendingVerification: PendingEmailVerification

    @State private var token = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Verify your email")
                    .font(.title.bold())

                Text("Account: \(pendingVerification.email)")
                    .font(.headline)

                Text("The backend is running in dev mailbox mode. The preview link and extracted token are shown below so we can complete the auth flow without an email provider.")
                    .foregroundStyle(.secondary)

                GroupBox("Preview link") {
                    Text(pendingVerification.previewLink)
                        .font(.footnote.monospaced())
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                }

                TextField("Verification token", text: $token)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .textFieldStyle(.roundedBorder)

                Button {
                    Task {
                        await appModel.verifyEmail(token: token)
                    }
                } label: {
                    if appModel.isLoading {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("Verify and continue")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(appModel.isLoading)

                Button("Start over") {
                    appModel.showEmailAuth()
                }
                .buttonStyle(.bordered)
            }
            .padding()
        }
        .navigationTitle("Email Verification")
        .onAppear {
            if token.isEmpty {
                token = pendingVerification.suggestedToken
            }
        }
    }
}

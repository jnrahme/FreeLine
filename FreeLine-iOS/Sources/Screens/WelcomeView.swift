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
                    ScrollView {
                        VStack(alignment: .leading, spacing: 20) {
                            Text("FreeLine")
                                .font(.largeTitle.bold())

                            Text("Get a free U.S. number for calls and texts.")
                                .font(.headline)

                            Text("This build wires the first real auth path: email sign-up, verification, dev OAuth, secure token storage, and a signed-in shell.")
                                .foregroundStyle(.secondary)

                            GroupBox("MVP rules") {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("1 free number per user")
                                    Text("24-hour activation required")
                                    Text("Dev auth is enabled while native Apple and Google SDKs are still pending")
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }

                            Button("Sign up with email") {
                                appModel.showEmailAuth()
                            }
                            .buttonStyle(.borderedProminent)

                            Button {
                                Task {
                                    await appModel.continueWithDevProvider(.apple)
                                }
                            } label: {
                                if appModel.isLoading {
                                    ProgressView()
                                        .frame(maxWidth: .infinity)
                                } else {
                                    Text(DevAuthProvider.apple.buttonTitle)
                                        .frame(maxWidth: .infinity)
                                }
                            }
                            .buttonStyle(.bordered)
                            .disabled(appModel.isLoading)

                            Button {
                                Task {
                                    await appModel.continueWithDevProvider(.google)
                                }
                            } label: {
                                if appModel.isLoading {
                                    ProgressView()
                                        .frame(maxWidth: .infinity)
                                } else {
                                    Text(DevAuthProvider.google.buttonTitle)
                                        .frame(maxWidth: .infinity)
                                }
                            }
                            .buttonStyle(.bordered)
                            .disabled(appModel.isLoading)

                            if let errorMessage = appModel.errorMessage {
                                Text(errorMessage)
                                    .foregroundStyle(.red)
                            }

                            Text("API: \(APIConfiguration.baseURL.absoluteString)")
                                .font(.footnote.monospaced())
                                .foregroundStyle(.secondary)
                        }
                        .padding()
                    }
                }
            }
            .navigationTitle("Welcome")
        }
    }
}

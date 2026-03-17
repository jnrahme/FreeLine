import SwiftUI

struct EmailAuthView: View {
    @EnvironmentObject private var appModel: AppModel
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Create your FreeLine account")
                    .font(.title.bold())

                Text("Start with email and password. The backend returns a dev preview link right now so we can verify the flow locally.")
                    .foregroundStyle(.secondary)

                TextField("Email", text: $email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .textFieldStyle(.roundedBorder)

                SecureField("Password", text: $password)
                    .textFieldStyle(.roundedBorder)

                Button {
                    Task {
                        await appModel.startEmailAuth(email: email, password: password)
                    }
                } label: {
                    if appModel.isLoading {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("Send verification link")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(appModel.isLoading)

                Button("Back") {
                    appModel.showWelcome()
                }
                .buttonStyle(.bordered)
            }
            .padding()
        }
        .navigationTitle("Email Sign Up")
    }
}

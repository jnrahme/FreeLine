import SwiftUI

struct NewMessageView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appModel: AppModel
    @State private var bodyText = ""
    @State private var recipient = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("To") {
                    TextField("U.S. phone number", text: $recipient)
                        .keyboardType(.phonePad)
                        .textInputAutocapitalization(.never)
                }

                Section("Message") {
                    TextField("Type your message", text: $bodyText, axis: .vertical)
                        .lineLimit(4...8)
                }

                if let allowance = appModel.messageAllowance {
                    Section("Allowance") {
                        Text("\(allowance.dailyRemaining) daily texts remaining")
                        Text("\(allowance.monthlyRemaining) monthly texts remaining")
                    }
                }
            }
            .navigationTitle("New Message")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") {
                        Task {
                            let conversation = await appModel.sendMessage(
                                to: recipient,
                                body: bodyText
                            )
                            if conversation != nil {
                                bodyText = ""
                                recipient = ""
                                dismiss()
                            }
                        }
                    }
                    .disabled(
                        recipient.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                            bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    )
                }
            }
        }
    }
}

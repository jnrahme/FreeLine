import SwiftUI

struct NumberClaimView: View {
    @EnvironmentObject private var appModel: AppModel
    @State private var areaCode = "415"

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 20) {
                Text("Choose your free number")
                    .font(.largeTitle.bold())

                Text("Search by area code, then claim one available number. Your line has to be activated within 24 hours.")
                    .foregroundStyle(.secondary)

                HStack {
                    TextField("Area code", text: $areaCode)
                        .keyboardType(.numberPad)
                        .textFieldStyle(.roundedBorder)

                    Button("Search") {
                        Task {
                            await appModel.searchNumbers(areaCode: areaCode)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(appModel.isLoading)
                }

                if appModel.availableNumbers.isEmpty {
                    Spacer()
                    ContentUnavailableView(
                        "No numbers loaded yet",
                        systemImage: "phone.badge.plus",
                        description: Text("Run a search to see claimable numbers from the provider.")
                    )
                    Spacer()
                } else {
                    List(appModel.availableNumbers, id: \.phoneNumber) { number in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(number.nationalFormat)
                                .font(.headline)
                            Text("\(number.locality), \(number.region)")
                                .foregroundStyle(.secondary)

                            Button("Claim this number") {
                                Task {
                                    await appModel.claimNumber(number)
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(appModel.isLoading)
                        }
                        .padding(.vertical, 8)
                    }
                    .listStyle(.plain)
                }

                if let errorMessage = appModel.errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
            }
            .padding()
            .navigationTitle("Claim Number")
            .task {
                if appModel.availableNumbers.isEmpty {
                    await appModel.searchNumbers(areaCode: areaCode)
                }
            }
        }
    }
}

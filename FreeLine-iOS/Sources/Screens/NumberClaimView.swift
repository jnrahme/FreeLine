import SwiftUI

struct NumberClaimView: View {
    @EnvironmentObject private var appModel: AppModel
    @State private var areaCode = "415"

    var body: some View {
        NavigationStack {
            FreeLineScreen {
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 20) {
                        FreeLineGlassCard {
                            VStack(alignment: .leading, spacing: 16) {
                                HStack(alignment: .top) {
                                    FreeLineSectionTitle(
                                        eyebrow: "Claim number",
                                        title: "Choose the local line that feels like yours.",
                                        subtitle: "Search by area code, browse inventory, and claim one number. Activation needs to happen within 24 hours so unused inventory can be recycled."
                                    )

                                    Spacer(minLength: 16)

                                    FreeLineHeroIcon(systemImage: "phone.badge.plus")
                                        .scaleEffect(0.82)
                                }

                                FreeLineGlassGroup(spacing: 12) {
                                    HStack(spacing: 12) {
                                        FreeLinePill(icon: "person.badge.key.fill", text: "1 free line", tint: FreeLineTheme.accentDeep)
                                        FreeLinePill(icon: "timer", text: "24h activate", tint: FreeLineTheme.warning)
                                    }
                                }
                            }
                        }

                        FreeLineGlassCard {
                            VStack(alignment: .leading, spacing: 18) {
                                HStack(spacing: 16) {
                                    FreeLineStatStrip(title: "Allowance", value: "1 free line", tint: FreeLineTheme.accentDeep)
                                    FreeLineStatStrip(title: "Window", value: "24h activate", tint: FreeLineTheme.warning)
                                }

                                FreeLineField(
                                    label: "Area code",
                                    icon: "location.fill",
                                    caption: "Search U.S. local inventory by the first three digits."
                                ) {
                                    TextField("415", text: $areaCode)
                                        .keyboardType(.numberPad)
                                }

                                Button {
                                    Task {
                                        await appModel.searchNumbers(areaCode: areaCode)
                                    }
                                } label: {
                                    if appModel.isLoading {
                                        ProgressView()
                                            .tint(.white)
                                            .frame(maxWidth: .infinity)
                                    } else {
                                        Text("Search available numbers")
                                            .frame(maxWidth: .infinity)
                                    }
                                }
                                .buttonStyle(FreeLinePrimaryButtonStyle())
                                .disabled(appModel.isLoading)
                            }
                        }

                        if let errorMessage = appModel.errorMessage {
                            FreeLineGlassCard(padding: 16) {
                                Text(errorMessage)
                                    .font(FreeLineTheme.body(14, weight: .semibold))
                                    .foregroundStyle(FreeLineTheme.coral)
                            }
                        }

                        if appModel.availableNumbers.isEmpty {
                            FreeLineGlassCard {
                                VStack(alignment: .leading, spacing: 12) {
                                    HStack {
                                        FreeLineHeroIcon(systemImage: "phone.badge.plus")
                                            .scaleEffect(0.76)
                                        Spacer()
                                    }

                                    Text("No numbers loaded yet")
                                        .font(FreeLineTheme.body(21, weight: .bold))
                                        .foregroundStyle(FreeLineTheme.textPrimary)

                                    Text("Run a search to see claimable numbers from the provider.")
                                        .font(FreeLineTheme.body(15, weight: .medium))
                                        .foregroundStyle(FreeLineTheme.textSecondary)
                                }
                            }
                        } else {
                            VStack(alignment: .leading, spacing: 14) {
                                Text("Available Numbers")
                                    .font(FreeLineTheme.body(20, weight: .bold))
                                    .foregroundStyle(FreeLineTheme.textPrimary)

                                ForEach(appModel.availableNumbers, id: \.phoneNumber) { number in
                                    FreeLineGlassCard {
                                        VStack(alignment: .leading, spacing: 14) {
                                            HStack(alignment: .top) {
                                                VStack(alignment: .leading, spacing: 6) {
                                                    Text(number.nationalFormat)
                                                        .font(FreeLineTheme.title(26, weight: .bold))
                                                        .foregroundStyle(FreeLineTheme.textPrimary)
                                                    Text("\(number.locality), \(number.region)")
                                                        .font(FreeLineTheme.body(15, weight: .medium))
                                                        .foregroundStyle(FreeLineTheme.textSecondary)
                                                }

                                                Spacer()
                                            }

                                            FreeLineGlassGroup(spacing: 12) {
                                                HStack(spacing: 12) {
                                                    FreeLinePill(icon: "building.2.fill", text: number.provider.capitalized, tint: FreeLineTheme.accentDeep)
                                                    FreeLinePill(icon: "mappin.and.ellipse", text: number.areaCode, tint: FreeLineTheme.warning)
                                                    FreeLinePill(icon: "checkmark.seal.fill", text: "Ready", tint: FreeLineTheme.mint)
                                                }
                                            }

                                            Button("Claim this number") {
                                                Task {
                                                    await appModel.claimNumber(number)
                                                }
                                            }
                                            .buttonStyle(FreeLinePrimaryButtonStyle())
                                            .disabled(appModel.isLoading)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 32)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .task {
                if appModel.availableNumbers.isEmpty {
                    await appModel.searchNumbers(areaCode: areaCode)
                }
            }
        }
    }
}

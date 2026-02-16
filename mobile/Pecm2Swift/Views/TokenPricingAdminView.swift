import SwiftUI

@MainActor
struct TokenPricingAdminView: View {
  @EnvironmentObject private var session: SessionStore
  @StateObject private var viewModel: TokenPricingViewModel

  @State private var baseText = "1"
  @State private var baseImage = "5"
  @State private var countryCode = ""
  @State private var countryText = ""
  @State private var countryImage = ""
  @State private var countryPricing: [String: TokenPricing] = [:]

  init(viewModel: TokenPricingViewModel) {
    _viewModel = StateObject(wrappedValue: viewModel)
  }

  @MainActor
  init() {
    _viewModel = StateObject(wrappedValue: TokenPricingViewModel())
  }

  var body: some View {
    Form {
      Section(header: Text("Tarifs de base")) {
        TextField("Texte", text: $baseText)
          .keyboardType(.numberPad)
          .listRowBackground(AppColors.backgroundSecondary)
        TextField("Image", text: $baseImage)
          .keyboardType(.numberPad)
          .listRowBackground(AppColors.backgroundSecondary)
      }

      Section(header: Text("Tarifs par pays")) {
        ForEach(countryPricing.keys.sorted(), id: \.self) { code in
          let pricing = countryPricing[code]
          VStack(alignment: .leading) {
            Text(code)
              .fontWeight(.semibold)
              .foregroundColor(AppColors.textPrimary)
            Text("Texte: \(pricing?.text ?? 0) | Image: \(pricing?.image ?? 0)")
              .font(.footnote)
              .foregroundColor(AppColors.textSecondary)
          }
          .listRowBackground(AppColors.backgroundSecondary)
        }

        VStack {
          TextField("Code pays (FR)", text: $countryCode)
            .listRowBackground(AppColors.backgroundSecondary)
          TextField("Texte", text: $countryText)
            .keyboardType(.numberPad)
            .listRowBackground(AppColors.backgroundSecondary)
          TextField("Image", text: $countryImage)
            .keyboardType(.numberPad)
            .listRowBackground(AppColors.backgroundSecondary)

          Button("Ajouter / Modifier") {
            let code = countryCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
            if !code.isEmpty {
              let pricing = TokenPricing(text: Int(countryText) ?? 0, image: Int(countryImage) ?? 0)
              countryPricing[code] = pricing
              countryCode = ""
              countryText = ""
              countryImage = ""
            }
          }
          .tint(AppColors.accent)
        }
        .listRowBackground(AppColors.backgroundSecondary)
      }

      if let error = viewModel.errorMessage {
        Text(error)
          .foregroundColor(AppColors.error)
          .listRowBackground(AppColors.backgroundSecondary)
      }

      Button("Enregistrer") {
        Task { await save() }
      }
      .buttonStyle(.borderedProminent)
      .tint(AppColors.accent)
      .listRowBackground(AppColors.backgroundSecondary)
    }
    .scrollContentBackground(.hidden)
    .background(AppColors.background)
    .navigationTitle("Token pricing")
    .onAppear {
      viewModel.listen()
      hydrate()
    }
    .onReceive(viewModel.objectWillChange) { _ in
      hydrate()
    }
    .tint(AppColors.accent)
  }

  private func hydrate() {
    guard let settings = viewModel.settings else { return }
    if let base = settings.base {
      baseText = String(base.text ?? 1)
      baseImage = String(base.image ?? 5)
    }
    countryPricing = settings.countries ?? [:]
  }

  private func save() async {
    let baseTextValue = Int(baseText) ?? 1
    let baseImageValue = Int(baseImage) ?? 5
    await viewModel.updateSettings(baseText: baseTextValue, baseImage: baseImageValue, countries: countryPricing, adminId: session.user?.uid, adminMail: session.user?.email)
  }
}

#Preview("Token pricing (admin)") {
  NavigationStack {
    TokenPricingAdminView(viewModel: .preview)
  }
  .environmentObject(SessionStore(startListening: false))
}

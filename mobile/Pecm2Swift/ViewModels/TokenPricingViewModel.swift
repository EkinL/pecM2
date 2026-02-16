import Foundation
import FirebaseFirestore

@MainActor
final class TokenPricingViewModel: ObservableObject {
  @Published var settings: TokenPricingSettings?
  @Published var isLoading = true
  @Published var errorMessage: String?

  private var listener: ListenerRegistration?

  deinit {
    listener?.remove()
  }

  func listen() {
    if ProcessInfo.processInfo.environment["XCODE_RUNNING_FOR_PREVIEWS"] == "1" {
      isLoading = false
      return
    }
    listener?.remove()
    isLoading = true
    listener = TokenPricingService.listenSettings { [weak self] settings in
      Task { @MainActor in
        self?.settings = settings
        self?.isLoading = false
      }
    }
  }

  func updateSettings(baseText: Int, baseImage: Int, countries: [String: TokenPricing], adminId: String?, adminMail: String?) async {
    do {
      let base = TokenPricing(text: baseText, image: baseImage)
      try await TokenPricingService.updateSettings(base: base, countries: countries, adminId: adminId, adminMail: adminMail)
    } catch {
      errorMessage = error.localizedDescription
    }
  }
}

#if DEBUG
extension TokenPricingViewModel {
  @MainActor static var preview: TokenPricingViewModel {
    let viewModel = TokenPricingViewModel()
    viewModel.settings = TokenPricingSettings(
      base: TokenPricing(text: 1, image: 5),
      countries: [
        "FR": TokenPricing(text: 2, image: 6),
        "US": TokenPricing(text: 3, image: 7),
      ],
      updatedAt: Date(),
      updatedBy: "preview",
      updatedMail: "preview@local"
    )
    viewModel.isLoading = false
    return viewModel
  }
}
#endif

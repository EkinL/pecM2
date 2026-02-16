import Foundation
import FirebaseFirestore

@MainActor
final class AiProfilesViewModel: ObservableObject {
  @Published var profiles: [AiProfile] = []
  @Published var isLoading = true
  @Published var errorMessage: String?

  private var listener: ListenerRegistration?

  deinit {
    listener?.remove()
  }

  func listenAll() {
    listener?.remove()
    isLoading = true
    listener = AiProfileService.listenAll { [weak self] items in
      Task { @MainActor in
        self?.profiles = items
        self?.isLoading = false
      }
    }
  }

  func listenOwner(ownerId: String) {
    listener?.remove()
    isLoading = true
    listener = AiProfileService.listenByOwner(ownerId: ownerId) { [weak self] items in
      Task { @MainActor in
        self?.profiles = items
        self?.isLoading = false
      }
    }
  }
}

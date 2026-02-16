import Foundation
import FirebaseAuth
import FirebaseFirestore

@MainActor
final class SessionStore: ObservableObject {
  @Published var user: User?
  @Published var profile: UserProfile?
  @Published var isLoading = true
  @Published var errorMessage: String?

  private var authHandle: AuthStateDidChangeListenerHandle?
  private var profileListener: ListenerRegistration?

    private static let isRunningForPreviews: Bool = {
    ProcessInfo.processInfo.environment["XCODE_RUNNING_FOR_PREVIEWS"] == "1"
  }()

  init(startListening: Bool? = nil) {
    let shouldStart = startListening ?? !Self.isRunningForPreviews
    if shouldStart {
      listenToAuthChanges()
    } else {
      isLoading = false
    }
  }

  deinit {
    if let authHandle { Auth.auth().removeStateDidChangeListener(authHandle) }
    profileListener?.remove()
  }

  func listenToAuthChanges() {
    authHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
      guard let self else { return }
      self.user = user
      self.profile = nil
      self.profileListener?.remove()
      if let user {
        self.profileListener = UserService.listenUser(id: user.uid) { [weak self] profile in
          Task { @MainActor in
            self?.profile = profile
            self?.isLoading = false
          }
        }
      } else {
        self.isLoading = false
      }
    }
  }

  func refreshProfile() async {
    guard let uid = user?.uid else { return }
    do {
      let fetched = try await UserService.fetchUser(id: uid)
      profile = fetched
    } catch {
      errorMessage = error.localizedDescription
    }
  }
}


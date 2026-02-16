import Foundation
import FirebaseFirestore
import FirebaseFirestoreSwift

@MainActor
final class UsersViewModel: ObservableObject {
  @Published var users: [UserProfile] = []
  @Published var isLoading = true
  private var listener: ListenerRegistration?

  deinit {
    listener?.remove()
  }

  func listenAll() {
    listener?.remove()
    isLoading = true
    let collection = FirebaseManager.shared.db.collection(FirestoreCollections.utilisateurs)
    listener = collection.addSnapshotListener { [weak self] snapshot, _ in
      let items = snapshot?.documents.compactMap { try? $0.data(as: UserProfile.self) } ?? []
      Task { @MainActor in
        self?.users = items
        self?.isLoading = false
      }
    }
  }
}

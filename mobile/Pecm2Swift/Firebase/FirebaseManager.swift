import Foundation
import FirebaseCore
import FirebaseAuth
import FirebaseFirestore

final class FirebaseManager {
  static let shared = FirebaseManager()

  let auth: Auth
  let db: Firestore

  private init() {
    if FirebaseApp.app() == nil {
      FirebaseApp.configure()
    }

    db = Firestore.firestore()

    // Configure Firestore caching using the modern cacheSettings API
    var settings = db.settings
    // Enable persistent (disk) cache with a reasonable size (e.g., 100 MB)
    let cacheSizeBytes = NSNumber(value: 100 * 1024 * 1024)
    settings.cacheSettings = PersistentCacheSettings(sizeBytes: cacheSizeBytes)
    db.settings = settings

    auth = Auth.auth()
  }
}

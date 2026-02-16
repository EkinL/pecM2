import Foundation
import FirebaseFirestore
import FirebaseFirestoreSwift

struct TokenPricingService {
  private static var collection: CollectionReference {
    FirebaseManager.shared.db.collection(FirestoreCollections.settings)
  }

  static func listenSettings(
    onChange: @escaping (TokenPricingSettings?) -> Void,
    onError: ((Error) -> Void)? = nil
  ) -> ListenerRegistration {
    collection.document("tokenPricingIdf").addSnapshotListener { snapshot, error in
      if let error {
        onError?(error)
      }
      guard let snapshot, snapshot.exists else {
        onChange(nil)
        return
      }
      do {
        onChange(try snapshot.data(as: TokenPricingSettings.self))
      } catch {
        onError?(error)
        onChange(nil)
      }
    }
  }

  static func updateSettings(base: TokenPricing, countries: [String: TokenPricing], adminId: String?, adminMail: String?) async throws {
    let payload: [String: Any] = [
      "base": try Firestore.Encoder().encode(base),
      "countries": try Firestore.Encoder().encode(countries),
      "updatedAt": FieldValue.serverTimestamp(),
      "updatedBy": adminId as Any,
      "updatedMail": adminMail as Any
    ]
    try await collection.document("tokenPricingIdf").setData(payload, merge: true)
  }
}

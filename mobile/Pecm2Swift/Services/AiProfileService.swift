import Foundation
import FirebaseAuth
import FirebaseFirestore
import FirebaseFirestoreSwift

struct AiProfileService {
  private static var collection: CollectionReference {
    FirebaseManager.shared.db.collection(FirestoreCollections.iaProfiles)
  }

  static func listenAll(onChange: @escaping ([AiProfile]) -> Void) -> ListenerRegistration {
    collection.addSnapshotListener { snapshot, _ in
      let items = snapshot?.documents.compactMap { try? $0.data(as: AiProfile.self) } ?? []
      onChange(items)
    }
  }

  static func listenByOwner(ownerId: String, onChange: @escaping ([AiProfile]) -> Void) -> ListenerRegistration {
    collection.whereField("ownerId", isEqualTo: ownerId).addSnapshotListener { snapshot, _ in
      let items = snapshot?.documents.compactMap { try? $0.data(as: AiProfile.self) } ?? []
      onChange(items)
    }
  }

  static func fetchById(_ id: String) async throws -> AiProfile? {
    let snapshot = try await collection.document(id).getDocument()
    guard snapshot.exists else { return nil }
    return try snapshot.data(as: AiProfile.self)
  }

  static func addProfile(name: String,
                         mentality: String,
                         voice: String,
                         voiceRhythm: String,
                         look: AiLook?,
                         visibility: String,
                         accessType: String) async throws {
    guard let user = Auth.auth().currentUser else {
      throw NSError(domain: "Auth", code: 401, userInfo: [NSLocalizedDescriptionKey: "Session invalide"])
    }

    var payload: [String: Any] = [
      "ownerId": user.uid,
      "ownerMail": user.email as Any,
      "name": name,
      "mentality": mentality,
      "voice": voice,
      "voiceRhythm": voiceRhythm,
      "visibility": visibility,
      "accessType": accessType,
      "status": "pending",
      "createdAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp()
    ]
    if let look {
      payload["look"] = try Firestore.Encoder().encode(look)
    }

    try await collection.addDocument(data: payload)
  }

  static func updateStatus(profileId: String, status: String, note: String?, adminId: String?, adminMail: String?) async throws {
    let docRef = collection.document(profileId)
    var payload: [String: Any] = [
      "status": status,
      "updatedAt": FieldValue.serverTimestamp(),
      "reviewedAt": FieldValue.serverTimestamp(),
      "reviewedBy": adminId as Any,
      "reviewedMail": adminMail as Any
    ]
    if let note {
      payload["statusNote"] = note
    }
    try await docRef.setData(payload, merge: true)
  }

  static func updateDetails(profileId: String, updates: [String: Any]) async throws {
    var payload = updates
    payload["updatedAt"] = FieldValue.serverTimestamp()
    try await collection.document(profileId).setData(payload, merge: true)
  }
}

import Foundation
import FirebaseAuth
import FirebaseFirestore
import FirebaseFirestoreSwift

struct UserService {
  private static var collection: CollectionReference {
    FirebaseManager.shared.db.collection(FirestoreCollections.utilisateurs)
  }

  static func fetchUser(id: String) async throws -> UserProfile? {
    let snapshot = try await collection.document(id).getDocument()
    guard snapshot.exists else { return nil }
    return try snapshot.data(as: UserProfile.self)
  }

  static func listenUser(id: String, onChange: @escaping (UserProfile?) -> Void) -> ListenerRegistration {
    collection.document(id).addSnapshotListener { snapshot, _ in
      guard let snapshot, snapshot.exists else {
        onChange(nil)
        return
      }
      onChange(try? snapshot.data(as: UserProfile.self))
    }
  }

  static func ensureProfile(user: User, role: UserRole, pseudo: String?) async throws -> UserProfile {
    let docRef = collection.document(user.uid)
    let snapshot = try await docRef.getDocument()
    let mail = user.email
    let providerIds = user.providerData.map { $0.providerID }
    let normalizedRole = role == .admin ? "admin" : "client"

    if !snapshot.exists {
      let payload: [String: Any] = [
        "mail": mail as Any,
        "pseudo": pseudo ?? mail?.components(separatedBy: "@").first as Any,
        "role": normalizedRole,
        "tokens": 0,
        "providerIds": providerIds,
        "createdAt": FieldValue.serverTimestamp(),
        "updatedAt": FieldValue.serverTimestamp()
      ]
      try await docRef.setData(payload, merge: true)
      let createdSnapshot = try await docRef.getDocument()
      Task {
        await LogService.log(
          action: "profile_setup",
          targetType: "user",
          targetId: user.uid,
          details: [
            "isNew": true,
            "role": normalizedRole
          ]
        )
      }
      return try createdSnapshot.data(as: UserProfile.self)
    }

    var updates: [String: Any] = [
      "updatedAt": FieldValue.serverTimestamp()
    ]

    let data = snapshot.data() ?? [:]
    if data["role"] == nil {
      updates["role"] = normalizedRole
    }
    if data["mail"] == nil, let mail {
      updates["mail"] = mail
    }
    if data["pseudo"] == nil, let pseudo {
      updates["pseudo"] = pseudo
    }
    if data["providerIds"] == nil {
      updates["providerIds"] = providerIds
    }

    if updates.count > 1 {
      try await docRef.setData(updates, merge: true)
      let updatedFields = updates.keys.filter { $0 != "updatedAt" }
      Task {
        await LogService.log(
          action: "profile_setup",
          targetType: "user",
          targetId: user.uid,
          details: [
            "isNew": false,
            "updatedFields": updatedFields
          ]
        )
      }
    }

    return try snapshot.data(as: UserProfile.self)
  }

  static func grantTokens(userId: String, amount: Int) async throws {
    let docRef = collection.document(userId)
    try await docRef.setData([
      "tokens": FieldValue.increment(Int64(amount)),
      "updatedAt": FieldValue.serverTimestamp()
    ], merge: true)
  }

  static func updateCountry(userId: String, countryCode: String, countryLabel: String) async throws {
    let normalizedCode = countryCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    guard normalizedCode.count == 2 else {
      throw NSError(domain: "User", code: 400, userInfo: [NSLocalizedDescriptionKey: "Code pays invalide."])
    }
    let normalizedLabel = countryLabel.trimmingCharacters(in: .whitespacesAndNewlines)
    let docRef = collection.document(userId)
    try await docRef.setData([
      "countryCode": normalizedCode,
      "countryLabel": normalizedLabel.isEmpty ? normalizedCode : normalizedLabel,
      "countryUpdatedAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp()
    ], merge: true)
  }

  static func updateUseLiveLocationPricing(userId: String, enabled: Bool) async throws {
    let docRef = collection.document(userId)
    try await docRef.setData([
      "useLiveLocationPricing": enabled,
      "updatedAt": FieldValue.serverTimestamp()
    ], merge: true)
  }
}

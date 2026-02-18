import Foundation
import FirebaseFirestore
import FirebaseFirestoreSwift

struct DemandeService {
  private static var collection: CollectionReference {
    FirebaseManager.shared.db.collection(FirestoreCollections.demandes)
  }

  private static var usersCollection: CollectionReference {
    FirebaseManager.shared.db.collection(FirestoreCollections.utilisateurs)
  }

  static func listenAll(onChange: @escaping ([Demande]) -> Void) -> ListenerRegistration {
    collection.addSnapshotListener { snapshot, _ in
      let items = snapshot?.documents.compactMap { try? $0.data(as: Demande.self) } ?? []
      onChange(items)
    }
  }

  static func listenForClient(clientId: String, onChange: @escaping ([Demande]) -> Void) -> ListenerRegistration {
    collection.whereField("clientId", isEqualTo: clientId).addSnapshotListener { snapshot, _ in
      let items = snapshot?.documents.compactMap { try? $0.data(as: Demande.self) } ?? []
      onChange(items)
    }
  }

  static func listenForPrestataire(prestataireId: String, onChange: @escaping ([Demande]) -> Void) -> ListenerRegistration {
    collection.whereField("prestataireId", isEqualTo: prestataireId).addSnapshotListener { snapshot, _ in
      let items = snapshot?.documents.compactMap { try? $0.data(as: Demande.self) } ?? []
      onChange(items)
    }
  }

  static func addDemande(clientId: String,
                         clientMail: String?,
                         clientPseudo: String?,
                         title: String,
                         description: String,
                         category: String?,
                         budget: Double?,
                         city: String?,
                         availability: String?,
                         location: GeoLocation?,
                         aiId: String? = nil,
                         aiName: String? = nil,
                         requestType: String? = nil,
                         payload aiPayload: DemandeAiPayload? = nil) async throws {
    let normalizedType = requestType?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? "other"
    let aiTypes = Set(["create_ai", "update_ai", "moderation", "incident", "usage_ai"])
    let isAiRequest = aiTypes.contains(normalizedType) || aiId != nil || aiName != nil || aiPayload != nil

    let matched: UserProfile?
    if isAiRequest {
      let adminsSnapshot = try await usersCollection.whereField("role", isEqualTo: "admin").getDocuments()
      let admins = adminsSnapshot.documents.compactMap { try? $0.data(as: UserProfile.self) }
      if let selected = admins.randomElement() {
        matched = selected
      } else {
        let fallbackSnapshot = try await usersCollection
          .whereField("role", in: ["client", "admin"])
          .getDocuments()
        let fallbackUsers = fallbackSnapshot.documents.compactMap { try? $0.data(as: UserProfile.self) }
        matched = fallbackUsers.randomElement()
      }
    } else {
      let prestatairesSnapshot = try await usersCollection
        .whereField("role", in: ["client", "admin"])
        .getDocuments()
      let prestataires = prestatairesSnapshot.documents.compactMap { try? $0.data(as: UserProfile.self) }
      matched = prestataires.randomElement()
    }

    var requestPayload: [String: Any] = [
      "clientId": clientId,
      "clientMail": clientMail as Any,
      "clientPseudo": clientPseudo as Any,
      "title": title,
      "description": description,
      "category": category as Any,
      "budget": budget as Any,
      "city": city as Any,
      "availability": availability as Any,
      "aiId": aiId as Any,
      "aiName": aiName as Any,
      "requestType": normalizedType,
      "prestataireId": matched?.id as Any,
      "prestatairePseudo": matched?.pseudo as Any,
      "prestataireMail": matched?.mail as Any,
      "status": matched == nil ? "pending" : "matched",
      "createdAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp()
    ]

    if matched != nil {
      requestPayload["matchedAt"] = FieldValue.serverTimestamp()
    }

    if let aiPayload {
      let encodedPayload = try Firestore.Encoder().encode(aiPayload)
      if !encodedPayload.isEmpty {
        requestPayload["payload"] = encodedPayload
      }
    }

    if let location {
      requestPayload["location"] = try Firestore.Encoder().encode(location)
      requestPayload["locationUpdatedAt"] = FieldValue.serverTimestamp()
    }

    let docRef = try await collection.addDocument(data: requestPayload)
    Task {
      await LogService.log(
        action: "demande_create",
        targetType: "demande",
        targetId: docRef.documentID,
        details: [
          "status": matched == nil ? "pending" : "matched",
          "prestataireId": matched?.id ?? NSNull()
        ]
      )
    }
  }

  static func updateLocation(demandeId: String, location: GeoLocation) async throws {
    let payload: [String: Any] = [
      "location": try Firestore.Encoder().encode(location),
      "locationUpdatedAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp()
    ]
    try await collection.document(demandeId).setData(payload, merge: true)
  }

  static func acceptDemande(demandeId: String, prestataireId: String) async throws {
    try await collection.document(demandeId).setData([
      "status": "accepted",
      "prestataireId": prestataireId,
      "acceptedAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp()
    ], merge: true)
  }

  static func cancelDemande(demandeId: String, reason: String?) async throws {
    var payload: [String: Any] = [
      "status": "cancelled",
      "cancelledAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp()
    ]
    if let reason {
      payload["cancelReason"] = reason
    }
    try await collection.document(demandeId).setData(payload, merge: true)
  }
}

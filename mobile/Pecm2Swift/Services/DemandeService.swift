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
                         location: GeoLocation?) async throws {
    let prestatairesSnapshot = try await usersCollection
      .whereField("role", in: ["client", "admin"])
      .getDocuments()

    let prestataires = prestatairesSnapshot.documents.compactMap { try? $0.data(as: UserProfile.self) }
    let matched = prestataires.randomElement()

    var payload: [String: Any] = [
      "clientId": clientId,
      "clientMail": clientMail as Any,
      "clientPseudo": clientPseudo as Any,
      "title": title,
      "description": description,
      "category": category as Any,
      "budget": budget as Any,
      "city": city as Any,
      "availability": availability as Any,
      "prestataireId": matched?.id as Any,
      "prestatairePseudo": matched?.pseudo as Any,
      "prestataireMail": matched?.mail as Any,
      "status": matched == nil ? "pending" : "matched",
      "createdAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp()
    ]

    if let location {
      payload["location"] = try Firestore.Encoder().encode(location)
      payload["locationUpdatedAt"] = FieldValue.serverTimestamp()
    }

    try await collection.addDocument(data: payload)
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

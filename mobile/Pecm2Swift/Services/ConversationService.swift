import Foundation
import FirebaseFirestore
import FirebaseFirestoreSwift

struct ConversationService {
  private static var collection: CollectionReference {
    FirebaseManager.shared.db.collection(FirestoreCollections.conversations)
  }

  private static var usersCollection: CollectionReference {
    FirebaseManager.shared.db.collection(FirestoreCollections.utilisateurs)
  }

  private static var aiCollection: CollectionReference {
    FirebaseManager.shared.db.collection(FirestoreCollections.iaProfiles)
  }

  private static var settingsCollection: CollectionReference {
    FirebaseManager.shared.db.collection(FirestoreCollections.settings)
  }

  static func listenAdminConversations(status: String? = nil, pageSize: Int = 50, onChange: @escaping ([Conversation], DocumentSnapshot?) -> Void) -> ListenerRegistration {
    var query: Query = collection
      .order(by: "updatedAt", descending: true)
      .limit(to: pageSize)

    if let status, !status.isEmpty {
      query = query.whereField("status", isEqualTo: status)
    }

    return query.addSnapshotListener { snapshot, _ in
      let items = snapshot?.documents.compactMap { try? $0.data(as: Conversation.self) } ?? []
      onChange(items, snapshot?.documents.last)
    }
  }

  static func fetchAdminConversationsPage(status: String? = nil, pageSize: Int = 50, startAfter lastSnapshot: DocumentSnapshot? = nil) async throws -> (items: [Conversation], lastSnapshot: DocumentSnapshot?) {
    var query: Query = collection
      .order(by: "updatedAt", descending: true)
      .limit(to: pageSize)

    if let status, !status.isEmpty {
      query = query.whereField("status", isEqualTo: status)
    }

    if let lastSnapshot {
      query = query.start(afterDocument: lastSnapshot)
    }

    let snapshot = try await query.getDocuments()
    let items = snapshot.documents.compactMap { try? $0.data(as: Conversation.self) }
    return (items, snapshot.documents.last)
  }

  static func listenAll(onChange: @escaping ([Conversation]) -> Void) -> ListenerRegistration {
    collection.addSnapshotListener { snapshot, _ in
      let items = snapshot?.documents.compactMap { try? $0.data(as: Conversation.self) } ?? []
      onChange(items)
    }
  }

  static func listenForUser(userId: String, onChange: @escaping ([Conversation]) -> Void) -> ListenerRegistration {
    collection.whereField("userId", isEqualTo: userId).addSnapshotListener { snapshot, _ in
      let items = snapshot?.documents.compactMap { try? $0.data(as: Conversation.self) } ?? []
      onChange(items)
    }
  }

  static func fetchById(conversationId: String) async throws -> Conversation? {
    let snapshot = try await collection.document(conversationId).getDocument()
    guard snapshot.exists else { return nil }
    return try snapshot.data(as: Conversation.self)
  }

  static func createConversation(userId: String, aiId: String, status: String = "running") async throws -> Conversation {
    let aiSnapshot = try await aiCollection.document(aiId).getDocument()
    guard aiSnapshot.exists else { throw NSError(domain: "AI", code: 404, userInfo: [NSLocalizedDescriptionKey: "IA introuvable."]) }
    let aiData = aiSnapshot.data() ?? [:]
    let aiStatus = (aiData["status"] as? String ?? "pending").lowercased()
    if aiStatus != "active" {
      throw NSError(domain: "AI", code: 403, userInfo: [NSLocalizedDescriptionKey: "IA non active."])
    }
    let imageUrl = aiData["imageUrl"] as? String ?? ""
    if imageUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      throw NSError(domain: "AI", code: 403, userInfo: [NSLocalizedDescriptionKey: "Avatar IA en cours de generation."])
    }

    let docRef = collection.document()
    let payload: [String: Any] = [
      "userId": userId,
      "aiId": aiId,
      "status": status,
      "messageCount": 0,
      "createdAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp()
    ]
    try await docRef.setData(payload)

    let snapshot = try await docRef.getDocument()
    return try snapshot.data(as: Conversation.self)
  }

  static func updateLocation(conversationId: String, location: GeoLocation) async throws {
    let payload: [String: Any] = [
      "location": try Firestore.Encoder().encode(location),
      "locationUpdatedAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp()
    ]
    try await collection.document(conversationId).setData(payload, merge: true)
  }

  static func updateCountry(conversationId: String, countryCode: String, countryLabel: String) async throws {
    try await collection.document(conversationId).setData([
      "countryCode": countryCode,
      "countryLabel": countryLabel,
      "countryUpdatedAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp()
    ], merge: true)
  }

  static func updateTokenPricing(conversationId: String, pricing: TokenPricing, updatedBy: String? = nil) async throws {
    var payload: [String: Any] = [
      "tokenPricing": try Firestore.Encoder().encode(pricing),
      "tokenPricingUpdatedAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp()
    ]
    if let updatedBy, !updatedBy.isEmpty {
      payload["tokenPricingUpdatedBy"] = updatedBy
    }
    try await collection.document(conversationId).setData(payload, merge: true)
  }

  static func listenMessages(conversationId: String, pageSize: Int = 25, onChange: @escaping ([ConversationMessage]) -> Void) -> ListenerRegistration {
    let messagesRef = FirebaseManager.shared.db.collection(FirestoreCollections.conversationMessages(conversationId: conversationId))
    let query = messagesRef.order(by: "createdAt", descending: true).limit(to: pageSize)
    return query.addSnapshotListener { snapshot, _ in
      let items = snapshot?.documents.compactMap { try? $0.data(as: ConversationMessage.self) } ?? []
      onChange(items.reversed())
    }
  }

  static func sendMessageWithTokens(conversationId: String,
                                    userId: String,
                                    authorRole: String,
                                    content: String,
                                    kind: String = "text",
                                    tokenCost: Int? = nil) async throws -> ConversationMessage {
    let db = FirebaseManager.shared.db
    let conversationRef = collection.document(conversationId)
    let userRef = usersCollection.document(userId)
    let messageRef = db.collection(FirestoreCollections.conversationMessages(conversationId: conversationId)).document()
    let settingsRef = settingsCollection.document("tokenPricingIdf")

    let finalPayload = try await db.runTransaction { (transaction, errorPointer) -> Any? in
      // Helper to convert thrown errors into NSError via errorPointer
      func fail(_ error: NSError) -> Any? {
        errorPointer?.pointee = error
        return nil
      }

      let conversationSnapshot: DocumentSnapshot
      do {
        conversationSnapshot = try transaction.getDocument(conversationRef)
      } catch {
        return fail(NSError(domain: "Conversation", code: 500, userInfo: [NSLocalizedDescriptionKey: "Echec lecture conversation."]))
      }
      guard conversationSnapshot.exists else {
        return fail(NSError(domain: "Conversation", code: 404, userInfo: [NSLocalizedDescriptionKey: "Conversation introuvable."]))
      }
      let conversationData = conversationSnapshot.data() ?? [:]
      let location = conversationData["location"] as? [String: Any]
      let hasLocation = (location?["lat"] as? Double) != nil && (location?["lng"] as? Double) != nil
      let countryCode = conversationData["countryCode"] as? String
      if !hasLocation && (countryCode ?? "").isEmpty {
        return fail(NSError(domain: "Conversation", code: 400, userInfo: [NSLocalizedDescriptionKey: "Localisation requise."]))
      }

      let aiId = conversationData["aiId"] as? String ?? ""
      if aiId.isEmpty {
        return fail(NSError(domain: "AI", code: 404, userInfo: [NSLocalizedDescriptionKey: "IA introuvable."]))
      }

      let aiSnapshot: DocumentSnapshot
      do {
        aiSnapshot = try transaction.getDocument(aiCollection.document(aiId))
      } catch {
        return fail(NSError(domain: "AI", code: 500, userInfo: [NSLocalizedDescriptionKey: "Echec lecture IA."]))
      }
      guard aiSnapshot.exists else {
        return fail(NSError(domain: "AI", code: 404, userInfo: [NSLocalizedDescriptionKey: "IA introuvable."]))
      }
      let aiData = aiSnapshot.data() ?? [:]
      let aiStatus = (aiData["status"] as? String ?? "pending").lowercased()
      if aiStatus != "active" {
        return fail(NSError(domain: "AI", code: 403, userInfo: [NSLocalizedDescriptionKey: "IA non active."]))
      }
      let aiImageUrl = aiData["imageUrl"] as? String ?? ""
      if aiImageUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return fail(NSError(domain: "AI", code: 403, userInfo: [NSLocalizedDescriptionKey: "Avatar IA en cours de generation."]))
      }

      let settingsSnapshot: DocumentSnapshot
      do {
        settingsSnapshot = try transaction.getDocument(settingsRef)
      } catch {
        return fail(NSError(domain: "Settings", code: 500, userInfo: [NSLocalizedDescriptionKey: "Echec lecture tarifs."]))
      }
      let settingsData = settingsSnapshot.data() ?? [:]
      let basePricing = settingsData["base"] as? [String: Any] ?? [:]
      let countryPricing = (countryCode != nil) ? (settingsData["countries"] as? [String: Any])?[countryCode ?? ""] as? [String: Any] ?? [:] : [:]
      let conversationPricing = conversationData["tokenPricing"] as? [String: Any] ?? [:]

      let baseCosts: [String: Int] = ["text": 1, "image": 5]
      let overrideCost = intValue(conversationPricing[kind])
      let countryCost = intValue(countryPricing[kind])
      let baseCost = intValue(basePricing[kind])
      let fallbackCost = baseCosts[kind] ?? tokenCost ?? 1
      let finalTokenCost = overrideCost ?? countryCost ?? baseCost ?? fallbackCost

      if finalTokenCost <= 0 {
        return fail(NSError(domain: "Conversation", code: 400, userInfo: [NSLocalizedDescriptionKey: "Cout token invalide."]))
      }

      let userSnapshot: DocumentSnapshot
      do {
        userSnapshot = try transaction.getDocument(userRef)
      } catch {
        return fail(NSError(domain: "User", code: 500, userInfo: [NSLocalizedDescriptionKey: "Echec lecture utilisateur."]))
      }
      guard userSnapshot.exists else {
        return fail(NSError(domain: "User", code: 404, userInfo: [NSLocalizedDescriptionKey: "Utilisateur introuvable."]))
      }
      let currentTokens = intValue(userSnapshot.data()?["tokens"]) ?? 0
      if currentTokens < finalTokenCost {
        return fail(NSError(domain: "User", code: 403, userInfo: [NSLocalizedDescriptionKey: "Solde insuffisant."]))
      }

      let payload: [String: Any] = [
        "conversationId": conversationId,
        "authorId": userId,
        "authorRole": authorRole,
        "kind": kind,
        "content": content,
        "tokenCost": finalTokenCost,
        "createdAt": FieldValue.serverTimestamp()
      ]

      transaction.setData(payload, forDocument: messageRef)
      transaction.setData([
        "updatedAt": FieldValue.serverTimestamp(),
        "messageCount": FieldValue.increment(Int64(1))
      ], forDocument: conversationRef, merge: true)
      transaction.setData([
        "tokens": currentTokens - finalTokenCost,
        "updatedAt": FieldValue.serverTimestamp()
      ], forDocument: userRef, merge: true)

      return payload
    }

    _ = finalPayload
    let snapshot = try await messageRef.getDocument()
    return try snapshot.data(as: ConversationMessage.self)
  }

  private static func intValue(_ value: Any?) -> Int? {
    if let intValue = value as? Int { return intValue }
    if let doubleValue = value as? Double { return Int(doubleValue) }
    if let stringValue = value as? String, let intValue = Int(stringValue) { return intValue }
    return nil
  }
}

import Foundation
import FirebaseFirestore

struct AiEvaluationService {
  private static var collection: CollectionReference {
    FirebaseManager.shared.db.collection(FirestoreCollections.aiEvaluations)
  }

  static func addEvaluation(aiId: String, userId: String, conversationId: String, rating: Int, comment: String?, tags: [String]?) async throws {
    guard (1...5).contains(rating) else {
      throw NSError(domain: "Evaluation", code: 400, userInfo: [NSLocalizedDescriptionKey: "Note invalide."])
    }

    var payload: [String: Any] = [
      "aiId": aiId,
      "userId": userId,
      "conversationId": conversationId,
      "rating": rating,
      "createdAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp()
    ]
    if let comment, !comment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      payload["comment"] = comment
    }
    if let tags, !tags.isEmpty {
      payload["tags"] = tags
    }
    try await collection.addDocument(data: payload)
  }
}

import Foundation
import FirebaseFirestoreSwift

struct AiEvaluation: Codable, Identifiable {
  @DocumentID var id: String?
  var aiId: String?
  var userId: String?
  var conversationId: String?
  var rating: Int?
  var comment: String?
  var tags: [String]?
  var createdAt: Date?
  var updatedAt: Date?
}

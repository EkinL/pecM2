import Foundation
import FirebaseFirestoreSwift

struct Conversation: Codable, Identifiable {
  @DocumentID var id: String?
  var userId: String?
  var aiId: String?
  var status: String?
  var messageCount: Int?
  var createdAt: Date?
  var updatedAt: Date?
  var location: GeoLocation?
  var locationUpdatedAt: Date?
  var countryCode: String?
  var countryLabel: String?
  var countryUpdatedAt: Date?
  var tokenPricing: TokenPricing?
  var tokenPricingUpdatedAt: Date?
  var tokenPricingUpdatedBy: String?
}

struct ConversationMessage: Codable, Identifiable {
  @DocumentID var id: String?
  var conversationId: String?
  var authorId: String?
  var authorRole: String?
  var kind: String?
  var content: String?
  var tokenCost: Int?
  var metadata: [String: String]?
  var createdAt: Date?
}

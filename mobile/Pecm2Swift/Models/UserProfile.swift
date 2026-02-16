import Foundation
import FirebaseFirestoreSwift

enum UserRole: String, Codable, CaseIterable {
  case client
  case admin
}

struct UserProfile: Codable, Identifiable {
  @DocumentID var id: String?
  var mail: String?
  var pseudo: String?
  var role: String?
  var tokens: Int?
  var useLiveLocationPricing: Bool?
  var countryCode: String?
  var countryLabel: String?
  var countryUpdatedAt: Date?
  var providerIds: [String]?
  var createdAt: Date?
  var updatedAt: Date?
}

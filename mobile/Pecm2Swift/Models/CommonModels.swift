import Foundation
import FirebaseFirestoreSwift

struct GeoLocation: Codable {
  var lat: Double?
  var lng: Double?
  var accuracy: Double?
}

struct TokenPricing: Codable {
  var text: Int?
  var image: Int?
}

struct TokenPricingSettings: Codable, Identifiable {
  @DocumentID var id: String?
  var base: TokenPricing?
  var countries: [String: TokenPricing]?
  var updatedAt: Date?
  var updatedBy: String?
  var updatedMail: String?
}

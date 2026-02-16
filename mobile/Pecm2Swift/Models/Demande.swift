import Foundation
import FirebaseFirestoreSwift

struct Demande: Codable, Identifiable {
  @DocumentID var id: String?
  var clientId: String?
  var clientMail: String?
  var clientPseudo: String?
  var title: String?
  var description: String?
  var category: String?
  var budget: Double?
  var city: String?
  var availability: String?
  var location: GeoLocation?
  var locationUpdatedAt: Date?
  var prestataireId: String?
  var prestatairePseudo: String?
  var prestataireMail: String?
  var status: String?
  var createdAt: Date?
  var updatedAt: Date?
  var acceptedAt: Date?
  var cancelledAt: Date?
  var cancelReason: String?
}

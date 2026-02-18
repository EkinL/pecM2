import Foundation
import FirebaseFirestoreSwift

struct DemandeAiPayload: Codable {
  var objective: String?
  var tone: String?
  var constraints: String?
  var requestedChanges: String?
  var currentStatus: String?
  var requestedStatus: String?
  var incidentType: String?
  var incidentSeverity: String?
  var incidentContext: String?
  var mentality: String?
  var voice: String?
  var look: [String: String]?
}

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
  var matchedAt: Date?
  var aiId: String?
  var aiName: String?
  var requestType: String?
  var payload: DemandeAiPayload?
  var adminNote: String?
}

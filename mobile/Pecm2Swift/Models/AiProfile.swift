import Foundation
import FirebaseFirestoreSwift

struct AiLook: Codable {
  var gender: String?
  var skin: String?
  var hair: String?
  var hairColor: String?
  var eyeColor: String?
  var age: String?
  var height: String?
  var bodyType: String?
  var facialHair: String?
  var makeup: String?
  var glasses: String?
  var accessories: String?
  var piercings: String?
  var tattoos: String?
  var scars: String?
  var outfit: String?
  var ethnicity: String?
  var details: String?
}

struct AiProfile: Codable, Identifiable {
  @DocumentID var id: String?
  var ownerId: String?
  var ownerMail: String?
  var name: String?
  var mentality: String?
  var voice: String?
  var voiceRhythm: String?
  var look: AiLook?
  var visibility: String?
  var accessType: String?
  var imageUrl: String?
  var imagePrompt: String?
  var status: String?
  var statusNote: String?
  var ownerNotification: String?
  var safetyWarnings: [String]?
  var warningCount: Int?
  var hiddenFromCatalogue: Bool?
  var reviewedAt: Date?
  var reviewedBy: String?
  var reviewedMail: String?
  var sourceDemandeId: String?
  var sourceRequestType: String?
  var createdAt: Date?
  var updatedAt: Date?
}

import Foundation
import FirebaseFirestore

enum FirestoreCollections {
  static let utilisateurs = "utilisateurs"
  static let cours = "cours"
  static let conversations = "conversations"
  static let iaProfiles = "iaProfiles"
  static let demandes = "demandes"
  static let adminLogs = "adminLogs"
  static let aiEvaluations = "aiEvaluations"
  static let settings = "settings"

  static func conversationMessages(conversationId: String) -> String {
    "conversations/\(conversationId)/messages"
  }
}

import Foundation
import FirebaseFirestoreSwift

struct AdminLog: Codable, Identifiable {
  @DocumentID var id: String?
  var action: String?
  var targetType: String?
  var targetId: String?
  var adminId: String?
  var adminMail: String?
  var details: [String: String]?
  var createdAt: Date?
}

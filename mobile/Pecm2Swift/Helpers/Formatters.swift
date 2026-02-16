import Foundation

enum Formatters {
  static let shortDateTime: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "fr_FR")
    formatter.dateStyle = .short
    formatter.timeStyle = .short
    return formatter
  }()
}

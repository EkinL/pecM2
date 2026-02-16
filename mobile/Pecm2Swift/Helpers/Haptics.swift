import Foundation

#if canImport(UIKit)
import UIKit

enum Haptics {
  static func light() {
    UIImpactFeedbackGenerator(style: .light).impactOccurred()
  }

  static func success() {
    UINotificationFeedbackGenerator().notificationOccurred(.success)
  }

  static func warning() {
    UINotificationFeedbackGenerator().notificationOccurred(.warning)
  }

  static func error() {
    UINotificationFeedbackGenerator().notificationOccurred(.error)
  }
}
#else
enum Haptics {
  static func light() {}
  static func success() {}
  static func warning() {}
  static func error() {}
}
#endif


import Foundation
import SwiftUI
import UIKit

enum MobileLayout {
  static let maxWidth: CGFloat = 430
}

private struct MobileDesktopParityModifier: ViewModifier {
  let maxWidth: CGFloat

  func body(content: Content) -> some View {
    content
      .frame(maxWidth: shouldConstrain ? maxWidth : nil)
      .frame(maxWidth: .infinity, alignment: .center)
  }

  private var shouldConstrain: Bool {
    if ProcessInfo.processInfo.isiOSAppOnMac {
      return true
    }
    switch UIDevice.current.userInterfaceIdiom {
    case .pad, .mac:
      return true
    default:
      return false
    }
  }
}

extension View {
  func mobileDesktopParity(maxWidth: CGFloat = MobileLayout.maxWidth) -> some View {
    modifier(MobileDesktopParityModifier(maxWidth: maxWidth))
  }
}


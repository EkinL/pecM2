import SwiftUI

enum AppLayout {
  static let screenPadding: CGFloat = 16
  static let sectionSpacing: CGFloat = 16
  static let itemSpacing: CGFloat = 12
  static let controlHeight: CGFloat = 48
  static let minTapTarget: CGFloat = 44
  static let maxContentWidth: CGFloat = 520
}

enum AppTypography {
  static let brandTitle = Font.system(.largeTitle, design: .rounded).weight(.bold)
  static let title = Font.system(.title2, design: .rounded).weight(.bold)
  static let headline = Font.system(.headline, design: .rounded).weight(.semibold)
  static let body = Font.system(.body, design: .rounded)
  static let caption = Font.system(.caption, design: .rounded)
  static let footnote = Font.system(.footnote, design: .rounded)
}

enum AppMotion {
  static let standard = Animation.easeInOut(duration: 0.22)
  static let quick = Animation.easeInOut(duration: 0.16)
}

extension View {
  func appGlow(color: Color = AppColors.accent, radius: CGFloat = 16) -> some View {
    shadow(color: color.opacity(0.22), radius: radius, x: 0, y: 0)
      .shadow(color: color.opacity(0.10), radius: radius / 2, x: 0, y: 0)
  }
}


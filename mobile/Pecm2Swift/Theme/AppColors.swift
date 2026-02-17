import SwiftUI
import UIKit

enum AppColors {
  static let background = themedColor(light: "#F3F6FC", dark: "#0D0F14")
  static let backgroundSecondary = themedColor(light: "#FFFFFF", dark: "#151922")
  static let inputBackground = themedColor(light: "#DFE6F4", dark: "#1C2130")

  static let messageUser = themedColor(light: "#355CE0", dark: "#3A63F3")
  static let messageAI = themedColor(light: "#EAF0FB", dark: "#22293A")

  static let textPrimary = themedColor(light: "#16233B", dark: "#F1F4FF")
  static let textSecondary = themedColor(light: "#5E6D8B", dark: "#A0A7C0")
  static let onAccent = themedColor(light: "#F9FBFF", dark: "#F1F4FF")

  static let accent = themedColor(light: "#4E6EFF", dark: "#6C8CFF")
  static let error = themedColor(light: "#CC2C2C", dark: "#FF5A5A")

  static let uiBackground = themedUIColor(light: "#F3F6FC", dark: "#0D0F14")
  static let uiBackgroundSecondary = themedUIColor(light: "#FFFFFF", dark: "#151922")
  static let uiTextPrimary = themedUIColor(light: "#16233B", dark: "#F1F4FF")
  static let uiTextSecondary = themedUIColor(light: "#5E6D8B", dark: "#A0A7C0")
  static let uiAccent = themedUIColor(light: "#4E6EFF", dark: "#6C8CFF")
  static let uiError = themedUIColor(light: "#CC2C2C", dark: "#FF5A5A")

  private static func themedColor(light: String, dark: String) -> Color {
    Color(uiColor: themedUIColor(light: light, dark: dark))
  }

  private static func themedUIColor(light: String, dark: String) -> UIColor {
    UIColor { traits in
      let hex = traits.userInterfaceStyle == .dark ? dark : light
      return UIColor(hex: hex)
    }
  }
}

extension Color {
  init(hex: String, alpha: Double = 1.0) {
    let rgba = HexColorParser.parse(hex: hex, defaultAlpha: alpha)
    self.init(.sRGB, red: rgba.r, green: rgba.g, blue: rgba.b, opacity: rgba.a)
  }
}

extension UIColor {
  convenience init(hex: String, alpha: CGFloat = 1.0) {
    let rgba = HexColorParser.parse(hex: hex, defaultAlpha: Double(alpha))
    self.init(red: CGFloat(rgba.r), green: CGFloat(rgba.g), blue: CGFloat(rgba.b), alpha: CGFloat(rgba.a))
  }
}

private enum HexColorParser {
  static func parse(hex: String, defaultAlpha: Double) -> (r: Double, g: Double, b: Double, a: Double) {
    let cleaned = hex
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .replacingOccurrences(of: "#", with: "")
      .replacingOccurrences(of: "0x", with: "")
      .replacingOccurrences(of: "0X", with: "")

    guard cleaned.count == 6 || cleaned.count == 8 else {
      return (0, 0, 0, defaultAlpha)
    }

    var value: UInt64 = 0
    Scanner(string: cleaned).scanHexInt64(&value)

    let r, g, b, a: Double
    if cleaned.count == 8 {
      a = Double((value & 0xFF00_0000) >> 24) / 255.0
      r = Double((value & 0x00FF_0000) >> 16) / 255.0
      g = Double((value & 0x0000_FF00) >> 8) / 255.0
      b = Double(value & 0x0000_00FF) / 255.0
    } else {
      a = defaultAlpha
      r = Double((value & 0xFF00_00) >> 16) / 255.0
      g = Double((value & 0x00FF_00) >> 8) / 255.0
      b = Double(value & 0x0000_FF) / 255.0
    }

    return (r, g, b, a)
  }
}

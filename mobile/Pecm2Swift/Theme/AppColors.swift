import SwiftUI
import UIKit

enum AppColors {
  // Source of truth (Dark UI premium)
  static let background = Color(hex: "#0D0F14")
  static let backgroundSecondary = Color(hex: "#151922")
  static let inputBackground = Color(hex: "#1C2130")

  static let messageUser = Color(hex: "#3A63F3")
  static let messageAI = Color(hex: "#22293A")

  static let textPrimary = Color(hex: "#F1F4FF")
  static let textSecondary = Color(hex: "#A0A7C0")

  static let accent = Color(hex: "#6C8CFF")
  static let error = Color(hex: "#FF5A5A")

  // UIKit counterparts for appearance APIs
  static let uiBackground = UIColor(hex: "#0D0F14")
  static let uiBackgroundSecondary = UIColor(hex: "#151922")
  static let uiTextPrimary = UIColor(hex: "#F1F4FF")
  static let uiTextSecondary = UIColor(hex: "#A0A7C0")
  static let uiAccent = UIColor(hex: "#6C8CFF")
  static let uiError = UIColor(hex: "#FF5A5A")
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


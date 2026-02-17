import SwiftUI

enum AppThemePreference: String, CaseIterable, Identifiable {
  case dark
  case light

  var id: String { rawValue }

  var label: String {
    switch self {
    case .dark:
      return "Sombre"
    case .light:
      return "Clair"
    }
  }

  var colorScheme: ColorScheme {
    switch self {
    case .dark:
      return .dark
    case .light:
      return .light
    }
  }
}

@MainActor
final class AppAccessibilitySettings: ObservableObject {
  private static let fontScaleValues: [DynamicTypeSize] = [.small, .medium, .large, .xLarge, .xxLarge]
  private static let fontScaleLabels: [String] = ["Petit", "Moyen", "Standard", "Grand", "Tres grand"]

  static let minFontScaleIndex = 0
  static let defaultFontScaleIndex = 2
  static let maxFontScaleIndex = fontScaleValues.count - 1

  private enum Keys {
    static let themePreference = "app.themePreference"
    static let reduceMotion = "app.reduceMotion"
    static let fontScaleIndex = "app.fontScaleIndex"
  }

  @Published var themePreference: AppThemePreference {
    didSet {
      defaults.set(themePreference.rawValue, forKey: Keys.themePreference)
    }
  }

  @Published var reduceMotion: Bool {
    didSet {
      defaults.set(reduceMotion, forKey: Keys.reduceMotion)
    }
  }

  @Published var fontScaleIndex: Int {
    didSet {
      let clamped = Self.clampedFontScaleIndex(fontScaleIndex)
      if clamped != fontScaleIndex {
        fontScaleIndex = clamped
        return
      }
      defaults.set(clamped, forKey: Keys.fontScaleIndex)
    }
  }

  var preferredColorScheme: ColorScheme {
    themePreference.colorScheme
  }

  var dynamicTypeSize: DynamicTypeSize {
    Self.fontScaleValues[fontScaleIndex]
  }

  var fontScaleLabel: String {
    Self.fontScaleLabels[fontScaleIndex]
  }

  private let defaults: UserDefaults

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults

    let rawTheme = defaults.string(forKey: Keys.themePreference) ?? AppThemePreference.dark.rawValue
    self.themePreference = AppThemePreference(rawValue: rawTheme) ?? .dark

    if defaults.object(forKey: Keys.reduceMotion) == nil {
      self.reduceMotion = false
    } else {
      self.reduceMotion = defaults.bool(forKey: Keys.reduceMotion)
    }

    let storedScale = defaults.object(forKey: Keys.fontScaleIndex) as? Int ?? Self.defaultFontScaleIndex
    self.fontScaleIndex = Self.clampedFontScaleIndex(storedScale)
  }

  func setFontScale(from sliderValue: Double) {
    fontScaleIndex = Self.clampedFontScaleIndex(Int(sliderValue.rounded()))
  }

  private static func clampedFontScaleIndex(_ value: Int) -> Int {
    min(max(value, minFontScaleIndex), maxFontScaleIndex)
  }
}

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

private struct AppReduceMotionPreferenceKey: EnvironmentKey {
  static let defaultValue = false
}

extension EnvironmentValues {
  var appReduceMotion: Bool {
    get { self[AppReduceMotionPreferenceKey.self] }
    set { self[AppReduceMotionPreferenceKey.self] = newValue }
  }

  var appShouldReduceMotion: Bool {
    accessibilityReduceMotion || appReduceMotion
  }
}

extension View {
  func appGlow(color: Color = AppColors.accent, radius: CGFloat = 16) -> some View {
    shadow(color: color.opacity(0.22), radius: radius, x: 0, y: 0)
      .shadow(color: color.opacity(0.10), radius: radius / 2, x: 0, y: 0)
  }

  func appReduceMotionPreference(_ enabled: Bool) -> some View {
    environment(\.appReduceMotion, enabled)
  }
}

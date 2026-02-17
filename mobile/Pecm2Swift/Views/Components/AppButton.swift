import SwiftUI

private struct AppPressableButtonStyle: ButtonStyle {
  @Environment(\.appShouldReduceMotion) private var reduceMotion

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1)
      .opacity(configuration.isPressed ? 0.9 : 1)
      .animation(reduceMotion ? nil : AppMotion.quick, value: configuration.isPressed)
  }
}

struct PrimaryButton: View {
  let title: String
  var systemImage: String?
  var isLoading: Bool = false
  var isDisabled: Bool = false
  var action: () -> Void

  var body: some View {
    Button {
      action()
    } label: {
      HStack(spacing: 10) {
        if isLoading {
          ProgressView()
            .tint(AppColors.onAccent)
        } else if let systemImage {
          Image(systemName: systemImage)
            .font(.system(size: 16, weight: .semibold))
        }
        Text(title)
          .font(AppTypography.headline)
          .lineLimit(1)
      }
      .foregroundColor(AppColors.onAccent)
      .frame(maxWidth: .infinity, minHeight: AppLayout.controlHeight)
      .padding(.horizontal, 14)
      .background(
        LinearGradient(
          colors: [AppColors.accent, AppColors.accent.opacity(0.70)],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        )
      )
      .clipShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous)
          .stroke(AppColors.accent.opacity(0.30), lineWidth: 1)
      )
      .appGlow()
    }
    .buttonStyle(AppPressableButtonStyle())
    .disabled(isDisabled || isLoading)
    .opacity((isDisabled || isLoading) ? 0.60 : 1)
    .accessibilityHint(isLoading ? "Chargement" : "")
  }
}

struct SecondaryButton: View {
  let title: String
  var systemImage: String?
  var isLoading: Bool = false
  var isDisabled: Bool = false
  var action: () -> Void

  var body: some View {
    Button {
      action()
    } label: {
      HStack(spacing: 10) {
        if isLoading {
          ProgressView()
            .tint(AppColors.accent)
        } else if let systemImage {
          Image(systemName: systemImage)
            .font(.system(size: 16, weight: .semibold))
        }
        Text(title)
          .font(AppTypography.headline)
          .lineLimit(1)
      }
      .foregroundColor(AppColors.textPrimary)
      .frame(maxWidth: .infinity, minHeight: AppLayout.controlHeight)
      .padding(.horizontal, 14)
      .background(AppColors.backgroundSecondary)
      .clipShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous)
          .stroke(AppColors.inputBackground.opacity(AppTheme.strokeOpacity), lineWidth: 1)
      )
    }
    .buttonStyle(AppPressableButtonStyle())
    .disabled(isDisabled || isLoading)
    .opacity((isDisabled || isLoading) ? 0.60 : 1)
  }
}

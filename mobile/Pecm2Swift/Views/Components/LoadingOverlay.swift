import SwiftUI

private struct LoadingOverlayView: View {
  let title: String?

  var body: some View {
    ZStack {
      Color.black.opacity(0.35)
        .ignoresSafeArea()

      VStack(spacing: 12) {
        ProgressView()
          .tint(AppColors.accent)
        if let title {
          Text(title)
            .font(AppTypography.footnote)
            .foregroundColor(AppColors.textSecondary)
            .multilineTextAlignment(.center)
        }
      }
      .padding(16)
      .background(AppColors.backgroundSecondary)
      .overlay(
        RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous)
          .stroke(AppColors.inputBackground.opacity(AppTheme.strokeOpacity), lineWidth: 1)
      )
      .clipShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous))
      .shadow(color: .black.opacity(0.35), radius: 18, x: 0, y: 14)
      .padding(24)
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(title ?? "Chargement")
  }
}

extension View {
  func loadingOverlay(isPresented: Bool, title: String? = nil) -> some View {
    overlay {
      if isPresented {
        LoadingOverlayView(title: title)
          .transition(.opacity)
      }
    }
  }
}


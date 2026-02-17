import SwiftUI

struct ToastData: Equatable {
  enum Style: Equatable {
    case info
    case success
    case error
  }

  var style: Style
  var message: String
}

private struct ToastBanner: View {
  let toast: ToastData

  private var accentColor: Color {
    switch toast.style {
    case .info: return AppColors.accent
    case .success: return .green
    case .error: return AppColors.error
    }
  }

  private var systemImage: String {
    switch toast.style {
    case .info: return "info.circle.fill"
    case .success: return "checkmark.circle.fill"
    case .error: return "exclamationmark.triangle.fill"
    }
  }

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: systemImage)
        .foregroundColor(accentColor)
        .font(.system(size: 16, weight: .semibold))
      Text(toast.message)
        .font(AppTypography.footnote)
        .foregroundColor(AppColors.textPrimary)
        .fixedSize(horizontal: false, vertical: true)
      Spacer(minLength: 0)
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
    .background(AppColors.backgroundSecondary)
    .overlay(
      RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous)
        .stroke(AppColors.inputBackground.opacity(AppTheme.strokeOpacity), lineWidth: 1)
    )
    .clipShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous))
    .shadow(color: .black.opacity(0.35), radius: 18, x: 0, y: 14)
    .padding(.horizontal, 16)
    .padding(.bottom, 12)
    .accessibilityElement(children: .combine)
  }
}

private struct ToastModifier: ViewModifier {
  @Environment(\.appShouldReduceMotion) private var reduceMotion
  @Binding var toast: ToastData?

  @State private var dismissWorkItem: DispatchWorkItem?

  func body(content: Content) -> some View {
    content
      .overlay(alignment: .bottom) {
        if let toast {
          ToastBanner(toast: toast)
            .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
            .onAppear { scheduleDismiss() }
        }
      }
      .animation(reduceMotion ? nil : AppMotion.standard, value: toast)
  }

  private func scheduleDismiss() {
    dismissWorkItem?.cancel()
    let work = DispatchWorkItem {
      withAnimation(reduceMotion ? nil : AppMotion.standard) {
        toast = nil
      }
    }
    dismissWorkItem = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 2.5, execute: work)
  }
}

extension View {
  func toast(_ toast: Binding<ToastData?>) -> some View {
    modifier(ToastModifier(toast: toast))
  }
}

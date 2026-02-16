import SwiftUI

struct EmptyStateView: View {
  let title: String
  var message: String? = nil
  var systemImage: String = "tray"
  var actionTitle: String? = nil
  var actionSystemImage: String? = nil
  var action: (() -> Void)? = nil

  var body: some View {
    VStack(spacing: 12) {
      Image(systemName: systemImage)
        .font(.system(size: 34, weight: .semibold))
        .foregroundColor(AppColors.textSecondary)
        .padding(.bottom, 4)

      Text(title)
        .font(AppTypography.title)
        .foregroundColor(AppColors.textPrimary)
        .multilineTextAlignment(.center)

      if let message {
        Text(message)
          .font(AppTypography.body)
          .foregroundColor(AppColors.textSecondary)
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)
      }

      if let actionTitle, let action {
        PrimaryButton(title: actionTitle, systemImage: actionSystemImage, action: action)
          .frame(maxWidth: 360)
          .padding(.top, 8)
      }
    }
    .padding(24)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    .accessibilityElement(children: .combine)
  }
}


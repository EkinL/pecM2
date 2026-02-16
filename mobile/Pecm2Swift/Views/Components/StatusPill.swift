import SwiftUI

struct StatusPill: View {
  let text: String
  var tint: Color = AppColors.accent

  var body: some View {
    Text(text)
      .font(AppTypography.caption.weight(.semibold))
      .foregroundColor(tint)
      .padding(.horizontal, 10)
      .padding(.vertical, 6)
      .background(AppColors.inputBackground)
      .clipShape(Capsule())
  }
}


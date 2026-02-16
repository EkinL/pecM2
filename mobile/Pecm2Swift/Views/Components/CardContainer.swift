import SwiftUI

struct CardContainer<Content: View>: View {
  var padding: CGFloat = 12
  let content: Content

  init(padding: CGFloat = 12, @ViewBuilder content: () -> Content) {
    self.padding = padding
    self.content = content()
  }

  var body: some View {
    content
      .padding(padding)
      .background(AppColors.backgroundSecondary)
      .overlay(
        RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous)
          .stroke(AppColors.inputBackground.opacity(AppTheme.strokeOpacity), lineWidth: 1)
      )
      .clipShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous))
  }
}

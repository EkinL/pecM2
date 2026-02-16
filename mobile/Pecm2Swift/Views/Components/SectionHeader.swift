import SwiftUI

struct SectionHeader: View {
  let title: String
  var systemImage: String? = nil

  var body: some View {
    HStack(spacing: 8) {
      if let systemImage {
        Image(systemName: systemImage)
          .font(.system(size: 13, weight: .semibold))
          .foregroundColor(AppColors.textSecondary)
      }
      Text(title.uppercased())
        .font(AppTypography.footnote.weight(.semibold))
        .foregroundColor(AppColors.textSecondary)
      Spacer()
    }
    .padding(.horizontal, 2)
    .accessibilityAddTraits(.isHeader)
  }
}


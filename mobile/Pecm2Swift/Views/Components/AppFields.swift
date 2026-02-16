import SwiftUI
import UIKit

struct AppTextField: View {
  let label: String
  let placeholder: String
  @Binding var text: String

  var keyboardType: UIKeyboardType = .default
  var textContentType: UITextContentType? = nil
  var autocapitalization: TextInputAutocapitalization = .sentences
  var autocorrectionDisabled: Bool = false
  var submitLabel: SubmitLabel? = nil
  var axis: Axis = .horizontal
  var lineLimit: ClosedRange<Int> = 1...1

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(label)
        .font(AppTypography.caption)
        .foregroundColor(AppColors.textSecondary)

      TextField(
        placeholder,
        text: $text,
        axis: axis
      )
      .lineLimit(lineLimit)
      .textFieldStyle(.plain)
      .foregroundColor(AppColors.textPrimary)
      .keyboardType(keyboardType)
      .textInputAutocapitalization(autocapitalization)
      .autocorrectionDisabled(autocorrectionDisabled)
      .textContentType(textContentType)
      .appInputStyle()
      .ifLet(submitLabel) { view, submitLabel in
        view.submitLabel(submitLabel)
      }
    }
  }
}

struct AppSecureField: View {
  let label: String
  let placeholder: String
  @Binding var text: String

  var textContentType: UITextContentType? = .password
  var autocorrectionDisabled: Bool = true
  var submitLabel: SubmitLabel? = nil

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(label)
        .font(AppTypography.caption)
        .foregroundColor(AppColors.textSecondary)

      SecureField(placeholder, text: $text)
        .textFieldStyle(.plain)
        .foregroundColor(AppColors.textPrimary)
        .autocorrectionDisabled(autocorrectionDisabled)
        .textContentType(textContentType)
        .appInputStyle()
        .ifLet(submitLabel) { view, submitLabel in
          view.submitLabel(submitLabel)
        }
    }
  }
}

extension View {
  @ViewBuilder
  func ifLet<T, Content: View>(_ value: T?, transform: (Self, T) -> Content) -> some View {
    if let value {
      transform(self, value)
    } else {
      self
    }
  }
}

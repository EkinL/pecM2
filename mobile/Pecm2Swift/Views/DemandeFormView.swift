import SwiftUI

struct DemandeFormData {
  var title: String
  var description: String
  var category: String?
  var budget: Double?
}

struct DemandeFormView: View {
  @Environment(\.dismiss) private var dismiss
  @State private var title = ""
  @State private var description = ""
  @State private var category = ""
  @State private var budget = ""

  var onSubmit: (DemandeFormData) -> Void

  private var canSubmit: Bool {
    !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Essentiel", systemImage: "pencil.and.list.clipboard")
            CardContainer {
              VStack(spacing: 14) {
                AppTextField(
                  label: "Titre",
                  placeholder: "Ex: Besoin d’un coach IA",
                  text: $title,
                  keyboardType: .default,
                  textContentType: nil,
                  autocapitalization: .sentences,
                  autocorrectionDisabled: false,
                  submitLabel: .next
                )

                AppTextField(
                  label: "Description",
                  placeholder: "Décrivez votre besoin…",
                  text: $description,
                  keyboardType: .default,
                  textContentType: nil,
                  autocapitalization: .sentences,
                  autocorrectionDisabled: false,
                  submitLabel: .next,
                  axis: .vertical,
                  lineLimit: 2...8
                )
              }
            }
          }

          VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Détails (optionnel)", systemImage: "slider.horizontal.3")
            CardContainer {
              VStack(spacing: 14) {
                AppTextField(
                  label: "Catégorie",
                  placeholder: "Ex: Coaching, Relation, Santé…",
                  text: $category,
                  keyboardType: .default,
                  textContentType: nil,
                  autocapitalization: .words,
                  autocorrectionDisabled: false,
                  submitLabel: .next
                )

                AppTextField(
                  label: "Budget",
                  placeholder: "Ex: 50",
                  text: $budget,
                  keyboardType: .decimalPad,
                  textContentType: nil,
                  autocapitalization: .never,
                  autocorrectionDisabled: true,
                  submitLabel: .done,
                )
              }
            }
          }

          PrimaryButton(title: "Envoyer", systemImage: "paperplane.fill", isDisabled: !canSubmit) {
            let budgetValue = Double(budget)
            onSubmit(DemandeFormData(
              title: title,
              description: description,
              category: category.isEmpty ? nil : category,
              budget: budgetValue
            ))
            Haptics.success()
            dismiss()
          }
      }
        .padding(AppLayout.screenPadding)
        .mobileDesktopParity(maxWidth: AppLayout.maxContentWidth)
      }
      .scrollDismissesKeyboard(.interactively)
      .navigationTitle("Nouvelle demande")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button {
            dismiss()
          } label: {
            Image(systemName: "xmark")
          }
          .accessibilityLabel("Fermer")
        }
      }
    }
    .tint(AppColors.accent)
    .preferredColorScheme(.dark)
    .appScreenBackground()
  }
}

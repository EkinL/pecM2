import SwiftUI
import FirebaseAuth

struct ProfileSetupView: View {
  @EnvironmentObject private var session: SessionStore
  @State private var pseudo = ""
  @State private var role: UserRole = .client
  @State private var isLoading = false
  @State private var errorMessage: String?
  @State private var toast: ToastData?

  var body: some View {
    ScrollView {
      VStack(spacing: 18) {
        VStack(spacing: 8) {
          Text("Créer votre profil")
            .font(AppTypography.title)
            .foregroundColor(AppColors.textPrimary)

          Text("Choisissez un rôle et personnalisez votre pseudo. Vous pourrez le modifier plus tard.")
            .font(AppTypography.body)
            .foregroundColor(AppColors.textSecondary)
            .multilineTextAlignment(.center)
        }
        .padding(.top, 10)

        CardContainer {
          VStack(spacing: 14) {
            AppTextField(
              label: "Pseudo (optionnel)",
              placeholder: "Votre pseudo",
              text: $pseudo,
              keyboardType: .default,
              textContentType: .name,
              autocapitalization: .words,
              autocorrectionDisabled: false,
              submitLabel: .done
            )

            // VStack(alignment: .leading, spacing: 8) {
            //   Text("Rôle")
            //     .font(AppTypography.caption)
            //     .foregroundColor(AppColors.textSecondary)

            //   Picker("Rôle", selection: $role) {
            //     ForEach(UserRole.allCases, id: \.self) { value in
            //       Text(value.rawValue.capitalized).tag(value)
            //     }
            //   }
            //   .pickerStyle(.segmented)
            // }
          }
        }

        PrimaryButton(title: "Continuer", systemImage: "arrow.right.circle.fill", isLoading: isLoading, isDisabled: isLoading) {
          Task { await saveProfile() }
        }

        Spacer(minLength: 24)
      }
      .padding(AppLayout.screenPadding)
      .mobileDesktopParity(maxWidth: AppLayout.maxContentWidth)
    }
    .scrollDismissesKeyboard(.interactively)
    .foregroundColor(AppColors.textPrimary)
    .tint(AppColors.accent)
    .appScreenBackground()
    .toast($toast)
    .loadingOverlay(isPresented: isLoading, title: "Enregistrement…")
    .onChange(of: errorMessage) { newValue in
      guard let newValue, !newValue.isEmpty else { return }
      toast = ToastData(style: .error, message: newValue)
    }
  }

  private func saveProfile() async {
    guard let user = session.user else { return }
    isLoading = true
    errorMessage = nil
    do {
      _ = try await UserService.ensureProfile(user: user, role: role, pseudo: pseudo.isEmpty ? nil : pseudo)
      await session.refreshProfile()
    } catch {
      errorMessage = error.localizedDescription
    }
    isLoading = false
  }
}

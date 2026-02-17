import SwiftUI
import AuthenticationServices
import UIKit

struct AuthView: View {
  @State private var email = ""
  @State private var password = ""
  @State private var errorMessage: String?
  @State private var isLoading = false
  @State private var currentNonce: String?
  @State private var presentingController: UIViewController?
  @State private var toast: ToastData?

  private var canSubmit: Bool {
    !isLoading
      && !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      && !password.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 18) {
          VStack(spacing: 8) {
            Text("MyTalk")
              .font(AppTypography.brandTitle)
              .foregroundColor(AppColors.textPrimary)
              .appGlow()

            Text("Connexion")
              .font(AppTypography.title)
              .foregroundColor(AppColors.textPrimary)

            Text("Accédez à votre catalogue IA, vos conversations et vos demandes.")
              .font(AppTypography.body)
              .foregroundColor(AppColors.textSecondary)
              .multilineTextAlignment(.center)
          }
          .padding(.top, 10)

          CardContainer {
            VStack(spacing: 14) {
              AppTextField(
                label: "Email",
                placeholder: "email@exemple.com",
                text: $email,
                keyboardType: .emailAddress,
                textContentType: .username,
                autocapitalization: .never,
                autocorrectionDisabled: true,
                submitLabel: .next
              )

              AppSecureField(
                label: "Mot de passe",
                placeholder: "Mot de passe",
                text: $password,
                textContentType: .password,
                autocorrectionDisabled: true,
                submitLabel: .go
              )
              .onSubmit {
                guard canSubmit else { return }
                Task { await signIn() }
              }
            }
          }

          VStack(spacing: 12) {
            PrimaryButton(title: "Connexion", systemImage: "arrow.right.circle.fill", isLoading: isLoading, isDisabled: !canSubmit) {
              Task { await signIn() }
            }

            SecondaryButton(title: "Créer un compte", systemImage: "person.badge.plus", isDisabled: isLoading) {
              Task { await signUp() }
            }
          }

          HStack(spacing: 12) {
            Rectangle().fill(AppColors.inputBackground).frame(height: 1)
            Text("OU")
              .font(AppTypography.caption.weight(.semibold))
              .foregroundColor(AppColors.textSecondary)
            Rectangle().fill(AppColors.inputBackground).frame(height: 1)
          }
          .padding(.top, 4)

          VStack(spacing: 12) {
            SignInWithAppleButton(.signIn) { request in
              let nonce = AppleSignInHelper.randomNonceString()
              currentNonce = nonce
              request.requestedScopes = [.fullName, .email]
              request.nonce = AppleSignInHelper.sha256(nonce)
            } onCompletion: { result in
              handleAppleSignIn(result)
            }
            .signInWithAppleButtonStyle(.black)
            .frame(height: AppLayout.controlHeight)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous))
            .disabled(isLoading)

            SecondaryButton(title: "Connexion Google", systemImage: "globe", isLoading: false, isDisabled: isLoading) {
              Task { await signInWithGoogle() }
            }
          }

          Spacer(minLength: 24)
        }
        .padding(AppLayout.screenPadding)
        .mobileDesktopParity(maxWidth: AppLayout.maxContentWidth)
        .background(
          ViewControllerResolver { controller in
            presentingController = controller
          }
        )
      }
      .scrollDismissesKeyboard(.interactively)
      .foregroundColor(AppColors.textPrimary)
    }
    .appScreenBackground()
    .tint(AppColors.accent)
    .toast($toast)
    .loadingOverlay(isPresented: isLoading, title: "Connexion…")
    .onChange(of: errorMessage) { newValue in
      guard let newValue, !newValue.isEmpty else { return }
      toast = ToastData(style: .error, message: newValue)
    }
  }

  private func signIn() async {
    isLoading = true
    errorMessage = nil
    do {
      try await AuthService.signIn(email: email, password: password)
    } catch {
      errorMessage = error.localizedDescription
    }
    isLoading = false
  }

  private func signUp() async {
    isLoading = true
    errorMessage = nil
    do {
      try await AuthService.signUp(email: email, password: password)
    } catch {
      errorMessage = error.localizedDescription
    }
    isLoading = false
  }

  private func signInWithGoogle() async {
    guard let controller = presentingController else {
      errorMessage = "Impossible d'ouvrir Google Sign-In."
      return
    }
    isLoading = true
    errorMessage = nil
    do {
      try await AuthService.signInWithGoogle(presenting: controller)
    } catch {
      errorMessage = error.localizedDescription
    }
    isLoading = false
  }

  private func handleAppleSignIn(_ result: Result<ASAuthorization, Error>) {
    switch result {
    case .success(let authResults):
      guard let appleIDCredential = authResults.credential as? ASAuthorizationAppleIDCredential else {
        errorMessage = "Credential Apple invalide."
        return
      }
      guard let nonce = currentNonce else {
        errorMessage = "Nonce Apple manquant."
        return
      }
      guard let appleIDToken = appleIDCredential.identityToken else {
        errorMessage = "Token Apple manquant."
        return
      }
      guard let idTokenString = String(data: appleIDToken, encoding: .utf8) else {
        errorMessage = "Token Apple invalide."
        return
      }

      Task {
        isLoading = true
        errorMessage = nil
        do {
          try await AuthService.signInWithApple(idTokenString: idTokenString, nonce: nonce, fullName: appleIDCredential.fullName)
        } catch {
          errorMessage = error.localizedDescription
        }
        isLoading = false
      }
    case .failure(let error):
      errorMessage = error.localizedDescription
    }
  }
}

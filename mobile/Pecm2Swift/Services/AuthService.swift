import Foundation
import FirebaseAuth
import FirebaseCore
import GoogleSignIn

enum AuthServiceError: LocalizedError {
  case missingClientId
  case missingTokens

  var errorDescription: String? {
    switch self {
    case .missingClientId:
      return "Client ID Google manquant."
    case .missingTokens:
      return "Tokens Google manquants."
    }
  }
}

struct AuthService {
  static func signUp(email: String, password: String) async throws {
    _ = try await Auth.auth().createUser(withEmail: email, password: password)
  }

  static func signIn(email: String, password: String) async throws {
    _ = try await Auth.auth().signIn(withEmail: email, password: password)
  }

  static func signOut() throws {
    try Auth.auth().signOut()
  }

  @MainActor
  static func signInWithGoogle(presenting: UIViewController) async throws {
    guard let clientID = FirebaseApp.app()?.options.clientID else {
      throw AuthServiceError.missingClientId
    }

    let configuration = GIDConfiguration(clientID: clientID)
    GIDSignIn.sharedInstance.configuration = configuration

    let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenting)
    guard let idToken = result.user.idToken?.tokenString else {
      throw AuthServiceError.missingTokens
    }
    let accessToken = result.user.accessToken.tokenString
    let credential = GoogleAuthProvider.credential(withIDToken: idToken, accessToken: accessToken)
    _ = try await Auth.auth().signIn(with: credential)
  }

  static func signInWithApple(idTokenString: String, nonce: String, fullName: PersonNameComponents?) async throws {
    let credential = OAuthProvider.appleCredential(
      withIDToken: idTokenString,
      rawNonce: nonce,
      fullName: fullName
    )
    _ = try await Auth.auth().signIn(with: credential)
  }
}

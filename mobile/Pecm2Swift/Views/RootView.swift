import SwiftUI

struct RootView: View {
  @EnvironmentObject private var session: SessionStore

  var body: some View {
    Group {
      if session.isLoading {
        ProgressView("Chargement...")
      } else if session.user == nil {
        AuthView()
      } else if session.profile == nil {
        ProfileSetupView()
      } else {
        MainTabView()
      }
    }
  }
}

#Preview("RootView — loading") {
  let session = SessionStore(startListening: false)
  session.isLoading = true
  return RootView()
    .environmentObject(session)
}

#Preview("RootView — logged out") {
  let session = SessionStore(startListening: false)
  session.isLoading = false
  return RootView()
    .environmentObject(session)
}

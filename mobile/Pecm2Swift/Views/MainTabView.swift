import SwiftUI

struct MainTabView: View {
  @EnvironmentObject private var session: SessionStore

  var body: some View {
    let role = (session.profile?.role ?? "client").lowercased()
    TabView {
      if role == "admin" {
        AdminDashboardView()
          .tabItem {
            Label("Admin", systemImage: "speedometer")
          }

        DemandesAdminView()
          .tabItem {
            Label("Demandes", systemImage: "tray.full")
          }

        NavigationStack {
          ConversationsAdminView()
        }
          .tabItem {
            Label("Conversations", systemImage: "bubble.left.and.bubble.right")
          }

        TokenPricingAdminView()
          .tabItem {
            Label("Tokens", systemImage: "creditcard")
          }
      } else {
        AiProfilesView()
          .tabItem {
            Label("IA", systemImage: "sparkles")
          }

        DemandesClientView()
          .tabItem {
            Label("Demandes", systemImage: "tray.full")
          }

        HistoriqueView()
          .tabItem {
            Label("Conversation", systemImage: "clock")
          }
      }

      AccountView()
        .tabItem {
          Label("Compte", systemImage: "person")
        }
    }
    .appScreenBackground()
  }
}

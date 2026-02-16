import SwiftUI

struct AdminDashboardView: View {
  var body: some View {
    NavigationStack {
      List {
        NavigationLink("Utilisateurs", destination: AdminUsersView())
          .listRowBackground(AppColors.backgroundSecondary)
          .listRowSeparatorTint(AppColors.inputBackground)
        NavigationLink("Profils IA", destination: AdminAiProfilesView())
          .listRowBackground(AppColors.backgroundSecondary)
          .listRowSeparatorTint(AppColors.inputBackground)
        NavigationLink("Conversations", destination: ConversationsAdminView())
          .listRowBackground(AppColors.backgroundSecondary)
          .listRowSeparatorTint(AppColors.inputBackground)
        NavigationLink("Token pricing", destination: TokenPricingAdminView())
          .listRowBackground(AppColors.backgroundSecondary)
          .listRowSeparatorTint(AppColors.inputBackground)
      }
      .listStyle(.plain)
      .appListBackground()
      .navigationTitle("Admin")
    }
    .appScreenBackground()
    .tint(AppColors.accent)
  }
}

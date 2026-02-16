import SwiftUI

struct AdminUsersView: View {
  @StateObject private var viewModel = UsersViewModel()

  var body: some View {
    List(viewModel.users) { user in
      VStack(alignment: .leading) {
        Text(user.pseudo ?? user.mail ?? "Utilisateur")
          .fontWeight(.semibold)
          .foregroundColor(AppColors.textPrimary)
        Text(user.role ?? "client")
          .font(.footnote)
          .foregroundColor(AppColors.textSecondary)
      }
      .padding(.vertical, 6)
      .listRowBackground(AppColors.backgroundSecondary)
      .listRowSeparatorTint(AppColors.inputBackground)
    }
    .listStyle(.plain)
    .appListBackground()
    .navigationTitle("Utilisateurs")
    .onAppear {
      viewModel.listenAll()
    }
  }
}

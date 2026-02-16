import SwiftUI

struct AdminAiProfilesView: View {
  @EnvironmentObject private var session: SessionStore
  @StateObject private var viewModel = AiProfilesViewModel()

  private let statuses = ["pending", "active", "rejected", "suspended", "disabled"]

  var body: some View {
    List(viewModel.profiles) { profile in
      VStack(alignment: .leading, spacing: 8) {
        Text(profile.name ?? "IA")
          .fontWeight(.semibold)
          .foregroundColor(AppColors.textPrimary)
        Text("Statut: \(profile.status ?? "pending")")
          .font(.footnote)
          .foregroundColor(AppColors.textSecondary)

        Menu("Mettre à jour") {
          ForEach(statuses, id: \.self) { status in
            Button(status.capitalized) {
              Task {
                await updateStatus(profileId: profile.id, status: status)
              }
            }
          }
        }
      }
      .padding(.vertical, 4)
      .listRowBackground(AppColors.backgroundSecondary)
      .listRowSeparatorTint(AppColors.inputBackground)
    }
    .listStyle(.plain)
    .appListBackground()
    .navigationTitle("Profils IA")
    .onAppear {
      viewModel.listenAll()
    }
  }

  private func updateStatus(profileId: String?, status: String) async {
    guard let profileId else { return }
    do {
      try await AiProfileService.updateStatus(profileId: profileId, status: status, note: nil, adminId: session.user?.uid, adminMail: session.user?.email)
    } catch {
      // silently ignore for now
    }
  }
}

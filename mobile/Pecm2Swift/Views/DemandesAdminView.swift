import SwiftUI

struct DemandesAdminView: View {
  @EnvironmentObject private var session: SessionStore
  @StateObject private var viewModel = DemandesViewModel()
  @State private var toast: ToastData?
  @State private var demandeToCancel: Demande?

  var body: some View {
    NavigationStack {
      Group {
        if viewModel.isLoading {
          List(0..<6, id: \.self) { _ in
            DemandeAdminRowSkeleton()
              .listRowBackground(AppColors.backgroundSecondary)
              .listRowSeparatorTint(AppColors.inputBackground)
          }
          .listStyle(.plain)
          .appListBackground()
          .redacted(reason: .placeholder)
        } else if viewModel.demandes.isEmpty {
          EmptyStateView(
            title: "Aucune demande",
            message: "Les nouvelles demandes apparaîtront ici.",
            systemImage: "tray.full"
          )
        } else {
          List(viewModel.demandes.sorted { ($0.createdAt ?? .distantPast) > ($1.createdAt ?? .distantPast) }) { demande in
            DemandeAdminRow(
              demande: demande,
              onAccept: {
                Task {
                  if let id = demande.id, let adminId = session.user?.uid {
                    await viewModel.acceptDemande(demandeId: id, prestataireId: adminId)
                    Haptics.success()
                  }
                }
              },
              onCancel: {
                demandeToCancel = demande
              }
            )
            .listRowBackground(AppColors.backgroundSecondary)
            .listRowSeparatorTint(AppColors.inputBackground)
          }
          .listStyle(.plain)
          .appListBackground()
        }
      }
      .navigationTitle("Demandes")
      .onAppear {
        viewModel.listenAll()
      }
      .onChange(of: viewModel.errorMessage) { newValue in
        guard let newValue, !newValue.isEmpty else { return }
        toast = ToastData(style: .error, message: newValue)
      }
      .confirmationDialog("Annuler la demande ?", isPresented: Binding(get: { demandeToCancel != nil }, set: { if !$0 { demandeToCancel = nil } }), titleVisibility: .visible) {
        Button("Annuler la demande", role: .destructive) {
          guard let id = demandeToCancel?.id else { return }
          Task {
            await viewModel.cancelDemande(demandeId: id, reason: "Annulé par admin")
            Haptics.warning()
            demandeToCancel = nil
          }
        }
        Button("Retour", role: .cancel) { demandeToCancel = nil }
      } message: {
        Text("Cette action est irréversible.")
      }
      .mobileDesktopParity(maxWidth: AppLayout.maxContentWidth)
    }
    .appScreenBackground()
    .tint(AppColors.accent)
    .toast($toast)
  }
}

private struct DemandeAdminRow: View {
  let demande: Demande
  var onAccept: () -> Void
  var onCancel: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline) {
        Text(demande.title ?? "Demande")
          .font(AppTypography.headline)
          .foregroundColor(AppColors.textPrimary)
          .lineLimit(2)
        Spacer(minLength: 0)
        StatusPill(text: (demande.status ?? "pending").capitalized, tint: AppColors.textSecondary)
      }

      if let description = demande.description, !description.isEmpty {
        Text(description)
          .font(AppTypography.body)
          .foregroundColor(AppColors.textSecondary)
          .lineLimit(4)
      }

      HStack(spacing: 10) {
        PrimaryButton(title: "Accepter", systemImage: "checkmark.circle.fill", isDisabled: false, action: onAccept)
        Button(role: .destructive, action: onCancel) {
          Label("Annuler", systemImage: "xmark.circle.fill")
            .font(AppTypography.headline)
            .frame(maxWidth: .infinity, minHeight: AppLayout.controlHeight)
            .padding(.horizontal, 14)
            .background(AppColors.backgroundSecondary)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous))
            .overlay(
              RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous)
                .stroke(AppColors.error.opacity(0.35), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .foregroundColor(AppColors.error)
      }
    }
    .padding(.vertical, 10)
  }
}

private struct DemandeAdminRowSkeleton: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .fill(AppColors.inputBackground)
          .frame(width: 220, height: 14)
        Spacer()
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .fill(AppColors.inputBackground)
          .frame(width: 70, height: 20)
      }
      RoundedRectangle(cornerRadius: 6, style: .continuous)
        .fill(AppColors.inputBackground)
        .frame(height: 12)
      HStack(spacing: 10) {
        RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous)
          .fill(AppColors.inputBackground)
          .frame(height: AppLayout.controlHeight)
        RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous)
          .fill(AppColors.inputBackground)
          .frame(height: AppLayout.controlHeight)
      }
    }
    .padding(.vertical, 10)
  }
}

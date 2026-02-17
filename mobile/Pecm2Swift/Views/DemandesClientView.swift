import SwiftUI

struct DemandesClientView: View {
  @EnvironmentObject private var session: SessionStore
  @EnvironmentObject private var locationManager: LocationManager
  @StateObject private var viewModel = DemandesViewModel()
  @State private var showForm = false
  @State private var toast: ToastData?

  var body: some View {
    NavigationStack {
      Group {
        if viewModel.isLoading {
          List(0..<6, id: \.self) { _ in
            DemandeRowSkeleton()
              .listRowBackground(AppColors.backgroundSecondary)
              .listRowSeparatorTint(AppColors.inputBackground)
          }
          .listStyle(.plain)
          .appListBackground()
          .redacted(reason: .placeholder)
        } else if viewModel.demandes.isEmpty {
          EmptyStateView(
            title: "Aucune demande",
            message: "Créez une demande pour être mis en relation avec un prestataire.",
            systemImage: "tray.full",
            actionTitle: "Nouvelle demande",
            actionSystemImage: "plus",
            action: { showForm = true }
          )
        } else {
          List(viewModel.demandes.sorted { ($0.createdAt ?? .distantPast) > ($1.createdAt ?? .distantPast) }) { demande in
            DemandeRow(demande: demande)
              .listRowBackground(AppColors.backgroundSecondary)
              .listRowSeparatorTint(AppColors.inputBackground)
          }
          .listStyle(.plain)
          .appListBackground()
        }
      }
      .navigationTitle("Mes demandes")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .navigationBarTrailing) {
          Button {
            showForm = true
          } label: {
            Image(systemName: "plus")
          }
          .accessibilityLabel("Nouvelle demande")
        }
      }
      .sheet(isPresented: $showForm) {
        DemandeFormView { form in
          Task {
            let location = locationManager.location
            let geo = location.map { GeoLocation(lat: $0.coordinate.latitude, lng: $0.coordinate.longitude, accuracy: $0.horizontalAccuracy) }
            await viewModel.addDemande(
              clientId: session.user?.uid ?? "",
              clientMail: session.user?.email,
              clientPseudo: session.profile?.pseudo,
              title: form.title,
              description: form.description,
              category: form.category,
              budget: form.budget,
              city: form.city,
              availability: form.availability,
              location: geo
            )
          }
        }
        .onAppear {
          locationManager.requestLocation()
        }
      }
      .onAppear {
        if let userId = session.user?.uid {
          viewModel.listenForClient(clientId: userId)
          Task {
            await LogService.log(
              action: "screen_open",
              targetType: "system",
              targetId: "demandes_client",
              details: ["screen": "DemandesClientView"],
              throttleKey: "screen_open:demandes_client",
              throttleSeconds: 60
            )
          }
        }
      }
      .onChange(of: viewModel.errorMessage) { newValue in
        guard let newValue, !newValue.isEmpty else { return }
        toast = ToastData(style: .error, message: newValue)
      }
      .mobileDesktopParity(maxWidth: AppLayout.maxContentWidth)
    }
    .appScreenBackground()
    .tint(AppColors.accent)
    .toast($toast)
  }
}

private struct DemandeRow: View {
  let demande: Demande

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .firstTextBaseline) {
        Text(demande.title?.isEmpty == false ? (demande.title ?? "") : "Demande")
          .font(AppTypography.headline)
          .foregroundColor(AppColors.textPrimary)
          .lineLimit(2)
        Spacer(minLength: 0)
        StatusPill(text: (demande.status ?? "pending").capitalized, tint: AppColors.accent)
      }

      if let description = demande.description, !description.isEmpty {
        Text(description)
          .font(AppTypography.body)
          .foregroundColor(AppColors.textSecondary)
          .lineLimit(3)
      }

      if let city = demande.city, !city.isEmpty {
        Label(city, systemImage: "mappin.and.ellipse")
          .font(AppTypography.footnote)
          .foregroundColor(AppColors.textSecondary)
      }
    }
    .padding(.vertical, 10)
  }
}

private struct DemandeRowSkeleton: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .fill(AppColors.inputBackground)
          .frame(width: 200, height: 14)
        Spacer()
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .fill(AppColors.inputBackground)
          .frame(width: 74, height: 20)
      }
      RoundedRectangle(cornerRadius: 6, style: .continuous)
        .fill(AppColors.inputBackground)
        .frame(height: 12)
      RoundedRectangle(cornerRadius: 6, style: .continuous)
        .fill(AppColors.inputBackground)
        .frame(width: 240, height: 12)
    }
    .padding(.vertical, 10)
  }
}

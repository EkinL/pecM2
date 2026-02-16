import SwiftUI

struct AiProfilesView: View {
  @EnvironmentObject private var session: SessionStore
  @StateObject private var viewModel = AiProfilesViewModel()
  @State private var selection: String = "catalogue"
  @State private var navigateToCreate = false
  @State private var toast: ToastData?

  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        CardContainer(padding: 10) {
          Picker("Mode", selection: $selection) {
            Text("Catalogue").tag("catalogue")
            Text("Mes IA").tag("mine")
          }
          .pickerStyle(.segmented)
        }
        .padding(.horizontal, AppLayout.screenPadding)
        .padding(.top, 10)
        .padding(.bottom, 6)

        Group {
          if viewModel.isLoading {
            List(0..<6, id: \.self) { _ in
              AiProfileRowSkeleton()
                .listRowBackground(AppColors.backgroundSecondary)
                .listRowSeparatorTint(AppColors.inputBackground)
            }
            .listStyle(.plain)
            .appListBackground()
            .redacted(reason: .placeholder)
          } else if filteredProfiles.isEmpty {
            EmptyStateView(
              title: selection == "mine" ? "Aucune IA" : "Aucune IA disponible",
              message: selection == "mine"
                ? "Créez votre première IA et soumettez-la à validation."
                : "Revenez plus tard, le catalogue se met à jour automatiquement.",
              systemImage: "sparkles",
              actionTitle: selection == "mine" ? "Créer une IA" : nil,
              actionSystemImage: selection == "mine" ? "plus" : nil,
              action: selection == "mine" ? { navigateToCreate = true } : nil
            )
          } else {
            List(filteredProfiles) { profile in
              NavigationLink {
                AiProfileDetailView(profile: profile)
              } label: {
                AiProfileRow(profile: profile)
              }
              .listRowBackground(AppColors.backgroundSecondary)
              .listRowSeparatorTint(AppColors.inputBackground)
            }
            .listStyle(.plain)
            .appListBackground()
          }
        }
      }
      .navigationTitle("IA")
      .navigationBarTitleDisplayMode(.large)
      .toolbar {
        if selection == "mine" {
          ToolbarItem(placement: .navigationBarTrailing) {
            Button {
              navigateToCreate = true
            } label: {
              Image(systemName: "plus")
            }
            .accessibilityLabel("Créer une IA")
          }
        }
      }
      .background {
        NavigationLink(isActive: $navigateToCreate) {
          AiCreateView()
        } label: {
          EmptyView()
        }
        .hidden()
      }
      .onAppear {
        refresh()
      }
      .onChange(of: selection) { newValue in
        refresh()
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

  private var filteredProfiles: [AiProfile] {
    if selection == "mine" {
      return viewModel.profiles.sorted { ($0.createdAt ?? Date()) > ($1.createdAt ?? Date()) }
    }
    return viewModel.profiles.filter { profile in
      let status = profile.status?.lowercased() ?? "pending"
      let visibility = profile.visibility?.lowercased() ?? "public"
      return status == "active" && visibility != "private"
    }
  }

  private func refresh() {
    if selection == "mine", let ownerId = session.user?.uid {
      viewModel.listenOwner(ownerId: ownerId)
    } else {
      viewModel.listenAll()
    }
  }
}

private struct AiProfileRow: View {
  let profile: AiProfile

  var body: some View {
    HStack(spacing: 12) {
      avatar

      VStack(alignment: .leading, spacing: 4) {
        Text(profile.name ?? "IA")
          .font(AppTypography.headline)
          .foregroundColor(AppColors.textPrimary)
          .lineLimit(1)

        HStack(spacing: 8) {
          StatusPill(text: (profile.status ?? "pending").capitalized)
          if let visibility = profile.visibility, !visibility.isEmpty {
            StatusPill(text: visibility.capitalized, tint: AppColors.textSecondary)
          }
        }
      }

      Spacer(minLength: 0)
      Image(systemName: "chevron.right")
        .font(.system(size: 13, weight: .semibold))
        .foregroundColor(AppColors.textSecondary)
    }
    .padding(.vertical, 8)
  }

  @ViewBuilder
  private var avatar: some View {
    if let urlString = profile.imageUrl, let url = URL(string: urlString) {
      AsyncImage(url: url) { image in
        image.resizable().scaledToFill()
      } placeholder: {
        Circle()
          .fill(AppColors.inputBackground)
          .overlay(Image(systemName: "sparkles").foregroundColor(AppColors.textSecondary))
      }
      .frame(width: 52, height: 52)
      .clipShape(Circle())
      .overlay(Circle().stroke(AppColors.inputBackground.opacity(0.8), lineWidth: 1))
    } else {
      Circle()
        .fill(AppColors.inputBackground)
        .frame(width: 52, height: 52)
        .overlay(
          Image(systemName: "sparkles")
            .font(.system(size: 18, weight: .semibold))
            .foregroundColor(AppColors.textSecondary)
        )
        .overlay(Circle().stroke(AppColors.inputBackground.opacity(0.8), lineWidth: 1))
    }
  }
}

private struct AiProfileRowSkeleton: View {
  var body: some View {
    HStack(spacing: 12) {
      Circle()
        .fill(AppColors.inputBackground)
        .frame(width: 52, height: 52)
      VStack(alignment: .leading, spacing: 8) {
        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .fill(AppColors.inputBackground)
          .frame(width: 160, height: 14)
        HStack(spacing: 8) {
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .fill(AppColors.inputBackground)
            .frame(width: 70, height: 20)
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .fill(AppColors.inputBackground)
            .frame(width: 60, height: 20)
        }
      }
      Spacer()
    }
    .padding(.vertical, 8)
  }
}

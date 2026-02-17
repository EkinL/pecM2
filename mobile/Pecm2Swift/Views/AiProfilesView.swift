import SwiftUI

struct AiProfilesView: View {
  @EnvironmentObject private var session: SessionStore
  @StateObject private var viewModel = AiProfilesViewModel()
  @State private var selection: String = "catalogue"
  @State private var searchQuery: String = ""
  @State private var navigateToCreate = false
  @State private var toast: ToastData?

  var body: some View {
    NavigationStack {
      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: 16) {
          heroCard
          modeToggle
          searchBar
          content
        }
        .padding(.horizontal, AppLayout.screenPadding)
        .padding(.top, 12)
        .padding(.bottom, 24)
        .mobileDesktopParity(maxWidth: AppLayout.maxContentWidth)
      }
      .navigationTitle("")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        if selection == "mine" {
          ToolbarItem(placement: .navigationBarTrailing) {
            Button {
              navigateToCreate = true
            } label: {
              Image(systemName: "plus")
            }
            .accessibilityLabel("Creer une IA")
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
      .onChange(of: selection) { _ in
        searchQuery = ""
        refresh()
      }
      .onChange(of: viewModel.errorMessage) { newValue in
        guard let newValue, !newValue.isEmpty else { return }
        toast = ToastData(style: .error, message: newValue)
      }
    }
    .appScreenBackground()
    .tint(AppColors.accent)
    .toast($toast)
  }

  @ViewBuilder
  private var content: some View {
    if viewModel.isLoading {
      LazyVStack(spacing: 12) {
        ForEach(0..<6, id: \.self) { _ in
          AiProfileCardSkeleton()
        }
      }
      .redacted(reason: .placeholder)
    } else if filteredProfiles.isEmpty {
      emptyState
    } else {
      LazyVStack(spacing: 12) {
        ForEach(filteredProfiles) { profile in
          NavigationLink {
            AiProfileDetailView(profile: profile)
          } label: {
            AiProfileCard(profile: profile, isMineMode: selection == "mine")
          }
          .buttonStyle(.plain)
        }
      }
    }
  }

  private var heroCard: some View {
    ZStack(alignment: .topLeading) {
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .fill(
          LinearGradient(
            colors: [AppColors.backgroundSecondary, AppColors.inputBackground.opacity(0.80)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          )
        )

      Circle()
        .fill(AppColors.accent.opacity(0.18))
        .frame(width: 180, height: 180)
        .offset(x: 140, y: -90)
        .blur(radius: 6)

      VStack(alignment: .leading, spacing: 12) {
        HStack(alignment: .top) {
          VStack(alignment: .leading, spacing: 4) {
            Label(selection == "mine" ? "Mes IA" : "Catalogue IA", systemImage: selection == "mine" ? "person.crop.circle" : "sparkles")
              .font(AppTypography.caption.weight(.semibold))
              .foregroundColor(AppColors.textSecondary)

            Text(selection == "mine" ? "Pilotez vos assistants" : "Trouvez la bonne IA en quelques secondes")
              .font(AppTypography.title)
              .foregroundColor(AppColors.textPrimary)
              .fixedSize(horizontal: false, vertical: true)
          }

          Spacer(minLength: 8)

          if selection == "mine" {
            Button {
              navigateToCreate = true
            } label: {
              Image(systemName: "plus")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(AppColors.textPrimary)
                .frame(width: 32, height: 32)
                .background(AppColors.accent.opacity(0.25))
                .clipShape(Circle())
            }
            .accessibilityLabel("Creer une IA")
          }
        }

        Text(selection == "mine"
             ? "Retrouvez rapidement vos profils, leur statut et leur visibilite."
             : "Explorez des profils actifs et commencez une conversation sans friction.")
          .font(AppTypography.body)
          .foregroundColor(AppColors.textSecondary)
          .fixedSize(horizontal: false, vertical: true)

        HStack(spacing: 8) {
          statChip(title: "Visibles", value: "\(filteredProfiles.count)")
          statChip(title: "En attente", value: "\(pendingProfilesCount)")
          Spacer(minLength: 0)
        }
      }
      .padding(16)
    }
    .overlay(
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .stroke(AppColors.inputBackground.opacity(0.70), lineWidth: 1)
    )
    .shadow(color: .black.opacity(0.22), radius: 14, x: 0, y: 10)
  }

  private var modeToggle: some View {
    HStack(spacing: 8) {
      modeButton(title: "Catalogue", systemImage: "sparkles", value: "catalogue")
      modeButton(title: "Mes IA", systemImage: "person.crop.circle", value: "mine")
    }
    .padding(6)
    .background(AppColors.backgroundSecondary)
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(AppColors.inputBackground.opacity(AppTheme.strokeOpacity), lineWidth: 1)
    )
  }

  private var searchBar: some View {
    HStack(spacing: 10) {
      Image(systemName: "magnifyingglass")
        .font(.system(size: 14, weight: .semibold))
        .foregroundColor(AppColors.textSecondary)

      TextField("Rechercher une IA, une voix, une mentalite", text: $searchQuery)
        .textFieldStyle(.plain)
        .foregroundColor(AppColors.textPrimary)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled(true)
        .submitLabel(.search)

      if !searchQuery.isEmpty {
        Button {
          searchQuery = ""
        } label: {
          Image(systemName: "xmark.circle.fill")
            .foregroundColor(AppColors.textSecondary)
        }
        .buttonStyle(.plain)
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(AppColors.backgroundSecondary)
    .clipShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous)
        .stroke(AppColors.inputBackground.opacity(AppTheme.strokeOpacity), lineWidth: 1)
    )
  }

  @ViewBuilder
  private var emptyState: some View {
    CardContainer {
      VStack(spacing: 12) {
        Image(systemName: searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "sparkles" : "magnifyingglass")
          .font(.system(size: 32, weight: .semibold))
          .foregroundColor(AppColors.textSecondary)

        Text(emptyTitle)
          .font(AppTypography.title)
          .foregroundColor(AppColors.textPrimary)
          .multilineTextAlignment(.center)

        Text(emptyMessage)
          .font(AppTypography.body)
          .foregroundColor(AppColors.textSecondary)
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)

        if selection == "mine" && searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          PrimaryButton(title: "Creer une IA", systemImage: "plus") {
            navigateToCreate = true
          }
          .padding(.top, 4)
        }
      }
      .padding(.vertical, 12)
    }
  }

  private var emptyTitle: String {
    if !searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return "Aucun resultat"
    }
    return selection == "mine" ? "Aucune IA" : "Aucune IA disponible"
  }

  private var emptyMessage: String {
    if !searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return "Ajustez votre recherche ou essayez un autre mot-cle."
    }
    return selection == "mine"
      ? "Creez votre premiere IA et soumettez-la a validation."
      : "Le catalogue se met a jour automatiquement. Revenez dans quelques instants."
  }

  private var pendingProfilesCount: Int {
    baseProfiles.filter { ($0.status ?? "pending").lowercased() == "pending" }.count
  }

  private var baseProfiles: [AiProfile] {
    if selection == "mine" {
      return viewModel.profiles.sorted { ($0.createdAt ?? .distantPast) > ($1.createdAt ?? .distantPast) }
    }

    return viewModel.profiles
      .filter { profile in
        let status = profile.status?.lowercased() ?? "pending"
        let visibility = profile.visibility?.lowercased() ?? "public"
        return status == "active" && visibility != "private"
      }
      .sorted { ($0.updatedAt ?? $0.createdAt ?? .distantPast) > ($1.updatedAt ?? $1.createdAt ?? .distantPast) }
  }

  private var filteredProfiles: [AiProfile] {
    let query = normalized(searchQuery)
    guard !query.isEmpty else { return baseProfiles }

    return baseProfiles.filter { profile in
      let fields = [
        profile.name,
        profile.mentality,
        profile.voice,
        profile.voiceRhythm,
        profile.visibility,
        profile.status
      ]

      return fields
        .compactMap { $0 }
        .map(normalized)
        .contains { $0.contains(query) }
    }
  }

  private func normalized(_ value: String) -> String {
    value
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
  }

  private func modeButton(title: String, systemImage: String, value: String) -> some View {
    Button {
      withAnimation(AppMotion.standard) {
        selection = value
      }
    } label: {
      HStack(spacing: 6) {
        Image(systemName: systemImage)
          .font(.system(size: 13, weight: .semibold))
        Text(title)
          .font(AppTypography.footnote.weight(.semibold))
          .lineLimit(1)
      }
      .foregroundColor(selection == value ? AppColors.textPrimary : AppColors.textSecondary)
      .frame(maxWidth: .infinity, minHeight: 34)
      .padding(.horizontal, 8)
      .background(
        Group {
          if selection == value {
            LinearGradient(
              colors: [AppColors.accent.opacity(0.90), AppColors.accent.opacity(0.62)],
              startPoint: .topLeading,
              endPoint: .bottomTrailing
            )
          } else {
            Color.clear
          }
        }
      )
      .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
    .buttonStyle(.plain)
  }

  private func statChip(title: String, value: String) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(value)
        .font(AppTypography.headline)
        .foregroundColor(AppColors.textPrimary)
      Text(title)
        .font(AppTypography.caption)
        .foregroundColor(AppColors.textSecondary)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .background(AppColors.background.opacity(0.30))
    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .stroke(AppColors.inputBackground.opacity(0.65), lineWidth: 1)
    )
  }

  private func refresh() {
    if selection == "mine", let ownerId = session.user?.uid {
      viewModel.listenOwner(ownerId: ownerId)
    } else {
      viewModel.listenAll()
    }
  }
}

private struct AiProfileCard: View {
  let profile: AiProfile
  let isMineMode: Bool

  var body: some View {
    HStack(spacing: 12) {
      thumbnail

      VStack(alignment: .leading, spacing: 8) {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(profile.name ?? "IA")
            .font(AppTypography.headline)
            .foregroundColor(AppColors.textPrimary)
            .lineLimit(1)

          Spacer(minLength: 0)

          if isMineMode {
            Image(systemName: "person.crop.circle.badge.checkmark")
              .font(.system(size: 13, weight: .semibold))
              .foregroundColor(AppColors.textSecondary)
          }
        }

        if let subtitle = subtitle, !subtitle.isEmpty {
          Text(subtitle)
            .font(AppTypography.body)
            .foregroundColor(AppColors.textSecondary)
            .lineLimit(2)
        }

        HStack(spacing: 8) {
          StatusPill(text: (profile.status ?? "pending").capitalized, tint: statusTint)

          if let visibility = profile.visibility, !visibility.isEmpty {
            StatusPill(text: visibility.capitalized, tint: AppColors.textSecondary)
          }
        }

        if let date = profile.updatedAt ?? profile.createdAt {
          HStack(spacing: 6) {
            Image(systemName: "clock.arrow.circlepath")
              .font(.system(size: 11, weight: .semibold))
            Text(date, style: .relative)
          }
          .font(AppTypography.footnote)
          .foregroundColor(AppColors.textSecondary)
        }
      }

      Image(systemName: "chevron.right")
        .font(.system(size: 13, weight: .semibold))
        .foregroundColor(AppColors.textSecondary)
    }
    .padding(12)
    .background(AppColors.backgroundSecondary)
    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .stroke(AppColors.inputBackground.opacity(AppTheme.strokeOpacity), lineWidth: 1)
    )
    .shadow(color: .black.opacity(0.20), radius: 10, x: 0, y: 7)
  }

  private var subtitle: String? {
    if let mentality = profile.mentality, !mentality.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return mentality
    }

    let voice = profile.voice?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let rhythm = profile.voiceRhythm?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

    if !voice.isEmpty && !rhythm.isEmpty {
      return "Voix \(voice) - Rythme \(rhythm)"
    }

    if !voice.isEmpty {
      return "Voix \(voice)"
    }

    return nil
  }

  private var statusTint: Color {
    switch (profile.status ?? "pending").lowercased() {
    case "active":
      return .green
    case "rejected":
      return AppColors.error
    default:
      return .orange
    }
  }

  @ViewBuilder
  private var thumbnail: some View {
    if let urlString = AppConfig.shared.resolvedRemoteURLString(profile.imageUrl),
       let url = URL(string: urlString) {
      AsyncImage(url: url) { phase in
        switch phase {
        case .success(let image):
          image
            .resizable()
            .scaledToFill()
        default:
          thumbnailPlaceholder
        }
      }
      .frame(width: 72, height: 72)
      .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .stroke(AppColors.inputBackground.opacity(0.8), lineWidth: 1)
      )
    } else {
      thumbnailPlaceholder
        .frame(width: 72, height: 72)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
          RoundedRectangle(cornerRadius: 16, style: .continuous)
            .stroke(AppColors.inputBackground.opacity(0.8), lineWidth: 1)
        )
    }
  }

  private var thumbnailPlaceholder: some View {
    LinearGradient(
      colors: [AppColors.inputBackground, AppColors.backgroundSecondary],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )
    .overlay(
      Image(systemName: "sparkles")
        .font(.system(size: 18, weight: .semibold))
        .foregroundColor(AppColors.textSecondary)
    )
  }
}

private struct AiProfileCardSkeleton: View {
  var body: some View {
    HStack(spacing: 12) {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .fill(AppColors.inputBackground)
        .frame(width: 72, height: 72)

      VStack(alignment: .leading, spacing: 8) {
        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .fill(AppColors.inputBackground)
          .frame(width: 170, height: 14)

        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .fill(AppColors.inputBackground)
          .frame(height: 12)

        HStack(spacing: 8) {
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .fill(AppColors.inputBackground)
            .frame(width: 76, height: 20)
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .fill(AppColors.inputBackground)
            .frame(width: 64, height: 20)
        }
      }

      Spacer(minLength: 0)
    }
    .padding(12)
    .background(AppColors.backgroundSecondary)
    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .stroke(AppColors.inputBackground.opacity(AppTheme.strokeOpacity), lineWidth: 1)
    )
  }
}

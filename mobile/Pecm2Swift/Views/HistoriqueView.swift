import SwiftUI

struct HistoriqueView: View {
  @EnvironmentObject private var session: SessionStore
  @StateObject private var viewModel = ConversationsViewModel()
  @State private var aiProfilesById: [String: AiProfile] = [:]
  @State private var aiProfilesLoading: Set<String> = []
  @State private var aiProfilesUnavailable: Set<String> = []
  @State private var toast: ToastData?
  @State private var searchQuery = ""
  @State private var isSelectionMode = false
  @State private var selectedConversationIds: Set<String> = []
  @State private var showDeleteConfirmation = false
  @State private var isDeletingSelection = false
  @State private var route: ConversationRoute?

  private var conversationsWithMessages: [Conversation] {
    viewModel.conversations
      .filter { ($0.messageCount ?? 0) > 0 }
      .sorted { ($0.updatedAt ?? .distantPast) > ($1.updatedAt ?? .distantPast) }
  }

  private var conversationIds: [String] {
    conversationsWithMessages.compactMap { $0.id }
  }

  private var filteredConversations: [Conversation] {
    let query = normalized(searchQuery)
    guard !query.isEmpty else { return conversationsWithMessages }

    return conversationsWithMessages.filter { conversation in
      let aiName = conversation.aiId.flatMap { aiProfilesById[$0]?.name } ?? ""
      let fields = [
        aiName,
        conversation.status ?? "",
        conversation.countryLabel ?? "",
        conversation.countryCode ?? ""
      ]
      return fields
        .map(normalized)
        .contains { $0.contains(query) }
    }
  }

  var body: some View {
    NavigationStack {
      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: 16) {
          heroCard
          if isSelectionMode {
            selectionSummaryCard
          }
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
        ToolbarItem(placement: .navigationBarTrailing) {
          if isSelectionMode {
            Button("Annuler") {
              cancelSelectionMode()
            }
          } else if !filteredConversations.isEmpty {
            Button("Sélection") {
              withAnimation(AppMotion.standard) {
                isSelectionMode = true
              }
            }
          }
        }
      }
      .navigationDestination(
        isPresented: Binding(
          get: { route != nil },
          set: { isPresented in
            if !isPresented {
              route = nil
            }
          }
        )
      ) {
        if let route {
          ConversationView(conversation: route.conversation, userId: route.userId, aiId: route.aiId)
        } else {
          EmptyView()
        }
      }
      .onAppear {
        if let userId = session.user?.uid {
          viewModel.listenForUser(userId: userId)
        }
      }
      .onChange(of: viewModel.errorMessage) { newValue in
        guard let newValue, !newValue.isEmpty else { return }
        toast = ToastData(style: .error, message: newValue)
      }
      .onChange(of: conversationIds) { _ in
        syncSelectionWithCurrentItems()
      }
    }
    .safeAreaInset(edge: .bottom) {
      if isSelectionMode {
        selectionActionBar
      }
    }
    .confirmationDialog(deleteDialogTitle, isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
      Button(deleteDialogConfirmTitle, role: .destructive) {
        Task { await deleteSelectedConversations() }
      }
      Button("Annuler", role: .cancel) { }
    } message: {
      Text(deleteDialogMessage)
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
          ConversationHistoryCardSkeleton()
        }
      }
      .redacted(reason: .placeholder)
    } else if filteredConversations.isEmpty {
      CardContainer(padding: 16) {
        VStack(spacing: 12) {
          Image(systemName: searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "bubble.left.and.bubble.right" : "magnifyingglass")
            .font(.system(size: 32, weight: .semibold))
            .foregroundColor(AppColors.textSecondary)

          Text(searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Aucune conversation" : "Aucun résultat")
            .font(AppTypography.title)
            .foregroundColor(AppColors.textPrimary)
            .multilineTextAlignment(.center)

          Text(searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
               ? "Démarrez une conversation depuis une IA pour la retrouver ici."
               : "Essayez un autre mot-clé ou videz la recherche.")
            .font(AppTypography.body)
            .foregroundColor(AppColors.textSecondary)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 10)
      }
    } else {
      LazyVStack(spacing: 12) {
        ForEach(filteredConversations) { conversation in
          let aiProfile = conversation.aiId.flatMap { aiProfilesById[$0] }
          ConversationHistoryCard(
            aiProfile: aiProfile,
            conversation: conversation,
            isSelectionMode: isSelectionMode,
            isSelected: isConversationSelected(conversation)
          )
          .contentShape(Rectangle())
          .onTapGesture {
            handleConversationTap(conversation)
          }
          .onLongPressGesture(minimumDuration: 0.35) {
            beginSelection(with: conversation)
          }
          .task(id: conversation.aiId) {
            guard let aiId = conversation.aiId else { return }
            await loadAiProfileIfNeeded(aiId: aiId)
          }
        }
      }
    }
  }

  private var heroCard: some View {
    ZStack(alignment: .topLeading) {
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .fill(
          LinearGradient(
            colors: [AppColors.backgroundSecondary, AppColors.inputBackground.opacity(0.82)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          )
        )

      Circle()
        .fill(AppColors.accent.opacity(0.18))
        .frame(width: 180, height: 180)
        .offset(x: 160, y: -90)
        .blur(radius: 6)

      VStack(alignment: .leading, spacing: 12) {
        Label("Conversations", systemImage: "bubble.left.and.bubble.right.fill")
          .font(AppTypography.caption.weight(.semibold))
          .foregroundColor(AppColors.textSecondary)

        Text(isSelectionMode ? "Sélectionnez et gérez vos conversations" : "Retrouvez vos discussions rapidement")
          .font(AppTypography.title)
          .foregroundColor(AppColors.textPrimary)
          .fixedSize(horizontal: false, vertical: true)

        Text(isSelectionMode
             ? "Appuyez sur une conversation pour la sélectionner, puis supprimez-la en bas de l'écran."
             : "Appui long sur une conversation pour activer la sélection et supprimer plusieurs éléments.")
          .font(AppTypography.body)
          .foregroundColor(AppColors.textSecondary)
          .fixedSize(horizontal: false, vertical: true)

        HStack(spacing: 8) {
          heroChip(title: "Total", value: "\(conversationsWithMessages.count)")
          heroChip(title: "Visibles", value: "\(filteredConversations.count)")
          if isSelectionMode {
            heroChip(title: "Sélection", value: "\(selectedConversationIds.count)")
          }
          Spacer(minLength: 0)
        }
      }
      .padding(16)
    }
    .overlay(
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .stroke(AppColors.inputBackground.opacity(0.7), lineWidth: 1)
    )
    .shadow(color: .black.opacity(0.22), radius: 14, x: 0, y: 10)
  }

  private var selectionSummaryCard: some View {
    HStack(spacing: 10) {
      Image(systemName: "checkmark.circle.fill")
        .font(.system(size: 18, weight: .semibold))
        .foregroundColor(AppColors.accent)

      Text(selectedConversationIds.isEmpty
           ? "Touchez une conversation pour la sélectionner."
           : "\(selectedConversationIds.count) conversation(s) sélectionnée(s).")
        .font(AppTypography.body)
        .foregroundColor(AppColors.textPrimary)

      Spacer(minLength: 0)
    }
    .padding(12)
    .background(AppColors.backgroundSecondary)
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .stroke(AppColors.inputBackground.opacity(AppTheme.strokeOpacity), lineWidth: 1)
    )
  }

  private var searchBar: some View {
    HStack(spacing: 10) {
      Image(systemName: "magnifyingglass")
        .font(.system(size: 14, weight: .semibold))
        .foregroundColor(AppColors.textSecondary)

      TextField("Rechercher une conversation", text: $searchQuery)
        .textFieldStyle(.plain)
        .foregroundColor(AppColors.textPrimary)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled(true)

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

  private var selectionActionBar: some View {
    VStack(spacing: 10) {
      HStack {
        Text("\(selectedConversationIds.count) sélectionnée(s)")
          .font(AppTypography.caption.weight(.semibold))
          .foregroundColor(AppColors.textSecondary)

        Spacer(minLength: 0)

        if selectedConversationIds.count < filteredConversations.compactMap({ $0.id }).count {
          Button("Tout sélectionner") {
            selectAllVisibleConversations()
          }
          .font(AppTypography.caption.weight(.semibold))
          .foregroundColor(AppColors.accent)
        }
      }

      HStack(spacing: 10) {
        Button {
          cancelSelectionMode()
        } label: {
          HStack(spacing: 6) {
            Image(systemName: "xmark")
            Text("Annuler")
          }
          .font(AppTypography.caption.weight(.semibold))
          .foregroundColor(AppColors.textPrimary)
          .frame(maxWidth: .infinity, minHeight: 40)
          .background(AppColors.inputBackground)
          .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)

        Button {
          showDeleteConfirmation = true
        } label: {
          HStack(spacing: 6) {
            if isDeletingSelection {
              ProgressView()
                .tint(AppColors.textPrimary)
            } else {
              Image(systemName: "trash.fill")
            }
            Text(isDeletingSelection ? "Suppression..." : "Supprimer")
          }
          .font(AppTypography.caption.weight(.semibold))
          .foregroundColor(AppColors.textPrimary)
          .frame(maxWidth: .infinity, minHeight: 40)
          .background(AppColors.error)
          .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(selectedConversationIds.isEmpty || isDeletingSelection)
        .opacity((selectedConversationIds.isEmpty || isDeletingSelection) ? 0.6 : 1)
      }
    }
    .padding(12)
    .background(AppColors.backgroundSecondary)
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .stroke(AppColors.inputBackground.opacity(AppTheme.strokeOpacity), lineWidth: 1)
    )
    .padding(.horizontal, AppLayout.screenPadding)
    .padding(.top, 8)
    .padding(.bottom, 10)
    .mobileDesktopParity(maxWidth: AppLayout.maxContentWidth)
    .background(AppColors.background.opacity(0.96).ignoresSafeArea(edges: .bottom))
  }

  private var deleteDialogTitle: String {
    selectedConversationIds.count > 1 ? "Supprimer ces conversations ?" : "Supprimer cette conversation ?"
  }

  private var deleteDialogConfirmTitle: String {
    selectedConversationIds.count > 1 ? "Supprimer les conversations" : "Supprimer la conversation"
  }

  private var deleteDialogMessage: String {
    "Cette action est définitive et supprimera aussi les messages associés."
  }

  private func heroChip(title: String, value: String) -> some View {
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

  private func handleConversationTap(_ conversation: Conversation) {
    if isSelectionMode {
      toggleConversationSelection(conversation)
      return
    }

    guard let userId = session.user?.uid,
          let aiId = conversation.aiId,
          let conversationId = conversation.id else {
      toast = ToastData(style: .error, message: "Conversation incomplète.")
      return
    }

    route = ConversationRoute(
      id: conversationId,
      conversation: conversation,
      userId: userId,
      aiId: aiId
    )
  }

  private func beginSelection(with conversation: Conversation) {
    guard let conversationId = conversation.id else { return }
    withAnimation(AppMotion.standard) {
      isSelectionMode = true
      selectedConversationIds.insert(conversationId)
    }
    Haptics.light()
  }

  private func toggleConversationSelection(_ conversation: Conversation) {
    guard let conversationId = conversation.id else { return }

    withAnimation(AppMotion.quick) {
      if selectedConversationIds.contains(conversationId) {
        selectedConversationIds.remove(conversationId)
      } else {
        selectedConversationIds.insert(conversationId)
      }

      if selectedConversationIds.isEmpty {
        isSelectionMode = false
      }
    }
  }

  private func isConversationSelected(_ conversation: Conversation) -> Bool {
    guard let id = conversation.id else { return false }
    return selectedConversationIds.contains(id)
  }

  private func selectAllVisibleConversations() {
    let ids = filteredConversations.compactMap { $0.id }
    withAnimation(AppMotion.quick) {
      selectedConversationIds = Set(ids)
    }
  }

  private func cancelSelectionMode() {
    withAnimation(AppMotion.standard) {
      isSelectionMode = false
      selectedConversationIds.removeAll()
    }
  }

  private func syncSelectionWithCurrentItems() {
    let currentIds = Set(conversationIds)
    selectedConversationIds = selectedConversationIds.filter { currentIds.contains($0) }
    if selectedConversationIds.isEmpty {
      isSelectionMode = false
    }
  }

  private func deleteSelectedConversations() async {
    let ids = Array(selectedConversationIds)
    guard !ids.isEmpty else { return }

    isDeletingSelection = true
    var failedCount = 0

    for id in ids {
      do {
        try await ConversationService.deleteConversation(conversationId: id)
      } catch {
        failedCount += 1
      }
    }

    isDeletingSelection = false

    if failedCount == 0 {
      Haptics.success()
      toast = ToastData(style: .success, message: ids.count > 1 ? "Conversations supprimées." : "Conversation supprimée.")
      cancelSelectionMode()
      return
    }

    Haptics.error()
    if failedCount == ids.count {
      toast = ToastData(style: .error, message: "Suppression impossible pour les conversations sélectionnées.")
    } else {
      toast = ToastData(style: .error, message: "Certaines conversations n'ont pas pu être supprimées.")
      syncSelectionWithCurrentItems()
    }
  }

  private func normalized(_ value: String) -> String {
    value
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
  }

  private func loadAiProfileIfNeeded(aiId: String) async {
    let shouldFetch = await MainActor.run { () -> Bool in
      if aiProfilesById[aiId] != nil { return false }
      if aiProfilesUnavailable.contains(aiId) { return false }
      if aiProfilesLoading.contains(aiId) { return false }
      aiProfilesLoading.insert(aiId)
      return true
    }
    guard shouldFetch else { return }

    defer {
      Task { @MainActor in
        aiProfilesLoading.remove(aiId)
      }
    }

    do {
      let profile = try await AiProfileService.fetchById(aiId)
      guard let profile else {
        await MainActor.run {
          _ = aiProfilesUnavailable.insert(aiId)
        }
        return
      }
      await MainActor.run {
        aiProfilesById[aiId] = profile
      }
    } catch {
      return
    }
  }
}

private struct ConversationRoute: Identifiable, Hashable {
  let id: String
  let conversation: Conversation
  let userId: String
  let aiId: String

  static func == (lhs: ConversationRoute, rhs: ConversationRoute) -> Bool {
    lhs.id == rhs.id && lhs.userId == rhs.userId && lhs.aiId == rhs.aiId
  }

  func hash(into hasher: inout Hasher) {
    hasher.combine(id)
    hasher.combine(userId)
    hasher.combine(aiId)
  }
}

private struct ConversationHistoryCard: View {
  let aiProfile: AiProfile?
  let conversation: Conversation
  let isSelectionMode: Bool
  let isSelected: Bool

  var body: some View {
    HStack(spacing: 12) {
      if isSelectionMode {
        Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
          .font(.system(size: 18, weight: .semibold))
          .foregroundColor(isSelected ? AppColors.accent : AppColors.textSecondary)
      }

      avatar

      VStack(alignment: .leading, spacing: 8) {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(aiProfile?.name ?? "IA")
            .font(AppTypography.headline)
            .foregroundColor(AppColors.textPrimary)
            .lineLimit(1)

          Spacer(minLength: 0)

          if let updatedAt = conversation.updatedAt {
            Text(updatedAt, style: .relative)
              .font(AppTypography.caption)
              .foregroundColor(AppColors.textSecondary)
          }
        }

        HStack(spacing: 8) {
          StatusPill(text: statusLabel, tint: statusTint)

          if let country = conversation.countryLabel, !country.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            StatusPill(text: country, tint: AppColors.textSecondary)
          }
        }

        HStack(spacing: 6) {
          Image(systemName: "text.bubble")
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(AppColors.textSecondary)
          Text("\(conversation.messageCount ?? 0) message(s)")
            .font(AppTypography.footnote)
            .foregroundColor(AppColors.textSecondary)
        }
      }

      if !isSelectionMode {
        Image(systemName: "chevron.right")
          .font(.system(size: 13, weight: .semibold))
          .foregroundColor(AppColors.textSecondary)
      }
    }
    .padding(12)
    .background(AppColors.backgroundSecondary)
    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .stroke(borderColor, lineWidth: isSelected ? 1.4 : 1)
    )
    .shadow(color: .black.opacity(0.20), radius: 10, x: 0, y: 7)
  }

  private var statusLabel: String {
    let raw = (conversation.status ?? "running").trimmingCharacters(in: .whitespacesAndNewlines)
    return raw.isEmpty ? "Running" : raw.capitalized
  }

  private var statusTint: Color {
    switch (conversation.status ?? "running").lowercased() {
    case "running", "active":
      return .green
    case "archived", "closed":
      return AppColors.textSecondary
    default:
      return .orange
    }
  }

  private var borderColor: Color {
    if isSelected {
      return AppColors.accent.opacity(0.9)
    }
    return AppColors.inputBackground.opacity(AppTheme.strokeOpacity)
  }

  @ViewBuilder
  private var avatar: some View {
    if let urlString = AppConfig.shared.resolvedRemoteURLString(aiProfile?.imageUrl),
       let url = URL(string: urlString) {
      AsyncImage(url: url) { phase in
        switch phase {
        case .success(let image):
          image
            .resizable()
            .scaledToFill()
        default:
          avatarPlaceholder
        }
      }
      .frame(width: 58, height: 58)
      .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .stroke(AppColors.inputBackground.opacity(0.8), lineWidth: 1)
      )
    } else {
      avatarPlaceholder
        .frame(width: 58, height: 58)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
          RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(AppColors.inputBackground.opacity(0.8), lineWidth: 1)
        )
    }
  }

  private var avatarPlaceholder: some View {
    LinearGradient(
      colors: [AppColors.inputBackground, AppColors.backgroundSecondary],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )
    .overlay(
      Image(systemName: "sparkles")
        .font(.system(size: 16, weight: .semibold))
        .foregroundColor(AppColors.textSecondary)
    )
  }
}

private struct ConversationHistoryCardSkeleton: View {
  var body: some View {
    HStack(spacing: 12) {
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .fill(AppColors.inputBackground)
        .frame(width: 58, height: 58)

      VStack(alignment: .leading, spacing: 8) {
        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .fill(AppColors.inputBackground)
          .frame(width: 160, height: 14)

        HStack(spacing: 8) {
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .fill(AppColors.inputBackground)
            .frame(width: 74, height: 20)
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .fill(AppColors.inputBackground)
            .frame(width: 86, height: 20)
        }

        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .fill(AppColors.inputBackground)
          .frame(width: 120, height: 12)
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

import SwiftUI

struct ConversationsAdminView: View {
  @StateObject private var viewModel = AdminConversationsViewModel()
  @State private var aiProfilesById: [String: AiProfile] = [:]
  @State private var aiProfilesLoading: Set<String> = []
  @State private var aiProfilesUnavailable: Set<String> = []
  @State private var toast: ToastData?

  var body: some View {
    Group {
      if viewModel.isLoading {
        List(0..<6, id: \.self) { _ in
          ConversationAdminRowSkeleton()
            .listRowBackground(AppColors.backgroundSecondary)
            .listRowSeparatorTint(AppColors.inputBackground)
        }
        .listStyle(.plain)
        .appListBackground()
        .redacted(reason: .placeholder)
      } else if viewModel.conversations.isEmpty {
        EmptyStateView(
          title: "Aucune conversation",
          message: "Les conversations apparaîtront ici.",
          systemImage: "bubble.left.and.bubble.right"
        )
      } else {
        List {
          ForEach(viewModel.conversations) { conversation in
            let aiProfile = conversation.aiId.flatMap { aiProfilesById[$0] }
            NavigationLink {
              destinationView(conversation: conversation)
            } label: {
              ConversationAdminRow(aiProfile: aiProfile, conversation: conversation)
            }
            .disabled(!canOpen(conversation: conversation))
            .listRowBackground(AppColors.backgroundSecondary)
            .listRowSeparatorTint(AppColors.inputBackground)
            .task(id: conversation.aiId) {
              guard let aiId = conversation.aiId else { return }
              await loadAiProfileIfNeeded(aiId: aiId)
            }
          }

          if viewModel.hasMore {
            HStack {
              Spacer(minLength: 0)
              if viewModel.isFetchingMore {
                ProgressView()
                  .tint(AppColors.textSecondary)
              } else {
                Text("Charger plus")
                  .font(AppTypography.headline)
                  .foregroundColor(AppColors.textSecondary)
              }
              Spacer(minLength: 0)
            }
            .padding(.vertical, 10)
            .listRowBackground(AppColors.backgroundSecondary)
            .listRowSeparatorTint(AppColors.inputBackground)
            .onAppear {
              Task { await viewModel.loadMore() }
            }
          }
        }
        .listStyle(.plain)
        .appListBackground()
      }
    }
    .navigationTitle("Conversations")
    .navigationBarTitleDisplayMode(.large)
    .onAppear {
      viewModel.startListening()
    }
    .onChange(of: viewModel.errorMessage) { newValue in
      guard let newValue, !newValue.isEmpty else { return }
      toast = ToastData(style: .error, message: newValue)
    }
    .toast($toast)
    .mobileDesktopParity(maxWidth: AppLayout.maxContentWidth)
  }

  private func canOpen(conversation: Conversation) -> Bool {
    guard let id = conversation.id, !id.isEmpty else { return false }
    guard let userId = conversation.userId, !userId.isEmpty else { return false }
    guard let aiId = conversation.aiId, !aiId.isEmpty else { return false }
    return true
  }

  @ViewBuilder
  private func destinationView(conversation: Conversation) -> some View {
    if let ownerId = conversation.userId, let aiId = conversation.aiId {
      ConversationView(conversation: conversation, userId: ownerId, aiId: aiId, isReadOnly: true)
    } else {
      EmptyStateView(
        title: "Conversation indisponible",
        message: "Cette conversation n'a pas les informations nécessaires pour être ouverte.",
        systemImage: "exclamationmark.triangle.fill"
      )
    }
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
      await MainActor.run {
        if let profile {
          aiProfilesById[aiId] = profile
        } else {
          aiProfilesUnavailable.insert(aiId)
        }
      }
    } catch {
      await MainActor.run {
        aiProfilesUnavailable.insert(aiId)
      }
    }
  }
}

private struct ConversationAdminRow: View {
  let aiProfile: AiProfile?
  let conversation: Conversation

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline) {
        Text(aiTitle)
          .font(AppTypography.headline)
          .foregroundColor(AppColors.textPrimary)
          .lineLimit(1)
        Spacer(minLength: 0)
        if let updatedAt = conversation.updatedAt {
          Text(updatedAt.formatted(date: .abbreviated, time: .shortened))
            .font(AppTypography.caption)
            .foregroundColor(AppColors.textSecondary)
            .lineLimit(1)
        }
      }

      Text("Owner: \(ownerLabel)")
        .font(AppTypography.body)
        .foregroundColor(AppColors.textSecondary)
        .lineLimit(1)

      HStack(spacing: 10) {
        StatusPill(text: (conversation.status ?? "—").capitalized, tint: AppColors.textSecondary)
        StatusPill(text: "Messages: \(conversation.messageCount ?? 0)", tint: AppColors.textSecondary)
        if let id = conversation.id, !id.isEmpty {
          StatusPill(text: String(id.prefix(6)), tint: AppColors.textSecondary)
        }
      }
    }
    .padding(.vertical, 10)
  }

  private var aiTitle: String {
    let trimmed = aiProfile?.name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !trimmed.isEmpty { return trimmed }
    if let aiId = conversation.aiId, !aiId.isEmpty { return "IA \(aiId.prefix(6))" }
    return "IA"
  }

  private var ownerLabel: String {
    let ownerId = conversation.userId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if ownerId.isEmpty { return "—" }
    if ownerId.count <= 16 { return ownerId }
    return "\(ownerId.prefix(8))…\(ownerId.suffix(4))"
  }
}

private struct ConversationAdminRowSkeleton: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      RoundedRectangle(cornerRadius: 6, style: .continuous)
        .fill(AppColors.inputBackground)
        .frame(width: 180, height: 14)
      RoundedRectangle(cornerRadius: 6, style: .continuous)
        .fill(AppColors.inputBackground)
        .frame(width: 220, height: 12)
      RoundedRectangle(cornerRadius: 6, style: .continuous)
        .fill(AppColors.inputBackground)
        .frame(width: 140, height: 12)
    }
    .padding(.vertical, 10)
  }
}

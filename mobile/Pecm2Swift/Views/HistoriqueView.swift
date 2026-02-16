import SwiftUI

struct HistoriqueView: View {
  @EnvironmentObject private var session: SessionStore
  @StateObject private var viewModel = ConversationsViewModel()
  @State private var aiProfilesById: [String: AiProfile] = [:]
  @State private var aiProfilesLoading: Set<String> = []
  @State private var aiProfilesUnavailable: Set<String> = []
  @State private var toast: ToastData?

  private var conversationsWithMessages: [Conversation] {
    viewModel.conversations
      .filter { ($0.messageCount ?? 0) > 0 }
      .sorted { ($0.updatedAt ?? .distantPast) > ($1.updatedAt ?? .distantPast) }
  }

  var body: some View {
    NavigationStack {
      Group {
        if viewModel.isLoading {
          List(0..<6, id: \.self) { _ in
            ConversationRowSkeleton()
              .listRowBackground(AppColors.backgroundSecondary)
              .listRowSeparatorTint(AppColors.inputBackground)
          }
          .listStyle(.plain)
          .appListBackground()
          .redacted(reason: .placeholder)
        } else if conversationsWithMessages.isEmpty {
          EmptyStateView(
            title: "Aucune conversation",
            message: "Démarrez une conversation depuis une IA pour la retrouver ici.",
            systemImage: "bubble.left.and.bubble.right"
          )
        } else {
          List(conversationsWithMessages) { conversation in
            let aiProfile = conversation.aiId.flatMap { aiProfilesById[$0] }
            NavigationLink {
              if let userId = session.user?.uid, let aiId = conversation.aiId {
                ConversationView(conversation: conversation, userId: userId, aiId: aiId)
              }
            } label: {
              ConversationRow(aiProfile: aiProfile, conversation: conversation)
            }
            .listRowBackground(AppColors.backgroundSecondary)
            .listRowSeparatorTint(AppColors.inputBackground)
            .task(id: conversation.aiId) {
              guard let aiId = conversation.aiId else { return }
              await loadAiProfileIfNeeded(aiId: aiId)
            }
          }
          .listStyle(.plain)
          .appListBackground()
        }
      }
      .navigationTitle("Conversations")
      .navigationBarTitleDisplayMode(.large)
      .onAppear {
        if let userId = session.user?.uid {
          viewModel.listenForUser(userId: userId)
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
          aiProfilesUnavailable.insert(aiId)
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

private struct ConversationRow: View {
  let aiProfile: AiProfile?
  let conversation: Conversation

  var body: some View {
    HStack(spacing: 12) {
      avatar

      VStack(alignment: .leading, spacing: 4) {
        Text(aiProfile?.name ?? "IA")
          .font(AppTypography.headline)
          .foregroundColor(AppColors.textPrimary)
          .lineLimit(1)

        if let updatedAt = conversation.updatedAt {
          Text(updatedAt, style: .relative)
            .font(AppTypography.footnote)
            .foregroundColor(AppColors.textSecondary)
        }

        if let status = conversation.status, !status.isEmpty {
          StatusPill(text: status.capitalized, tint: AppColors.textSecondary)
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
    if let urlString = aiProfile?.imageUrl, let url = URL(string: urlString) {
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

private struct ConversationRowSkeleton: View {
  var body: some View {
    HStack(spacing: 12) {
      Circle()
        .fill(AppColors.inputBackground)
        .frame(width: 52, height: 52)
      VStack(alignment: .leading, spacing: 8) {
        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .fill(AppColors.inputBackground)
          .frame(width: 160, height: 14)
        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .fill(AppColors.inputBackground)
          .frame(width: 120, height: 12)
      }
      Spacer()
    }
    .padding(.vertical, 8)
  }
}

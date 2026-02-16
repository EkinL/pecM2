import SwiftUI

struct AiProfileDetailView: View {
  @EnvironmentObject private var session: SessionStore
  let profile: AiProfile

  @State private var isCreatingConversation = false
  @State private var errorMessage: String?
  @State private var createdConversation: Conversation?
  @State private var navigateToConversation = false
  @State private var toast: ToastData?

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        hero

        VStack(alignment: .leading, spacing: 10) {
          Text(profile.name ?? "IA")
            .font(AppTypography.title)
            .foregroundColor(AppColors.textPrimary)
            .lineLimit(2)

          HStack(spacing: 10) {
            StatusPill(text: (profile.status ?? "pending").capitalized, tint: statusTint)
            if let visibility = profile.visibility, !visibility.isEmpty {
              StatusPill(text: visibility.capitalized, tint: AppColors.textSecondary)
            }
          }
        }

        VStack(alignment: .leading, spacing: 10) {
          SectionHeader(title: "Détails", systemImage: "info.circle")
          CardContainer {
            VStack(alignment: .leading, spacing: 10) {
              KeyValueRow(label: "Mentalité", value: profile.mentality)
              KeyValueRow(label: "Voix", value: profile.voice)
              KeyValueRow(label: "Rythme", value: profile.voiceRhythm)
            }
          }
        }

        PrimaryButton(
          title: "Démarrer une conversation",
          systemImage: "bubble.left.and.bubble.right.fill",
          isLoading: isCreatingConversation,
          isDisabled: !canStartConversation
        ) {
          Task { await startConversation() }
        }

        NavigationLink(isActive: $navigateToConversation) {
          if let conversation = createdConversation, let aiId = profile.id, let userId = session.user?.uid {
            ConversationView(conversation: conversation, userId: userId, aiId: aiId)
          }
        } label: { EmptyView() }
      }
      .padding(AppLayout.screenPadding)
      .mobileDesktopParity(maxWidth: AppLayout.maxContentWidth)
    }
    .navigationTitle(profile.name ?? "Profil IA")
    .navigationBarTitleDisplayMode(.inline)
    .appScreenBackground()
    .tint(AppColors.accent)
    .toast($toast)
    .onChange(of: errorMessage) { newValue in
      guard let newValue, !newValue.isEmpty else { return }
      toast = ToastData(style: .error, message: newValue)
    }
  }

  private var canStartConversation: Bool {
    session.user != nil && profile.id != nil && (profile.status ?? "").lowercased() == "active"
  }

  private var statusTint: Color {
    (profile.status ?? "").lowercased() == "active" ? .green : .orange
  }

  @ViewBuilder
  private var hero: some View {
    ZStack(alignment: .bottomLeading) {
      if let urlString = profile.imageUrl, let url = URL(string: urlString) {
        AsyncImage(url: url) { image in
          image.resizable().scaledToFill()
        } placeholder: {
          AppColors.inputBackground
        }
      } else {
        AppColors.inputBackground
          .overlay(
            Image(systemName: "sparkles")
              .font(.system(size: 42, weight: .semibold))
              .foregroundColor(AppColors.textSecondary)
          )
      }

      LinearGradient(
        colors: [.clear, AppColors.background.opacity(0.85)],
        startPoint: .top,
        endPoint: .bottom
      )

      Text((profile.mentality ?? "").isEmpty ? "IA" : profile.mentality ?? "IA")
        .font(AppTypography.caption.weight(.semibold))
        .foregroundColor(AppColors.textPrimary)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(AppColors.backgroundSecondary.opacity(0.8))
        .clipShape(Capsule())
        .padding(12)
    }
    .frame(height: 220)
    .frame(maxWidth: .infinity)
    .clipShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous)
        .stroke(AppColors.inputBackground.opacity(0.8), lineWidth: 1)
    )
  }

  private func startConversation() async {
    guard let userId = session.user?.uid, let aiId = profile.id else { return }
    isCreatingConversation = true
    errorMessage = nil
    do {
      let conversation = try await ConversationService.createConversation(userId: userId, aiId: aiId)
      createdConversation = conversation
      navigateToConversation = true
      Haptics.success()
    } catch {
      errorMessage = error.localizedDescription
    }
    isCreatingConversation = false
  }
}

private struct KeyValueRow: View {
  let label: String
  let value: String?

  var body: some View {
    if let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      HStack(alignment: .firstTextBaseline, spacing: 10) {
        Text(label)
          .font(AppTypography.caption.weight(.semibold))
          .foregroundColor(AppColors.textSecondary)
          .frame(width: 90, alignment: .leading)
        Text(value)
          .font(AppTypography.body)
          .foregroundColor(AppColors.textPrimary)
        Spacer(minLength: 0)
      }
    }
  }
}

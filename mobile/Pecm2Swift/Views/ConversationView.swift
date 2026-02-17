import SwiftUI
import UIKit

struct ConversationView: View {
  @EnvironmentObject private var session: SessionStore
  @EnvironmentObject private var locationManager: LocationManager
  @Environment(\.dismiss) private var dismiss
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let conversation: Conversation
  let userId: String
  let aiId: String
  let isReadOnly: Bool

  @StateObject private var viewModel: ConversationDetailViewModel
  @State private var messageText = ""
  @FocusState private var isComposerFocused: Bool
  @State private var showEvaluation = false
  @State private var rating = 5
  @State private var comment = ""
  @State private var didRequestLocation = false
  @State private var isSyncingLocation = false
  @State private var didSyncLocation = false
  @State private var aiProfile: AiProfile?
  @State private var isAtBottom = true
  @State private var toast: ToastData?

  private let bottomAnchorId = "bottom-anchor"

  init(conversation: Conversation, userId: String, aiId: String, isReadOnly: Bool = false) {
    self.conversation = conversation
    self.userId = userId
    self.aiId = aiId
    self.isReadOnly = isReadOnly
    let vm = ConversationDetailViewModel(conversation: conversation, userId: userId, aiId: aiId)
    _viewModel = StateObject(wrappedValue: vm)
  }

  var body: some View {
    GeometryReader { geometry in
      ScrollViewReader { proxy in
        ZStack {
          AppColors.background.ignoresSafeArea()

          ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
              ForEach(viewModel.messages) { message in
                MessageBubbleView(
                  message: message,
                  maxWidth: computedMaxBubbleWidth(geometry: geometry)
                ) {
                  Task { await viewModel.playTTS(for: message) }
                }
                .id(message.id)
              }

              if viewModel.isSending {
                TypingIndicatorBubble()
                  .frame(maxWidth: .infinity, alignment: .leading)
              }

              Color.clear
                .frame(height: 1)
                .id(bottomAnchorId)
                .onAppear { isAtBottom = true }
                .onDisappear { isAtBottom = false }
            }
            .padding(.horizontal, AppLayout.screenPadding)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity)
            .frame(minHeight: geometry.size.height, alignment: .bottom)
          }
          .scrollDismissesKeyboard(.interactively)
          .safeAreaInset(edge: .top, spacing: 0) {
            ConversationHeaderBar(
              title: aiDisplayName,
              onBack: { dismiss() },
              onEvaluate: isReadOnly ? nil : {
                Haptics.light()
                showEvaluation = true
              }
            )
          }
          .safeAreaInset(edge: .bottom, spacing: 0) {
            if !isReadOnly {
              ConversationComposerBar(
                text: $messageText,
                isSending: viewModel.isSending,
                focus: $isComposerFocused,
                onSend: {
                  sendMessage(using: proxy)
                }
              )
              .background(AppColors.background.opacity(0.96))
            }
          }
          .onTapGesture {
            isComposerFocused = false
          }
          .onChange(of: viewModel.messages.count) { _ in
            guard isAtBottom else { return }
            scrollToBottom(using: proxy)
          }
          .onChange(of: viewModel.errorMessage) { newValue in
            guard let newValue, !newValue.isEmpty else { return }
            toast = ToastData(style: .error, message: newValue)
          }

          if !isAtBottom, !viewModel.messages.isEmpty {
            ScrollToBottomButton {
              scrollToBottom(using: proxy)
            }
            .padding(.trailing, 16)
            .padding(.bottom, 86)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
          }
        }
        .loadingOverlay(isPresented: viewModel.isLoading && viewModel.messages.isEmpty, title: "Chargement…")
      }
    }
    .toolbar(.hidden, for: .navigationBar)
    .toast($toast)
    .onAppear {
      viewModel.startListening()
      if !isReadOnly {
        if shouldSyncLocation {
          ensureLocation()
        }
      }
    }
    .onChange(of: locationManager.location) { _ in
      if !isReadOnly {
        if shouldSyncLocation {
          ensureLocation()
        }
      }
    }
    .onChange(of: session.profile?.useLiveLocationPricing ?? false) { enabled in
      guard !isReadOnly else { return }
      guard enabled else { return }
      didSyncLocation = false
      ensureLocation()
    }
    .task(id: aiId) {
      aiProfile = try? await AiProfileService.fetchById(aiId)
    }
    .sheet(isPresented: $showEvaluation) {
      EvaluationSheet(rating: $rating, comment: $comment) {
        Task {
          do {
            guard let conversationId = conversation.id else {
              viewModel.errorMessage = "Conversation introuvable."
              return
            }
            try await AiEvaluationService.addEvaluation(
              aiId: aiId,
              userId: userId,
              conversationId: conversationId,
              rating: rating,
              comment: comment,
              tags: nil
            )
            showEvaluation = false
          } catch {
            viewModel.errorMessage = error.localizedDescription
          }
        }
      }
      .mobileDesktopParity()
    }
  }

  private var aiDisplayName: String {
    let trimmed = aiProfile?.name?.trimmingCharacters(in: .whitespacesAndNewlines)
    if let trimmed, !trimmed.isEmpty { return trimmed }
    return "…"
  }

  private var shouldSyncLocation: Bool {
    session.profile?.useLiveLocationPricing ?? false
  }

  private func ensureLocation() {
    guard shouldSyncLocation else { return }
    guard !didSyncLocation else { return }
    let storedCountryCode = conversation.countryCode?.trimmingCharacters(in: .whitespacesAndNewlines)
    let hasStoredCountryCode = (storedCountryCode?.isEmpty == false)
    let hasStoredLocation = (conversation.location?.lat != nil) && (conversation.location?.lng != nil)
    guard !hasStoredCountryCode && !hasStoredLocation else {
      didSyncLocation = true
      return
    }
    guard !isSyncingLocation else { return }
    guard let conversationId = conversation.id else { return }

    guard let location = locationManager.location else {
      if !didRequestLocation {
        didRequestLocation = true
        locationManager.requestLocation()
      }
      return
    }

    isSyncingLocation = true
    Task {
      let geo = GeoLocation(lat: location.coordinate.latitude, lng: location.coordinate.longitude, accuracy: location.horizontalAccuracy)
      do {
        try await ConversationService.updateLocation(conversationId: conversationId, location: geo)
        if let data = try? await NextApiService.countryLookup(lat: geo.lat ?? 0, lng: geo.lng ?? 0) {
          if let code = data["countryCode"] as? String,
             let label = data["countryLabel"] as? String {
            try? await ConversationService.updateCountry(conversationId: conversationId, countryCode: code, countryLabel: label)
          }
        }

        await MainActor.run {
          didSyncLocation = true
          isSyncingLocation = false
        }
      } catch {
        await MainActor.run {
          isSyncingLocation = false
        }
      }
    }
  }

  private func computedMaxBubbleWidth(geometry: GeometryProxy) -> CGFloat {
    let preferred = geometry.size.width * 0.78
    return max(min(preferred, AppLayout.maxContentWidth), 0)
  }

  private func scrollToBottom(using proxy: ScrollViewProxy) {
    if reduceMotion {
      proxy.scrollTo(bottomAnchorId, anchor: .bottom)
    } else {
      withAnimation(AppMotion.standard) {
        proxy.scrollTo(bottomAnchorId, anchor: .bottom)
      }
    }
  }

  private func sendMessage(using proxy: ScrollViewProxy) {
    let trimmed = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }

    let textToSend = trimmed
    messageText = ""
    Haptics.light()
    scrollToBottom(using: proxy)
    Task {
      await viewModel.sendTextMessage(textToSend)
    }
  }
}

private struct ConversationHeaderBar: View {
  let title: String
  var onBack: () -> Void
  var onEvaluate: (() -> Void)?

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 10) {
        IconCircleButton(systemName: "chevron.left", label: "Retour", action: onBack)

        Text(title)
          .font(AppTypography.headline)
          .foregroundColor(AppColors.textPrimary)
          .lineLimit(1)
          .truncationMode(.tail)
          .frame(maxWidth: .infinity, alignment: .center)

        if let onEvaluate {
          IconCircleButton(systemName: "star.fill", label: "Évaluer", action: onEvaluate)
        } else {
          Image(systemName: "lock.fill")
            .font(.system(size: 15, weight: .semibold))
            .foregroundColor(AppColors.textSecondary)
            .frame(width: AppLayout.minTapTarget, height: AppLayout.minTapTarget)
            .background(AppColors.inputBackground)
            .clipShape(Circle())
            .overlay(Circle().stroke(AppColors.backgroundSecondary.opacity(0.85), lineWidth: 1))
            .accessibilityLabel("Lecture seule")
        }
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 10)

      Divider()
        .overlay(AppColors.inputBackground.opacity(0.8))
    }
    .frame(maxWidth: .infinity)
    .background(AppColors.backgroundSecondary.opacity(0.96))
  }
}

private struct ConversationComposerBar: View {
  @Binding var text: String
  let isSending: Bool
  var focus: FocusState<Bool>.Binding
  var onSend: () -> Void

  private var canSend: Bool {
    !isSending && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  var body: some View {
    VStack(spacing: 10) {
      Divider()
        .overlay(AppColors.inputBackground.opacity(0.8))

      HStack(alignment: .bottom, spacing: 10) {
        TextField(
          "Votre message",
          text: $text,
          axis: .vertical
        )
        .focused(focus)
        .lineLimit(1...6)
        .foregroundColor(AppColors.textPrimary)
        .textFieldStyle(.plain)
        .appInputStyle()
        .submitLabel(.send)
        .onSubmit {
          guard canSend else { return }
          onSend()
        }
        .accessibilityLabel("Message")

        Button {
          onSend()
        } label: {
          ZStack {
            Circle()
              .fill(AppColors.accent)
              .frame(width: 44, height: 44)

            if isSending {
              ProgressView()
                .tint(AppColors.textPrimary)
            } else {
              Image(systemName: "paperplane.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(AppColors.textPrimary)
            }
          }
          .appGlow()
        }
        .buttonStyle(.plain)
        .disabled(!canSend)
        .opacity(canSend ? 1 : 0.55)
        .accessibilityLabel("Envoyer")
        .accessibilityHint(canSend ? "" : "Saisissez un message pour envoyer.")
      }
      .padding(.horizontal, AppLayout.screenPadding)
      .padding(.bottom, 10)
    }
  }
}

private struct IconCircleButton: View {
  let systemName: String
  let label: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: systemName)
        .font(.system(size: 15, weight: .semibold))
        .foregroundColor(AppColors.textPrimary)
        .frame(width: AppLayout.minTapTarget, height: AppLayout.minTapTarget)
        .background(AppColors.inputBackground)
        .clipShape(Circle())
        .overlay(Circle().stroke(AppColors.backgroundSecondary.opacity(0.85), lineWidth: 1))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label)
  }
}

private struct ScrollToBottomButton: View {
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: "arrow.down")
        .font(.system(size: 14, weight: .semibold))
        .foregroundColor(AppColors.textPrimary)
        .frame(width: 44, height: 44)
        .background(AppColors.backgroundSecondary)
        .clipShape(Circle())
        .overlay(Circle().stroke(AppColors.inputBackground.opacity(0.8), lineWidth: 1))
        .shadow(color: .black.opacity(0.35), radius: 14, x: 0, y: 10)
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Aller en bas")
  }
}

private struct TypingIndicatorBubble: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var animateDots = false

  var body: some View {
    HStack {
      if reduceMotion {
        Text("IA écrit…")
          .font(AppTypography.footnote)
          .foregroundColor(AppColors.textSecondary)
      } else {
        HStack(spacing: 6) {
          ForEach(0..<3, id: \.self) { index in
            Circle()
              .fill(AppColors.textSecondary)
              .frame(width: 6, height: 6)
              .opacity(animateDots ? 1 : 0.35)
              .animation(
                .easeInOut(duration: 0.55)
                  .repeatForever(autoreverses: true)
                  .delay(Double(index) * 0.18),
                value: animateDots
              )
          }
        }
        .onAppear {
          animateDots = true
        }
        .onDisappear {
          animateDots = false
        }
      }
      Spacer()
    }
    .padding(12)
    .background(AppColors.messageAI)
    .clipShape(RoundedRectangle(cornerRadius: AppTheme.bubbleCornerRadius, style: .continuous))
    .frame(maxWidth: AppLayout.maxContentWidth, alignment: .leading)
    .accessibilityLabel("IA écrit")
  }
}

struct EvaluationSheet: View {
  @Binding var rating: Int
  @Binding var comment: String
  var onSubmit: () -> Void

  var body: some View {
    NavigationStack {
      Form {
        Stepper("Note: \(rating)", value: $rating, in: 1...5)
        TextField(
          "Commentaire",
          text: $comment,
          prompt: Text("Commentaire").foregroundColor(AppColors.textSecondary)
        )
      }
      .scrollContentBackground(.hidden)
      .background(AppColors.background)
      .navigationTitle("Évaluation")
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Envoyer") {
            onSubmit()
          }
        }
      }
    }
    .tint(AppColors.accent)
    .preferredColorScheme(.dark)
  }
}

struct MessageBubbleView: View {
  let message: ConversationMessage
  var maxWidth: CGFloat = .infinity
  var onPlayTTS: (() -> Void)?

  var body: some View {
    HStack(alignment: .bottom, spacing: 8) {
      if isClientMessage { Spacer(minLength: 0) }
      bubble
      if !isClientMessage { Spacer(minLength: 0) }
    }
    .frame(maxWidth: .infinity)
  }

  private var bubble: some View {
    VStack(alignment: .leading, spacing: 8) {
      if let content = message.content {
        breakableText(content)
          .font(message.kind == "image" ? AppTypography.footnote : AppTypography.body)
          .foregroundColor(isClientMessage ? AppColors.textPrimary : (message.kind == "image" ? AppColors.textSecondary : AppColors.textPrimary))
          .lineLimit(nil)
          .multilineTextAlignment(.leading)
          .fixedSize(horizontal: false, vertical: true)
          .textSelection(.enabled)
      }

      if !isClientMessage, onPlayTTS != nil, message.kind != "image" {
        Button {
          Haptics.light()
          onPlayTTS?()
        } label: {
          Label("Écouter", systemImage: "speaker.wave.2.fill")
            .font(AppTypography.caption.weight(.semibold))
        }
        .buttonStyle(.plain)
        .foregroundColor(AppColors.accent)
        .accessibilityLabel("Écouter le message")
      }
    }
    .padding(12)
    .background(isClientMessage ? AppColors.messageUser : AppColors.messageAI)
    .clipShape(RoundedRectangle(cornerRadius: AppTheme.bubbleCornerRadius, style: .continuous))
    .frame(maxWidth: maxWidth, alignment: isClientMessage ? .trailing : .leading)
    .contextMenu { messageContextMenu }
  }

  @ViewBuilder
  private var messageContextMenu: some View {
    if let content = message.content, !content.isEmpty {
      Button {
        #if canImport(UIKit)
        UIPasteboard.general.string = content
        #endif
        Haptics.success()
      } label: {
        Label("Copier", systemImage: "doc.on.doc")
      }
    }

    if !isClientMessage, onPlayTTS != nil, message.kind != "image" {
      Button {
        Haptics.light()
        onPlayTTS?()
      } label: {
        Label("Écouter", systemImage: "speaker.wave.2")
      }
    }
  }

  private var isClientMessage: Bool {
    (message.authorRole ?? "").lowercased() == "client"
  }

  private func breakableText(_ value: String) -> Text {
    let style = NSMutableParagraphStyle()
    style.lineBreakMode = .byCharWrapping
    let attributed = NSAttributedString(string: value, attributes: [.paragraphStyle: style])
    return Text(AttributedString(attributed))
  }
}

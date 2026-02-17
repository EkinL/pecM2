import Foundation
import FirebaseAuth
import FirebaseFirestore
import AVFoundation

@MainActor
final class ConversationDetailViewModel: ObservableObject {
  @Published var messages: [ConversationMessage] = []
  @Published var isLoading = true
  @Published var errorMessage: String?
  @Published var isSending = false
  @Published var isPlayingAudio = false

  private let conversation: Conversation
  private let userId: String
  private let aiId: String
  private var listener: ListenerRegistration?
  private var audioPlayer: AVAudioPlayer?

  init(conversation: Conversation, userId: String, aiId: String) {
    self.conversation = conversation
    self.userId = userId
    self.aiId = aiId
  }

  deinit {
    listener?.remove()
  }

  func startListening() {
    guard let conversationId = conversation.id, !conversationId.isEmpty else {
      errorMessage = "Conversation introuvable."
      isLoading = false
      return
    }
    listener?.remove()
    listener = ConversationService.listenMessages(conversationId: conversationId) { [weak self] items in
      Task { @MainActor in
        self?.messages = items
        self?.isLoading = false
      }
    }
  }

  func sendTextMessage(_ text: String) async {
    guard let conversationId = conversation.id, !conversationId.isEmpty else {
      errorMessage = "Conversation introuvable."
      return
    }
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }

    isSending = true
    errorMessage = nil
    do {
      try await persistClientMessage(conversationId: conversationId, message: trimmed)
      do {
        _ = try await NextApiService.aiReply(conversationId: conversationId, aiId: aiId, message: trimmed)
      } catch {
        errorMessage = "Message envoyé, mais réponse IA indisponible. \(error.localizedDescription)"
      }
    } catch {
      errorMessage = error.localizedDescription
    }
    isSending = false
  }

  private func persistClientMessage(conversationId: String, message: String) async throws {
    do {
      _ = try await ConversationService.sendMessageWithTokens(
        conversationId: conversationId,
        userId: userId,
        authorRole: "client",
        content: message,
        kind: "text"
      )
      return
    } catch {
      guard shouldFallbackToApiAfterFirestoreError(error) else {
        throw error
      }
    }

    _ = try await NextApiService.sendConversationMessage(
      conversationId: conversationId,
      aiId: aiId,
      message: message,
      kind: "text"
    )
  }

  private func shouldFallbackToApiAfterFirestoreError(_ error: Error) -> Bool {
    let nsError = error as NSError
    if nsError.code == FirestoreErrorCode.permissionDenied.rawValue {
      return true
    }
    if nsError.domain == FirestoreErrorDomain &&
        nsError.code == FirestoreErrorCode.permissionDenied.rawValue {
      return true
    }

    let normalized = nsError.localizedDescription.lowercased()
    return normalized.contains("missing or insufficient permissions") ||
      normalized.contains("permission denied")
  }

  func playTTS(for message: ConversationMessage) async {
    guard let content = message.content else { return }
    isPlayingAudio = true
    do {
      let data = try await NextApiService.tts(text: content, aiId: aiId, voice: nil)
      audioPlayer = try AVAudioPlayer(data: data)
      audioPlayer?.play()
    } catch {
      errorMessage = error.localizedDescription
    }
    isPlayingAudio = false
  }
}

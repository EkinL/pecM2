import Foundation
import FirebaseFirestore

@MainActor
final class ConversationsViewModel: ObservableObject {
  @Published var conversations: [Conversation] = []
  @Published var isLoading = true
  @Published var errorMessage: String?

  private var listener: ListenerRegistration?

  deinit {
    listener?.remove()
  }

  func listenAll() {
    listener?.remove()
    isLoading = true
    listener = ConversationService.listenAll { [weak self] items in
      Task { @MainActor in
        self?.conversations = items
        self?.isLoading = false
      }
    }
  }

  func listenForUser(userId: String) {
    listener?.remove()
    isLoading = true
    listener = ConversationService.listenForUser(userId: userId) { [weak self] items in
      Task { @MainActor in
        self?.conversations = items
        self?.isLoading = false
      }
    }
  }
}

@MainActor
final class AdminConversationsViewModel: ObservableObject {
  @Published var conversations: [Conversation] = []
  @Published var isLoading = true
  @Published var isFetchingMore = false
  @Published var hasMore = true
  @Published var errorMessage: String?

  private let pageSize: Int
  private var statusFilter: String?
  private var listener: ListenerRegistration?
  private var firstPage: [Conversation] = []
  private var pagedItems: [Conversation] = []
  private var firstPageLastSnapshot: DocumentSnapshot?
  private var paginationCursor: DocumentSnapshot?

  init(pageSize: Int = 50) {
    self.pageSize = pageSize
  }

  deinit {
    listener?.remove()
  }

  func startListening(status: String? = nil) {
    statusFilter = status
    listener?.remove()
    firstPage = []
    pagedItems = []
    firstPageLastSnapshot = nil
    paginationCursor = nil
    hasMore = true
    errorMessage = nil
    isLoading = true
    isFetchingMore = false

    listener = ConversationService.listenAdminConversations(status: status, pageSize: pageSize) { [weak self] items, lastSnapshot in
      Task { @MainActor in
        guard let self else { return }
        self.firstPage = items
        self.firstPageLastSnapshot = lastSnapshot

        if self.pagedItems.isEmpty {
          self.paginationCursor = lastSnapshot
          self.hasMore = items.count == self.pageSize && lastSnapshot != nil
        }

        self.publishMerged()
        self.isLoading = false
      }
    }
  }

  func loadMore() async {
    guard !isFetchingMore else { return }
    guard hasMore else { return }
    guard let paginationCursor else { return }

    isFetchingMore = true
    do {
      let result = try await ConversationService.fetchAdminConversationsPage(
        status: statusFilter,
        pageSize: pageSize,
        startAfter: paginationCursor
      )
      pagedItems.append(contentsOf: result.items)
      self.paginationCursor = result.lastSnapshot
      if result.items.count < pageSize || result.lastSnapshot == nil {
        hasMore = false
      }
      publishMerged()
    } catch {
      errorMessage = error.localizedDescription
    }
    isFetchingMore = false
  }

  private func publishMerged() {
    var byId: [String: Conversation] = [:]
    for conversation in (firstPage + pagedItems) {
      guard let id = conversation.id, !id.isEmpty else { continue }
      byId[id] = conversation
    }

    var merged = Array(byId.values)
    merged.sort { ($0.updatedAt ?? .distantPast) > ($1.updatedAt ?? .distantPast) }
    conversations = merged
  }
}

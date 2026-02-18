import Foundation
import FirebaseFirestore

@MainActor
final class DemandesViewModel: ObservableObject {
  @Published var demandes: [Demande] = []
  @Published var isLoading = true
  @Published var errorMessage: String?

  private var listener: ListenerRegistration?

  deinit {
    listener?.remove()
  }

  func listenAll() {
    listener?.remove()
    isLoading = true
    listener = DemandeService.listenAll { [weak self] items in
      Task { @MainActor in
        self?.demandes = items
        self?.isLoading = false
      }
    }
  }

  func listenForClient(clientId: String) {
    listener?.remove()
    isLoading = true
    listener = DemandeService.listenForClient(clientId: clientId) { [weak self] items in
      Task { @MainActor in
        self?.demandes = items
        self?.isLoading = false
      }
    }
  }

  func listenForPrestataire(prestataireId: String) {
    listener?.remove()
    isLoading = true
    listener = DemandeService.listenForPrestataire(prestataireId: prestataireId) { [weak self] items in
      Task { @MainActor in
        self?.demandes = items
        self?.isLoading = false
      }
    }
  }

  func addDemande(clientId: String,
                  clientMail: String?,
                  clientPseudo: String?,
                  title: String,
                  description: String,
                  category: String?,
                  budget: Double?,
                  city: String?,
                  availability: String?,
                  location: GeoLocation?,
                  aiId: String? = nil,
                  aiName: String? = nil,
                  requestType: String? = nil,
                  payload: DemandeAiPayload? = nil) async {
    do {
      try await DemandeService.addDemande(
        clientId: clientId,
        clientMail: clientMail,
        clientPseudo: clientPseudo,
        title: title,
        description: description,
        category: category,
        budget: budget,
        city: city,
        availability: availability,
        location: location,
        aiId: aiId,
        aiName: aiName,
        requestType: requestType,
        payload: payload
      )
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  func acceptDemande(demandeId: String, prestataireId: String) async {
    do {
      try await DemandeService.acceptDemande(demandeId: demandeId, prestataireId: prestataireId)
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  func cancelDemande(demandeId: String, reason: String?) async {
    do {
      try await DemandeService.cancelDemande(demandeId: demandeId, reason: reason)
    } catch {
      errorMessage = error.localizedDescription
    }
  }
}

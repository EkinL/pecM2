import Foundation
import FirebaseAuth

struct NextApiService {
  struct ApiError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
  }

  private static var baseUrl: URL { AppConfig.shared.nextApiBaseUrl }

  private static func endpointURL(path: String) throws -> URL {
    let trimmed = path.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      throw ApiError(message: "Endpoint invalide.")
    }

    var url = baseUrl
    for component in trimmed.split(separator: "/") {
      url.appendPathComponent(String(component))
    }
    return url
  }

  static func aiReply(conversationId: String, aiId: String, message: String) async throws -> String {
    let payload: [String: Any] = [
      "conversationId": conversationId,
      "aiId": aiId,
      "message": message
    ]
    let data = try await sendJSON(path: "/api/ai/reply", payload: payload, includeAuthToken: true)
    guard let reply = data["reply"] as? String else {
      throw ApiError(message: "Réponse IA indisponible.")
    }
    return reply
  }

  static func aiImage(mode: String, conversationId: String?, userId: String?, aiId: String, message: String?) async throws -> [String: Any] {
    var payload: [String: Any] = [
      "mode": mode,
      "aiId": aiId
    ]
    if let conversationId { payload["conversationId"] = conversationId }
    if let userId { payload["userId"] = userId }
    if let message { payload["message"] = message }

    return try await sendJSON(path: "/api/ai/image", payload: payload, includeAuthToken: true)
  }

  static func tts(text: String, aiId: String?, voice: String?) async throws -> Data {
    var payload: [String: Any] = [
      "text": text
    ]
    if let aiId { payload["aiId"] = aiId }
    if let voice { payload["voice"] = voice }

    let url = try endpointURL(path: "api/ai/tts")
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("ios", forHTTPHeaderField: "x-pecm2-platform")
    if let user = Auth.auth().currentUser {
      do {
        let token = try await user.getIDToken()
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
      } catch {
        // On garde une requête best-effort si le token n'est pas disponible.
      }
    }
    request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])

    let (data, response): (Data, URLResponse)
    do {
      (data, response) = try await URLSession.shared.data(for: request)
    } catch {
      throw ApiError(message: "Impossible de contacter \(url.absoluteString) (\(error.localizedDescription)). Vérifiez nextApiBaseUrl.")
    }
    guard let httpResponse = response as? HTTPURLResponse else {
      throw ApiError(message: "Réponse invalide.")
    }
    if httpResponse.statusCode >= 300 {
      let errorMessage = parseErrorMessage(from: data) ?? "Erreur TTS."
      throw ApiError(message: errorMessage)
    }
    return data
  }

  static func tokenPrice(lat: Double?, lng: Double?, currency: String?, zoneId: String?) async throws -> [String: Any] {
    var payload: [String: Any] = [:]
    if let lat { payload["lat"] = lat }
    if let lng { payload["lng"] = lng }
    if let currency { payload["currency"] = currency }
    if let zoneId { payload["zoneId"] = zoneId }

    return try await sendJSON(path: "/api/token-price", payload: payload, includeAuthToken: true)
  }

  static func countryLookup(lat: Double, lng: Double) async throws -> [String: Any] {
    let payload: [String: Any] = [
      "lat": lat,
      "lng": lng
    ]
    return try await sendJSON(path: "/api/location/country", payload: payload)
  }

  private static func sendJSON(path: String, payload: [String: Any], includeAuthToken: Bool = false) async throws -> [String: Any] {
    let url = try endpointURL(path: path)
    let body = try JSONSerialization.data(withJSONObject: payload, options: [])

    func performRequest(withToken token: String?) async throws -> (data: Data, http: HTTPURLResponse) {
      var request = URLRequest(url: url)
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.setValue("ios", forHTTPHeaderField: "x-pecm2-platform")
      if let token {
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
      }
      request.httpBody = body

      let data: Data
      let response: URLResponse
      do {
        (data, response) = try await URLSession.shared.data(for: request)
      } catch {
        throw ApiError(message: "Impossible de contacter \(url.absoluteString) (\(error.localizedDescription)). Vérifiez nextApiBaseUrl.")
      }
      guard let http = response as? HTTPURLResponse else {
        throw ApiError(message: "Réponse invalide.")
      }
      return (data, http)
    }

    var tokenToUse: String? = nil
    if includeAuthToken, let user = Auth.auth().currentUser {
      tokenToUse = try await user.getIDToken()
    }

    var (data, http) = try await performRequest(withToken: tokenToUse)

    if includeAuthToken, http.statusCode == 401, let user = Auth.auth().currentUser {
      do {
        let tokenResult = try await user.getIDTokenResult(forcingRefresh: true)
        let refreshed = tokenResult.token
        (data, http) = try await performRequest(withToken: refreshed)
      } catch {
        // On conserve la réponse initiale si refresh impossible
      }
    }

    if http.statusCode >= 300 {
      var message = parseErrorMessage(from: data) ?? "Erreur réseau."
      let normalized = message.trimmingCharacters(in: .whitespacesAndNewlines)
      if normalized.isEmpty {
        message = "Erreur réseau."
      } else {
        message = normalized
      }

      if message.lowercased().contains("<!doctype html") || message.lowercased().contains("<html") {
        message = "Erreur \(http.statusCode). Vérifiez nextApiBaseUrl."
      } else if http.statusCode == 401 {
        message = "Session expirée. Déconnectez-vous puis reconnectez-vous."
      } else if http.statusCode == 404 {
        message = "Endpoint introuvable (404). Vérifiez nextApiBaseUrl."
      } else if http.statusCode >= 500 {
        message = "Service indisponible (\(http.statusCode)). Réessayez plus tard."
      }

      if message.count > 400 {
        let index = message.index(message.startIndex, offsetBy: 400)
        message = String(message[..<index]) + "…"
      }

      throw ApiError(message: message)
    }

    let json = try JSONSerialization.jsonObject(with: data, options: [])
    if let dict = json as? [String: Any] {
      return dict
    }
    if let array = json as? [Any] {
      return ["data": array]
    }
    return [:]
  }

  private static func parseErrorMessage(from data: Data) -> String? {
    guard let json = try? JSONSerialization.jsonObject(with: data, options: []) else {
      return String(data: data, encoding: .utf8)
    }
    if let dict = json as? [String: Any], let message = dict["error"] as? String {
      return message
    }
    return nil
  }
}

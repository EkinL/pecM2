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

  static func aiReply(conversationId: String, userId: String, aiId: String, message: String) async throws -> String {
    let payload: [String: Any] = [
      "conversationId": conversationId,
      "userId": userId,
      "aiId": aiId,
      "message": message
    ]
    let data = try await sendJSON(path: "/api/ai/reply", payload: payload)
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

    return try await sendJSON(path: "/api/ai/image", payload: payload)
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
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    if includeAuthToken, let user = Auth.auth().currentUser {
      let token = try await user.getIDToken()
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
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
      let message = parseErrorMessage(from: data) ?? "Erreur réseau."
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

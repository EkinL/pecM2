import Foundation
import FirebaseAuth

actor LogThrottleStore {
  private var lastLoggedAt: [String: Date] = [:]

  func shouldLog(key: String, minInterval: TimeInterval) -> Bool {
    guard minInterval > 0 else { return true }
    let now = Date()
    if let last = lastLoggedAt[key], now.timeIntervalSince(last) < minInterval {
      return false
    }
    lastLoggedAt[key] = now
    return true
  }
}

struct LogService {
  private static let throttleStore = LogThrottleStore()

  private static var baseUrl: URL { AppConfig.shared.nextApiBaseUrl }

  private static func endpointURL(path: String) throws -> URL {
    let trimmed = path.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      throw NSError(domain: "Logs", code: 400, userInfo: [NSLocalizedDescriptionKey: "Endpoint invalide."])
    }

    var url = baseUrl
    for component in trimmed.split(separator: "/") {
      url.appendPathComponent(String(component))
    }
    return url
  }

  static func log(action: String,
                  targetType: String,
                  targetId: String? = nil,
                  details: [String: Any]? = nil,
                  throttleKey: String? = nil,
                  throttleSeconds: TimeInterval = 0) async {
    guard let user = Auth.auth().currentUser else { return }
    let normalizedAction = action.trimmingCharacters(in: .whitespacesAndNewlines)
    let normalizedTargetType = targetType.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedAction.isEmpty, !normalizedTargetType.isEmpty else { return }

    let key = throttleKey ?? "\(normalizedAction)|\(normalizedTargetType)|\(targetId ?? "")"
    let canLog = await throttleStore.shouldLog(key: key, minInterval: throttleSeconds)
    guard canLog else { return }

    do {
      let token = try await user.getIDToken()
      let url = try endpointURL(path: "/api/logs")

      var payload: [String: Any] = [
        "action": normalizedAction,
        "targetType": normalizedTargetType
      ]
      if let targetId, !targetId.isEmpty {
        payload["targetId"] = targetId
      }
      if let details {
        payload["details"] = details
      }

      var request = URLRequest(url: url)
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.setValue("ios", forHTTPHeaderField: "x-pecm2-platform")
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
      request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])

      let (_, response) = try await URLSession.shared.data(for: request)
      guard let httpResponse = response as? HTTPURLResponse else { return }
      guard (200..<300).contains(httpResponse.statusCode) else { return }
    } catch {
      // Best-effort: ne pas bloquer le flux utilisateur si le log échoue.
    }
  }
}


import Foundation

struct AppConfig {
  static let shared = AppConfig()
  private static let fallbackNextApiBaseUrl = URL(string: "https://pec-m2.vercel.app")!

  let firebaseApiKey: String
  let firebaseProjectId: String
  let firebaseStorageBucket: String
  let firebaseMessagingSenderId: String
  let firebaseAppId: String
  let firebaseMeasurementId: String
  let nextApiBaseUrl: URL
  let nextApiBaseUrls: [URL]
  let openAiApiKey: String
  let openAiModel: String
  let openAiTtsModel: String
  let openAiTtsVoice: String

  init(bundle: Bundle = .main) {
    let values = AppConfig.load(bundle: bundle)
    firebaseApiKey = values["firebaseApiKey"] as? String ?? ""
    firebaseProjectId = values["firebaseProjectId"] as? String ?? ""
    firebaseStorageBucket = values["firebaseStorageBucket"] as? String ?? ""
    firebaseMessagingSenderId = values["firebaseMessagingSenderId"] as? String ?? ""
    firebaseAppId = values["firebaseAppId"] as? String ?? ""
    firebaseMeasurementId = values["firebaseMeasurementId"] as? String ?? ""
    openAiApiKey = values["openAiApiKey"] as? String ?? ""
    openAiModel = values["openAiModel"] as? String ?? ""
    openAiTtsModel = values["openAiTtsModel"] as? String ?? ""
    openAiTtsVoice = values["openAiTtsVoice"] as? String ?? ""

    if let baseUrlString = values["nextApiBaseUrl"] as? String,
       let url = URL(string: baseUrlString),
       !Self.isLoopbackUrl(url) {
      nextApiBaseUrl = url
    } else {
      nextApiBaseUrl = Self.fallbackNextApiBaseUrl
    }

    let fallbackUrl = Self.fallbackNextApiBaseUrl
    nextApiBaseUrls = AppConfig.uniqueUrls([nextApiBaseUrl, fallbackUrl])
  }

  func resolvedRemoteURLString(_ rawValue: String?) -> String? {
    guard let rawValue else { return nil }
    let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }

    if let absolute = URL(string: trimmed), absolute.scheme != nil {
      if Self.isLoopbackUrl(absolute) {
        return replacingOrigin(of: absolute, with: nextApiBaseUrl)?.absoluteString ?? trimmed
      }
      return absolute.absoluteString
    }

    if let resolved = URL(string: trimmed, relativeTo: nextApiBaseUrl)?.absoluteURL {
      return resolved.absoluteString
    }

    return trimmed
  }

  private static func isLoopbackUrl(_ url: URL) -> Bool {
    guard let host = url.host?.lowercased() else { return false }
    return host == "localhost" || host == "127.0.0.1" || host == "::1"
  }

  private func replacingOrigin(of url: URL, with origin: URL) -> URL? {
    guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false),
          let originComponents = URLComponents(url: origin, resolvingAgainstBaseURL: false),
          let scheme = originComponents.scheme,
          let host = originComponents.host else {
      return nil
    }

    components.scheme = scheme
    components.host = host
    components.port = originComponents.port
    return components.url
  }

  func resolvedRemoteURLString(_ rawValue: String?) -> String? {
    guard let rawValue else { return nil }
    let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }

    if let absolute = URL(string: trimmed), absolute.scheme != nil {
      if Self.isLoopbackUrl(absolute) {
        return replacingOrigin(of: absolute, with: nextApiBaseUrl)?.absoluteString ?? trimmed
      }
      return absolute.absoluteString
    }

    if let resolved = URL(string: trimmed, relativeTo: nextApiBaseUrl)?.absoluteURL {
      return resolved.absoluteString
    }

    return trimmed
  }

  private static func isLoopbackUrl(_ url: URL) -> Bool {
    guard let host = url.host?.lowercased() else { return false }
    return host == "localhost" || host == "127.0.0.1" || host == "::1"
  }

  private func replacingOrigin(of url: URL, with origin: URL) -> URL? {
    guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false),
          let originComponents = URLComponents(url: origin, resolvingAgainstBaseURL: false),
          let scheme = originComponents.scheme,
          let host = originComponents.host else {
      return nil
    }

    components.scheme = scheme
    components.host = host
    components.port = originComponents.port
    return components.url
  }

  private static func load(bundle: Bundle) -> [String: Any] {
    guard let url = bundle.url(forResource: "AppConfig", withExtension: "plist"),
          let data = try? Data(contentsOf: url),
          let plist = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil) as? [String: Any] else {
      return [:]
    }
    return plist
  }

  private static func uniqueUrls(_ urls: [URL]) -> [URL] {
    var seen = Set<String>()
    var result: [URL] = []

    for url in urls {
      let key = url.absoluteString
      if seen.insert(key).inserted {
        result.append(url)
      }
    }

    return result
  }
}

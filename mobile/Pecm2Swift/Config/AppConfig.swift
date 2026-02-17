import Foundation

struct AppConfig {
  static let shared = AppConfig()

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
       let url = URL(string: baseUrlString) {
      nextApiBaseUrl = url
    } else {
      nextApiBaseUrl = URL(string: "https://pec-m2.vercel.app")!
    }

    let fallbackUrl = URL(string: "http://localhost:3000")!
    nextApiBaseUrls = AppConfig.uniqueUrls([nextApiBaseUrl, fallbackUrl])
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

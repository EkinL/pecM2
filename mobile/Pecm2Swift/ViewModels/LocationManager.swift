import Foundation
import CoreLocation

@MainActor
final class LocationManager: NSObject, ObservableObject, @preconcurrency CLLocationManagerDelegate {
  enum OneShotError: LocalizedError {
    case permissionDenied
    case timeout

    var errorDescription: String? {
      switch self {
      case .permissionDenied:
        return "Autorisation de localisation refusée."
      case .timeout:
        return "Impossible d'obtenir votre position (timeout)."
      }
    }
  }

  @Published var location: CLLocation?
  @Published var authorizationStatus: CLAuthorizationStatus = .notDetermined
  @Published var isUpdatingLocation = false
  @Published var errorMessage: String?

  private let manager = CLLocationManager()
  private var oneShotContinuation: CheckedContinuation<CLLocation, Error>?
  private var oneShotTimeoutTask: Task<Void, Never>?

  override init() {
    super.init()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    manager.distanceFilter = 250
    authorizationStatus = manager.authorizationStatus
  }

  func requestLocation() {
    if authorizationStatus == .notDetermined {
      manager.requestWhenInUseAuthorization()
    } else {
      manager.requestLocation()
    }
  }

  func requestPermissionIfNeeded() {
    if authorizationStatus == .notDetermined {
      manager.requestWhenInUseAuthorization()
    }
  }

  func requestOneShotLocation(timeoutSeconds: Double = 30) async throws -> CLLocation {
    if authorizationStatus == .notDetermined {
      manager.requestWhenInUseAuthorization()
    }

    guard authorizationStatus == .authorizedWhenInUse || authorizationStatus == .authorizedAlways || authorizationStatus == .notDetermined else {
      throw OneShotError.permissionDenied
    }

    return try await withCheckedThrowingContinuation { continuation in
      oneShotContinuation?.resume(throwing: CancellationError())
      oneShotContinuation = continuation

      oneShotTimeoutTask?.cancel()
      oneShotTimeoutTask = Task { [weak self] in
        guard let self else { return }
        try? await Task.sleep(nanoseconds: UInt64(timeoutSeconds * 1_000_000_000))
        await MainActor.run {
          guard let continuation = self.oneShotContinuation else { return }
          self.oneShotContinuation = nil
          continuation.resume(throwing: OneShotError.timeout)
        }
      }

      if authorizationStatus == .authorizedWhenInUse || authorizationStatus == .authorizedAlways {
        manager.requestLocation()
      }
    }
  }

  func startUpdatingLocation() {
    isUpdatingLocation = true
    if authorizationStatus == .notDetermined {
      manager.requestWhenInUseAuthorization()
      return
    }
    guard authorizationStatus == .authorizedWhenInUse || authorizationStatus == .authorizedAlways else {
      return
    }
    manager.startUpdatingLocation()
  }

  func stopUpdatingLocation() {
    isUpdatingLocation = false
    manager.stopUpdatingLocation()
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    authorizationStatus = manager.authorizationStatus
    if authorizationStatus == .authorizedWhenInUse || authorizationStatus == .authorizedAlways {
      if isUpdatingLocation {
        manager.startUpdatingLocation()
      } else {
        manager.requestLocation()
      }
      if oneShotContinuation != nil {
        manager.requestLocation()
      }
    } else if authorizationStatus == .denied || authorizationStatus == .restricted {
      errorMessage = "Localisation refusée."
      if let continuation = oneShotContinuation {
        oneShotContinuation = nil
        continuation.resume(throwing: OneShotError.permissionDenied)
      }
    }
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    location = locations.last
    if let value = location, let continuation = oneShotContinuation {
      oneShotContinuation = nil
      oneShotTimeoutTask?.cancel()
      continuation.resume(returning: value)
    }
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    errorMessage = error.localizedDescription
    if let continuation = oneShotContinuation {
      oneShotContinuation = nil
      oneShotTimeoutTask?.cancel()
      continuation.resume(throwing: error)
    }
  }
}

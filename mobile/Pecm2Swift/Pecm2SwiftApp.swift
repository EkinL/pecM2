import SwiftUI
import UIKit
import FirebaseCore
import GoogleSignIn

final class AppDelegate: NSObject, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    FirebaseApp.configure()
    AppTheme.apply()
    return true
  }

  func application(
    _ application: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    GIDSignIn.sharedInstance.handle(url)
  }
}

@main
struct Pecm2SwiftApp: App {
  @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate
  @StateObject private var session = SessionStore()
  @StateObject private var locationManager = LocationManager()

  var body: some Scene {
    WindowGroup {
      ZStack {
        AppColors.background.ignoresSafeArea()
        RootView()
      }
      .tint(AppColors.accent)
      .preferredColorScheme(.dark)
      .environmentObject(session)
      .environmentObject(locationManager)
    }
  }
}

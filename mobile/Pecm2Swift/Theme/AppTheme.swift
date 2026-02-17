import SwiftUI
import UIKit

enum AppTheme {
  static let cornerRadius: CGFloat = 14
  static let bubbleCornerRadius: CGFloat = 18
  static let strokeOpacity: CGFloat = 0.65

  static func apply() {
    // Navigation bar (no white / no blur by default)
    let nav = UINavigationBarAppearance()
    nav.configureWithOpaqueBackground()
    nav.backgroundColor = AppColors.uiBackground
    nav.titleTextAttributes = [.foregroundColor: AppColors.uiTextPrimary]
    nav.largeTitleTextAttributes = [.foregroundColor: AppColors.uiTextPrimary]
    nav.shadowColor = .clear

    let navigationBar = UINavigationBar.appearance()
    navigationBar.standardAppearance = nav
    navigationBar.scrollEdgeAppearance = nav
    navigationBar.compactAppearance = nav
    navigationBar.tintColor = AppColors.uiAccent

    // Tab bar
    let tab = UITabBarAppearance()
    tab.configureWithOpaqueBackground()
    tab.backgroundColor = AppColors.uiBackground
    tab.shadowColor = .clear
    tab.stackedLayoutAppearance.selected.iconColor = AppColors.uiAccent
    tab.stackedLayoutAppearance.selected.titleTextAttributes = [.foregroundColor: AppColors.uiAccent]
    tab.stackedLayoutAppearance.normal.iconColor = AppColors.uiTextSecondary
    tab.stackedLayoutAppearance.normal.titleTextAttributes = [.foregroundColor: AppColors.uiTextSecondary]

    let tabBar = UITabBar.appearance()
    tabBar.standardAppearance = tab
    tabBar.scrollEdgeAppearance = tab
    tabBar.tintColor = AppColors.uiAccent
    tabBar.unselectedItemTintColor = AppColors.uiTextSecondary

    // Lists / Forms background
    UITableView.appearance().backgroundColor = AppColors.uiBackground
    UITableViewCell.appearance().backgroundColor = .clear
    UICollectionView.appearance().backgroundColor = AppColors.uiBackground

    // Keyboard / inputs
    UITextField.appearance().keyboardAppearance = .default
  }
}

extension View {
  func appScreenBackground() -> some View {
    background(AppColors.background.ignoresSafeArea())
  }

  func appListBackground() -> some View {
    scrollContentBackground(.hidden)
      .background(AppColors.background)
  }

  func appCardStyle() -> some View {
    padding(12)
      .background(AppColors.backgroundSecondary)
      .overlay(
        RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous)
          .stroke(AppColors.inputBackground.opacity(AppTheme.strokeOpacity), lineWidth: 1)
      )
      .clipShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous))
      .shadow(color: .black.opacity(0.25), radius: 12, x: 0, y: 10)
  }

  func appInputStyle() -> some View {
    padding(.horizontal, 12)
      .padding(.vertical, 10)
      .background(AppColors.inputBackground)
      .overlay(
        RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous)
          .stroke(AppColors.backgroundSecondary.opacity(0.65), lineWidth: 1)
      )
      .clipShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous))
  }
}

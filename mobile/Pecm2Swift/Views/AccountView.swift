import Combine
import CoreLocation
import SwiftUI
import UIKit
import FirebaseAuth
import FirebaseFirestore

struct AccountView: View {
  @EnvironmentObject private var session: SessionStore
  @EnvironmentObject private var locationManager: LocationManager
  @EnvironmentObject private var accessibilitySettings: AppAccessibilitySettings
  @Environment(\.openURL) private var openURL
  @StateObject private var viewModel = AccountViewModel()
  @State private var errorMessage: String?
  @State private var toast: ToastData?
  @State private var showLogoutConfirm = false
  @State private var showDeleteAccountRequestConfirm = false
  @State private var isSubmittingDeletionRequest = false

  var body: some View {
    NavigationStack {
      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: 18) {
          if let profile = session.profile {
            profileHero(profile)
            identitySection(profile)
          } else {
            profilePlaceholder
          }

          locationSection
          pricingSection
          accessibilitySection
          securitySection

          Spacer(minLength: 24)
        }
        .padding(.horizontal, AppLayout.screenPadding)
        .padding(.top, 12)
        .padding(.bottom, 24)
        .mobileDesktopParity(maxWidth: AppLayout.maxContentWidth)
      }
      .navigationTitle("")
      .navigationBarTitleDisplayMode(.inline)
    }
    .appScreenBackground()
    .tint(AppColors.accent)
    .toast($toast)
    .onChange(of: errorMessage) { newValue in
      guard let newValue, !newValue.isEmpty else { return }
      toast = ToastData(style: .error, message: newValue)
    }
    .confirmationDialog("Se déconnecter ?", isPresented: $showLogoutConfirm, titleVisibility: .visible) {
      Button("Se déconnecter", role: .destructive) {
        do {
          try AuthService.signOut()
          Haptics.success()
        } catch {
          errorMessage = error.localizedDescription
          Haptics.error()
        }
      }
      Button("Annuler", role: .cancel) {}
    } message: {
      Text("Vous devrez vous reconnecter pour accéder à vos conversations et demandes.")
    }
    .confirmationDialog("Demander la suppression du compte ?", isPresented: $showDeleteAccountRequestConfirm, titleVisibility: .visible) {
      Button("Envoyer la demande", role: .destructive) {
        submitDeletionRequest()
      }
      Button("Annuler", role: .cancel) {}
    } message: {
      Text("Votre demande RGPD sera enregistrée et traitée par un administrateur.")
    }
    .onAppear {
      guard let uid = session.user?.uid else { return }
      viewModel.start(userId: uid, locationManager: locationManager)
      viewModel.applyProfile(session.profile)
      if isAdminRole(session.profile?.role) {
        viewModel.applyPricingMode(using: locationManager)
      } else {
        viewModel.ensureLiveLocationForReadonlyUsers(using: locationManager)
      }
    }
    .onDisappear {
      locationManager.stopUpdatingLocation()
      viewModel.stop()
    }
    .onReceive(session.$user) { user in
      guard let user else {
        locationManager.stopUpdatingLocation()
        return
      }
      viewModel.start(userId: user.uid, locationManager: locationManager)
    }
    .onReceive(session.$profile) { profile in
      viewModel.applyProfile(profile)
      guard session.user != nil else { return }
      if isAdminRole(profile?.role) {
        viewModel.applyPricingMode(using: locationManager)
      } else {
        viewModel.ensureLiveLocationForReadonlyUsers(using: locationManager)
      }
    }
  }

  @ViewBuilder
  private func profileHero(_ profile: UserProfile) -> some View {
    ZStack(alignment: .topLeading) {
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .fill(
          LinearGradient(
            colors: [AppColors.backgroundSecondary, AppColors.inputBackground.opacity(0.82)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          )
        )

      Circle()
        .fill(AppColors.accent.opacity(0.20))
        .frame(width: 190, height: 190)
        .offset(x: 180, y: -98)
        .blur(radius: 6)

      VStack(alignment: .leading, spacing: 14) {
        HStack(alignment: .top, spacing: 12) {
          ZStack {
            Circle()
              .fill(AppColors.inputBackground)
            Text(initials(for: displayName(profile: profile)))
              .font(AppTypography.headline)
              .foregroundColor(AppColors.textPrimary)
          }
          .frame(width: 48, height: 48)

          VStack(alignment: .leading, spacing: 4) {
            Label("Compte", systemImage: "person.crop.circle.fill")
              .font(AppTypography.caption.weight(.semibold))
              .foregroundColor(AppColors.textSecondary)

            Text(displayName(profile: profile))
              .font(AppTypography.title)
              .foregroundColor(AppColors.textPrimary)
              .lineLimit(2)

            Text((profile.mail ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Email indisponible" : (profile.mail ?? ""))
              .font(AppTypography.footnote)
              .foregroundColor(AppColors.textSecondary)
              .lineLimit(2)
          }
        }

        HStack(spacing: 8) {
          StatusPill(text: (profile.role ?? "client").capitalized, tint: AppColors.accent)
          StatusPill(text: "Tokens \(profile.tokens ?? 0)", tint: AppColors.textSecondary)
          StatusPill(text: "\(providerCount(profile: profile, authUser: session.user)) connexion(s)", tint: AppColors.textSecondary)
          Spacer(minLength: 0)
        }
      }
      .padding(16)
    }
    .overlay(
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .stroke(AppColors.inputBackground.opacity(0.72), lineWidth: 1)
    )
    .shadow(color: .black.opacity(0.24), radius: 14, x: 0, y: 10)
  }

  private var profilePlaceholder: some View {
    CardContainer(padding: 16) {
      VStack(alignment: .leading, spacing: 8) {
        Label("Compte", systemImage: "person.crop.circle.fill")
          .font(AppTypography.caption.weight(.semibold))
          .foregroundColor(AppColors.textSecondary)
        Text("Chargement du profil...")
          .font(AppTypography.title)
          .foregroundColor(AppColors.textPrimary)
        Text("Vos informations seront disponibles dans un instant.")
          .font(AppTypography.body)
          .foregroundColor(AppColors.textSecondary)
      }
    }
  }

  @ViewBuilder
  private func identitySection(_ profile: UserProfile) -> some View {
    sectionTitle(
      title: "Profil et identite",
      subtitle: "Consultez vos informations et vos methodes de connexion.",
      systemImage: "person.text.rectangle"
    )

    CardContainer(padding: 16) {
      VStack(alignment: .leading, spacing: 14) {
        AccountInfoRow(label: "Pseudo", value: profile.pseudo)
        dividerLine
        AccountInfoRow(label: "Email", value: profile.mail)
        dividerLine
        AccountInfoRow(label: "Role", value: profile.role ?? "client")
        dividerLine
        AccountInfoRow(label: "Tokens", value: String(profile.tokens ?? 0))
        dividerLine
        AccountConnectionsRow(providerIDs: resolvedProviderIDs(profile: profile, authUser: session.user))
      }
    }
  }

  private var locationSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      sectionTitle(
        title: "Localisation",
        subtitle: "Activez la localisation pour des tarifs adaptes a votre pays.",
        systemImage: "location.fill"
      )

      CardContainer(padding: 16) {
        VStack(alignment: .leading, spacing: 14) {
          if isAdminRole(session.profile?.role) {
            Picker("Tarification", selection: Binding(get: {
              viewModel.useLiveLocationPricing
            }, set: { enabled in
              viewModel.togglePricingMode(enabled, locationManager: locationManager)
            })) {
              Text("Localisation ON").tag(true)
              Text("Tarif de base").tag(false)
            }
            .pickerStyle(.segmented)
          }

          let showLiveLocationDetails = !isAdminRole(session.profile?.role) || viewModel.useLiveLocationPricing
          if showLiveLocationDetails {
            HStack(spacing: 8) {
              Label(locationStatusText, systemImage: locationStatusIconName)
                .font(AppTypography.caption.weight(.semibold))
                .foregroundColor(locationStatusTint)

              Spacer(minLength: 0)

              if viewModel.locationStatus == .denied {
                smallActionButton("Ouvrir Reglages") {
                  if let url = URL(string: UIApplication.openSettingsURLString) {
                    openURL(url)
                  }
                }
              }

              smallActionButton(viewModel.isRefreshingLocation ? "Actualisation..." : "Actualiser", isDisabled: viewModel.isRefreshingLocation) {
                if isAdminRole(session.profile?.role) {
                  viewModel.refreshPricing(using: locationManager)
                } else {
                  viewModel.refreshLocationForReadonlyUser(using: locationManager)
                }
              }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 9)
            .background(AppColors.background.opacity(0.35))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
              RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(AppColors.inputBackground.opacity(0.70), lineWidth: 1)
            )

            AccountInfoRow(label: "Pays", value: countryDisplayText)
            AccountInfoRow(label: "Derniere maj", value: lastUpdatedText)

            if let error = viewModel.locationError, !error.isEmpty {
              Text(error)
                .font(AppTypography.footnote)
                .foregroundColor(AppColors.error)
            }
          } else {
            HStack(spacing: 10) {
              StatusPill(text: "Tarif de base", tint: AppColors.textSecondary)
              Spacer(minLength: 0)
              smallActionButton("Actualiser") {
                viewModel.refreshPricing(using: locationManager)
              }
            }

            Text("Tarif de base applique (localisation desactivee).")
              .font(AppTypography.footnote)
              .foregroundColor(AppColors.textSecondary)
          }
        }
      }
    }
  }

  private var pricingSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      sectionTitle(
        title: "Tarifs tokens",
        subtitle: "Visualisez le cout des actions selon votre configuration.",
        systemImage: "tag.fill"
      )

      CardContainer(padding: 16) {
        VStack(alignment: .leading, spacing: 14) {
          HStack(spacing: 10) {
            if viewModel.tokenPriceLoading {
              ProgressView()
                .tint(AppColors.accent)
            } else {
              StatusPill(text: tokenPricingSourceText, tint: AppColors.textSecondary)
            }

            Spacer(minLength: 0)

            if viewModel.tokenPriceError != nil {
              smallActionButton("Reessayer") {
                viewModel.retryTokenPricing()
              }
            }
          }

          HStack(spacing: 10) {
            tokenMetricCard(title: "Texte", value: tokenTextDisplay ?? "—")
            tokenMetricCard(title: "Image", value: tokenImageDisplay ?? "—")
          }

          if !viewModel.useLiveLocationPricing {
            Text("Tarif de base applique (localisation desactivee).")
              .font(AppTypography.footnote)
              .foregroundColor(AppColors.textSecondary)
          } else if viewModel.countryCode == nil {
            Text("Tarif de base affiche (localisation en attente).")
              .font(AppTypography.footnote)
              .foregroundColor(AppColors.textSecondary)
          }

          if let error = viewModel.tokenPriceError, !error.isEmpty {
            Text(error)
              .font(AppTypography.footnote)
              .foregroundColor(AppColors.error)
          }
        }
      }
    }
  }

  private var accessibilitySection: some View {
    VStack(alignment: .leading, spacing: 10) {
      sectionTitle(
        title: "Accessibilite",
        subtitle: "Ajustez le theme, la taille du texte et les animations.",
        systemImage: "figure.wave"
      )

      CardContainer(padding: 16) {
        VStack(alignment: .leading, spacing: 16) {
          VStack(alignment: .leading, spacing: 8) {
            Text("Theme d'affichage")
              .font(AppTypography.caption.weight(.semibold))
              .foregroundColor(AppColors.textSecondary)

            Picker("Theme", selection: $accessibilitySettings.themePreference) {
              ForEach(AppThemePreference.allCases) { preference in
                Text(preference.label).tag(preference)
              }
            }
            .pickerStyle(.segmented)
          }

          dividerLine

          VStack(alignment: .leading, spacing: 8) {
            Toggle(isOn: $accessibilitySettings.reduceMotion) {
              Text("Reduire les animations")
                .font(AppTypography.body)
                .foregroundColor(AppColors.textPrimary)
            }
            .tint(AppColors.accent)

            Text("Limite les transitions et animations pour un affichage plus statique.")
              .font(AppTypography.footnote)
              .foregroundColor(AppColors.textSecondary)
          }

          dividerLine

          VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
              Text("Taille du texte")
                .font(AppTypography.body)
                .foregroundColor(AppColors.textPrimary)

              Spacer(minLength: 0)

              Text(accessibilitySettings.fontScaleLabel)
                .font(AppTypography.caption.weight(.semibold))
                .foregroundColor(AppColors.textSecondary)
            }

            Slider(
              value: Binding(
                get: { Double(accessibilitySettings.fontScaleIndex) },
                set: { accessibilitySettings.setFontScale(from: $0) }
              ),
              in: Double(AppAccessibilitySettings.minFontScaleIndex)...Double(AppAccessibilitySettings.maxFontScaleIndex),
              step: 1
            )
            .tint(AppColors.accent)

            HStack(spacing: 0) {
              ForEach(AppAccessibilitySettings.minFontScaleIndex...AppAccessibilitySettings.maxFontScaleIndex, id: \.self) { index in
                fontScaleMarker(for: index)
                if index < AppAccessibilitySettings.maxFontScaleIndex {
                  Spacer(minLength: 0)
                }
              }
            }

            HStack {
              Text("Petit")
                .font(AppTypography.footnote)
                .foregroundColor(AppColors.textSecondary)
              Spacer(minLength: 0)
              Text("Grand")
                .font(AppTypography.footnote)
                .foregroundColor(AppColors.textSecondary)
            }
          }
        }
      }
    }
  }

  private var securitySection: some View {
    VStack(alignment: .leading, spacing: 10) {
      sectionTitle(
        title: "Securite et donnees",
        subtitle: "Gerez votre session et vos droits RGPD.",
        systemImage: "lock.shield.fill"
      )

      CardContainer(padding: 16) {
        VStack(alignment: .leading, spacing: 14) {
          Text("Vous pouvez fermer votre session a tout moment.")
            .font(AppTypography.body)
            .foregroundColor(AppColors.textSecondary)

          termsOfUseNavigationRow

          DestructiveActionButton(title: "Se deconnecter", systemImage: "rectangle.portrait.and.arrow.right") {
            showLogoutConfirm = true
          }

          if let deletionStatusText {
            HStack(spacing: 8) {
              Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(AppColors.accent)
              Text(deletionStatusText)
                .font(AppTypography.footnote)
                .foregroundColor(AppColors.textSecondary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 9)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppColors.background.opacity(0.35))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
              RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(AppColors.inputBackground.opacity(0.70), lineWidth: 1)
            )
          }

          DestructiveActionButton(
            title: deletionActionTitle,
            systemImage: "trash.fill",
            isDisabled: isSubmittingDeletionRequest || hasDeletionRequest
          ) {
            showDeleteAccountRequestConfirm = true
          }

          Text("Conformement au RGPD, vous pouvez demander la suppression de votre compte et de vos donnees.")
            .font(AppTypography.footnote)
            .foregroundColor(AppColors.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
    }
  }

  private var termsOfUseNavigationRow: some View {
    NavigationLink {
      TermsOfUseView()
    } label: {
      HStack(spacing: 10) {
        Image(systemName: "doc.text.fill")
          .font(.system(size: 14, weight: .semibold))
          .foregroundColor(AppColors.accent)
          .frame(width: 18)

        VStack(alignment: .leading, spacing: 3) {
          Text("Conditions Generales d'utilisation")
            .font(AppTypography.body.weight(.semibold))
            .foregroundColor(AppColors.textPrimary)
            .lineLimit(2)

          Text("Consultez les regles d'utilisation et vos droits RGPD.")
            .font(AppTypography.footnote)
            .foregroundColor(AppColors.textSecondary)
            .lineLimit(2)
        }

        Spacer(minLength: 0)

        Image(systemName: "chevron.right")
          .font(.system(size: 12, weight: .semibold))
          .foregroundColor(AppColors.textSecondary)
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 10)
      .background(AppColors.background.opacity(0.35))
      .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .stroke(AppColors.inputBackground.opacity(0.70), lineWidth: 1)
      )
    }
    .buttonStyle(.plain)
  }

  private func sectionTitle(title: String, subtitle: String, systemImage: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Label(title, systemImage: systemImage)
        .font(AppTypography.headline)
        .foregroundColor(AppColors.textPrimary)

      Text(subtitle)
        .font(AppTypography.footnote)
        .foregroundColor(AppColors.textSecondary)
        .fixedSize(horizontal: false, vertical: true)
    }
  }

  private func fontScaleMarker(for index: Int) -> some View {
    VStack(spacing: 4) {
      Capsule()
        .fill(index == AppAccessibilitySettings.defaultFontScaleIndex ? AppColors.accent : AppColors.inputBackground.opacity(0.85))
        .frame(width: index == AppAccessibilitySettings.defaultFontScaleIndex ? 3 : 1, height: index == AppAccessibilitySettings.defaultFontScaleIndex ? 13 : 8)

      if index == AppAccessibilitySettings.defaultFontScaleIndex {
        Text("Defaut")
          .font(AppTypography.caption.weight(.semibold))
          .foregroundColor(AppColors.textSecondary)
      } else {
        Color.clear
          .frame(height: 14)
      }
    }
  }

  private var normalizedDeletionStatus: String {
    session.profile?.accountDeletionRequestStatus?
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased() ?? ""
  }

  private var hasDeletionRequest: Bool {
    if session.profile?.accountDeletionRequestedAt != nil {
      return true
    }
    return !normalizedDeletionStatus.isEmpty
  }

  private var deletionStatusText: String? {
    guard hasDeletionRequest else { return nil }

    let requestedAtText = session.profile?.accountDeletionRequestedAt?
      .formatted(date: .abbreviated, time: .shortened)
    let reviewedAtText = session.profile?.accountDeletionReviewedAt?
      .formatted(date: .abbreviated, time: .shortened)

    switch normalizedDeletionStatus {
    case "in_review", "processing":
      if let reviewedAtText {
        return "Demande prise en compte le \(reviewedAtText)."
      }
      if let requestedAtText {
        return "Demande en cours depuis le \(requestedAtText)."
      }
      return "Votre demande est en cours de traitement."
    case "completed", "done", "approved":
      if let reviewedAtText {
        return "Demande traitee le \(reviewedAtText)."
      }
      return "Votre demande a ete traitee."
    case "rejected", "declined":
      if let reviewedAtText {
        return "Demande refusee le \(reviewedAtText)."
      }
      return "Votre demande a ete refusee."
    default:
      if let requestedAtText {
        return "Demande envoyee le \(requestedAtText)."
      }
      return "Demande de suppression deja envoyee."
    }
  }

  private var deletionActionTitle: String {
    if isSubmittingDeletionRequest {
      return "Envoi en cours..."
    }
    switch normalizedDeletionStatus {
    case "in_review", "processing":
      return "Demande en cours de traitement"
    case "completed", "done", "approved":
      return "Demande traitee"
    case "rejected", "declined":
      return "Demande refusee"
    default:
      if hasDeletionRequest {
        return "Demande deja envoyee"
      }
      return "Demander la suppression du compte"
    }
  }

  private func submitDeletionRequest() {
    guard !isSubmittingDeletionRequest else { return }
    guard let user = session.user else {
      errorMessage = "Utilisateur non authentifie."
      return
    }

    isSubmittingDeletionRequest = true
    let contactEmail = session.profile?.mail ?? user.email
    let pseudo = session.profile?.pseudo

    Task {
      do {
        try await UserService.requestAccountDeletion(userId: user.uid, email: contactEmail, pseudo: pseudo)
        await LogService.log(
          action: "account_deletion_requested",
          targetType: "user",
          targetId: user.uid,
          details: ["source": "ios"]
        )
        await MainActor.run {
          isSubmittingDeletionRequest = false
          toast = ToastData(style: .success, message: "Demande envoyee. Nous revenons vers vous rapidement.")
          Haptics.success()
        }
      } catch {
        await MainActor.run {
          isSubmittingDeletionRequest = false
          errorMessage = error.localizedDescription
          Haptics.error()
        }
      }
    }
  }

  private func smallActionButton(_ title: String, isDisabled: Bool = false, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(title)
        .font(AppTypography.caption.weight(.semibold))
        .foregroundColor(AppColors.textPrimary)
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(AppColors.inputBackground)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .stroke(AppColors.inputBackground.opacity(0.75), lineWidth: 1)
        )
    }
    .buttonStyle(.plain)
    .disabled(isDisabled)
    .opacity(isDisabled ? 0.55 : 1)
  }

  private func tokenMetricCard(title: String, value: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title.uppercased())
        .font(AppTypography.caption.weight(.semibold))
        .foregroundColor(AppColors.textSecondary)
      Text(value)
        .font(AppTypography.headline)
        .foregroundColor(AppColors.textPrimary)
        .lineLimit(2)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(12)
    .background(AppColors.background.opacity(0.35))
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .stroke(AppColors.inputBackground.opacity(0.72), lineWidth: 1)
    )
  }

  private var dividerLine: some View {
    Rectangle()
      .fill(AppColors.inputBackground.opacity(0.75))
      .frame(height: 1)
  }

  private var locationStatusIconName: String {
    switch viewModel.locationStatus {
    case .active:
      return "location.fill"
    case .pending:
      return "hourglass"
    case .denied:
      return "location.slash"
    }
  }

  private var locationStatusText: String {
    switch viewModel.locationStatus {
    case .active:
      return "Localisation active"
    case .pending:
      return "En attente"
    case .denied:
      return "Refusée"
    }
  }

  private var locationStatusTint: Color {
    switch viewModel.locationStatus {
    case .active:
      return AppColors.accent
    case .pending:
      return AppColors.textSecondary
    case .denied:
      return AppColors.error
    }
  }

  private var countryDisplayText: String? {
    let label = viewModel.countryLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !label.isEmpty { return label }
    let code = viewModel.countryCode?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return code.isEmpty ? nil : code
  }

  private var lastUpdatedText: String? {
    guard let lastUpdated = viewModel.lastUpdated else { return nil }
    return lastUpdated.formatted(date: .abbreviated, time: .shortened)
  }

  private var tokenTextDisplay: String? {
    guard let value = viewModel.tokenPriceText else { return nil }
    return "\(value) token(s)"
  }

  private var tokenImageDisplay: String? {
    guard let value = viewModel.tokenPriceImage else { return nil }
    return "\(value) token(s)"
  }

  private var tokenPricingSourceText: String {
    switch viewModel.tokenPriceSource {
    case .base:
      return "Source: base"
    case .countryOverride:
      return "Source: pays"
    case .fallback:
      return "Source: defaut"
    }
  }

  private func isAdminRole(_ role: String?) -> Bool {
    (role ?? "client").trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "admin"
  }

  private func providerCount(profile: UserProfile, authUser: User?) -> Int {
    resolvedProviderIDs(profile: profile, authUser: authUser).count
  }

  private func initials(for name: String) -> String {
    let parts = name
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .split(separator: " ")
      .map(String.init)
      .filter { !$0.isEmpty }

    if parts.isEmpty {
      return "U"
    }
    if parts.count == 1 {
      return String(parts[0].prefix(1)).uppercased()
    }
    return (String(parts[0].prefix(1)) + String(parts[1].prefix(1))).uppercased()
  }
}

private func displayName(profile: UserProfile) -> String {
  let trimmedPseudo = profile.pseudo?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  if !trimmedPseudo.isEmpty { return trimmedPseudo }
  let trimmedMail = profile.mail?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  if !trimmedMail.isEmpty { return trimmedMail }
  return "Utilisateur"
}

private func resolvedProviderIDs(profile: UserProfile, authUser: User?) -> [String] {
  let fromProfile = (profile.providerIds ?? [])
    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
    .filter { !$0.isEmpty }
  let source = !fromProfile.isEmpty ? fromProfile : (authUser?.providerData ?? []).map { $0.providerID }

  var seen: Set<String> = []
  var result: [String] = []
  for provider in source {
    let normalized = provider.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalized.isEmpty else { continue }
    if seen.insert(normalized).inserted {
      result.append(normalized)
    }
  }
  return result
}

private struct TermsOfUseView: View {
  private let sections: [TermsOfUseSection] = [
    TermsOfUseSection(
      title: "1. Objet et acceptation",
      paragraphs: [
        "Les presentes Conditions Generales d'Utilisation (CGU) encadrent l'utilisation de l'application PECM2 (ci-apres le Service).",
        "Le responsable de traitement des donnees personnelles traitees via le Service est PECM2.",
        "En creant un compte ou en utilisant le Service, vous acceptez sans reserve les presentes CGU."
      ]
    ),
    TermsOfUseSection(
      title: "2. Acces au service et compte utilisateur",
      paragraphs: [
        "L'acces au Service est reserve aux utilisateurs disposant d'un compte actif.",
        "Vous etes responsable de la confidentialite de vos identifiants et des actions realisees depuis votre compte.",
        "Vous vous engagez a fournir des informations exactes et a les maintenir a jour."
      ]
    ),
    TermsOfUseSection(
      title: "3. Regles d'utilisation",
      paragraphs: [
        "Vous vous engagez a utiliser le Service de maniere loyale et conforme a la loi.",
        "Sont notamment interdits: usurpation d'identite, tentative d'acces non autorise, extraction massive de donnees, diffusion de contenus illicites.",
        "En cas de manquement grave, l'acces au Service peut etre suspendu ou limite."
      ]
    ),
    TermsOfUseSection(
      title: "4. Disponibilite du service",
      paragraphs: [
        "Le Service est fourni en mode \"best effort\". L'editeur met en oeuvre des moyens raisonnables pour assurer sa disponibilite et sa securite.",
        "Des interruptions temporaires peuvent survenir, notamment pour maintenance, evolution technique ou contraintes de securite."
      ]
    ),
    TermsOfUseSection(
      title: "5. Donnees personnelles traitees",
      paragraphs: [
        "Dans le cadre du Service, peuvent etre traitees: donnees d'identite et de contact, donnees de compte, historiques de demandes et conversations, donnees techniques de securite et de journalisation.",
        "Les donnees de localisation ne sont traitees que lorsque vous activez cette fonctionnalite."
      ]
    ),
    TermsOfUseSection(
      title: "6. Finalites et bases legales (RGPD)",
      paragraphs: [
        "Les traitements sont realises pour: fournir le Service, gerer les comptes, assurer la securite, prevenir la fraude, gerer les droits RGPD et respecter les obligations legales.",
        "Les bases legales sont: execution du contrat (utilisation du Service), interet legitime (securite/amelioration), consentement lorsque requis (ex: localisation), et obligation legale."
      ]
    ),
    TermsOfUseSection(
      title: "7. Hebergement et localisation des donnees",
      paragraphs: [
        "Les donnees du Service sont hebergees aux Pays-Bas, au sein de l'Espace economique europeen (EEE).",
        "En cas de transfert hors EEE impose par un sous-traitant technique, des garanties appropriees conformes au RGPD sont appliquees (ex: clauses contractuelles types)."
      ]
    ),
    TermsOfUseSection(
      title: "8. Duree de conservation",
      paragraphs: [
        "Les donnees sont conservees pendant la duree strictement necessaire aux finalites ci-dessus, puis supprimees ou anonymisees.",
        "Certaines donnees peuvent etre conservees plus longtemps en archivage pour repondre a une obligation legale, a une demande d'autorite competente ou a la defense de droits en justice."
      ]
    ),
    TermsOfUseSection(
      title: "9. Vos droits RGPD",
      paragraphs: [
        "Vous disposez des droits d'acces, de rectification, d'effacement, de limitation, d'opposition, et de portabilite lorsque ce droit est applicable.",
        "Vous pouvez egalement retirer votre consentement a tout moment pour les traitements fondes sur le consentement.",
        "Vous pouvez introduire une reclamation aupres de la CNIL si vous estimez que vos droits ne sont pas respectes."
      ]
    ),
    TermsOfUseSection(
      title: "10. Exercice de vos droits et suppression de compte",
      paragraphs: [
        "Une demande de suppression de compte est disponible dans l'application, depuis Profil > Securite et donnees.",
        "Les demandes RGPD sont traitees dans les meilleurs delais et, sauf cas particulier prevu par la loi, au plus tard dans un delai d'un mois."
      ]
    ),
    TermsOfUseSection(
      title: "11. Securite",
      paragraphs: [
        "L'editeur met en place des mesures techniques et organisationnelles appropriees pour proteger les donnees contre l'acces non autorise, l'alteration, la divulgation ou la destruction."
      ]
    ),
    TermsOfUseSection(
      title: "12. Propriete intellectuelle",
      paragraphs: [
        "Le Service, son code, ses interfaces, ses elements graphiques et ses contenus sont proteges par le droit de la propriete intellectuelle.",
        "Toute reproduction, extraction ou reutilisation non autorisee est interdite."
      ]
    ),
    TermsOfUseSection(
      title: "13. Responsabilite",
      paragraphs: [
        "L'utilisateur reste responsable de l'usage qu'il fait du Service et des contenus qu'il publie.",
        "L'editeur ne peut etre tenu responsable des dommages indirects, pertes de donnees ou indisponibilites temporaires du Service, sauf disposition legale contraire."
      ]
    ),
    TermsOfUseSection(
      title: "14. Modification des CGU",
      paragraphs: [
        "Les presentes CGU peuvent etre modifiees a tout moment pour tenir compte d'evolutions legales, reglementaires ou techniques.",
        "La version applicable est celle publiee dans l'application a la date d'utilisation du Service."
      ]
    ),
    TermsOfUseSection(
      title: "15. Droit applicable et contact",
      paragraphs: [
        "Les presentes CGU sont soumises au droit francais.",
        "Pour toute question relative aux CGU ou au traitement des donnees, utilisez le canal de support communique dans l'application."
      ]
    )
  ]

  var body: some View {
    ScrollView(showsIndicators: false) {
      VStack(alignment: .leading, spacing: 12) {
        CardContainer(padding: 16) {
          VStack(alignment: .leading, spacing: 8) {
            Text("Conditions Generales d'utilisation")
              .font(AppTypography.title)
              .foregroundColor(AppColors.textPrimary)

            Text("Version applicable au 18/02/2026")
              .font(AppTypography.caption.weight(.semibold))
              .foregroundColor(AppColors.textSecondary)

            Text("Ces CGU encadrent contractuellement l'utilisation du Service et les principales regles de traitement des donnees personnelles.")
              .font(AppTypography.footnote)
              .foregroundColor(AppColors.textSecondary)
              .fixedSize(horizontal: false, vertical: true)
          }
        }

        ForEach(sections) { section in
          CardContainer(padding: 16) {
            VStack(alignment: .leading, spacing: 6) {
              Text(section.title)
                .font(AppTypography.headline)
                .foregroundColor(AppColors.textPrimary)

              ForEach(Array(section.paragraphs.enumerated()), id: \.offset) { _, paragraph in
                Text(paragraph)
                  .font(AppTypography.body)
                  .foregroundColor(AppColors.textSecondary)
                  .fixedSize(horizontal: false, vertical: true)
                  .textSelection(.enabled)
              }
            }
          }
        }
      }
      .padding(.horizontal, AppLayout.screenPadding)
      .padding(.top, 12)
      .padding(.bottom, 24)
      .mobileDesktopParity(maxWidth: AppLayout.maxContentWidth)
    }
    .navigationTitle("CGU")
    .navigationBarTitleDisplayMode(.inline)
    .appScreenBackground()
  }
}

private struct TermsOfUseSection: Identifiable {
  let title: String
  let paragraphs: [String]

  var id: String { title }
}

private struct AccountConnectionsRow: View {
  let providerIDs: [String]

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("CONNEXIONS")
        .font(AppTypography.caption.weight(.semibold))
        .foregroundColor(AppColors.textSecondary)

      if providerIDs.isEmpty {
        Text("—")
          .font(AppTypography.body)
          .foregroundColor(AppColors.textPrimary)
      } else {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 8) {
            ForEach(providerIDs, id: \.self) { providerID in
              ConnectionProviderBadge(providerID: providerID)
            }
          }
          .padding(.vertical, 2)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct AccountInfoRow: View {
  let label: String
  let value: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(label.uppercased())
        .font(AppTypography.caption.weight(.semibold))
        .foregroundColor(AppColors.textSecondary)

      Text(displayValue)
        .font(AppTypography.body)
        .foregroundColor(AppColors.textPrimary)
        .fixedSize(horizontal: false, vertical: true)
        .textSelection(.enabled)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var displayValue: String {
    let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return trimmed.isEmpty ? "—" : trimmed
  }
}

private struct ConnectionProviderBadge: View {
  let providerID: String

  private var normalizedProviderID: String {
    providerID.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  }

  private var providerLabel: String {
    switch normalizedProviderID {
    case "google.com":
      return "Google"
    case "apple.com":
      return "Apple"
    case "password":
      return "Email"
    case "phone":
      return "Telephone"
    default:
      return providerID
    }
  }

  var body: some View {
    HStack(spacing: 6) {
      icon
      Text(providerLabel)
        .font(AppTypography.caption.weight(.semibold))
        .foregroundColor(AppColors.textPrimary)
        .lineLimit(1)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 7)
    .background(AppColors.background.opacity(0.35))
    .clipShape(Capsule())
    .overlay(
      Capsule()
        .stroke(AppColors.inputBackground.opacity(0.75), lineWidth: 1)
    )
  }

  @ViewBuilder
  private var icon: some View {
    switch normalizedProviderID {
    case "google.com":
      GoogleProviderIcon()
    case "apple.com":
      Image(systemName: "apple.logo")
        .font(.system(size: 12, weight: .semibold))
        .foregroundColor(AppColors.textPrimary)
    case "password":
      Image(systemName: "envelope.fill")
        .font(.system(size: 11, weight: .semibold))
        .foregroundColor(AppColors.textSecondary)
    case "phone":
      Image(systemName: "phone.fill")
        .font(.system(size: 11, weight: .semibold))
        .foregroundColor(AppColors.textSecondary)
    default:
      Image(systemName: "person.crop.circle.badge.checkmark")
        .font(.system(size: 12, weight: .semibold))
        .foregroundColor(AppColors.textSecondary)
    }
  }
}

private struct GoogleProviderIcon: View {
  var body: some View {
    ZStack {
      Circle()
        .fill(Color.white)
      Text("G")
        .font(.system(size: 10, weight: .bold, design: .rounded))
        .foregroundColor(Color(hex: "#4285F4"))
    }
    .frame(width: 16, height: 16)
    .overlay(
      Circle()
        .stroke(Color(hex: "#DADCE0"), lineWidth: 0.9)
    )
  }
}

private struct DestructiveActionButton: View {
  let title: String
  let systemImage: String
  var isDisabled: Bool = false
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 10) {
        Image(systemName: systemImage)
          .font(.system(size: 16, weight: .semibold))
        Text(title)
          .font(AppTypography.headline)
          .lineLimit(1)
        Spacer(minLength: 0)
      }
      .foregroundColor(AppColors.error)
      .frame(maxWidth: .infinity, minHeight: AppLayout.controlHeight)
      .padding(.horizontal, 14)
      .background(AppColors.backgroundSecondary)
      .clipShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous)
          .stroke(AppColors.error.opacity(0.35), lineWidth: 1)
      )
    }
    .buttonStyle(.plain)
    .disabled(isDisabled)
    .opacity(isDisabled ? 0.60 : 1)
  }
}

@MainActor
final class AccountViewModel: ObservableObject {
  enum LocationStatus: Equatable {
    case active
    case pending
    case denied
  }

  enum TokenPricingSource: Equatable {
    case base
    case countryOverride
    case fallback
  }

  @Published var useLiveLocationPricing = false
  @Published var locationStatus: LocationStatus = .pending
  @Published var countryLabel: String?
  @Published var countryCode: String?
  @Published var lastUpdated: Date?
  @Published var locationError: String?
  @Published var isRefreshingLocation = false

  @Published var tokenPriceText: Int?
  @Published var tokenPriceImage: Int?
  @Published var tokenPriceLoading = false
  @Published var tokenPriceError: String?
  @Published var tokenPriceSource: TokenPricingSource = .fallback

  private var cancellables: Set<AnyCancellable> = []
  private var tokenPricingListener: ListenerRegistration?
  private var tokenPricingSettings: TokenPricingSettings?

  private var userId: String?
  private var didBindLocationManager = false
  private var lastSavedUseLiveLocationPricing: Bool?

  private var lastLookupAt: Date?
  private var lastLookupLocation: CLLocation?
  private var lastSavedCountryCode: String?
  private var lookupTask: Task<Void, Never>?
  private var lastManualRefreshAt: Date?

  deinit {
    cancellables.removeAll()
    tokenPricingListener?.remove()
    lookupTask?.cancel()
  }

  func start(userId: String, locationManager: LocationManager) {
    if self.userId != userId {
      self.userId = userId
      lastLookupAt = nil
      lastLookupLocation = nil
      lastSavedCountryCode = nil
      lastSavedUseLiveLocationPricing = nil
      lookupTask?.cancel()
      countryLabel = nil
      countryCode = nil
      lastUpdated = nil
      useLiveLocationPricing = false
    }

    if !didBindLocationManager {
      didBindLocationManager = true
      bindLocationManager(locationManager)
    }

    listenTokenPricing()
  }

  func stop() {
    tokenPricingListener?.remove()
    tokenPricingListener = nil
    lookupTask?.cancel()
    isRefreshingLocation = false
  }

  func applyProfile(_ profile: UserProfile?) {
    guard let profile else {
      lastSavedUseLiveLocationPricing = nil
      useLiveLocationPricing = false
      countryLabel = nil
      countryCode = nil
      lastUpdated = nil
      lastSavedCountryCode = nil
      refreshTokenPricing()
      return
    }

    lastSavedUseLiveLocationPricing = profile.useLiveLocationPricing
    useLiveLocationPricing = profile.useLiveLocationPricing ?? false

    let normalizedCode = profile.countryCode?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    if let normalizedCode, !normalizedCode.isEmpty {
      countryCode = normalizedCode
      lastSavedCountryCode = normalizedCode
    }
    if let countryLabel = profile.countryLabel?.trimmingCharacters(in: .whitespacesAndNewlines), !countryLabel.isEmpty {
      self.countryLabel = countryLabel
    }
    if let countryUpdatedAt = profile.countryUpdatedAt {
      lastUpdated = countryUpdatedAt
    }
    refreshTokenPricing()
  }

	  func applyPricingMode(using locationManager: LocationManager) {
	    if useLiveLocationPricing {
	      let auth = locationManager.authorizationStatus
	      if auth == .authorizedWhenInUse || auth == .authorizedAlways {
	        locationManager.startUpdatingLocation()
	        if let location = locationManager.location {
	          performCountryLookupIfNeeded(location: location, force: false)
	        } else {
	          locationManager.requestLocation()
	        }
	      } else {
	        locationManager.stopUpdatingLocation()
	      }
	      refreshTokenPricing()
	      return
	    }

	    locationManager.stopUpdatingLocation()
	    refreshTokenPricing()
	  }

  func ensureLiveLocationForReadonlyUsers(using locationManager: LocationManager) {
    useLiveLocationPricing = true
    locationError = nil

    let auth = locationManager.authorizationStatus
    if auth == .authorizedWhenInUse || auth == .authorizedAlways {
      locationManager.startUpdatingLocation()
      if let location = locationManager.location {
        performCountryLookupIfNeeded(location: location, force: false)
      } else {
        locationManager.requestLocation()
      }
    } else {
      locationManager.stopUpdatingLocation()
    }

    refreshTokenPricing()
  }

  func retryTokenPricing() {
    listenTokenPricing()
  }

	  func togglePricingMode(_ enabled: Bool, locationManager: LocationManager) {
	    useLiveLocationPricing = enabled
	    if enabled {
	      locationError = nil
	      let auth = locationManager.authorizationStatus
	      if auth == .authorizedWhenInUse || auth == .authorizedAlways {
	        locationManager.startUpdatingLocation()
	        if let location = locationManager.location {
	          performCountryLookupIfNeeded(location: location, force: false)
	        } else {
	          locationManager.requestLocation()
	        }
	      } else {
	        locationManager.stopUpdatingLocation()
	      }
	      refreshTokenPricing()
	    } else {
	      locationError = nil
	      locationManager.stopUpdatingLocation()
	      refreshTokenPricing()
	    }

	    guard let userId else { return }

    if lastSavedUseLiveLocationPricing == enabled {
      return
    }
    if lastSavedUseLiveLocationPricing == nil && enabled == false {
      return
    }

    Task {
      do {
        try await UserService.updateUseLiveLocationPricing(userId: userId, enabled: enabled)
        lastSavedUseLiveLocationPricing = enabled
      } catch {
        locationError = error.localizedDescription
        useLiveLocationPricing = lastSavedUseLiveLocationPricing ?? false
      }
    }
  }

	  func refreshPricing(using locationManager: LocationManager) {
	    let now = Date()
	    if let lastManualRefreshAt, now.timeIntervalSince(lastManualRefreshAt) < 2 {
	      return
	    }
	    lastManualRefreshAt = now

	    tokenPriceError = nil

	    guard useLiveLocationPricing else {
	      listenTokenPricing()
	      refreshTokenPricing()
	      return
	    }

	    isRefreshingLocation = true
	    locationError = nil

		    Task {
		      defer { isRefreshingLocation = false }
		      do {
		        let location = try await locationManager.requestOneShotLocation()
		        locationManager.startUpdatingLocation()
		        performCountryLookupIfNeeded(location: location, force: true)
		      } catch is CancellationError {
		        // Ignoré
		      } catch {
		        let appliedFallback = await applyFallbackCountry()
		        if !appliedFallback {
		          locationError = error.localizedDescription
		        }
	      }
		    }
		  }

  func refreshLocationForReadonlyUser(using locationManager: LocationManager) {
    let now = Date()
    if let lastManualRefreshAt, now.timeIntervalSince(lastManualRefreshAt) < 2 {
      return
    }
    lastManualRefreshAt = now

    isRefreshingLocation = true
    locationError = nil

    Task {
      defer { isRefreshingLocation = false }
      do {
        let location = try await locationManager.requestOneShotLocation()
        locationManager.startUpdatingLocation()
        performCountryLookupIfNeeded(location: location, force: true)
      } catch is CancellationError {
        // Ignore
      } catch {
        let appliedFallback = await applyFallbackCountry()
        if !appliedFallback {
          locationError = error.localizedDescription
        }
      }
    }
  }

	  private struct IpWhoIsPayload: Decodable {
	    var success: Bool?
	    var message: String?
	    var country_code: String?
	    var country: String?
	  }

	  private func applyFallbackCountry() async -> Bool {
	    if let ipCountry = try? await lookupCountryFromIP() {
	      applyCountry(code: ipCountry.code, countryName: ipCountry.name)
	      return true
	    }

	    if let regionCode = Locale.current.region?.identifier.trimmingCharacters(in: .whitespacesAndNewlines),
	       regionCode.count == 2 {
	      let code = regionCode.uppercased()
	      let regionName = Locale.current.localizedString(forRegionCode: code)
	      applyCountry(code: code, countryName: regionName)
	      return true
	    }

	    return false
	  }

	  private func lookupCountryFromIP() async throws -> (code: String, name: String?) {
	    guard let url = URL(string: "https://ipwho.is/") else {
	      throw NSError(domain: "IP", code: 400, userInfo: [NSLocalizedDescriptionKey: "Endpoint IP invalide."])
	    }

	    let (data, response) = try await URLSession.shared.data(from: url)
	    guard let httpResponse = response as? HTTPURLResponse else {
	      throw NSError(domain: "IP", code: 500, userInfo: [NSLocalizedDescriptionKey: "Réponse IP invalide."])
	    }
	    guard (200..<300).contains(httpResponse.statusCode) else {
	      throw NSError(domain: "IP", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "Service IP indisponible."])
	    }

	    let payload = try JSONDecoder().decode(IpWhoIsPayload.self, from: data)
	    if payload.success == false {
	      let message = payload.message?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
	      throw NSError(
	        domain: "IP",
	        code: 502,
	        userInfo: [NSLocalizedDescriptionKey: message.isEmpty ? "Service IP indisponible." : message]
	      )
	    }

	    let rawCode = payload.country_code?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
	    guard rawCode.count == 2 else {
	      throw NSError(domain: "IP", code: 404, userInfo: [NSLocalizedDescriptionKey: "Pays indisponible via IP."])
	    }

	    let code = rawCode.uppercased()
	    let name = payload.country?.trimmingCharacters(in: .whitespacesAndNewlines)
	    return (code, (name?.isEmpty == false ? name : nil))
	  }

	  private func applyCountry(code: String, countryName: String?) {
	    let normalizedCode = code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
	    guard normalizedCode.count == 2 else { return }

	    let trimmedName = countryName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
	    let displayName = trimmedName.isEmpty ? normalizedCode : trimmedName

	    countryCode = normalizedCode
	    countryLabel = "\(displayName) (\(normalizedCode))"
	    lastUpdated = Date()
	    refreshTokenPricing()
	  }

	  private func bindLocationManager(_ locationManager: LocationManager) {
	    locationManager.$authorizationStatus
	      .receive(on: RunLoop.main)
	      .sink { [weak self] status in
	        guard let self else { return }
        self.updateLocationStatus(auth: status, hasLocation: locationManager.location != nil)
      }
      .store(in: &cancellables)

    locationManager.$errorMessage
      .receive(on: RunLoop.main)
      .sink { [weak self] message in
        guard let self else { return }
        let trimmed = message?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.locationError = trimmed.isEmpty ? nil : trimmed
      }
      .store(in: &cancellables)

    locationManager.$location
      .compactMap { $0 }
      .receive(on: RunLoop.main)
      .sink { [weak self] location in
        guard let self else { return }
        guard self.useLiveLocationPricing else { return }
        self.locationError = nil
        self.locationStatus = .active
        self.performCountryLookupIfNeeded(location: location, force: false)
      }
      .store(in: &cancellables)
  }

  private func updateLocationStatus(auth: CLAuthorizationStatus, hasLocation: Bool) {
    switch auth {
    case .authorizedAlways, .authorizedWhenInUse:
      locationStatus = hasLocation ? .active : .pending
    case .denied, .restricted:
      locationStatus = .denied
    case .notDetermined:
      locationStatus = .pending
    @unknown default:
      locationStatus = .pending
    }
  }

  private func performCountryLookupIfNeeded(location: CLLocation, force: Bool) {
    guard let userId else { return }

    let now = Date()
    if !force {
      if let lastLookupAt, now.timeIntervalSince(lastLookupAt) < 15 {
        return
      }

      if let lastLookupLocation,
         now.timeIntervalSince(lastLookupAt ?? .distantPast) < 10 * 60,
         location.distance(from: lastLookupLocation) < 1_000 {
        return
      }
    }

    lastLookupAt = now
    lastLookupLocation = location

    lookupTask?.cancel()
    lookupTask = Task {
      do {
        let payload = try await NextApiService.countryLookup(
          lat: location.coordinate.latitude,
          lng: location.coordinate.longitude
        )

        let rawCode = (payload["countryCode"] as? String) ?? ""
        let rawLabel = (payload["countryLabel"] as? String) ?? ""
        let normalizedCode = rawCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let normalizedLabel = rawLabel.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !normalizedCode.isEmpty else { return }

        countryCode = normalizedCode
        countryLabel = normalizedLabel.isEmpty ? normalizedCode : normalizedLabel
        lastUpdated = Date()
        refreshTokenPricing()

        guard lastSavedCountryCode != normalizedCode else { return }
        try await UserService.updateCountry(
          userId: userId,
          countryCode: normalizedCode,
          countryLabel: normalizedLabel.isEmpty ? normalizedCode : normalizedLabel
        )
        lastSavedCountryCode = normalizedCode
      } catch {
        locationError = error.localizedDescription
      }
    }
  }

  private func listenTokenPricing() {
    tokenPriceLoading = true
    tokenPriceError = nil
    tokenPricingListener?.remove()
    tokenPricingListener = TokenPricingService.listenSettings(
      onChange: { [weak self] settings in
        Task { @MainActor in
          guard let self else { return }
          self.tokenPricingSettings = settings
          self.tokenPriceLoading = false
          self.tokenPriceError = settings == nil ? "Tarifs tokens indisponibles." : nil
          self.refreshTokenPricing()
        }
      },
      onError: { [weak self] error in
        Task { @MainActor in
          guard let self else { return }
          self.tokenPriceLoading = false
          self.tokenPriceError = error.localizedDescription
          self.refreshTokenPricing()
        }
      }
    )
  }

  private func refreshTokenPricing() {
    let baseText = tokenPricingSettings?.base?.text ?? 1
    let baseImage = tokenPricingSettings?.base?.image ?? 5

    let uppercasedCode = useLiveLocationPricing ? countryCode?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() : nil
    let overridePricing = uppercasedCode.flatMap { tokenPricingSettings?.countries?[$0] }

    tokenPriceText = overridePricing?.text ?? baseText
    tokenPriceImage = overridePricing?.image ?? baseImage

    if tokenPricingSettings == nil {
      tokenPriceSource = .fallback
    } else if overridePricing != nil, (overridePricing?.text != nil || overridePricing?.image != nil) {
      tokenPriceSource = .countryOverride
    } else {
      tokenPriceSource = .base
    }
  }
}

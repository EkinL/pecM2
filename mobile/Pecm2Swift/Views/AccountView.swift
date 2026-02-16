import Combine
import CoreLocation
import SwiftUI
import UIKit
import FirebaseAuth
import FirebaseFirestore

struct AccountView: View {
  @EnvironmentObject private var session: SessionStore
  @EnvironmentObject private var locationManager: LocationManager
  @Environment(\.openURL) private var openURL
  @StateObject private var viewModel = AccountViewModel()
  @State private var errorMessage: String?
  @State private var toast: ToastData?
  @State private var showLogoutConfirm = false

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          if let profile = session.profile {
            VStack(alignment: .leading, spacing: 10) {
              SectionHeader(title: "Profil", systemImage: "person.crop.circle")
              CardContainer {
                VStack(alignment: .leading, spacing: 10) {
                  Text(displayName(profile: profile))
                    .font(AppTypography.title)
                    .foregroundColor(AppColors.textPrimary)
                    .lineLimit(2)

                  HStack(spacing: 10) {
                    StatusPill(text: (profile.role ?? "client").capitalized, tint: AppColors.accent)
                    StatusPill(text: "Tokens: \(profile.tokens ?? 0)", tint: AppColors.textSecondary)
                  }

                  Divider()
                    .overlay(AppColors.inputBackground.opacity(0.8))

                  VStack(alignment: .leading, spacing: 8) {
                    AccountInfoRow(label: "Email", value: profile.mail)
                    AccountInfoRow(label: "Rôle", value: profile.role ?? "client")
                    AccountInfoRow(label: "Tokens", value: String(profile.tokens ?? 0))
                    AccountInfoRow(label: "Providers", value: providerIdsText(profile: profile, authUser: session.user))
                  }
                }
              }
            }
          }

	          VStack(alignment: .leading, spacing: 10) {
	            SectionHeader(title: "Localisation", systemImage: "location.fill")
	            CardContainer {
	              VStack(alignment: .leading, spacing: 10) {
	                Picker("Tarification", selection: Binding(get: {
	                  viewModel.useLiveLocationPricing
	                }, set: { enabled in
	                  viewModel.togglePricingMode(enabled, locationManager: locationManager)
	                })) {
	                  Text("Localisation ON").tag(true)
	                  Text("Tarif de base").tag(false)
	                }
	                .pickerStyle(.segmented)

		                if viewModel.useLiveLocationPricing {
		                  HStack(spacing: 10) {
		                    StatusPill(text: locationStatusText, tint: locationStatusTint)
		                    Spacer(minLength: 0)

		                    if viewModel.locationStatus == .denied {
		                      Button("Ouvrir Réglages") {
		                        if let url = URL(string: UIApplication.openSettingsURLString) {
		                          openURL(url)
		                        }
		                      }
		                      .font(AppTypography.caption.weight(.semibold))
		                      .tint(AppColors.accent)
		                    }

		                    Button(viewModel.isRefreshingLocation ? "Actualisation..." : "Actualiser") {
		                      viewModel.refreshPricing(using: locationManager)
		                    }
		                    .disabled(viewModel.isRefreshingLocation)
		                    .font(AppTypography.caption.weight(.semibold))
		                    .tint(AppColors.accent)
		                  }

                  Divider()
                    .overlay(AppColors.inputBackground.opacity(0.8))

                  VStack(alignment: .leading, spacing: 8) {
                    AccountInfoRow(label: "Pays", value: countryDisplayText)
                    AccountInfoRow(label: "Maj", value: lastUpdatedText)
                  }

                  if let error = viewModel.locationError, !error.isEmpty {
                    Text(error)
                      .font(AppTypography.footnote)
                      .foregroundColor(AppColors.error)
                  }
                } else {
                  HStack(spacing: 10) {
                    StatusPill(text: "Tarif de base", tint: AppColors.textSecondary)
                    Spacer(minLength: 0)
                    Button("Actualiser") {
                      viewModel.refreshPricing(using: locationManager)
                    }
                    .font(AppTypography.caption.weight(.semibold))
                    .tint(AppColors.accent)
                  }
                  Text("Tarif de base appliqué (localisation désactivée).")
                    .font(AppTypography.footnote)
                    .foregroundColor(AppColors.textSecondary)
                }
              }
            }
          }

          VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Tarif tokens (selon localisation)", systemImage: "tag.fill")
            CardContainer {
              VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                  if viewModel.tokenPriceLoading {
                    ProgressView()
                      .tint(AppColors.accent)
                  } else {
                    StatusPill(text: tokenPricingSourceText, tint: AppColors.textSecondary)
                  }
                  Spacer(minLength: 0)
                  if viewModel.tokenPriceError != nil {
                    Button("Réessayer") {
                      viewModel.retryTokenPricing()
                    }
                    .font(AppTypography.caption.weight(.semibold))
                    .tint(AppColors.accent)
                  }
                }

                Divider()
                  .overlay(AppColors.inputBackground.opacity(0.8))

                VStack(alignment: .leading, spacing: 8) {
                  AccountInfoRow(label: "Texte", value: tokenTextDisplay)
                  AccountInfoRow(label: "Image", value: tokenImageDisplay)
                }

                if !viewModel.useLiveLocationPricing {
                  Text("Tarif de base appliqué (localisation désactivée).")
                    .font(AppTypography.footnote)
                    .foregroundColor(AppColors.textSecondary)
                } else if viewModel.countryCode == nil {
                  Text("Tarif de base affiché (localisation en attente).")
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

          VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Sécurité", systemImage: "lock.fill")
            CardContainer {
              VStack(spacing: 12) {
                DestructiveActionButton(title: "Se déconnecter", systemImage: "rectangle.portrait.and.arrow.right") {
                  showLogoutConfirm = true
                }
              }
            }
          }

          Spacer(minLength: 24)
        }
        .padding(AppLayout.screenPadding)
        .mobileDesktopParity(maxWidth: AppLayout.maxContentWidth)
      }
      .navigationTitle("Compte")
      .navigationBarTitleDisplayMode(.large)
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
    .onAppear {
      guard let uid = session.user?.uid else { return }
      viewModel.start(userId: uid, locationManager: locationManager)
      viewModel.applyProfile(session.profile)
      viewModel.applyPricingMode(using: locationManager)
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
      return "Source: override pays"
    case .fallback:
      return "Source: défaut"
    }
  }
}

private func displayName(profile: UserProfile) -> String {
  let trimmedPseudo = profile.pseudo?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  if !trimmedPseudo.isEmpty { return trimmedPseudo }
  let trimmedMail = profile.mail?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  if !trimmedMail.isEmpty { return trimmedMail }
  return "Utilisateur"
}

private func providerIdsText(profile: UserProfile, authUser: User?) -> String {
  let fromProfile = (profile.providerIds ?? [])
    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
    .filter { !$0.isEmpty }
  if !fromProfile.isEmpty { return fromProfile.joined(separator: ", ") }

  let fromAuth = (authUser?.providerData ?? []).map { $0.providerID }
  if !fromAuth.isEmpty { return fromAuth.joined(separator: ", ") }

  return "—"
}

private struct AccountInfoRow: View {
  let label: String
  let value: String?

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 10) {
      Text(label)
        .font(AppTypography.caption.weight(.semibold))
        .foregroundColor(AppColors.textSecondary)
        .frame(width: 90, alignment: .leading)
      Text(displayValue)
        .font(AppTypography.body)
        .foregroundColor(AppColors.textPrimary)
        .lineLimit(2)
        .textSelection(.enabled)
      Spacer(minLength: 0)
    }
  }

  private var displayValue: String {
    let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return trimmed.isEmpty ? "—" : trimmed
  }
}

private struct DestructiveActionButton: View {
  let title: String
  let systemImage: String
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

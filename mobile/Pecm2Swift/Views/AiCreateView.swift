import SwiftUI

struct AiCreateView: View {
  @EnvironmentObject private var session: SessionStore
  @Environment(\.dismiss) private var dismiss

  private let mentalityOptions = [
    "Coach",
    "Amoureux",
    "Sarcastique",
    "Philosophe",
    "Motivant",
    "Zen",
    "Protecteur",
    "Ludique",
    "Autre"
  ]

  private let voiceOptions = [
    "Calme",
    "Energique",
    "Chaleureuse",
    "Grave",
    "Posee",
    "Rythmee",
    "Autre"
  ]

  private let voiceRhythmOptions = [
    "Lent",
    "Modere",
    "Rapide",
    "Percutant",
    "Progressif",
    "Autre"
  ]

  private let genderOptions = ["Femme", "Homme", "Neutre", "Autre"]
  private let skinOptions = ["Claire", "Halee", "Foncee", "Ebene", "Autre"]
  private let hairOptions = ["Court", "Long", "Boucle", "Lisse", "Afro", "Tresse", "Autre"]
  private let outfitOptions = ["Casual", "Chic", "Sport", "Tech", "Minimal", "Autre"]
  private let ethnicityOptions = ["Europeenne", "Latine", "Africaine", "Asiatique", "Moyen-Orient", "Mixte", "Autre"]

  @State private var name = ""
  @State private var mentality = ""
  @State private var mentalityCustom = ""
  @State private var voice = ""
  @State private var voiceCustom = ""
  @State private var voiceRhythm = ""
  @State private var voiceRhythmCustom = ""
  @State private var gender = ""
  @State private var genderCustom = ""
  @State private var skin = ""
  @State private var skinCustom = ""
  @State private var hair = ""
  @State private var hairCustom = ""
  @State private var outfit = ""
  @State private var outfitCustom = ""
  @State private var ethnicity = ""
  @State private var ethnicityCustom = ""
  @State private var details = ""
  @State private var visibility = "public"
  @State private var accessType = "free"
  @State private var errorMessage: String?
  @State private var successMessage: String?
  @State private var isLoading = false

  var body: some View {
    Form {
      Section(header: Text("Identité")) {
        TextField("Nom", text: $name)

        Picker("Mentalité", selection: $mentality) {
          Text("Sélectionner").tag("")
          ForEach(mentalityOptions, id: \.self) { option in
            Text(option).tag(option)
          }
        }
        .pickerStyle(.menu)
        .onChange(of: mentality) { newValue in
          if newValue != "Autre" {
            mentalityCustom = ""
          }
        }
        if mentality == "Autre" {
          TextField("Autre (préciser)", text: $mentalityCustom)
        }

        Picker("Voix", selection: $voice) {
          Text("Sélectionner").tag("")
          ForEach(voiceOptions, id: \.self) { option in
            Text(option).tag(option)
          }
        }
        .pickerStyle(.menu)
        .onChange(of: voice) { newValue in
          if newValue != "Autre" {
            voiceCustom = ""
          }
        }
        if voice == "Autre" {
          TextField("Autre (préciser)", text: $voiceCustom)
        }

        Picker("Rythme de voix", selection: $voiceRhythm) {
          Text("Sélectionner").tag("")
          ForEach(voiceRhythmOptions, id: \.self) { option in
            Text(option).tag(option)
          }
        }
        .pickerStyle(.menu)
        .onChange(of: voiceRhythm) { newValue in
          if newValue != "Autre" {
            voiceRhythmCustom = ""
          }
        }
        if voiceRhythm == "Autre" {
          TextField("Autre (préciser)", text: $voiceRhythmCustom)
        }
      }

      Section(header: Text("Apparence")) {
        Picker("Genre", selection: $gender) {
          Text("Sélectionner").tag("")
          ForEach(genderOptions, id: \.self) { option in
            Text(option).tag(option)
          }
        }
        .pickerStyle(.menu)
        .onChange(of: gender) { newValue in
          if newValue != "Autre" {
            genderCustom = ""
          }
        }
        if gender == "Autre" {
          TextField("Autre (préciser)", text: $genderCustom)
        }

        Picker("Peau", selection: $skin) {
          Text("Sélectionner").tag("")
          ForEach(skinOptions, id: \.self) { option in
            Text(option).tag(option)
          }
        }
        .pickerStyle(.menu)
        .onChange(of: skin) { newValue in
          if newValue != "Autre" {
            skinCustom = ""
          }
        }
        if skin == "Autre" {
          TextField("Autre (préciser)", text: $skinCustom)
        }

        Picker("Cheveux", selection: $hair) {
          Text("Sélectionner").tag("")
          ForEach(hairOptions, id: \.self) { option in
            Text(option).tag(option)
          }
        }
        .pickerStyle(.menu)
        .onChange(of: hair) { newValue in
          if newValue != "Autre" {
            hairCustom = ""
          }
        }
        if hair == "Autre" {
          TextField("Autre (préciser)", text: $hairCustom)
        }

        Picker("Tenue", selection: $outfit) {
          Text("Sélectionner").tag("")
          ForEach(outfitOptions, id: \.self) { option in
            Text(option).tag(option)
          }
        }
        .pickerStyle(.menu)
        .onChange(of: outfit) { newValue in
          if newValue != "Autre" {
            outfitCustom = ""
          }
        }
        if outfit == "Autre" {
          TextField("Autre (préciser)", text: $outfitCustom)
        }

        Picker("Ethnie", selection: $ethnicity) {
          Text("Sélectionner").tag("")
          ForEach(ethnicityOptions, id: \.self) { option in
            Text(option).tag(option)
          }
        }
        .pickerStyle(.menu)
        .onChange(of: ethnicity) { newValue in
          if newValue != "Autre" {
            ethnicityCustom = ""
          }
        }
        if ethnicity == "Autre" {
          TextField("Autre (préciser)", text: $ethnicityCustom)
        }

        TextField("Détails", text: $details)
      }

      Section(header: Text("Visibilité")) {
        Picker("Visibilité", selection: $visibility) {
          Text("Public").tag("public")
          Text("Privé").tag("private")
        }
        .pickerStyle(.segmented)

        Picker("Accès", selection: $accessType) {
          Text("Gratuit").tag("free")
          Text("Payant").tag("paid")
        }
        .pickerStyle(.segmented)
      }

      if let errorMessage {
        Text(errorMessage)
          .foregroundColor(AppColors.error)
      }
      if let successMessage {
        Text(successMessage).foregroundColor(.green)
      }

      Button("Créer") {
        Task { await createProfile() }
      }
      .disabled(isLoading || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }
    .scrollContentBackground(.hidden)
    .background(AppColors.background)
    .tint(AppColors.accent)
    .navigationTitle("Créer une IA")
  }

  private func createProfile() async {
    isLoading = true
    errorMessage = nil
    successMessage = nil

    let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmedName.isEmpty {
      errorMessage = "Le nom est obligatoire."
      isLoading = false
      return
    }

    let normalizedMentality = resolveCustomValue(choice: mentality, custom: mentalityCustom)
    let normalizedVoice = resolveCustomValue(choice: voice, custom: voiceCustom)
    let normalizedVoiceRhythm = resolveCustomValue(choice: voiceRhythm, custom: voiceRhythmCustom)
    let normalizedGender = resolveCustomValue(choice: gender, custom: genderCustom)
    let normalizedSkin = resolveCustomValue(choice: skin, custom: skinCustom)
    let normalizedHair = resolveCustomValue(choice: hair, custom: hairCustom)
    let normalizedOutfit = resolveCustomValue(choice: outfit, custom: outfitCustom)
    let normalizedEthnicity = resolveCustomValue(choice: ethnicity, custom: ethnicityCustom)

    let finalMentality = normalizedMentality.isEmpty ? randomOption(from: mentalityOptions) : normalizedMentality
    let finalVoice = normalizedVoice.isEmpty ? randomOption(from: voiceOptions) : normalizedVoice
    let finalVoiceRhythm = normalizedVoiceRhythm.isEmpty ? randomOption(from: voiceRhythmOptions) : normalizedVoiceRhythm

    let finalGender = normalizedGender.isEmpty ? randomOption(from: genderOptions) : normalizedGender
    let finalSkin = normalizedSkin.isEmpty ? randomOption(from: skinOptions) : normalizedSkin
    let finalHair = normalizedHair.isEmpty ? randomOption(from: hairOptions) : normalizedHair
    let finalOutfit = normalizedOutfit.isEmpty ? randomOption(from: outfitOptions) : normalizedOutfit
    let finalEthnicity = normalizedEthnicity.isEmpty ? randomOption(from: ethnicityOptions) : normalizedEthnicity

    let look = AiLook(
      gender: finalGender.isEmpty ? nil : finalGender,
      skin: finalSkin.isEmpty ? nil : finalSkin,
      hair: finalHair.isEmpty ? nil : finalHair,
      hairColor: nil,
      eyeColor: nil,
      age: nil,
      height: nil,
      bodyType: nil,
      facialHair: nil,
      makeup: nil,
      glasses: nil,
      accessories: nil,
      piercings: nil,
      tattoos: nil,
      scars: nil,
      outfit: finalOutfit.isEmpty ? nil : finalOutfit,
      ethnicity: finalEthnicity.isEmpty ? nil : finalEthnicity,
      details: details.isEmpty ? nil : details
    )

    do {
      try await AiProfileService.addProfile(
        name: trimmedName,
        mentality: finalMentality,
        voice: finalVoice,
        voiceRhythm: finalVoiceRhythm,
        look: look,
        visibility: visibility,
        accessType: accessType
      )
      successMessage = "Profil IA créé. Validation admin requise."
      dismiss()
    } catch {
      errorMessage = error.localizedDescription
    }

    isLoading = false
  }

  private func resolveCustomValue(choice: String, custom: String) -> String {
    if choice == "Autre" {
      return custom
    }
    return choice
  }

  private func randomOption(from options: [String]) -> String {
    let candidates = options.filter { $0 != "Autre" }
    return candidates.randomElement() ?? ""
  }
}

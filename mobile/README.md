# PECM2 Swift (iOS)

Cette app iOS (SwiftUI + Firebase) consomme les mêmes données que le projet Next.js.
Elle utilise les routes API Next (`/api/...`) comme backend pour l’IA et la tarification.

## Démarrage

1. Ouvrir `mobile/Pecm2Swift.xcodeproj`
2. Vérifier `Pecm2Swift/Resources/AppConfig.plist`
   - `nextApiBaseUrl` doit pointer vers votre serveur Next (LAN ou production)
   - Les valeurs Firebase proviennent de votre projet Firebase (ou de la config web dans `next/.env.local`)
3. Lancer sur simulateur ou device

## Notes importantes

- Pour iOS, Firebase recommande l’utilisation d’un `GoogleService-Info.plist` généré depuis la console Firebase (app iOS). Vous pouvez remplacer la configuration actuelle par ce fichier si besoin.
- Google Sign-In nécessite un `clientID` iOS (depuis Firebase console) + configuration des URL Types.
- L’API IA utilise les routes Next.js, la clé OpenAI reste côté serveur.

## Structure

- `Pecm2Swift/` : code SwiftUI + services Firebase
- `project.yml` : configuration XcodeGen
- `fastlane/` : lanes de build/signature/deploiement TestFlight

## CD TestFlight (Fastlane + GitHub Actions)

Le workflow `.github/workflows/ios-cd.yml` publie automatiquement sur TestFlight a chaque push sur `main` (et en manuel via `workflow_dispatch`).

### 1. Initialiser les certificats/profils avec `match`

Depuis `mobile/`, lancez localement:

```bash
bundle install
bundle exec fastlane match appstore --app_identifier com.pecm2.app --git_url <URL_DU_REPO_MATCH>
```

Cela cree le certificat et le provisioning profile App Store dans votre repo `match`.

### 2. Ajouter les secrets GitHub du repo

- `MATCH_GIT_URL`: URL du repo `match` (HTTPS ou SSH)
- `MATCH_PASSWORD`: mot de passe de chiffrement `match`
- `APP_STORE_CONNECT_API_KEY_ID`: Key ID de la cle API App Store Connect
- `APP_STORE_CONNECT_ISSUER_ID`: Issuer ID de la cle API App Store Connect
- `APP_STORE_CONNECT_API_KEY_BASE64`: contenu du fichier `.p8` encode en base64
- `APPLE_TEAM_ID`: Team ID Apple Developer (optionnel mais recommande)

Exemple pour generer `APP_STORE_CONNECT_API_KEY_BASE64`:

```bash
base64 -i AuthKey_XXXXXX.p8 | tr -d '\n'
```

Variable optionnelle:

- `MATCH_GIT_BRANCH` (GitHub Variables): branche du repo `match` (defaut `main`)

### 3. Lancer manuellement (optionnel)

```bash
bundle exec fastlane ios beta
```

La lane:

- recupere la signature via `match`
- incremente automatiquement le build number
- build l'IPA App Store
- envoie le build sur TestFlight

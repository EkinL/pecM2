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

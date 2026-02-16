# PECM2-1 - Recap ultra complet (fiche projet)

## 1) Resume executif
PECM2-1 est une plateforme multi-clients (web Next.js + app iOS SwiftUI) basee sur Firebase.
Le coeur produit est un catalogue d'IA conversationnelles, des conversations payees en tokens, et un module de demandes (matching client/admin).
L'IA (texte, image, TTS) est fournie via des routes API Next.js, consommees par le web et par iOS.

Objectifs clefs :
- Permettre a un client de creer des profils IA (personnalite + apparence) et de discuter avec eux.
- Moneter les messages via un systeme de tokens, avec tarifs dynamiques par pays.
- Offrir un backoffice admin pour moderer les IA, suivre les conversations, gerer les tarifs.

## 2) Architecture generale
- Client web : `next/` (Next.js App Router, pages client, Firebase Auth + Firestore + Functions)
- Client iOS : `mobile/` (SwiftUI, Firebase Auth + Firestore)
- Backend IA : routes Next.js `/api/...` (OpenAI + fallback HuggingFace)
- Donnees : Firestore (collections partagees par web et iOS)

Flux principal (simplifie) :
1) Auth utilisateur (Firebase)
2) Creation profil utilisateur (collection `utilisateurs`)
3) Creation profil IA (collection `iaProfiles`)
4) Validation admin + generation avatar IA (OpenAI Images)
5) Creation conversation (collection `conversations`)
6) Envoi messages avec debit tokens (transaction Firestore)
7) Reponse IA via `/api/ai/reply` ou `/api/ai/image`

## 3) Stack technique
Web (Next.js) :
- Next.js App Router (pages client)
- Firebase Auth / Firestore / Functions
- Tailwind CSS
- OpenAI API (chat, images, TTS) + HuggingFace (fallback texte)
- OpenStreetMap Nominatim (reverse geocoding)

iOS (SwiftUI) :
- SwiftUI
- Firebase Auth / Firestore
- Appels HTTP vers les routes Next `/api/...`

## 4) Configuration et environnements
### 4.1 Web (Next.js)
Fichier de reference : `next/.env.local` (ou `next/.env`) (non versionné).
Variables attendues (valeurs a fournir dans `next/.env.local`) :
- Firebase (client):
  - `NEXT_PUBLIC_FIREBASE_API_KEY`
  - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
  - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
  - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
  - `NEXT_PUBLIC_FIREBASE_APP_ID`
  - `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`
- OpenAI / HF:
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL` (defaut: gpt-4o-mini)
  - `OPENAI_TTS_MODEL` (defaut: gpt-4o-mini-tts)
  - `OPENAI_TTS_VOICE` (defaut: alloy)
  - `OPENAI_IMAGE_MODEL` (defaut: gpt-image-1.5)
  - `OPENAI_IMAGE_QUALITY` (optionnel)
  - `OPENAI_IMAGE_STYLE` (optionnel)
  - `HUGGINGFACE_API_KEY` / `HUGGINGFACE_MODEL` (fallback texte)
- Firebase Admin (upload images):
  - `FIREBASE_SERVICE_ACCOUNT_KEY` (JSON)

Note securite : ne pas stocker de cles reelles dans le repo. Utiliser des placeholders.

### 4.2 iOS (SwiftUI)
Fichier : `mobile/Pecm2Swift/Resources/AppConfig.plist`
Champs utilises :
- Firebase config (apiKey, projectId, storageBucket, etc.)
- `nextApiBaseUrl` : base URL du serveur Next (LAN ou production)
- `openAiApiKey`, `openAiModel`, `openAiTtsModel`, `openAiTtsVoice`

Note : le design cible prevoit que la cle OpenAI reste cote serveur (Next). Le champ iOS est present mais devrait rester vide en prod.

### 4.3 iOS Info.plist
- `NSLocationWhenInUseUsageDescription` (localisation requise pour tarifs tokens / conversations)

## 5) Donnees Firestore (schema)
Fichier reference web : `next/src/app/firebase/collections.ts`
Fichier reference iOS : `mobile/Pecm2Swift/Services/*`

### 5.1 `utilisateurs`
Champs typiques :
- `id` (doc id = uid)
- `mail`, `pseudo`, `role` (client/admin), `tokens`
- `providerIds[]`
- `createdAt`, `updatedAt`

Regles : `prestataire` est normalise en `client` (web).

### 5.2 `iaProfiles`
Champs clefs :
- Owner : `ownerId`, `ownerMail`
- Identite : `name`, `mentality`, `voice`, `voiceRhythm`
- Apparence : `look.{gender, skin, hair, hairColor, eyeColor, age, height, bodyType, facialHair, makeup, glasses, accessories, piercings, tattoos, scars, outfit, ethnicity, details}`
- Image : `imageUrl`, `imagePrompt`
- Moderation : `status` (pending/active/rejected/suspended/disabled), `statusNote`, `ownerNotification`, `safetyWarnings`, `warningCount`, `hiddenFromCatalogue`
- Acces : `visibility` (public/private), `accessType` (free/paid)
- Dates : `createdAt`, `updatedAt`, `reviewedAt`, `reviewedBy`, `reviewedMail`

### 5.3 `conversations`
Champs clefs :
- `userId`, `aiId`, `status` (pending/running/completed)
- `messageCount`, `createdAt`, `updatedAt`
- `location` (lat, lng, accuracy) + `locationUpdatedAt`
- `countryCode`, `countryLabel`, `countryUpdatedAt`
- `tokenPricing` (override), `tokenPricingUpdatedAt`, `tokenPricingUpdatedBy` ...

Sous-collection : `conversations/{id}/messages`
- `authorId`, `authorRole` (client/ai), `content`, `kind` (text/image)
- `tokenCost`, `metadata`, `createdAt`

### 5.4 `demandes`
Champs clefs :
- Client : `clientId`, `clientMail`, `clientPseudo`
- Contenu : `title`, `description`, `category`, `budget`, `city`, `availability`
- Localisation : `location`, `locationUpdatedAt`
- Matching : `prestataireId`, `prestatairePseudo`, `prestataireMail`
- Statut : `status` (pending/matched/accepted/cancelled)
- Dates : `createdAt`, `updatedAt`, `acceptedAt`, `cancelledAt`, `cancelReason`

Matching : un prestataire est choisi aleatoirement parmi les `utilisateurs` role `client` ou `admin`.

### 5.5 `aiEvaluations`
Champs :
- `aiId`, `userId`, `conversationId` (web)
- `rating` (1..5), `comment`, `tags[]`
- `createdAt`, `updatedAt`

### 5.6 `settings/tokenPricingIdf`
Champs :
- `base`: { text, image }
- `countries`: { [ISO2]: { text, image } }
- `updatedAt`, `updatedBy`, `updatedMail`

### 5.7 `adminLogs`
Champs :
- action (user_role_update, user_tokens_grant, ai_profile_status, ai_profile_update, ai_profile_delete, conversation_delete, ...)
- targetType, targetId, adminId, adminMail, details, createdAt

### 5.8 `cours` (demo/test)
Champs : `coursName`, `prof`, `hours`, `dateOfCreate`

## 6) API Next.js (routes)
Dossier : `next/src/app/api`

### 6.1 `POST /api/ai/reply`
Fichier : `src/app/api/ai/reply/route.ts`
Body :
- `conversationId`, `userId`, `aiId`, `message`

Traitement :
- Verif conversation + ownership + IA active + avatar present
- Recup historique (12 derniers messages)
- Memoire IA par utilisateur (stockee sous `utilisateurs/{userId}/aiMemory/{aiId}`)
- Prompt systeme + historique + message utilisateur
- IA via OpenAI Chat Completions (model `OPENAI_MODEL`)
- Fallback HuggingFace Router si pas de reponse OpenAI
- Stockage message IA en Firestore (kind text, tokenCost 0)

Reponse : `{ reply }` ou erreurs 4xx/5xx.

### 6.2 `POST /api/ai/image`
Fichier : `src/app/api/ai/image/route.ts`
Body :
- `mode`: `base` (avatar IA) ou autre (image conversation)
- `aiId` (requis)
- `conversationId`, `userId`, `message` (requis si conversation)

Traitement :
- Verif conversation + ownership + IA active + avatar existant (pour mode conversation)
- Prompt photo realiste (identite + apparence + pose)
- Appel OpenAI Images (model `OPENAI_IMAGE_MODEL`)
- Upload Firebase Storage si possible, sinon cache local `.cache/ai-images`
- Si safety violation OpenAI => IA rejetee + hidden + warning

Reponse : `{ imageUrl, prompt, identityPrompt, model, updateError? }`

### 6.3 `GET /api/ai/image/file/[name]`
Fichier : `src/app/api/ai/image/file/[name]/route.ts`
- Sert les images du cache local `.cache/ai-images`

### 6.4 `POST /api/ai/tts`
Fichier : `src/app/api/ai/tts/route.ts`
Body :
- `text` (requis), `aiId` (optionnel), `voice` (optionnel)

Traitement :
- Selection d'une voix (profil IA, heuristiques par genre/mentalite/rythme)
- Appel OpenAI Audio Speech (`OPENAI_TTS_MODEL`)

Reponse : MP3 (`audio/mpeg`)

### 6.5 `POST /api/location/department`
Fichier : `src/app/api/location/department/route.ts`
Body : `{ lat, lng }`
- Reverse geocoding via Nominatim OpenStreetMap
- Reponse : `{ countryCode, countryLabel }`

### 6.6 `POST /api/location/country`
Alias de `/api/location/department`.

### 6.7 `POST /api/token-price`
Fichier : `src/app/api/token-price/route.ts`
Body : `{ lat?, lng?, currency?, zoneId? }`
- Proxy vers Cloud Function `getTokenPrice` (us-central1-todolist-76572)
- Transmet Authorization Firebase si present
- Reponse : payload de la function (normalise)

## 7) Logique tokens & tarification
- Couts par defaut : texte = 1 token, image = 5 tokens
- Tarification dynamique : `settings/tokenPricingIdf` (base + pays)
- Override possible par conversation (champ `tokenPricing`)
- Debit tokens fait dans transaction Firestore :
  - verifie localisation (location ou countryCode obligatoire)
  - verifie IA active + avatar
  - calcule cout final
  - verifie solde tokens
  - ecrit message + decremente tokens + incr messageCount

## 8) Localisation
- Web : localisation requise pour creer IA et demarrer conversation
- Conversation web : sync geoloc + reverse geocoding vers pays
- iOS : `LocationManager` + `NextApiService.countryLookup`

## 9) IA (prompts, memoire, moderation)
- Prompt systeme construit avec : identite IA, mentalite, voix, apparence
- Memoire par utilisateur stockee dans `utilisateurs/{userId}/aiMemory/{aiId}`
- Safety image : si OpenAI refuse, profil IA passe en `rejected` + warning

## 10) Modules Web (Next.js)
Principales pages :
- `/auth` : inscription/connexion, creation profil utilisateur
- `/` : dashboard admin (utilisateurs, IA, conversations, actions admin)
- `/ia` : catalogue IA + filtres + lancement conversation
- `/ia/create` : creation IA
- `/ia/mes` : gestion IA du createur (visibility/accessType, abonnement)
- `/ia/[id]` : detail IA
- `/ia/owner/[ownerId]` : liste IA d'un createur
- `/conversations/[id]` : chat IA (texte/image, tokens, TTS)
- `/historique/client` : historique + evaluations IA
- `/demandes/client` : creation/suivi demandes client
- `/demandes/prestataire` : gestion demandes admin
- `/admin/ia`, `/admin/tokens`, `/admin/conversations` : modules admin
- `/form/users`, `/form/cours`, `/cours` : CRUD demo/test

## 11) Modules iOS (SwiftUI)
Navigation via `MainTabView` :
- Client : IA, Demandes, Historique, Compte
- Admin : Admin, Demandes, Conversations, Tokens, Compte

Ecrans clefs :
- `AuthView` : email, Apple Sign-In, Google Sign-In
- `ProfileSetupView` : creation profil utilisateur (role/pseudo)
- `AiProfilesView` : catalogue + mes IA
- `AiProfileDetailView` : detail IA + demarrer conversation
- `AiCreateView` : creation IA
- `ConversationView` : chat + image + TTS + evaluation
- `DemandesClientView` / `DemandesAdminView`
- `AdminUsersView` / `AdminAiProfilesView` / `ConversationsAdminView` / `TokenPricingAdminView`

## 12) Services iOS (equivalents Firebase / API)
- Auth : `AuthService` (email + Google + Apple)
- User : `UserService` (fetch, listen, ensure profile, grant tokens)
- IA : `AiProfileService` (CRUD, update status)
- Conversations : `ConversationService` (create, messages, token debit, location)
- Demandes : `DemandeService`
- Token pricing : `TokenPricingService`
- Next API : `NextApiService` (aiReply, aiImage, tts, tokenPrice, countryLookup)

## 13) Flows metier
### 13.1 Flow client (web + iOS)
1) Auth -> profil utilisateur
2) Creation IA (statut pending)
3) Validation admin + generation avatar
4) Choix IA -> creation conversation
5) Envoi messages (tokens debites)
6) Reponse IA (texte/image)
7) Evaluation IA (rating/comment)

### 13.2 Flow admin
1) Acces dashboard admin
2) Moderation IA (status, details)
3) Gestion token pricing
4) Suivi conversations et demandes
5) Attribution tokens aux utilisateurs (web)

### 13.3 Flow demandes
- Client cree demande (optional location)
- Matching auto vers un prestataire (client/admin)
- Admin peut accepter ou annuler

## 14) Abonnement / acces payant
- Champ `accessType` (free/paid) dans `iaProfiles`
- Passage en `paid` requiert un abonnement actif (verifie via `subscriptionUtils`)
- Champs possibles : `subscription.status`, `subscriptionActive`, `hasSubscription`, `isSubscriber`, `plan`

## 15) Notes securite et compliance
- Firestore rules : `firestore.rules` et `storage.rules` (a deployer dans Firebase)
- Recommandations :
  - Restreindre lecture/ecriture par role
  - Verifier ownership des conversations/messages
  - Forcer debit tokens cote serveur (transactions)
  - Ne jamais exposer les cles OpenAI au client

## 16) Observations / dettes techniques
- Duplication de `AiEvaluationService` dans iOS :
  - `Pecm2Swift/Services/AiEvaluationService.swift` (impl Firestore)
  - `Pecm2Swift/Views/AiEvaluationService.swift` (placeholder)
  - Risque de conflit de nom / confusion
- Ne pas stocker de cle OpenAI dans iOS (le champ `openAiApiKey` doit rester vide en prod)
- Cloud Function `getTokenPrice` n'est pas versionnee ici

## 17) Chemins importants (code)
- Web Firebase init : `next/src/app/firebase/init.ts`
- Web services : `next/src/app/firebase/services/*`
- Web API : `next/src/app/api/*`
- iOS config : `mobile/Pecm2Swift/Resources/AppConfig.plist`
- iOS services : `mobile/Pecm2Swift/Services/*`
- iOS views : `mobile/Pecm2Swift/Views/*`

## 18) TODO possibles (si evolution)
- Ajouter Firestore rules et tests de securite
- Normaliser et documenter la politique de moderation IA
- Completer la doc API (schemas request/response)
- Eliminer la duplication AiEvaluationService (iOS)
- Retirer toutes cles sensibles des fichiers versionnes

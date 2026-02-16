# PECM2-1

Technical README and usage guide for the PECM2 app (Next.js + Firebase).

## Stack

- Next.js App Router (client pages)
- Firebase Auth, Firestore, Cloud Functions
- Tailwind CSS

## Local setup

1. Create `.env.local` from `.env.example`
2. Fill Firebase keys
3. Install deps + start dev server

```bash
cd next
npm install
npm run dev
```

## Testing

```bash
# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Architecture

### Data layer

- `src/app/indexFirebase.ts` centralizes Firebase init + queries + realtime listeners.
- `onSnapshot` listeners drive live dashboards and lists.

### Firestore collections

- `utilisateurs` : user profiles + roles + tokens
- `demandes` : client requests (matching + status)
- `conversations` : conversation headers
- `conversations/{id}/messages` : chat messages (per message doc)
- `iaProfiles` : IA profiles created by users
- `aiEvaluations` : client evaluations after completed chats IA
- `adminLogs` : admin actions
- `cours` : legacy/test data

### Modules (pages)

- `/` admin dashboard (admins) / accueil client (chats IA)
- `/auth` authentication and profile creation
- `/ia/create` IA creation form
- `/demandes/client` client requests + live tracking
- `/demandes/prestataire` demandes admin + accept/cancel
- `/historique/client` chats IA + IA evaluations
- `/conversations/[id]` chat, message cost + tokens + avatar placeholder

## Authentication & roles

- Methods: email/password, Google, Apple
- Profile creation via `ensureUtilisateurProfile` (role saved in `utilisateurs`)
- Roles used in UI: `client`, `admin`
- Access control is expected in Firestore rules (not included here)

## Monetization & tokens

- Tokens stored on `utilisateurs.tokens`
- Dynamic pricing available via Cloud Function `getTokenPrice`
- Message costs:
  - text: 1 token
  - image: 5 tokens
- UI blocking: input disabled when `tokens < cost` (`/conversations/[id]`)
- Server-side decrement: `sendConversationMessageWithTokens` runs a Firestore transaction to:
  - write message
  - increment `messageCount`
  - decrement user tokens

## Core flows (usage guide)

### Client flow

1. Create account in `/auth`, choose role `client`
2. Create an IA profile in `/ia/create` (pending validation)
3. Submit a request in `/demandes/client`
4. Once matched, open the conversation from `/historique/client`
5. Send messages in `/conversations/[id]` (token cost + balance)
6. After completion, leave an evaluation in `/historique/client`

### Admin flow

1. Login as `admin`
2. Review requests in `/demandes/prestataire`
3. Accept or cancel the request (status updates in realtime)

### Admin flow

1. Access `/` dashboard
2. Review users, IA profiles, conversations
3. Update IA statuses and conversation states as needed

### Matching + conversation lifecycle

- New `demandes` pick a random client/admin and set status `matched` or `pending`
- `conversations` use status buckets: `pending`, `running`, `completed`
- Each message stored in `conversations/{id}/messages` with `tokenCost`

## Notes / security

- Define Firestore rules for:
  - user ownership on conversations/messages
  - token decrement integrity
  - read/write access by role
- Cloud Functions or rules should enforce server-side validation in production.

# pecM2

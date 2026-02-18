# pecM2

Application web et mobile de mise en relation client / prestataire avec chat IA, gestion de tokens et tableau de bord admin.

## Stack

| Couche        | Technologie                              |
| ------------- | ---------------------------------------- |
| Frontend web  | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| Mobile        | Swift (Xcode, Fastlane)                  |
| Backend       | Firebase Auth, Firestore, Cloud Functions |
| IA            | OpenAI API                               |
| Tests         | Jest, Testing Library                    |
| Monitoring    | Prometheus, Grafana, Winston + Loki      |
| CI            | Husky, ESLint, Prettier                  |

## Structure du projet

```
.
├── next/                 # Application web (Next.js)
│   └── src/app/
│       ├── admin/        # Dashboard admin
│       ├── auth/         # Authentification & création de profil
│       ├── conversations/# Chat temps réel
│       ├── demandes/     # Demandes client & prestataire
│       ├── historique/   # Historique des chats IA & évaluations
│       ├── ia/           # Création de profils IA
│       ├── api/          # Routes API
│       ├── components/   # Composants partagés
│       ├── firebase/     # Configuration Firebase
│       ├── types/        # Types TypeScript
│       └── utils/        # Utilitaires
├── mobile/               # Application iOS (Swift)
├── monitoring/           # Observabilité (Prometheus + Grafana)
├── docs/                 # Documentation
│   ├── PEC Document.pdf  # Document de PEC
│   ├── uml/              # Diagrammes UML (PlantUML)
│   └── uml-png/          # Exports PNG des diagrammes
├── firestore.rules       # Règles de sécurité Firestore
├── storage.rules         # Règles de sécurité Storage
└── firebase.json         # Configuration Firebase
```

## Démarrage rapide

### Prérequis

- Node.js >= 18
- Compte Firebase avec un projet configuré

### Installation

```bash
cd next
npm install
```

### Configuration

Créer un fichier `next/.env.local` avec les variables Firebase :

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

### Lancement

```bash
cd next
npm run dev
```

L'app est accessible sur `http://localhost:3000`.

## Tests

```bash
cd next

# Tests unitaires
npm test

# Mode watch
npm run test:watch

# Couverture
npm run test:coverage

# Check CI complet (lint + format + types + tests)
npm run ci:check
```

## Monitoring

Stack d'observabilité locale avec Prometheus et Grafana.

```bash
cp monitoring/.env.example monitoring/.env
docker compose --env-file monitoring/.env -f monitoring/docker-compose.yml up -d
```

- Grafana : `http://localhost:3001`
- Prometheus : `http://localhost:9090`

Voir [monitoring/README.md](monitoring/README.md) pour le détail.

## Documentation

| Document | Emplacement |
| -------- | ----------- |
| PEC | [docs/cahier_des_charges.pdf](docs/cahier_des_charges.pdf) |
| Diagrammes UML | [docs/uml/](docs/uml/) (PlantUML) / [docs/uml-png/](docs/uml-png/) (PNG) |
| Monitoring | [monitoring/README.md](monitoring/README.md) |
| Mobile | [mobile/README.md](mobile/README.md) |

**HAMMACHE Lilian** & **PUMPALOVIC Alexandre**
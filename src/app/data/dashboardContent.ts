export const roadmapPhases = [
  {
    title: 'Phase 2 – MVP (auth, création, matching)',
    summary:
      'Firebase Auth, pages onboarding client, matching automatisé et conversations en temps réel.',
    tasks: [
      'Auth email + provider (Google / Apple) avec rôles distincts et redirection vers la création d’IA pour les nouveaux.',
      'Formulaire de demande côté client, vue liste côté client, appariement automatique et contrôle accept/annuler.',
      'Accepter/annuler une demande, afficher l’état actuel (en attente, en cours, terminé) et garder les conversations synchronisées.',
      'Stocker chaque message comme document Firestore pour respecter la limite 1 Mo et permettre pagination + realtime.',
    ],
  },
  {
    title: 'Phase 3 – Temps réel & expérience',
    summary: 'Expérience immersive : géoloc, notifications et historique avec filtres/pagination.',
    tasks: [
      'Carte + géolocalisation pour suivre le client, prix dynamique par zone (getTokenPrice).',
      'Push Firebase, filtres/recherche/pagination sur les listes de demandes et conversations.',
      'Formulaire d’évaluation des IA, page historique client, chats IA dynamiques (en cours, terminé).',
      'Indication du coût du message, tokens restants, avatar 3D réactif et blocage de la saisie sans solde.',
    ],
  },
  {
    title: 'Phase 4 – Finalisation',
    summary: 'Navigation fluide et documentation complète pour embarquer les équipes.',
    tasks: [
      'Ajouter une barre de navigation cohérente entre tous les modules.',
      'Rédiger un README technique + guide d’usage détaillant l’architecture, l’auth, la monétisation et les flows.',
    ],
  },
];

export const uxFocusDefinition = [
  'Mentalités définies (coach, amoureux, sarcastique, philosophe…) pour chaque IA.',
  'Modèles 3D paramétrables (genre, peau, cheveux, tenue, ethnie) et voix associée.',
  'Configurateur IA combinant personnalité + apparence + rythme vocal.',
  'Parcours utilisateur complet : choisir IA → dialoguer → payer en tokens → reset ou sauvegarde.',
  'Profil IA consultable + bouton reset pour lancer une nouvelle personnalité/physique.',
];

export const iaFunctionality = [
  'LLM + prompt engine personnalisé pour gérer le contexte memory de chaque IA créée.',
  'Génération de voix (TTS) et de réponses visuelles (image, GIF).',
  'Avatar IA 3D réagissant au message, avec états dynamiques selon les tokens restants.',
  'Context memory persistante et segmentée par IA pour enrichir chaque conversation.',
];

export const monetizationItems = [
  'Système de token : affichage constant, blocage de message sans solde et achats par lot ou recharge auto.',
  'Prix dynamiques selon géolocalisation / devise / pouvoir d’achat (via Cloud Function getTokenPrice).',
  'Tarification par type de message (1 token = message texte, 5 tokens = image ou réponse multimédia).',
  'Paiements rapides via Stripe + Apple Pay + Google Pay (WebView si besoin).',
];

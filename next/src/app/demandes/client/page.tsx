'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import {
  addDemande,
  auth,
  fetchAiProfilesByOwnerRealTime,
  fetchDemandesForClientRealTime,
  fetchUtilisateurById,
} from '../../indexFirebase';
import type { AiProfile } from '../../ia/types';
import {
  normalizeDemandeRequestType,
  type Demande,
  type DemandeRequestType,
  type Timestamp,
} from '../types';

type Profil = {
  id: string;
  mail?: string;
  pseudo?: string;
  role?: string;
};

type RequestTypeOption = {
  id: DemandeRequestType;
  label: string;
  description: string;
};

const requestTypeOptions: RequestTypeOption[] = [
  {
    id: 'create_ai',
    label: 'Creer une IA',
    description: 'Brief complet pour une IA personnalisee.',
  },
  {
    id: 'update_ai',
    label: 'Modifier une IA',
    description: 'Demande de changement apparence, voix ou style.',
  },
  {
    id: 'moderation',
    label: 'Validation / moderation',
    description: 'Validation statut IA et note admin.',
  },
  {
    id: 'incident',
    label: 'Incident / signalement',
    description: 'Signalement contenu, safety ou comportement.',
  },
  {
    id: 'usage_ai',
    label: 'IA pour un usage',
    description: 'Objectif, ton et contraintes d usage.',
  },
  {
    id: 'other',
    label: 'Autre',
    description: 'Demande libre compatible historique.',
  },
];

const statusLabels: Record<string, string> = {
  pending: 'En attente',
  matched: 'Assignee',
  accepted: 'Acceptee',
  cancelled: 'Annulee',
  other: 'En cours',
};

const statusStyles: Record<string, string> = {
  pending: 'bg-amber-100/80 text-amber-700 border border-amber-400/70',
  matched: 'bg-sky-100/80 text-sky-700 border border-sky-400/70',
  accepted: 'bg-emerald-100/80 text-emerald-700 border border-emerald-400/70',
  cancelled: 'bg-rose-100/80 text-rose-700 border border-rose-400/70',
  other: 'bg-slate-100/80 text-slate-700 border border-slate-300/80',
};

const requestTypeLabels: Record<DemandeRequestType, string> = {
  create_ai: 'Creation IA',
  update_ai: 'Modification IA',
  moderation: 'Moderation IA',
  incident: 'Incident IA',
  usage_ai: 'Usage IA',
  other: 'Autre',
};

const normalizeStatus = (status?: string) => {
  const normalized = status?.toLowerCase() ?? '';
  if (['pending', 'nouveau', 'en attente', ''].includes(normalized)) {
    return 'pending';
  }
  if (['matched', 'assigne', 'assigned'].includes(normalized)) {
    return 'matched';
  }
  if (['accepted', 'in progress', 'en cours'].includes(normalized)) {
    return 'accepted';
  }
  if (['cancelled', 'annule', 'annulee', 'refused'].includes(normalized)) {
    return 'cancelled';
  }
  return 'other';
};

const formatDate = (value?: Timestamp | string) => {
  if (!value) {
    return '-';
  }
  if (typeof value === 'string') {
    return new Date(value).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }
  if (typeof value === 'object' && typeof value?.seconds === 'number') {
    return new Date(value.seconds * 1000).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }
  return '-';
};

const timelineSteps = (demande: Demande) => {
  const normalizedStatus = normalizeStatus(demande.status);
  const isMatched =
    normalizedStatus === 'matched' || normalizedStatus === 'accepted' || normalizedStatus === 'cancelled';
  return [
    {
      key: 'created',
      label: 'Demande creee',
      done: true,
      at: demande.createdAt,
    },
    {
      key: 'matched',
      label: 'Admin assigne',
      done: isMatched || Boolean(demande.matchedAt),
      at: demande.matchedAt ?? demande.updatedAt,
    },
    {
      key: 'accepted',
      label: 'Traitement accepte',
      done: normalizedStatus === 'accepted',
      at: demande.acceptedAt,
    },
    {
      key: 'cancelled',
      label: 'Demande annulee',
      done: normalizedStatus === 'cancelled',
      at: demande.cancelledAt,
    },
  ];
};

const isAiRequired = (requestType: DemandeRequestType) =>
  ['update_ai', 'moderation', 'incident'].includes(requestType);

const formatAssignedAdmin = (demande: Demande) => {
  if (demande.prestatairePseudo) {
    return demande.prestatairePseudo;
  }
  if (demande.prestataireMail) {
    return demande.prestataireMail;
  }
  if (demande.prestataireId) {
    return `Admin ${demande.prestataireId.slice(0, 5)}`;
  }
  return 'Non assigne';
};

const toOptional = (value: FormDataEntryValue | null) => {
  if (!value) {
    return undefined;
  }
  const text = value.toString().trim();
  return text.length ? text : undefined;
};

export default function ClientDemandesPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profil | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [demandesLoading, setDemandesLoading] = useState(true);
  const [demandesError, setDemandesError] = useState<string | null>(null);

  const [myAiProfiles, setMyAiProfiles] = useState<AiProfile[]>([]);
  const [aiProfilesLoading, setAiProfilesLoading] = useState(false);

  const [selectedRequestType, setSelectedRequestType] = useState<DemandeRequestType>('create_ai');
  const [selectedAiId, setSelectedAiId] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const [demandeSearch, setDemandeSearch] = useState('');
  const [demandeStatusFilter, setDemandeStatusFilter] = useState('all');
  const [demandePage, setDemandePage] = useState(1);

  const roleMismatch = Boolean(userId && profile?.role === 'admin');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUserId(null);
        setProfile(null);
        setProfileLoading(false);
        return;
      }

      setUserId(user.uid);

      try {
        const profileData = (await fetchUtilisateurById(user.uid)) as Profil | null;
        setProfile(profileData);
        setProfileError(null);
      } catch (error) {
        console.error('Impossible de charger le profil', error);
        setProfileError('Profil utilisateur introuvable.');
      } finally {
        setProfileLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId || roleMismatch) {
      setDemandes([]);
      setDemandesLoading(false);
      return;
    }

    setDemandesLoading(true);

    const unsubscribe = fetchDemandesForClientRealTime(
      userId,
      (data: unknown) => {
        setDemandes(data as Demande[]);
        setDemandesLoading(false);
        setDemandesError(null);
      },
      () => {
        setDemandesError('Impossible de recuperer vos demandes.');
        setDemandesLoading(false);
      },
    );

    return () => unsubscribe?.();
  }, [userId, roleMismatch]);

  useEffect(() => {
    if (!userId || roleMismatch) {
      setMyAiProfiles([]);
      setAiProfilesLoading(false);
      return;
    }

    setAiProfilesLoading(true);
    const unsubscribe = fetchAiProfilesByOwnerRealTime(
      userId,
      (data: unknown) => {
        setMyAiProfiles(data as AiProfile[]);
        setAiProfilesLoading(false);
      },
      () => {
        setMyAiProfiles([]);
        setAiProfilesLoading(false);
      },
    );

    return () => unsubscribe?.();
  }, [userId, roleMismatch]);

  useEffect(() => {
    setDemandePage(1);
  }, [demandeSearch, demandeStatusFilter]);

  useEffect(() => {
    if (!isAiRequired(selectedRequestType)) {
      setSelectedAiId('');
    }
  }, [selectedRequestType]);

  const aiProfilesById = useMemo(() => {
    const map = new Map<string, AiProfile>();
    myAiProfiles.forEach((profile) => {
      map.set(profile.id, profile);
    });
    return map;
  }, [myAiProfiles]);

  const sortedDemandes = useMemo(
    () => [...demandes].sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)),
    [demandes],
  );

  const filteredDemandes = useMemo(() => {
    const search = demandeSearch.trim().toLowerCase();

    return sortedDemandes.filter((demande) => {
      const statusKey = normalizeStatus(demande.status);
      if (demandeStatusFilter !== 'all' && statusKey !== demandeStatusFilter) {
        return false;
      }
      if (!search) {
        return true;
      }
      const requestType = normalizeDemandeRequestType(demande.requestType);
      const haystack = [
        demande.title,
        demande.description,
        demande.category,
        demande.aiName,
        demande.adminNote,
        requestTypeLabels[requestType],
        demande.id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(search);
    });
  }, [sortedDemandes, demandeSearch, demandeStatusFilter]);

  const statusSummary = useMemo(() => {
    return sortedDemandes.reduce(
      (acc, demande) => {
        const key = normalizeStatus(demande.status);
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      },
      { pending: 0, matched: 0, accepted: 0, cancelled: 0, other: 0 } as Record<string, number>,
    );
  }, [sortedDemandes]);

  const demandesPageSize = 5;
  const totalDemandesPages = Math.max(1, Math.ceil(filteredDemandes.length / demandesPageSize));
  const currentDemandesPage = Math.min(demandePage, totalDemandesPages);

  const paginatedDemandes = useMemo(() => {
    const start = (currentDemandesPage - 1) * demandesPageSize;
    return filteredDemandes.slice(start, start + demandesPageSize);
  }, [filteredDemandes, currentDemandesPage]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!userId) {
      setSubmitError('Connectez-vous pour envoyer une demande.');
      return;
    }

    if (profile?.role === 'admin') {
      setSubmitError('Ce formulaire est reserve aux comptes non-admin.');
      return;
    }

    if (isAiRequired(selectedRequestType) && !selectedAiId) {
      setSubmitError('Selectionnez une IA pour ce type de demande.');
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const title = toOptional(formData.get('title'));
    const description = toOptional(formData.get('description'));
    const category = toOptional(formData.get('category'));
    const budget = toOptional(formData.get('budget'));

    if (!title || !description) {
      setSubmitError('Le titre et la description sont obligatoires.');
      return;
    }

    const payload: Record<string, unknown> = {};

    if (selectedRequestType === 'create_ai') {
      payload.objective = toOptional(formData.get('objective'));
      payload.tone = toOptional(formData.get('tone'));
      payload.constraints = toOptional(formData.get('constraints'));
      payload.mentality = toOptional(formData.get('mentality'));
      payload.voice = toOptional(formData.get('voice'));
      const lookDetails = toOptional(formData.get('lookDetails'));
      if (lookDetails) {
        payload.look = { details: lookDetails };
      }
    }

    if (selectedRequestType === 'update_ai') {
      payload.requestedChanges = toOptional(formData.get('requestedChanges'));
      payload.constraints = toOptional(formData.get('constraints'));
      payload.mentality = toOptional(formData.get('mentality'));
      payload.voice = toOptional(formData.get('voice'));
      const lookDetails = toOptional(formData.get('lookDetails'));
      if (lookDetails) {
        payload.look = { details: lookDetails };
      }
    }

    if (selectedRequestType === 'moderation') {
      payload.currentStatus = toOptional(formData.get('currentStatus'));
      payload.requestedStatus = toOptional(formData.get('requestedStatus'));
      payload.constraints = toOptional(formData.get('moderationNote'));
    }

    if (selectedRequestType === 'incident') {
      payload.incidentType = toOptional(formData.get('incidentType'));
      payload.incidentSeverity = toOptional(formData.get('incidentSeverity'));
      payload.incidentContext = toOptional(formData.get('incidentContext'));
    }

    if (selectedRequestType === 'usage_ai') {
      payload.objective = toOptional(formData.get('objective'));
      payload.tone = toOptional(formData.get('tone'));
      payload.constraints = toOptional(formData.get('constraints'));
    }

    const targetAi = selectedAiId ? aiProfilesById.get(selectedAiId) : undefined;

    setIsSubmitting(true);
    try {
      await addDemande({
        clientId: userId,
        clientMail: profile?.mail ?? undefined,
        clientPseudo: profile?.pseudo ?? undefined,
        title,
        description,
        category,
        budget,
        aiId: targetAi?.id,
        aiName: targetAi?.name ?? undefined,
        requestType: selectedRequestType,
        payload,
      });
      form.reset();
      setSelectedAiId('');
      setSelectedRequestType('create_ai');
      setSubmitSuccess('Demande IA envoyee. Un admin va prendre en charge le suivi.');
    } catch (error) {
      console.error('Erreur lors de la creation de la demande', error);
      setSubmitError("Impossible d'envoyer la demande. Reessayez.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderRequestTypeFields = () => {
    switch (selectedRequestType) {
      case 'create_ai':
        return (
          <div className="space-y-3 rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Brief IA</p>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                name="objective"
                className="rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm"
                placeholder="Objectif de l IA"
              />
              <input
                name="tone"
                className="rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm"
                placeholder="Ton attendu"
              />
            </div>
            <input
              name="constraints"
              className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm"
              placeholder="Contraintes (sujet interdit, style, langue...)"
            />
            <div className="grid gap-3 md:grid-cols-2">
              <input
                name="mentality"
                className="rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm"
                placeholder="Mentalite"
              />
              <input
                name="voice"
                className="rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm"
                placeholder="Voix"
              />
            </div>
            <textarea
              name="lookDetails"
              rows={2}
              className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm"
              placeholder="Look (details visuels attendus)"
            />
          </div>
        );
      case 'update_ai':
        return (
          <div className="space-y-3 rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Changements demandes</p>
            <textarea
              name="requestedChanges"
              rows={3}
              className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm"
              placeholder="Qu est-ce qui doit changer ?"
            />
            <div className="grid gap-3 md:grid-cols-2">
              <input
                name="mentality"
                className="rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm"
                placeholder="Nouvelle mentalite"
              />
              <input
                name="voice"
                className="rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm"
                placeholder="Nouvelle voix"
              />
            </div>
            <textarea
              name="lookDetails"
              rows={2}
              className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm"
              placeholder="Nouveau look (details)"
            />
            <input
              name="constraints"
              className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm"
              placeholder="Contraintes de changement"
            />
          </div>
        );
      case 'moderation':
        return (
          <div className="space-y-3 rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Moderation</p>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                name="currentStatus"
                className="rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm"
                placeholder="Statut actuel"
              />
              <input
                name="requestedStatus"
                className="rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm"
                placeholder="Statut souhaite"
              />
            </div>
            <textarea
              name="moderationNote"
              rows={3}
              className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm"
              placeholder="Contexte de moderation / note"
            />
          </div>
        );
      case 'incident':
        return (
          <div className="space-y-3 rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Signalement</p>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                name="incidentType"
                className="rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm"
                placeholder="Type d incident"
              />
              <select
                name="incidentSeverity"
                defaultValue="medium"
                className="rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm"
              >
                <option value="low">Faible</option>
                <option value="medium">Moyen</option>
                <option value="high">Eleve</option>
              </select>
            </div>
            <textarea
              name="incidentContext"
              rows={3}
              className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm"
              placeholder="Description de l incident"
            />
          </div>
        );
      case 'usage_ai':
        return (
          <div className="space-y-3 rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Objectif d usage</p>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                name="objective"
                className="rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm"
                placeholder="Usage cible"
              />
              <input
                name="tone"
                className="rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm"
                placeholder="Ton souhaite"
              />
            </div>
            <textarea
              name="constraints"
              rows={3}
              className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm"
              placeholder="Contraintes fonctionnelles"
            />
          </div>
        );
      default:
        return null;
    }
  };

  const renderPayloadSummary = (demande: Demande) => {
    const entries = Object.entries((demande.payload ?? {}) as Record<string, unknown>).filter(
      ([, value]) => {
        if (typeof value === 'string') {
          return value.trim().length > 0;
        }
        if (Array.isArray(value)) {
          return value.length > 0;
        }
        return Boolean(value);
      },
    );

    if (!entries.length) {
      return <p className="mt-1 text-[11px] text-slate-500">Aucun detail structuré.</p>;
    }

    return (
      <ul className="mt-2 grid gap-1 text-[11px] text-slate-400">
        {entries.slice(0, 5).map(([key, value]) => (
          <li key={key}>
            {key}: {typeof value === 'object' ? JSON.stringify(value) : String(value)}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 md:px-6 lg:px-8">
        <header className="space-y-3 rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-900/80 via-slate-900 to-slate-950/80 p-6 shadow-2xl shadow-slate-900/40 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Espace client</p>
          <h1 className="text-3xl font-semibold md:text-4xl">Demandes IA: nouvelle demande & suivi</h1>
          <p className="text-sm text-slate-400 md:text-base">
            Creez une demande IA (creation, moderation, incident, modification) et suivez son traitement
            par un admin assigne.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <Link
              href="/historique/client"
              className="rounded-full border border-slate-800/80 bg-slate-950/60 px-4 py-2 font-semibold text-slate-200 transition hover:border-slate-700"
            >
              Historique & evaluations IA
            </Link>
          </div>
        </header>

        {!userId ? (
          <section className="rounded-3xl border border-slate-800/80 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
            <h2 className="text-lg font-semibold">Connexion requise</h2>
            <p className="mt-2 text-sm text-slate-400">
              Connectez-vous pour envoyer une demande et suivre son statut.
            </p>
            <Link
              href="/auth"
              className="mt-4 inline-flex items-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Aller a la connexion
            </Link>
          </section>
        ) : roleMismatch ? (
          <section className="rounded-3xl border border-slate-800/80 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
            <h2 className="text-lg font-semibold">Acces indisponible pour les admins</h2>
            <p className="mt-2 text-sm text-slate-400">
              Connectez-vous avec un compte non-admin pour acceder a cet espace.
            </p>
          </section>
        ) : (
          <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <article className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Nouvelle demande IA</h2>
                  <p className="text-sm text-slate-400">
                    Selectionnez un type puis remplissez le formulaire adapte.
                  </p>
                </div>
                {profileLoading ? (
                  <span className="text-xs text-slate-500">Profil...</span>
                ) : profileError ? (
                  <span className="text-xs text-rose-300">{profileError}</span>
                ) : (
                  <span className="text-xs text-slate-500">Role: {profile?.role ?? 'non defini'}</span>
                )}
              </div>

              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wide text-slate-400">Type de demande IA</label>
                  <div className="flex flex-wrap gap-2">
                    {requestTypeOptions.map((option) => {
                      const isActive = selectedRequestType === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setSelectedRequestType(option.id)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            isActive
                              ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                              : 'border-slate-700 bg-slate-950/60 text-slate-300 hover:border-slate-500'
                          }`}
                          title={option.description}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {
                      requestTypeOptions.find((option) => option.id === selectedRequestType)
                        ?.description
                    }
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="title" className="text-xs uppercase tracking-wide text-slate-400">
                      Titre
                    </label>
                    <input
                      id="title"
                      name="title"
                      type="text"
                      className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                      placeholder="Ex: IA coach lifestyle"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="category" className="text-xs uppercase tracking-wide text-slate-400">
                      Categorie
                    </label>
                    <select
                      id="category"
                      name="category"
                      defaultValue=""
                      className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100"
                    >
                      <option value="">Selectionner</option>
                      <option value="ia_creation">Creation IA</option>
                      <option value="ia_update">Modification IA</option>
                      <option value="ia_moderation">Moderation IA</option>
                      <option value="ia_incident">Incident IA</option>
                      <option value="autre">Autre</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="description" className="text-xs uppercase tracking-wide text-slate-400">
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    rows={4}
                    className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                    placeholder="Contexte, attente, resultat attendu..."
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="budget" className="text-xs uppercase tracking-wide text-slate-400">
                    Budget (optionnel)
                  </label>
                  <input
                    id="budget"
                    name="budget"
                    type="number"
                    min="0"
                    step="1"
                    className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100"
                    placeholder="Montant estime"
                  />
                </div>

                <div className="space-y-2 rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4">
                  <label htmlFor="aiId" className="text-xs uppercase tracking-wide text-slate-400">
                    IA associee {isAiRequired(selectedRequestType) ? '(obligatoire)' : '(optionnel)'}
                  </label>
                  <select
                    id="aiId"
                    value={selectedAiId}
                    onChange={(event) => setSelectedAiId(event.target.value)}
                    disabled={aiProfilesLoading || myAiProfiles.length === 0}
                    className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">Aucune IA</option>
                    {myAiProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name ?? `IA ${profile.id.slice(0, 5)}`}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500">
                    {aiProfilesLoading
                      ? 'Chargement des IA...'
                      : myAiProfiles.length
                        ? 'Selectionnez une IA existante si votre demande la concerne.'
                        : 'Vous n avez pas encore d IA dans votre compte.'}
                  </p>
                </div>

                {renderRequestTypeFields()}

                {submitError && <p className="text-sm text-rose-300">{submitError}</p>}
                {submitSuccess && <p className="text-sm text-emerald-300">{submitSuccess}</p>}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
                >
                  {isSubmitting ? 'Envoi...' : 'Envoyer la demande'}
                </button>
              </form>
            </article>

            <article className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Suivi des demandes IA</h2>
                  <p className="text-sm text-slate-400">Timeline statuts + infos IA + note admin.</p>
                </div>
                <span className="text-xs text-slate-500">
                  {demandesLoading ? 'Chargement...' : `${sortedDemandes.length} demandes`}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
                <span>En attente: {statusSummary.pending}</span>
                <span>Assignees: {statusSummary.matched}</span>
                <span>Acceptees: {statusSummary.accepted}</span>
                <span>Annulees: {statusSummary.cancelled}</span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[1.3fr_0.7fr]">
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wide text-slate-400">Recherche</label>
                  <input
                    value={demandeSearch}
                    onChange={(event) => setDemandeSearch(event.target.value)}
                    className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600"
                    placeholder="Titre, IA, note admin..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wide text-slate-400">Filtre statut</label>
                  <select
                    value={demandeStatusFilter}
                    onChange={(event) => setDemandeStatusFilter(event.target.value)}
                    className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
                  >
                    <option value="all">Tous</option>
                    <option value="pending">En attente</option>
                    <option value="matched">Assignee</option>
                    <option value="accepted">Acceptee</option>
                    <option value="cancelled">Annulee</option>
                    <option value="other">Autre</option>
                  </select>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between text-[11px] text-slate-500">
                <span>
                  Resultats: {filteredDemandes.length} / {sortedDemandes.length}
                </span>
                <span>
                  Page {currentDemandesPage} / {totalDemandesPages}
                </span>
              </div>

              <div className="mt-6 space-y-3">
                {demandesLoading ? (
                  <p className="text-sm text-slate-400">Chargement des demandes...</p>
                ) : demandesError ? (
                  <p className="text-sm text-rose-300">{demandesError}</p>
                ) : filteredDemandes.length === 0 ? (
                  <p className="text-sm text-slate-400">Aucune demande pour ce filtre.</p>
                ) : (
                  paginatedDemandes.map((demande) => {
                    const statusKey = normalizeStatus(demande.status);
                    const requestType = normalizeDemandeRequestType(demande.requestType);
                    const steps = timelineSteps(demande);

                    return (
                      <div
                        key={demande.id}
                        className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold">
                            {demande.title ?? `Demande ${demande.id.slice(0, 5)}`}
                          </p>
                          <span
                            className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${statusStyles[statusKey]}`}
                          >
                            {statusLabels[statusKey]}
                          </span>
                        </div>

                        <p className="mt-1 text-xs text-slate-400">
                          Type: {requestTypeLabels[requestType]} - Admin: {formatAssignedAdmin(demande)}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          IA: {demande.aiName ?? 'Aucune'} {demande.aiId ? `(${demande.aiId.slice(0, 6)})` : ''}
                        </p>
                        {demande.description ? (
                          <p className="mt-2 text-xs text-slate-500">{demande.description}</p>
                        ) : null}

                        <div className="mt-3 rounded-xl border border-slate-800/70 bg-slate-950/60 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">Timeline</p>
                          <div className="mt-2 grid gap-2">
                            {steps.map((step) => (
                              <div key={step.key} className="flex items-center justify-between gap-3 text-xs">
                                <span className={step.done ? 'text-emerald-300' : 'text-slate-500'}>
                                  {step.done ? '●' : '○'} {step.label}
                                </span>
                                <span className="text-slate-500">{step.done ? formatDate(step.at) : '-'}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="mt-3 rounded-xl border border-slate-800/70 bg-slate-950/60 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">Brief IA</p>
                          {renderPayloadSummary(demande)}
                        </div>

                        <div className="mt-3 rounded-xl border border-slate-800/70 bg-slate-950/60 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">Note admin</p>
                          <p className="mt-1 text-xs text-slate-300">{demande.adminNote ?? 'Aucune note pour le moment.'}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {!demandesLoading && !demandesError && filteredDemandes.length > 0 && (
                <div className="mt-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setDemandePage((prev) => Math.max(1, prev - 1))}
                    disabled={currentDemandesPage === 1}
                    className="rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-600 disabled:cursor-not-allowed disabled:text-slate-600"
                  >
                    Page precedente
                  </button>
                  <button
                    type="button"
                    onClick={() => setDemandePage((prev) => Math.min(totalDemandesPages, prev + 1))}
                    disabled={currentDemandesPage === totalDemandesPages}
                    className="rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-600 disabled:cursor-not-allowed disabled:text-slate-600"
                  >
                    Page suivante
                  </button>
                </div>
              )}
            </article>
          </section>
        )}
      </div>
    </div>
  );
}

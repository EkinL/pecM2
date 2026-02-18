'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import {
  acceptDemande,
  attachDemandeAiProfile,
  auth,
  cancelDemande,
  createAiDraftFromDemande,
  fetchDemandesForPrestataireRealTime,
  fetchUtilisateurById,
  updateAiProfileDetails,
  updateAiProfileStatus,
  updateDemandeAdminNote,
} from '../../indexFirebase';
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

type Utilisateur = {
  id: string;
  mail?: string;
  pseudo?: string;
  accountDeletionRequestedAt?: unknown;
  accountDeletionRequestStatus?: string;
  accountDeletionRequestSource?: string;
  accountDeletionRequestContactEmail?: string;
  accountDeletionRequestPseudo?: string;
  accountDeletionReviewedAt?: unknown;
  accountDeletionReviewedBy?: string;
  accountDeletionReviewedByMail?: string;
  updatedAt?: unknown;
  [key: string]: unknown;
};

type DeletionStatus = 'all' | 'pending' | 'in_review' | 'completed' | 'rejected';

const demandeStatusLabels: Record<string, string> = {
  pending: 'En attente',
  matched: 'A confirmer',
  accepted: 'En cours',
  cancelled: 'Annulee',
  other: 'A verifier',
};

const demandeStatusStyles: Record<string, string> = {
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
  other: 'Classique',
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

const formatClientLabel = (demande: Demande) => {
  if (demande.clientPseudo) {
    return demande.clientPseudo;
  }
  if (demande.clientMail) {
    return demande.clientMail;
  }
  if (demande.clientId) {
    return `Client ${demande.clientId.slice(0, 5)}`;
  }
  return 'Client inconnu';
};

const timelineSteps = (demande: Demande) => {
  const normalizedStatus = normalizeStatus(demande.status);
  const isMatched =
    normalizedStatus === 'matched' ||
    normalizedStatus === 'accepted' ||
    normalizedStatus === 'cancelled';
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

const toRequestPayload = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

export default function AdminDemandesPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profil | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [demandesLoading, setDemandesLoading] = useState(true);
  const [demandesError, setDemandesError] = useState<string | null>(null);

  const [actionState, setActionState] = useState<{
    id: string;
    type: 'accept' | 'cancel' | 'save_note' | 'create_ai' | 'sync_ai';
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [demandeSearch, setDemandeSearch] = useState('');
  const [demandeStatusFilter, setDemandeStatusFilter] = useState('all');
  const [demandePage, setDemandePage] = useState(1);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

  const roleMismatch = Boolean(userId && profile?.role && profile.role !== 'admin');

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

    const unsubscribe = fetchDemandesForPrestataireRealTime(
      userId,
      (data: unknown) => {
        const nextDemandes = data as Demande[];
        setDemandes(nextDemandes);
        setDemandesLoading(false);
        setDemandesError(null);

        setAdminNotes((prev) => {
          const next = { ...prev };
          nextDemandes.forEach((demande) => {
            if (next[demande.id] === undefined) {
              next[demande.id] = demande.adminNote ?? '';
            }
          });
          return next;
        });
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
      setDeletionUsers([]);
      setDeletionUsersLoading(false);
      return;
    }

    setDeletionUsersLoading(true);

    const unsubscribe = fetchUtilisateursRealTime(
      (data: unknown) => {
        setDeletionUsers((Array.isArray(data) ? data : []) as Utilisateur[]);
        setDeletionUsersLoading(false);
        setDeletionUsersError(null);
      },
      () => {
        setDeletionUsersError('Impossible de recuperer les demandes RGPD.');
        setDeletionUsersLoading(false);
      },
    );

    return () => unsubscribe?.();
  }, [userId, roleMismatch]);

  useEffect(() => {
    setDemandePage(1);
  }, [demandeSearch, demandeStatusFilter]);

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
        requestTypeLabels[requestType],
        adminNotes[demande.id],
        demande.clientPseudo,
        demande.clientMail,
        demande.id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [sortedDemandes, demandeSearch, demandeStatusFilter, adminNotes]);

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

  const setBusy = (id: string, type: 'accept' | 'cancel' | 'save_note' | 'create_ai' | 'sync_ai') =>
    setActionState({ id, type });

  const handleAccept = async (demandeId: string) => {
    if (!userId) {
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setBusy(demandeId, 'accept');

    try {
      await acceptDemande({ demandeId, prestataireId: userId });
      setActionSuccess('Demande acceptee.');
    } catch (error) {
      console.error("Erreur lors de l'acceptation", error);
      setDemandeActionError("Impossible d'accepter la demande.");
    } finally {
      setDemandeActionState(null);
    }
  };

  const handleCancel = async (demandeId: string) => {
    if (!userId) {
      return;
    }

    const confirmed = window.confirm('Annuler cette demande ?');
    if (!confirmed) {
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setBusy(demandeId, 'cancel');

    try {
      await cancelDemande({ demandeId, reason: 'Refus admin' });
      setActionSuccess('Demande annulee.');
    } catch (error) {
      console.error("Erreur lors de l'annulation", error);
      setDemandeActionError("Impossible d'annuler la demande.");
    } finally {
      setDemandeActionState(null);
    }
  };

  const handleUpdateDeletionStatus = async (
    user: Utilisateur,
    nextStatus: Exclude<DeletionStatus, 'all'>,
  ) => {
    const currentStatus = normalizeDeletionStatus(user.accountDeletionRequestStatus);
    if (currentStatus === nextStatus || !userId) {
      return;
    }

    if (nextStatus === 'completed' || nextStatus === 'rejected') {
      const actionLabel = nextStatus === 'completed' ? 'traitee' : 'refusee';
      const confirmed = window.confirm(
        `Confirmer: marquer la demande de ${formatDeletionUserLabel(user)} comme ${actionLabel} ?`,
      );
      if (!confirmed) {
        return;
      }
    }

    setDeletionActionError(null);
    setDeletionActionSuccess(null);
    setDeletionActionState({ userId: user.id, status: nextStatus });

    try {
      await updateUtilisateurDeletionRequestStatus({
        userId: user.id,
        status: nextStatus,
        adminId: userId,
        adminMail: profile?.mail,
      });
      setDeletionActionSuccess(
        `Demande de ${formatDeletionUserLabel(user)} mise a jour: ${deletionStatusLabels[nextStatus]}.`,
      );
    } catch (error) {
      console.error('Erreur lors de la mise a jour de la demande RGPD', error);
      setDeletionActionError('Impossible de mettre a jour le statut de la demande.');
    } finally {
      setDeletionActionState(null);
    }
  };

  const handleSaveAdminNote = async (demandeId: string) => {
    const note = adminNotes[demandeId] ?? '';
    setActionError(null);
    setActionSuccess(null);
    setBusy(demandeId, 'save_note');

    try {
      await updateDemandeAdminNote({ demandeId, adminNote: note });
      setActionSuccess('Note admin enregistree.');
    } catch (error) {
      console.error('Erreur sauvegarde note admin', error);
      setActionError('Impossible de sauvegarder la note admin.');
    } finally {
      setActionState(null);
    }
  };

  const handleCreateAiDraft = async (demande: Demande) => {
    if (!demande.id || !demande.clientId) {
      setActionError('Demande incomplete: client introuvable.');
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setBusy(demande.id, 'create_ai');

    try {
      const brief = toRequestPayload(demande.payload);
      const aiName =
        demande.aiName ??
        (typeof brief.objective === 'string' ? brief.objective : undefined) ??
        demande.title ??
        `IA ${demande.id.slice(0, 5)}`;

      const draftRef = await createAiDraftFromDemande({
        demandeId: demande.id,
        ownerId: demande.clientId,
        ownerMail: demande.clientMail,
        aiName,
        requestType: demande.requestType,
        payload: brief,
      });

      await attachDemandeAiProfile({
        demandeId: demande.id,
        aiId: draftRef.id,
        aiName,
      });

      setActionSuccess('Brouillon IA cree et lie a la demande.');
    } catch (error) {
      console.error('Erreur creation brouillon IA', error);
      setActionError('Impossible de creer le brouillon IA.');
    } finally {
      setActionState(null);
    }
  };

  const handleSyncToAiProfile = async (demande: Demande) => {
    if (!demande.id || !demande.aiId || !userId) {
      setActionError('Synchronisation impossible: IA non liee.');
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setBusy(demande.id, 'sync_ai');

    try {
      const requestType = normalizeDemandeRequestType(demande.requestType);
      const demandeStatus = normalizeStatus(demande.status);
      const note = adminNotes[demande.id] ?? demande.adminNote;
      const brief = toRequestPayload(demande.payload);

      if (requestType === 'moderation' || requestType === 'incident') {
        let targetStatus: 'pending' | 'active' | 'rejected' | 'suspended' = 'pending';
        if (requestType === 'incident' && demandeStatus === 'accepted') {
          targetStatus = 'suspended';
        } else if (demandeStatus === 'accepted') {
          targetStatus = 'active';
        } else if (demandeStatus === 'cancelled') {
          targetStatus = 'rejected';
        }

        await updateAiProfileStatus({
          profileId: demande.aiId,
          status: targetStatus,
          adminId: userId,
          adminMail: profile?.mail ?? undefined,
          note,
        });
      }

      if (requestType === 'update_ai') {
        const updates: Record<string, unknown> = {};
        if (typeof brief.mentality === 'string') {
          updates.mentality = brief.mentality;
        }
        if (typeof brief.voice === 'string') {
          updates.voice = brief.voice;
        }
        if (brief.look && typeof brief.look === 'object') {
          updates.look = brief.look;
        }
        if (Object.keys(updates).length > 0) {
          await updateAiProfileDetails({
            profileId: demande.aiId,
            updates,
          });
        }
      }

      await attachDemandeAiProfile({
        demandeId: demande.id,
        aiId: demande.aiId,
        aiName: demande.aiName,
      });

      setActionSuccess('Demande synchronisee vers le profil IA.');
    } catch (error) {
      console.error('Erreur synchronisation demande -> IA', error);
      setActionError('Impossible de synchroniser cette demande vers IA.');
    } finally {
      setActionState(null);
    }
  };

  const renderPayloadSummary = (demande: Demande) => {
    const entries = Object.entries(toRequestPayload(demande.payload)).filter(([, value]) => {
      if (typeof value === 'string') {
        return value.trim().length > 0;
      }
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return Boolean(value);
    });

    if (!entries.length) {
      return <p className="text-[11px] text-slate-500">Aucun detail structuré.</p>;
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
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Espace admin</p>
          <h1 className="text-3xl font-semibold md:text-4xl">Demandes IA a traiter</h1>
          <p className="text-sm text-slate-400 md:text-base">
            Traitement des demandes IA assignees: timeline, note admin, creation de brouillon IA et
            synchronisation vers `iaProfiles`.
          </p>
        </header>

        {!userId ? (
          <section className="rounded-3xl border border-slate-800/80 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
            <h2 className="text-lg font-semibold">Connexion requise</h2>
            <p className="mt-2 text-sm text-slate-400">Connectez-vous pour voir vos demandes.</p>
            <Link
              href="/auth"
              className="mt-4 inline-flex items-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Aller a la connexion
            </Link>
          </section>
        ) : roleMismatch ? (
          <section className="rounded-3xl border border-slate-800/80 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
            <h2 className="text-lg font-semibold">Acces reserve aux admins</h2>
            <p className="mt-2 text-sm text-slate-400">
              Connectez-vous avec un compte admin pour acceder a cet espace.
            </p>
          </section>
        ) : (
          <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Flux demandes IA</h2>
                <p className="text-sm text-slate-400">
                  Les demandes historiques restent visibles, les nouvelles demandes IA portent un
                  `requestType`.
                </p>
              </div>
              {profileLoading ? (
                <span className="text-xs text-slate-500">Profil...</span>
              ) : profileError ? (
                <span className="text-xs text-rose-300">{profileError}</span>
              ) : (
                <span className="text-xs text-slate-500">
                  Role: {profile?.role ?? 'non defini'}
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
              <span>A confirmer: {statusSummary.matched}</span>
              <span>En cours: {statusSummary.accepted}</span>
              <span>Annulees: {statusSummary.cancelled}</span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1.3fr_0.7fr]">
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wide text-slate-400">
                  Recherche
                </label>
                <input
                  value={demandeSearch}
                  onChange={(event) => setDemandeSearch(event.target.value)}
                  className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600"
                  placeholder="Client, IA, note admin..."
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wide text-slate-400">
                  Filtre statut
                </label>
                <select
                  value={demandeStatusFilter}
                  onChange={(event) => setDemandeStatusFilter(event.target.value)}
                  className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
                >
                  <option value="all">Tous</option>
                  <option value="pending">En attente</option>
                  <option value="matched">A confirmer</option>
                  <option value="accepted">En cours</option>
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

            {(actionError || actionSuccess) && (
              <div className="mt-4">
                {actionError && <p className="text-sm text-rose-300">{actionError}</p>}
                {actionSuccess && <p className="text-sm text-emerald-300">{actionSuccess}</p>}
              </div>
            )}

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
                  const isBusy = actionState?.id === demande.id;
                  const canAccept = statusKey === 'matched';
                  const canCancel = statusKey === 'matched' || statusKey === 'accepted';
                  const noteValue = adminNotes[demande.id] ?? '';
                  const timeline = timelineSteps(demande);
                  const canCreateAiDraft =
                    requestType === 'create_ai' && statusKey === 'accepted' && !demande.aiId;
                  const canSyncAi =
                    ['update_ai', 'moderation', 'incident'].includes(requestType) &&
                    Boolean(demande.aiId);

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
                        Type: {requestTypeLabels[requestType]}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Client: {formatClientLabel(demande)}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        IA: {demande.aiName ?? 'Aucune'}{' '}
                        {demande.aiId ? `(${demande.aiId.slice(0, 6)})` : ''}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Creee le {formatDate(demande.createdAt)} - Maj{' '}
                        {formatDate(demande.updatedAt)}
                      </p>

                      {demande.description ? (
                        <p className="mt-2 text-xs text-slate-500">{demande.description}</p>
                      ) : null}

                      <div className="mt-3 rounded-xl border border-slate-800/70 bg-slate-950/60 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">
                          Timeline
                        </p>
                        <div className="mt-2 grid gap-2">
                          {timeline.map((step) => (
                            <div
                              key={step.key}
                              className="flex items-center justify-between gap-3 text-xs"
                            >
                              <span className={step.done ? 'text-emerald-300' : 'text-slate-500'}>
                                {step.done ? '●' : '○'} {step.label}
                              </span>
                              <span className="text-slate-500">
                                {step.done ? formatDate(step.at) : '-'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-3 rounded-xl border border-slate-800/70 bg-slate-950/60 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">
                          Brief IA
                        </p>
                        {renderPayloadSummary(demande)}
                      </div>

                      <div className="mt-3 rounded-xl border border-slate-800/70 bg-slate-950/60 p-3">
                        <label className="text-[11px] uppercase tracking-wide text-slate-400">
                          Note admin
                        </label>
                        <textarea
                          rows={2}
                          value={noteValue}
                          onChange={(event) =>
                            setAdminNotes((prev) => ({ ...prev, [demande.id]: event.target.value }))
                          }
                          className="mt-2 w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-200"
                          placeholder="Message visible dans le suivi client"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveAdminNote(demande.id)}
                          disabled={isBusy}
                          className="mt-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isBusy && actionState?.type === 'save_note'
                            ? 'Sauvegarde...'
                            : 'Sauvegarder la note'}
                        </button>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {demande.clientId ? (
                          <Link
                            href={`/admin/users/${user.id}/logs`}
                            className="rounded-lg border border-slate-700/70 bg-slate-900/40 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
                          >
                            Logs user
                          </Link>
                        ) : null}

                        {canAccept && (
                          <button
                            type="button"
                            onClick={() => void handleUpdateDeletionStatus(user, 'in_review')}
                            disabled={isBusy || status === 'in_review'}
                            className="rounded-lg border border-sky-400/60 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200 transition hover:border-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isBusy && actionState?.type === 'accept'
                              ? 'Validation...'
                              : 'Accepter'}
                          </button>
                        )}

                        {canCancel && (
                          <button
                            type="button"
                            onClick={() => void handleUpdateDeletionStatus(user, 'completed')}
                            disabled={isBusy || status === 'completed'}
                            className="rounded-lg border border-emerald-400/60 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isBusy && deletionActionState?.status === 'completed'
                              ? 'Mise a jour...'
                              : 'Marquer traitee'}
                          </button>
                        )}

                        {canCreateAiDraft && (
                          <button
                            type="button"
                            onClick={() => handleCreateAiDraft(demande)}
                            disabled={isBusy}
                            className="rounded-lg border border-cyan-400/60 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:border-cyan-300 disabled:cursor-not-allowed"
                          >
                            {isBusy && actionState?.type === 'create_ai'
                              ? 'Creation IA...'
                              : 'Creer IA depuis la demande'}
                          </button>
                        )}

                        {canSyncAi && (
                          <button
                            type="button"
                            onClick={() => handleSyncToAiProfile(demande)}
                            disabled={isBusy}
                            className="rounded-lg border border-indigo-400/60 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition hover:border-indigo-300 disabled:cursor-not-allowed"
                          >
                            {isBusy && actionState?.type === 'sync_ai'
                              ? 'Synchronisation...'
                              : 'Pousser vers IA profile'}
                          </button>
                        )}
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
            </section>
          </>
        )}
      </div>
    </div>
  );
}

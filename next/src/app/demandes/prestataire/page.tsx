'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import {
  acceptDemande,
  auth,
  cancelDemande,
  fetchDemandesForPrestataireRealTime,
  fetchUtilisateurById,
  fetchUtilisateursRealTime,
  updateUtilisateurDeletionRequestStatus,
} from '../../indexFirebase';

type Timestamp = {
  seconds?: number;
  nanoseconds?: number;
};

type Demande = {
  id: string;
  title?: string;
  description?: string;
  category?: string;
  budget?: number;
  city?: string;
  availability?: string;
  status?: string;
  clientPseudo?: string;
  clientMail?: string;
  clientId?: string;
  location?: {
    lat?: number;
    lng?: number;
    accuracy?: number;
  };
  locationUpdatedAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  [key: string]: unknown;
};

type GeoLocation = {
  lat: number;
  lng: number;
  accuracy?: number;
};

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

const deletionStatusLabels: Record<Exclude<DeletionStatus, 'all'>, string> = {
  pending: 'En attente',
  in_review: 'En cours',
  completed: 'Traitee',
  rejected: 'Refusee',
};

const deletionStatusStyles: Record<Exclude<DeletionStatus, 'all'>, string> = {
  pending: 'bg-amber-100/80 text-amber-700 border border-amber-400/70',
  in_review: 'bg-sky-100/80 text-sky-700 border border-sky-400/70',
  completed: 'bg-emerald-100/80 text-emerald-700 border border-emerald-400/70',
  rejected: 'bg-rose-100/80 text-rose-700 border border-rose-400/70',
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
  if (typeof value === 'object' && value?.seconds) {
    return new Date(value.seconds * 1000).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }
  return '-';
};

const normalizeDeletionStatus = (status?: string): Exclude<DeletionStatus, 'all'> => {
  const normalized = status?.trim().toLowerCase() ?? '';
  if (normalized === 'pending') {
    return 'pending';
  }
  if (normalized === 'in_review' || normalized === 'processing') {
    return 'in_review';
  }
  if (normalized === 'completed' || normalized === 'done' || normalized === 'approved') {
    return 'completed';
  }
  if (normalized === 'rejected' || normalized === 'declined') {
    return 'rejected';
  }
  return 'pending';
};

const toMillis = (value?: unknown): number | null => {
  if (!value) {
    return null;
  }
  if (
    typeof value === 'object' &&
    value &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (
    typeof value === 'object' &&
    value &&
    'seconds' in value &&
    typeof (value as { seconds?: unknown }).seconds === 'number'
  ) {
    return (value as { seconds: number }).seconds * 1000;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const formatDeletionDate = (value?: unknown) => {
  const millis = toMillis(value);
  if (!millis) {
    return '-';
  }
  return new Date(millis).toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
};

const formatCoordinates = (location?: GeoLocation | null) => {
  if (!location) {
    return 'Position inconnue';
  }
  return `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
};

const formatAccuracy = (accuracy?: number) => {
  if (typeof accuracy !== 'number') {
    return 'Precision inconnue';
  }
  return `±${Math.round(accuracy)} m`;
};

const buildMapEmbedUrl = (location: GeoLocation) => {
  const delta = 0.02;
  const left = location.lng - delta;
  const right = location.lng + delta;
  const top = location.lat + delta;
  const bottom = location.lat - delta;
  const bbox = `${left},${bottom},${right},${top}`;

  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
    bbox,
  )}&layer=mapnik&marker=${location.lat}%2C${location.lng}`;
};

const buildMapLink = (location: GeoLocation) =>
  `https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=16/${location.lat}/${location.lng}`;

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

const formatDeletionUserLabel = (user: Utilisateur) => {
  if (user.pseudo) {
    return user.pseudo;
  }
  if (user.mail) {
    return user.mail;
  }
  return `Utilisateur ${user.id.slice(0, 6)}`;
};

export default function AdminDemandesPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profil | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [demandesLoading, setDemandesLoading] = useState(true);
  const [demandesError, setDemandesError] = useState<string | null>(null);
  const [demandeActionState, setDemandeActionState] = useState<{
    id: string;
    type: 'accept' | 'cancel';
  } | null>(null);
  const [demandeActionError, setDemandeActionError] = useState<string | null>(null);
  const [demandeActionSuccess, setDemandeActionSuccess] = useState<string | null>(null);
  const [demandeSearch, setDemandeSearch] = useState('');
  const [demandeStatusFilter, setDemandeStatusFilter] = useState('all');
  const [demandePage, setDemandePage] = useState(1);
  const [deletionUsers, setDeletionUsers] = useState<Utilisateur[]>([]);
  const [deletionUsersLoading, setDeletionUsersLoading] = useState(true);
  const [deletionUsersError, setDeletionUsersError] = useState<string | null>(null);
  const [deletionSearch, setDeletionSearch] = useState('');
  const [deletionStatusFilter, setDeletionStatusFilter] = useState<DeletionStatus>('pending');
  const [deletionActionState, setDeletionActionState] = useState<{
    userId: string;
    status: Exclude<DeletionStatus, 'all'>;
  } | null>(null);
  const [deletionActionError, setDeletionActionError] = useState<string | null>(null);
  const [deletionActionSuccess, setDeletionActionSuccess] = useState<string | null>(null);
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
      const haystack = [
        demande.title,
        demande.description,
        demande.category,
        demande.city,
        demande.clientPseudo,
        demande.clientMail,
        demande.id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [sortedDemandes, demandeSearch, demandeStatusFilter]);

  const demandesPageSize = 5;
  const totalDemandesPages = Math.max(1, Math.ceil(filteredDemandes.length / demandesPageSize));
  const currentDemandesPage = Math.min(demandePage, totalDemandesPages);
  const paginatedDemandes = useMemo(() => {
    const start = (currentDemandesPage - 1) * demandesPageSize;
    return filteredDemandes.slice(start, start + demandesPageSize);
  }, [filteredDemandes, currentDemandesPage]);

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

  const deletionRequests = useMemo(() => {
    return [...deletionUsers]
      .filter((user) => {
        const hasRequestedAt = Boolean(user.accountDeletionRequestedAt);
        const status = user.accountDeletionRequestStatus?.trim();
        return hasRequestedAt || Boolean(status);
      })
      .sort((a, b) => {
        const aRequestedAt = toMillis(a.accountDeletionRequestedAt) ?? 0;
        const bRequestedAt = toMillis(b.accountDeletionRequestedAt) ?? 0;
        if (aRequestedAt !== bRequestedAt) {
          return bRequestedAt - aRequestedAt;
        }
        const aUpdatedAt = toMillis(a.updatedAt) ?? 0;
        const bUpdatedAt = toMillis(b.updatedAt) ?? 0;
        return bUpdatedAt - aUpdatedAt;
      });
  }, [deletionUsers]);

  const deletionSummary = useMemo(() => {
    return deletionRequests.reduce(
      (acc, user) => {
        const status = normalizeDeletionStatus(user.accountDeletionRequestStatus);
        acc.total += 1;
        acc[status] += 1;
        return acc;
      },
      { total: 0, pending: 0, in_review: 0, completed: 0, rejected: 0 },
    );
  }, [deletionRequests]);

  const filteredDeletionRequests = useMemo(() => {
    const query = deletionSearch.trim().toLowerCase();

    return deletionRequests.filter((user) => {
      const status = normalizeDeletionStatus(user.accountDeletionRequestStatus);
      if (deletionStatusFilter !== 'all' && status !== deletionStatusFilter) {
        return false;
      }
      if (!query) {
        return true;
      }

      const haystack = [
        user.id,
        user.mail,
        user.pseudo,
        user.accountDeletionRequestContactEmail,
        user.accountDeletionRequestPseudo,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [deletionRequests, deletionSearch, deletionStatusFilter]);

  const handleAccept = async (demandeId: string) => {
    if (!userId) {
      return;
    }
    setDemandeActionError(null);
    setDemandeActionSuccess(null);
    setDemandeActionState({ id: demandeId, type: 'accept' });

    try {
      await acceptDemande({ demandeId, prestataireId: userId });
      setDemandeActionSuccess('Demande acceptee. Le client est notifie.');
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

    setDemandeActionError(null);
    setDemandeActionSuccess(null);
    setDemandeActionState({ id: demandeId, type: 'cancel' });

    try {
      await cancelDemande({ demandeId, reason: 'Refus client' });
      setDemandeActionSuccess('Demande annulee.');
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 md:px-6 lg:px-8">
        <header className="space-y-3 rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-900/80 via-slate-900 to-slate-950/80 p-6 shadow-2xl shadow-slate-900/40 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Espace admin</p>
          <h1 className="text-3xl font-semibold md:text-4xl">Liste des demandes a traiter</h1>
          <p className="text-sm text-slate-400 md:text-base">
            Acceptez ou annulez les demandes, le client est synchronise en temps reel.
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
            <Link
              href="/demandes/client"
              className="mt-4 inline-flex items-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Aller aux demandes client
            </Link>
          </section>
        ) : (
          <>
            <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Flux en temps reel</h2>
                  <p className="text-sm text-slate-400">
                    Appariement automatique, acceptation et annulation synchronises.
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
                    placeholder="Client, ville, categorie..."
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

              {(demandeActionError || demandeActionSuccess) && (
                <div className="mt-4">
                  {demandeActionError && (
                    <p className="text-sm text-rose-300">{demandeActionError}</p>
                  )}
                  {demandeActionSuccess && (
                    <p className="text-sm text-emerald-300">{demandeActionSuccess}</p>
                  )}
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
                    const isBusy = demandeActionState?.id === demande.id;
                    const canAccept = statusKey === 'matched';
                    const canCancel = statusKey === 'matched' || statusKey === 'accepted';
                    const hasLocation =
                      typeof demande.location?.lat === 'number' &&
                      typeof demande.location?.lng === 'number';
                    const locationData = hasLocation
                      ? {
                          lat: demande.location?.lat as number,
                          lng: demande.location?.lng as number,
                          accuracy: demande.location?.accuracy,
                        }
                      : null;

                    return (
                      <div
                        key={demande.id}
                        className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold">
                            {demande.title ?? `Demande ${demande.id.slice(0, 5)}`}
                          </p>
                          <span
                            className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${demandeStatusStyles[statusKey]}`}
                          >
                            {demandeStatusLabels[statusKey]}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">
                          Client: {formatClientLabel(demande)}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {demande.category ?? 'Categorie libre'} -{' '}
                          {demande.city ?? 'Ville inconnue'}
                        </p>
                        {demande.description ? (
                          <p className="mt-2 text-xs text-slate-500">{demande.description}</p>
                        ) : null}
                        <p className="mt-2 text-xs text-slate-500">
                          Creee le {formatDate(demande.createdAt)} - Maj{' '}
                          {formatDate(demande.updatedAt)}
                        </p>
                        <div className="mt-3 rounded-xl border border-slate-800/70 bg-slate-950/60 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                            <span>Position: {formatCoordinates(locationData)}</span>
                            {locationData?.accuracy !== undefined && (
                              <span>{formatAccuracy(locationData.accuracy)}</span>
                            )}
                          </div>
                          {demande.locationUpdatedAt && (
                            <p className="mt-1 text-[11px] text-slate-500">
                              Maj position {formatDate(demande.locationUpdatedAt)}
                            </p>
                          )}
                          {locationData ? (
                            <div className="mt-2 space-y-2">
                              <div className="aspect-[4/3] w-full overflow-hidden rounded-lg border border-slate-800/80">
                                <iframe
                                  title={`Position client ${demande.id}`}
                                  src={buildMapEmbedUrl(locationData)}
                                  className="h-full w-full"
                                  loading="lazy"
                                  referrerPolicy="no-referrer-when-downgrade"
                                />
                              </div>
                              <a
                                href={buildMapLink(locationData)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] font-semibold text-emerald-300 transition hover:text-emerald-200"
                              >
                                Ouvrir dans OpenStreetMap
                              </a>
                            </div>
                          ) : (
                            <p className="mt-2 text-[11px] text-slate-500">
                              Position client non partagee.
                            </p>
                          )}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {demande.clientId ? (
                            <Link
                              href={`/admin/users/${demande.clientId}/logs`}
                              className="rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-600"
                            >
                              Logs client
                            </Link>
                          ) : null}
                          {canAccept && (
                            <button
                              type="button"
                              onClick={() => handleAccept(demande.id)}
                              disabled={isBusy}
                              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
                            >
                              {isBusy && demandeActionState?.type === 'accept'
                                ? 'Validation...'
                                : 'Accepter'}
                            </button>
                          )}
                          {canCancel && (
                            <button
                              type="button"
                              onClick={() => handleCancel(demande.id)}
                              disabled={isBusy}
                              className="rounded-lg border border-rose-400/60 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:border-rose-300 disabled:cursor-not-allowed"
                            >
                              {isBusy && demandeActionState?.type === 'cancel'
                                ? 'Annulation...'
                                : 'Annuler'}
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
              )}
            </section>

            <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Demandes suppression compte (RGPD)</h2>
                  <p className="text-sm text-slate-400">
                    Espace mutualise pour suivre les demandes de suppression de compte.
                  </p>
                </div>
                <span className="rounded-full border border-slate-800/80 bg-slate-950/60 px-3 py-1 text-[11px] text-slate-400">
                  Total: {deletionSummary.total}
                </span>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-amber-700/30 bg-slate-950/40 p-3 text-xs text-slate-300">
                  <p className="text-slate-500">En attente</p>
                  <p className="mt-1 text-lg font-semibold text-amber-300">
                    {deletionSummary.pending}
                  </p>
                </div>
                <div className="rounded-xl border border-sky-700/30 bg-slate-950/40 p-3 text-xs text-slate-300">
                  <p className="text-slate-500">En cours</p>
                  <p className="mt-1 text-lg font-semibold text-sky-300">
                    {deletionSummary.in_review}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-700/30 bg-slate-950/40 p-3 text-xs text-slate-300">
                  <p className="text-slate-500">Traitees</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-300">
                    {deletionSummary.completed}
                  </p>
                </div>
                <div className="rounded-xl border border-rose-700/30 bg-slate-950/40 p-3 text-xs text-slate-300">
                  <p className="text-slate-500">Refusees</p>
                  <p className="mt-1 text-lg font-semibold text-rose-300">
                    {deletionSummary.rejected}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[1.3fr_0.7fr]">
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wide text-slate-400">
                    Recherche RGPD
                  </label>
                  <input
                    value={deletionSearch}
                    onChange={(event) => setDeletionSearch(event.target.value)}
                    className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600"
                    placeholder="Mail, pseudo, uid..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wide text-slate-400">
                    Filtre statut
                  </label>
                  <select
                    value={deletionStatusFilter}
                    onChange={(event) =>
                      setDeletionStatusFilter(event.target.value as DeletionStatus)
                    }
                    className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
                  >
                    <option value="all">Tous</option>
                    <option value="pending">En attente</option>
                    <option value="in_review">En cours</option>
                    <option value="completed">Traitee</option>
                    <option value="rejected">Refusee</option>
                  </select>
                </div>
              </div>

              <div className="mt-3 text-[11px] text-slate-500">
                Resultats: {filteredDeletionRequests.length} / {deletionRequests.length}
              </div>

              {(deletionUsersError || deletionActionError || deletionActionSuccess) && (
                <div className="mt-4 text-xs">
                  {deletionUsersError && <p className="text-rose-300">{deletionUsersError}</p>}
                  {deletionActionError && <p className="text-rose-300">{deletionActionError}</p>}
                  {deletionActionSuccess && (
                    <p className="text-emerald-300">{deletionActionSuccess}</p>
                  )}
                </div>
              )}

              <div className="mt-6 space-y-3">
                {deletionUsersLoading ? (
                  <p className="text-sm text-slate-400">Chargement des demandes RGPD...</p>
                ) : filteredDeletionRequests.length === 0 ? (
                  <p className="text-sm text-slate-400">Aucune demande pour ce filtre.</p>
                ) : (
                  filteredDeletionRequests.map((user) => {
                    const status = normalizeDeletionStatus(user.accountDeletionRequestStatus);
                    const isBusy = deletionActionState?.userId === user.id;

                    return (
                      <article
                        key={user.id}
                        className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">{formatDeletionUserLabel(user)}</p>
                            <p className="text-xs text-slate-500">
                              {user.mail ?? 'Email indisponible'} · UID{' '}
                              <span className="font-mono">{user.id}</span>
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${deletionStatusStyles[status]}`}
                          >
                            {deletionStatusLabels[status]}
                          </span>
                        </div>

                        <div className="mt-3 grid gap-2 text-xs text-slate-400 md:grid-cols-2">
                          <p>
                            <span className="text-slate-500">Demande:</span>{' '}
                            {formatDeletionDate(user.accountDeletionRequestedAt)}
                          </p>
                          <p>
                            <span className="text-slate-500">Source:</span>{' '}
                            {user.accountDeletionRequestSource ?? '-'}
                          </p>
                          <p>
                            <span className="text-slate-500">Contact:</span>{' '}
                            {user.accountDeletionRequestContactEmail ?? user.mail ?? '-'}
                          </p>
                          <p>
                            <span className="text-slate-500">Pseudo saisi:</span>{' '}
                            {user.accountDeletionRequestPseudo ?? user.pseudo ?? '-'}
                          </p>
                          <p>
                            <span className="text-slate-500">Derniere revue:</span>{' '}
                            {formatDeletionDate(user.accountDeletionReviewedAt)}
                          </p>
                          <p>
                            <span className="text-slate-500">Admin:</span>{' '}
                            {user.accountDeletionReviewedByMail ??
                              user.accountDeletionReviewedBy ??
                              '-'}
                          </p>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Link
                            href={`/admin/users/${user.id}/logs`}
                            className="rounded-lg border border-slate-700/70 bg-slate-900/40 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
                          >
                            Logs user
                          </Link>
                          <button
                            type="button"
                            onClick={() => void handleUpdateDeletionStatus(user, 'in_review')}
                            disabled={isBusy || status === 'in_review'}
                            className="rounded-lg border border-sky-400/60 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200 transition hover:border-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isBusy && deletionActionState?.status === 'in_review'
                              ? 'Mise a jour...'
                              : 'Prendre en charge'}
                          </button>
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
                          <button
                            type="button"
                            onClick={() => void handleUpdateDeletionStatus(user, 'rejected')}
                            disabled={isBusy || status === 'rejected'}
                            className="rounded-lg border border-rose-400/60 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isBusy && deletionActionState?.status === 'rejected'
                              ? 'Mise a jour...'
                              : 'Refuser'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleUpdateDeletionStatus(user, 'pending')}
                            disabled={isBusy || status === 'pending'}
                            className="rounded-lg border border-amber-400/60 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:border-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isBusy && deletionActionState?.status === 'pending'
                              ? 'Mise a jour...'
                              : 'Remettre en attente'}
                          </button>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

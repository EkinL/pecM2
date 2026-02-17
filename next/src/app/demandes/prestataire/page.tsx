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

const statusLabels: Record<string, string> = {
  pending: 'En attente',
  matched: 'A confirmer',
  accepted: 'En cours',
  cancelled: 'Annulee',
  other: 'A verifier',
};

const statusStyles: Record<string, string> = {
  pending: 'bg-amber-100/80 text-amber-700 border border-amber-400/70',
  matched: 'bg-sky-100/80 text-sky-700 border border-sky-400/70',
  accepted: 'bg-emerald-100/80 text-emerald-700 border border-emerald-400/70',
  cancelled: 'bg-rose-100/80 text-rose-700 border border-rose-400/70',
  other: 'bg-slate-100/80 text-slate-700 border border-slate-300/80',
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
    type: 'accept' | 'cancel';
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [demandeSearch, setDemandeSearch] = useState('');
  const [demandeStatusFilter, setDemandeStatusFilter] = useState('all');
  const [demandePage, setDemandePage] = useState(1);
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

  const handleAccept = async (demandeId: string) => {
    if (!userId) {
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    setActionState({ id: demandeId, type: 'accept' });

    try {
      await acceptDemande({ demandeId, prestataireId: userId });
      setActionSuccess('Demande acceptee. Le client est notifie.');
    } catch (error) {
      console.error("Erreur lors de l'acceptation", error);
      setActionError("Impossible d'accepter la demande.");
    } finally {
      setActionState(null);
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
    setActionState({ id: demandeId, type: 'cancel' });

    try {
      await cancelDemande({ demandeId, reason: 'Refus client' });
      setActionSuccess('Demande annulee.');
    } catch (error) {
      console.error("Erreur lors de l'annulation", error);
      setActionError("Impossible d'annuler la demande.");
    } finally {
      setActionState(null);
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
                  const isBusy = actionState?.id === demande.id;
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
                          className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${statusStyles[statusKey]}`}
                        >
                          {statusLabels[statusKey]}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        Client: {formatClientLabel(demande)}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {demande.category ?? 'Categorie libre'} - {demande.city ?? 'Ville inconnue'}
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
                            {isBusy && actionState?.type === 'accept'
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
                            {isBusy && actionState?.type === 'cancel' ? 'Annulation...' : 'Annuler'}
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
        )}
      </div>
    </div>
  );
}

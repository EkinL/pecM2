'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import {
  addDemande,
  auth,
  fetchDemandesForClientRealTime,
  fetchUtilisateurById,
  getTokenPrice,
  updateDemandeLocation,
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
  prestataireId?: string;
  prestatairePseudo?: string;
  prestataireMail?: string;
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

const requestBrowserLocation = () =>
  new Promise<GeoLocation>((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocalisation indisponible.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => reject(error),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 },
    );
  });

const formatClientLabel = (demande: Demande) => {
  if (demande.prestatairePseudo) {
    return demande.prestatairePseudo;
  }
  if (demande.prestataireMail) {
    return demande.prestataireMail;
  }
  if (demande.prestataireId) {
    return `Client ${demande.prestataireId.slice(0, 5)}`;
  }
  return 'Non assigne';
};

export default function ClientDemandesPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profil | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [demandesLoading, setDemandesLoading] = useState(true);
  const [demandesError, setDemandesError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [demandeSearch, setDemandeSearch] = useState('');
  const [demandeStatusFilter, setDemandeStatusFilter] = useState('all');
  const [demandePage, setDemandePage] = useState(1);
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [locationCapturedAt, setLocationCapturedAt] = useState<Date | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationUpdateState, setLocationUpdateState] = useState<{
    id: string;
    status: 'loading' | 'success' | 'error';
    message?: string;
  } | null>(null);
  const [tokenPrice, setTokenPrice] = useState<number | null>(null);
  const [tokenCurrency, setTokenCurrency] = useState<string | null>(null);
  const [tokenZone, setTokenZone] = useState<string | null>(null);
  const [tokenPriceLoading, setTokenPriceLoading] = useState(false);
  const [tokenPriceError, setTokenPriceError] = useState<string | null>(null);
  const roleMismatch = Boolean(userId && profile?.role && profile.role !== 'client');

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
    setDemandePage(1);
  }, [demandeSearch, demandeStatusFilter]);

  useEffect(() => {
    if (!location) {
      setTokenPrice(null);
      setTokenCurrency(null);
      setTokenZone(null);
      setTokenPriceError(null);
      setTokenPriceLoading(false);
      return;
    }

    let isActive = true;
    setTokenPriceLoading(true);
    setTokenPriceError(null);

    getTokenPrice({ lat: location.lat, lng: location.lng })
      .then((data) => {
        if (!isActive) {
          return;
        }
        if (!data || typeof data !== 'object') {
          setTokenPrice(null);
          setTokenCurrency(null);
          setTokenZone(null);
          return;
        }
        const rawPrice = data.price ?? data.amount ?? data.value;
        let priceValue: number | null = null;
        if (typeof rawPrice === 'number' && Number.isFinite(rawPrice)) {
          priceValue = rawPrice;
        }
        if (typeof rawPrice === 'string') {
          const parsed = Number(rawPrice);
          priceValue = Number.isFinite(parsed) ? parsed : null;
        }
        const currencyValue = typeof data.currency === 'string' ? data.currency : null;
        const zoneValue =
          typeof data.zone === 'string'
            ? data.zone
            : typeof data.zoneLabel === 'string'
              ? data.zoneLabel
              : null;

        setTokenPrice(priceValue);
        setTokenCurrency(currencyValue);
        setTokenZone(zoneValue);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }
        console.error('Erreur lors de la recuperation du prix dynamique', error);
        setTokenPriceError('Impossible de recuperer le tarif dynamique.');
      })
      .finally(() => {
        if (isActive) {
          setTokenPriceLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [location]);

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
        demande.prestatairePseudo,
        demande.prestataireMail,
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

  const handleRequestLocation = async () => {
    setLocationError(null);
    setLocationLoading(true);

    try {
      const nextLocation = await requestBrowserLocation();
      setLocation(nextLocation);
      setLocationCapturedAt(new Date());
    } catch (error) {
      console.error('Erreur lors de la geolocalisation', error);
      setLocationError("Impossible d'obtenir votre position.");
    } finally {
      setLocationLoading(false);
    }
  };

  const handleUpdateLocation = async (demandeId: string) => {
    setLocationUpdateState({ id: demandeId, status: 'loading' });

    try {
      const nextLocation = await requestBrowserLocation();
      await updateDemandeLocation({ demandeId, location: nextLocation });
      setLocationUpdateState({
        id: demandeId,
        status: 'success',
        message: 'Position mise a jour.',
      });
    } catch (error) {
      console.error('Erreur lors de la mise a jour de la position', error);
      setLocationUpdateState({
        id: demandeId,
        status: 'error',
        message: 'Impossible de partager la position.',
      });
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!userId) {
      setSubmitError('Connectez-vous pour envoyer une demande.');
      return;
    }

    if (profile?.role && profile.role !== 'client') {
      setSubmitError("Ce compte n'est pas un profil client.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const title = formData.get('title')?.toString().trim();
    const description = formData.get('description')?.toString().trim();
    const category = formData.get('category')?.toString().trim();
    const budget = formData.get('budget')?.toString().trim();
    const city = formData.get('city')?.toString().trim();
    const availability = formData.get('availability')?.toString().trim();

    if (!title || !description) {
      setSubmitError('Le titre et la description sont obligatoires.');
      return;
    }

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
        city,
        availability,
        location: location ?? undefined,
      });
      form.reset();
      setSubmitSuccess('Demande envoyee. Nous vous notifions du matching.');
    } catch (error) {
      console.error('Erreur lors de la creation de la demande', error);
      setSubmitError("Impossible d'envoyer la demande. Reessayez.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 md:px-6 lg:px-8">
        <header className="space-y-3 rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-900/80 via-slate-900 to-slate-950/80 p-6 shadow-2xl shadow-slate-900/40 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Espace client</p>
          <h1 className="text-3xl font-semibold md:text-4xl">Nouvelle demande & suivi</h1>
          <p className="text-sm text-slate-400 md:text-base">
            Formulaire simple, appariement automatique avec un client, suivi en temps reel.
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
            <h2 className="text-lg font-semibold">Acces reserve aux clients</h2>
            <p className="mt-2 text-sm text-slate-400">
              Connectez-vous avec un compte client pour acceder a cet espace.
            </p>
            <Link
              href="/demandes/client"
              className="mt-4 inline-flex items-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Aller aux demandes client
            </Link>
          </section>
        ) : (
          <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <article className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Formulaire de demande</h2>
                  <p className="text-sm text-slate-400">
                    Donnez un maximum de contexte pour ameliorer le matching.
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

              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <label htmlFor="title" className="text-xs uppercase tracking-wide text-slate-400">
                    Titre
                  </label>
                  <input
                    id="title"
                    name="title"
                    type="text"
                    className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                    placeholder="Ex: Coaching, support administratif..."
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="description"
                    className="text-xs uppercase tracking-wide text-slate-400"
                  >
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    rows={4}
                    className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                    placeholder="Contexte, objectifs, attentes..."
                    required
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label
                      htmlFor="category"
                      className="text-xs uppercase tracking-wide text-slate-400"
                    >
                      Categorie
                    </label>
                    <select
                      id="category"
                      name="category"
                      className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100"
                    >
                      <option value="">Selectionner</option>
                      <option value="coaching">Coaching</option>
                      <option value="support">Support</option>
                      <option value="conseil">Conseil</option>
                      <option value="autre">Autre</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="budget"
                      className="text-xs uppercase tracking-wide text-slate-400"
                    >
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
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label
                      htmlFor="city"
                      className="text-xs uppercase tracking-wide text-slate-400"
                    >
                      Ville
                    </label>
                    <input
                      id="city"
                      name="city"
                      type="text"
                      className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                      placeholder="Paris, Lyon..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="availability"
                      className="text-xs uppercase tracking-wide text-slate-400"
                    >
                      Disponibilite
                    </label>
                    <input
                      id="availability"
                      name="availability"
                      type="text"
                      className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                      placeholder="Ex: Cette semaine, lundi..."
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">
                        Geolocalisation
                      </p>
                      <p className="text-xs text-slate-500">
                        Partagez votre position pour aider le client a vous suivre.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRequestLocation}
                      disabled={locationLoading}
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
                    >
                      {locationLoading ? 'Localisation...' : 'Detecter ma position'}
                    </button>
                  </div>
                  {locationError && <p className="mt-2 text-xs text-rose-300">{locationError}</p>}
                  {location ? (
                    <div className="mt-3 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                        <span>Position: {formatCoordinates(location)}</span>
                        <span>{formatAccuracy(location.accuracy)}</span>
                      </div>
                      {locationCapturedAt && (
                        <p className="text-[11px] text-slate-500">
                          Capture le{' '}
                          {locationCapturedAt.toLocaleString('fr-FR', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </p>
                      )}
                      <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/60">
                        <iframe
                          title="Position client"
                          src={buildMapEmbedUrl(location)}
                          className="h-full w-full"
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                        />
                      </div>
                      <a
                        href={buildMapLink(location)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-semibold text-emerald-300 transition hover:text-emerald-200"
                      >
                        Ouvrir dans OpenStreetMap
                      </a>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">
                      Aucune position partagee pour l&apos;instant.
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">
                        Prix dynamique
                      </p>
                      <p className="text-xs text-slate-500">
                        Calcule via <code>getTokenPrice</code> selon votre zone.
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-white">
                      {tokenPriceLoading
                        ? 'Calcul...'
                        : tokenPrice !== null
                          ? `${tokenPrice.toLocaleString('fr-FR')} ${tokenCurrency ?? ''}`.trim()
                          : 'Non disponible'}
                    </span>
                  </div>
                  {tokenZone && (
                    <p className="mt-2 text-xs text-slate-400">Zone detectee: {tokenZone}</p>
                  )}
                  {tokenPriceError && (
                    <p className="mt-2 text-xs text-rose-300">{tokenPriceError}</p>
                  )}
                  {!location && (
                    <p className="mt-2 text-xs text-slate-500">
                      Activez la geolocalisation pour obtenir un tarif adapte.
                    </p>
                  )}
                </div>

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
                  <h2 className="text-xl font-semibold">Suivi des demandes</h2>
                  <p className="text-sm text-slate-400">
                    Appariement automatique et controle accept/annuler.
                  </p>
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
                  <label className="text-[11px] uppercase tracking-wide text-slate-400">
                    Recherche
                  </label>
                  <input
                    value={demandeSearch}
                    onChange={(event) => setDemandeSearch(event.target.value)}
                    className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600"
                    placeholder="Titre, ville, client..."
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
                    const isUpdatingLocation =
                      locationUpdateState?.id === demande.id &&
                      locationUpdateState.status === 'loading';
                    const locationMessage =
                      locationUpdateState?.id === demande.id ? locationUpdateState.message : null;
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
                          {demande.category ?? 'Categorie libre'} -{' '}
                          {demande.city ?? 'Ville inconnue'}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Client: {formatClientLabel(demande)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Creee le {formatDate(demande.createdAt)}
                        </p>
                        <div className="mt-3 rounded-xl border border-slate-800/70 bg-slate-950/60 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                            <span>Position: {formatCoordinates(locationData)}</span>
                            {demande.locationUpdatedAt && (
                              <span>Maj {formatDate(demande.locationUpdatedAt)}</span>
                            )}
                          </div>
                          {locationData ? (
                            <div className="mt-2 aspect-[4/3] w-full overflow-hidden rounded-lg border border-slate-800/80">
                              <iframe
                                title={`Position demande ${demande.id}`}
                                src={buildMapEmbedUrl(locationData)}
                                className="h-full w-full"
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                              />
                            </div>
                          ) : (
                            <p className="mt-2 text-[11px] text-slate-500">
                              Aucune position partagee pour cette demande.
                            </p>
                          )}
                          {locationMessage && (
                            <p
                              className={`mt-2 text-[11px] ${
                                locationUpdateState?.status === 'error'
                                  ? 'text-rose-300'
                                  : 'text-emerald-300'
                              }`}
                            >
                              {locationMessage}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => handleUpdateLocation(demande.id)}
                            disabled={isUpdatingLocation}
                            className="mt-3 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
                          >
                            {isUpdatingLocation ? 'Mise a jour...' : 'Mettre a jour ma position'}
                          </button>
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

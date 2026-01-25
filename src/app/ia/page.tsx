'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  auth,
  createConversation,
  fetchAiEvaluationsRealTime,
  fetchAiProfilesRealTime,
  fetchConversationsForUserRealTime,
  fetchUtilisateursRealTime,
  fetchUtilisateurByIdRealTime,
} from "../indexFirebase";
import { formatLookSummary } from "./aiOptions";
import {
  countryLabelByCode,
  countryOptions,
  isValidCountryCode,
  normalizeCountryCodeInput,
  readStoredManualCountry,
  writeStoredManualCountry,
} from "../data/countries";

type Timestamp = {
  seconds?: number;
  nanoseconds?: number;
};

type Profil = {
  id: string;
  mail?: string;
  pseudo?: string;
  role?: string;
  tokens?: number;
};

type Utilisateur = {
  id: string;
  mail?: string;
  pseudo?: string;
  role?: string;
};

type AiProfile = {
  id: string;
  ownerId?: string;
  name?: string;
  mentality?: string;
  voice?: string;
  voiceRhythm?: string;
  look?: {
    gender?: string;
    skin?: string;
    hair?: string;
    hairColor?: string;
    eyeColor?: string;
    age?: string;
    height?: string;
    bodyType?: string;
    facialHair?: string;
    makeup?: string;
    glasses?: string;
    accessories?: string;
    piercings?: string;
    tattoos?: string;
    scars?: string;
    outfit?: string;
    ethnicity?: string;
  };
  imageUrl?: string;
  status?: string;
  statusNote?: string;
  ownerNotification?: string;
  hiddenFromCatalogue?: boolean;
  safetyWarnings?: string[];
  warningCount?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  [key: string]: unknown;
};

type Conversation = {
  id: string;
  userId?: string;
  aiId?: string;
  status?: string;
  updatedAt?: Timestamp;
  createdAt?: Timestamp;
  [key: string]: unknown;
};

type AiEvaluation = {
  id: string;
  aiId?: string;
  rating?: number;
  [key: string]: unknown;
};

const formatDate = (value?: Timestamp | string) => {
  if (!value) {
    return "—";
  }
  if (typeof value === "string") {
    return new Date(value).toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }
  if (typeof value === "object" && value?.seconds) {
    return new Date(value.seconds * 1000).toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }
  return "—";
};

const formatAverageRating = (value?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Non notee";
  }
  return `${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}/5`;
};

const formatOwnerLabel = (owner?: Utilisateur) => {
  if (!owner) {
    return "Créateur inconnu";
  }
  if (owner.pseudo) {
    return owner.pseudo;
  }
  if (owner.mail) {
    return owner.mail;
  }
  return owner.id ? `Créateur ${owner.id.slice(0, 5)}` : "Créateur";
};

const normalizeFilterValue = (value?: string) => value?.trim().toLowerCase() ?? "";

const buildFilterOptions = (values: Array<string | undefined>) => {
  const map = new Map<string, string>();
  values.forEach((value) => {
    if (typeof value !== "string") {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    const key = trimmed.toLowerCase();
    if (!map.has(key)) {
      map.set(key, trimmed);
    }
  });
  return Array.from(map.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr-FR"));
};

const matchesFilter = (value: string | undefined, filter: string) => {
  if (filter === "all") {
    return true;
  }
  if (filter === "__missing__") {
    return !normalizeFilterValue(value);
  }
  return normalizeFilterValue(value) === filter;
};

const normalizeStatus = (status?: string) => {
  const normalized = status?.toLowerCase() ?? "pending";
  if (["pending", "active", "suspended", "disabled", "rejected"].includes(normalized)) {
    return normalized;
  }
  return "pending";
};

const statusLabels: Record<string, string> = {
  pending: "En attente",
  active: "Active",
  suspended: "Suspendue",
  disabled: "Desactivee",
  rejected: "Refusee",
};

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100/80 text-amber-700 border border-amber-400/70",
  active: "bg-emerald-100/80 text-emerald-700 border border-emerald-400/70",
  suspended: "bg-sky-100/80 text-sky-700 border border-sky-400/70",
  disabled: "bg-slate-100/80 text-slate-700 border border-slate-300/80",
  rejected: "bg-rose-100/80 text-rose-700 border border-rose-400/70",
};

const LOCATION_FAILURE_THRESHOLD = 3;

export default function IaCataloguePage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [authMail, setAuthMail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profil | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<"pending" | "ready" | "error">(
    "pending"
  );
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationFailures, setLocationFailures] = useState(0);
  const [manualCountry, setManualCountry] = useState<{ code: string; label: string } | null>(
    null
  );
  const [manualCountrySelect, setManualCountrySelect] = useState("");
  const [manualCountryInput, setManualCountryInput] = useState("");
  const [manualCountryError, setManualCountryError] = useState<string | null>(null);

  const [aiProfiles, setAiProfiles] = useState<AiProfile[]>([]);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiError, setAiError] = useState<string | null>(null);
  const [users, setUsers] = useState<Utilisateur[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const [evaluations, setEvaluations] = useState<AiEvaluation[]>([]);
  const [evaluationsLoading, setEvaluationsLoading] = useState(true);
  const [evaluationsError, setEvaluationsError] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsError, setConversationsError] = useState<string | null>(null);

  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mentalityFilter, setMentalityFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [skinFilter, setSkinFilter] = useState("all");
  const [hairFilter, setHairFilter] = useState("all");
  const [outfitFilter, setOutfitFilter] = useState("all");
  const [ethnicityFilter, setEthnicityFilter] = useState("all");
  const roleMismatch = Boolean(userId && profile?.role && profile.role !== "client");
  const isAdminUser = profile?.role === "admin";
  const locationRequired = Boolean(userId) && !roleMismatch;
  const locationReady = locationStatus === "ready" || Boolean(manualCountry);
  const locationBlocked = locationRequired && !locationReady;
  const locationCtaLabel =
    locationStatus === "pending" ? "Localisation..." : "Activer la localisation";

  useEffect(() => {
    const stored = readStoredManualCountry();
    if (stored) {
      setManualCountry(stored);
    }
  }, []);

  const requestLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationStatus("error");
      setLocationError("Geolocalisation indisponible.");
      setLocationFailures((prev) => Math.max(prev, LOCATION_FAILURE_THRESHOLD));
      return;
    }

    setLocationError(null);
    setLocationStatus("pending");
    navigator.geolocation.getCurrentPosition(
      () => {
        setLocationStatus("ready");
        setLocationError(null);
        setLocationFailures(0);
      },
      () => {
        setLocationStatus("error");
        setLocationError("Localisation requise pour continuer.");
        setLocationFailures((prev) => prev + 1);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
    );
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setUserId(null);
        setAuthMail(null);
        setProfile(null);
        setProfileLoading(false);
        return;
      }

      setUserId(user.uid);
      setAuthMail(user.email ?? null);
      setProfileLoading(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    const unsubscribe = fetchUtilisateurByIdRealTime(
      userId,
      (data) => {
        setProfile(data as Profil | null);
        setProfileError(null);
        setProfileLoading(false);
      },
      () => {
        setProfileError("Impossible de recuperer le profil.");
        setProfileLoading(false);
      }
    );

    return () => unsubscribe?.();
  }, [userId]);

  useEffect(() => {
    if (!locationRequired) {
      setLocationStatus("pending");
      setLocationError(null);
      setLocationFailures(0);
      return;
    }
    if (manualCountry) {
      setLocationStatus("ready");
      setLocationError(null);
      return;
    }
    requestLocation();
  }, [locationRequired, manualCountry, requestLocation]);

  const applyManualCountry = () => {
    const selectedCode =
      manualCountrySelect === "custom"
        ? normalizeCountryCodeInput(manualCountryInput)
        : normalizeCountryCodeInput(manualCountrySelect);

    if (!isValidCountryCode(selectedCode)) {
      setManualCountryError("Selectionnez un pays ou un code ISO valide.");
      return;
    }

    const label = countryLabelByCode[selectedCode] ?? `Pays ${selectedCode}`;
    writeStoredManualCountry(selectedCode, label);
    setManualCountry({ code: selectedCode, label });
    setLocationStatus("ready");
    setLocationError(null);
    setLocationFailures(0);
    setManualCountryError(null);
    setManualCountrySelect("");
    setManualCountryInput("");
  };

  useEffect(() => {
    setAiLoading(true);
    const unsubscribe = fetchAiProfilesRealTime(
      (data) => {
        setAiProfiles(data as AiProfile[]);
        setAiLoading(false);
        setAiError(null);
      },
      () => {
        setAiError("Impossible de recuperer les IA.");
        setAiLoading(false);
      }
    );

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    setUsersLoading(true);
    const unsubscribe = fetchUtilisateursRealTime(
      (data) => {
        setUsers(data as Utilisateur[]);
        setUsersLoading(false);
        setUsersError(null);
      },
      (error) => {
        console.error("Impossible de recuperer les createurs IA", error);
        setUsersError("Impossible de recuperer les createurs.");
        setUsersLoading(false);
      }
    );

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    setEvaluationsLoading(true);
    const unsubscribe = fetchAiEvaluationsRealTime(
      (data) => {
        setEvaluations(data as AiEvaluation[]);
        setEvaluationsLoading(false);
        setEvaluationsError(null);
      },
      () => {
        setEvaluationsError("Impossible de recuperer les evaluations.");
        setEvaluationsLoading(false);
      }
    );

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (!userId || roleMismatch) {
      setConversations([]);
      setConversationsLoading(false);
      return;
    }

    setConversationsLoading(true);
    const unsubscribe = fetchConversationsForUserRealTime(
      userId,
      (data) => {
        setConversations(data as Conversation[]);
        setConversationsLoading(false);
        setConversationsError(null);
      },
      () => {
        setConversationsError("Impossible de recuperer les conversations.");
        setConversationsLoading(false);
      }
    );

    return () => unsubscribe?.();
  }, [userId, roleMismatch]);

  const usersById = useMemo(() => {
    const map: Record<string, Utilisateur> = {};
    users.forEach((user) => {
      if (user.id) {
        map[user.id] = user;
      }
    });
    return map;
  }, [users]);

  const conversationsByAi = useMemo(() => {
    const map: Record<string, Conversation> = {};
    conversations.forEach((conversation) => {
      if (conversation.aiId) {
        map[conversation.aiId] = conversation;
      }
    });
    return map;
  }, [conversations]);

  const ratingSummaryByAi = useMemo(() => {
    const totals: Record<string, { total: number; count: number }> = {};

    evaluations.forEach((evaluation) => {
      if (!evaluation.aiId) {
        return;
      }
      if (typeof evaluation.rating !== "number" || !Number.isFinite(evaluation.rating)) {
        return;
      }
      totals[evaluation.aiId] = totals[evaluation.aiId] ?? { total: 0, count: 0 };
      totals[evaluation.aiId].total += evaluation.rating;
      totals[evaluation.aiId].count += 1;
    });

    return Object.entries(totals).reduce(
      (acc, [aiId, { total, count }]) => {
        if (count > 0) {
          acc[aiId] = {
            average: Math.round((total / count) * 10) / 10,
            count,
          };
        }
        return acc;
      },
      {} as Record<string, { average: number; count: number }>
    );
  }, [evaluations]);

  const mentalityOptions = useMemo(
    () => buildFilterOptions(aiProfiles.map((profileItem) => profileItem.mentality)),
    [aiProfiles]
  );

  const appearanceOptions = useMemo(
    () => ({
      gender: buildFilterOptions(aiProfiles.map((profileItem) => profileItem.look?.gender)),
      skin: buildFilterOptions(aiProfiles.map((profileItem) => profileItem.look?.skin)),
      hair: buildFilterOptions(aiProfiles.map((profileItem) => profileItem.look?.hair)),
      outfit: buildFilterOptions(aiProfiles.map((profileItem) => profileItem.look?.outfit)),
      ethnicity: buildFilterOptions(aiProfiles.map((profileItem) => profileItem.look?.ethnicity)),
    }),
    [aiProfiles]
  );

  const sortedAiProfiles = useMemo(
    () =>
      [...aiProfiles].sort(
        (a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
      ),
    [aiProfiles]
  );

  const isCatalogProfileVisible = (profileItem: AiProfile) =>
    isAdminUser ||
    (!profileItem.hiddenFromCatalogue && profileItem.visibility !== "private");

  const filteredAiProfiles = useMemo(() => {
    const normalizedSearch = normalizeFilterValue(searchQuery);

    if (statusFilter === "all") {
      return sortedAiProfiles.filter((profileItem) => {
        const name = normalizeFilterValue(profileItem.name);
        if (normalizedSearch && !name.includes(normalizedSearch)) {
          return false;
        }
        if (!matchesFilter(profileItem.mentality, mentalityFilter)) {
          return false;
        }
        if (!matchesFilter(profileItem.look?.gender, genderFilter)) {
          return false;
        }
        if (!matchesFilter(profileItem.look?.skin, skinFilter)) {
          return false;
        }
        if (!matchesFilter(profileItem.look?.hair, hairFilter)) {
          return false;
        }
        if (!matchesFilter(profileItem.look?.outfit, outfitFilter)) {
          return false;
        }
        if (!matchesFilter(profileItem.look?.ethnicity, ethnicityFilter)) {
          return false;
        }
        if (!isCatalogProfileVisible(profileItem)) {
          return false;
        }
        return true;
      });
    }
    if (statusFilter === "available") {
      return sortedAiProfiles.filter((profileItem) => {
        const name = normalizeFilterValue(profileItem.name);
        if (normalizedSearch && !name.includes(normalizedSearch)) {
          return false;
        }
        if (!matchesFilter(profileItem.mentality, mentalityFilter)) {
          return false;
        }
        if (!matchesFilter(profileItem.look?.gender, genderFilter)) {
          return false;
        }
        if (!matchesFilter(profileItem.look?.skin, skinFilter)) {
          return false;
        }
        if (!matchesFilter(profileItem.look?.hair, hairFilter)) {
          return false;
        }
        if (!matchesFilter(profileItem.look?.outfit, outfitFilter)) {
          return false;
        }
        if (!matchesFilter(profileItem.look?.ethnicity, ethnicityFilter)) {
          return false;
        }
        if (!isCatalogProfileVisible(profileItem)) {
          return false;
        }
        return (
          normalizeStatus(profileItem.status) === "active" &&
          Boolean(profileItem.imageUrl)
        );
      });
    }
    return sortedAiProfiles.filter((profileItem) => {
      const name = normalizeFilterValue(profileItem.name);
      if (normalizedSearch && !name.includes(normalizedSearch)) {
        return false;
      }
      if (!matchesFilter(profileItem.mentality, mentalityFilter)) {
        return false;
      }
      if (!matchesFilter(profileItem.look?.gender, genderFilter)) {
        return false;
      }
      if (!matchesFilter(profileItem.look?.skin, skinFilter)) {
        return false;
      }
      if (!matchesFilter(profileItem.look?.hair, hairFilter)) {
        return false;
      }
      if (!matchesFilter(profileItem.look?.outfit, outfitFilter)) {
        return false;
      }
        if (!matchesFilter(profileItem.look?.ethnicity, ethnicityFilter)) {
          return false;
        }
        if (!isCatalogProfileVisible(profileItem)) {
          return false;
        }
        return normalizeStatus(profileItem.status) === statusFilter;
    });
  }, [
    sortedAiProfiles,
    statusFilter,
    searchQuery,
    mentalityFilter,
    genderFilter,
    skinFilter,
    hairFilter,
    outfitFilter,
    ethnicityFilter,
  ]);

  const hasFilterSelections =
    Boolean(normalizeFilterValue(searchQuery)) ||
    mentalityFilter !== "all" ||
    genderFilter !== "all" ||
    skinFilter !== "all" ||
    hairFilter !== "all" ||
    outfitFilter !== "all" ||
    ethnicityFilter !== "all";

  const resetFilters = () => {
    setSearchQuery("");
    setMentalityFilter("all");
    setGenderFilter("all");
    setSkinFilter("all");
    setHairFilter("all");
    setOutfitFilter("all");
    setEthnicityFilter("all");
    setStatusFilter("all");
  };

  const handleStartConversation = async (aiId: string) => {
    setActionError(null);
    if (!userId) {
      setActionError("Connectez-vous pour demarrer une conversation.");
      return;
    }
    if (locationBlocked) {
      setActionError("Localisation requise pour demarrer une conversation.");
      requestLocation();
      return;
    }

    setActionId(aiId);
    try {
      const conversation = await createConversation({ userId, aiId });
      router.push(`/conversations/${conversation.id}`);
    } catch (error) {
      console.error("Erreur lors du demarrage", error);
      const message =
        error instanceof Error ? error.message : "Impossible de demarrer la conversation.";
      setActionError(message);
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 md:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-900/80 via-slate-900 to-slate-950/80 p-6 shadow-2xl shadow-slate-900/40 backdrop-blur">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Catalogue IA
            </p>
            <h1 className="text-3xl font-semibold md:text-4xl">
              Choisir une IA
            </h1>
            <p className="text-sm text-slate-400 md:text-base">
              Selectionnez une IA, lancez la conversation et payez en tokens.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>{profile?.mail ?? authMail ?? "Compte actif"}</span>
            <span>
              {profileLoading ? "..." : `${profile?.tokens ?? 0} tokens`}
            </span>
            {locationBlocked ? (
              <button
                type="button"
                onClick={requestLocation}
                className="rounded-full border border-amber-400/60 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-200 transition hover:border-amber-300"
              >
                {locationCtaLabel}
              </button>
            ) : (
              <Link
                href="/ia/create"
                className="rounded-full border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-700"
              >
                Creer IA
              </Link>
            )}
            {userId && !roleMismatch && (
              <Link
                href="/ia/mes"
                className="rounded-full border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-700"
              >
                Mes IA
              </Link>
            )}
          </div>
        </header>

        {!userId ? (
          <section className="rounded-3xl border border-slate-800/80 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
            <h2 className="text-lg font-semibold">Connexion requise</h2>
            <p className="mt-2 text-sm text-slate-400">
              Connectez-vous pour consulter et lancer vos IA.
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
              Ce catalogue est reserve aux comptes client.
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
            {locationBlocked && (
              <div className="mb-4 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-xs text-amber-200">
                <p>
                  {locationStatus === "pending"
                    ? "Localisation en cours..."
                    : "Localisation requise pour discuter ou creer une IA."}
                </p>
                <button
                  type="button"
                  onClick={requestLocation}
                  className="mt-2 rounded-lg border border-amber-400/60 px-3 py-1 text-[11px] font-semibold text-amber-200 transition hover:border-amber-300"
                >
                  Redemander la localisation
                </button>
                {locationFailures >= LOCATION_FAILURE_THRESHOLD && (
                  <div className="mt-3 space-y-2 rounded-xl border border-amber-400/30 bg-slate-950/40 p-3 text-[11px] text-amber-100">
                    <p>
                      Geolocalisation echouee plusieurs fois. Choisissez un pays
                      manuellement.
                    </p>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wide text-slate-400">
                          Pays
                        </label>
                        <select
                          value={manualCountrySelect}
                          onChange={(event) => {
                            setManualCountrySelect(event.target.value);
                            setManualCountryError(null);
                            if (event.target.value !== "custom") {
                              setManualCountryInput("");
                            }
                          }}
                          className="rounded-lg border border-slate-800/80 bg-slate-950/60 px-2 py-1 text-[11px] text-slate-100"
                        >
                          <option value="">Selectionner</option>
                          {countryOptions.map((option) => (
                            <option key={option.code} value={option.code}>
                              {option.label} ({option.code})
                            </option>
                          ))}
                          <option value="custom">Autre (code ISO)</option>
                        </select>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                        {visibilityValue === "private" && (
                          <span className="rounded-full border border-slate-700/80 bg-slate-900/60 px-3 py-1 text-xs font-semibold text-slate-200">
                            Privée
                          </span>
                        )}
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${accessBadgeClass}`}
                        >
                          {accessTypeValue === "paid" ? "Payante" : "Gratuite"}
                        </span>
                      </div>
                      {manualCountrySelect === "custom" && (
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wide text-slate-400">
                            Code ISO
                          </label>
                          <input
                            value={manualCountryInput}
                            onChange={(event) => {
                              setManualCountryInput(event.target.value);
                              setManualCountryError(null);
                            }}
                            className="rounded-lg border border-slate-800/80 bg-slate-950/60 px-2 py-1 text-[11px] text-slate-100 placeholder:text-slate-600"
                            placeholder="Ex: FR"
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={applyManualCountry}
                        className="rounded-lg border border-amber-400/60 px-3 py-1 text-[11px] font-semibold text-amber-200 transition hover:border-amber-300"
                      >
                        Valider le pays
                      </button>
                    </div>
                    {manualCountryError && (
                      <p className="text-[11px] text-rose-300">{manualCountryError}</p>
                    )}
                  </div>
                )}
                {locationError && (
                  <p className="mt-2 text-[11px] text-amber-300">{locationError}</p>
                )}
              </div>
            )}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">IA disponibles</h2>
                <p className="text-sm text-slate-400">
                  Profils actifs, mentalites et apparences configurees.
                </p>
              </div>
              <span className="text-xs text-slate-400">
                {aiLoading
                  ? "Chargement..."
                  : `${filteredAiProfiles.length} IA / ${sortedAiProfiles.length}`}
              </span>
            </div>

            {(aiError || conversationsError || profileError || evaluationsError) && (
              <p className="mt-4 text-sm text-rose-300">
                {aiError ?? conversationsError ?? profileError ?? evaluationsError}
              </p>
            )}

            <div className="mt-4 grid gap-3 text-xs md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1 md:col-span-2 lg:col-span-3">
                <label className="text-[11px] uppercase tracking-wide text-slate-400">
                  Recherche par nom
                </label>
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600"
                  placeholder="Rechercher une IA..."
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wide text-slate-400">
                  Mentalite
                </label>
                <select
                  value={mentalityFilter}
                  onChange={(event) => setMentalityFilter(event.target.value)}
                  className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
                >
                  <option value="all">Toutes</option>
                  <option value="__missing__">Non definie</option>
                  {mentalityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wide text-slate-400">
                  Genre
                </label>
                <select
                  value={genderFilter}
                  onChange={(event) => setGenderFilter(event.target.value)}
                  className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
                >
                  <option value="all">Tous</option>
                  <option value="__missing__">Non defini</option>
                  {appearanceOptions.gender.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wide text-slate-400">
                  Peau
                </label>
                <select
                  value={skinFilter}
                  onChange={(event) => setSkinFilter(event.target.value)}
                  className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
                >
                  <option value="all">Toutes</option>
                  <option value="__missing__">Non definie</option>
                  {appearanceOptions.skin.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wide text-slate-400">
                  Cheveux
                </label>
                <select
                  value={hairFilter}
                  onChange={(event) => setHairFilter(event.target.value)}
                  className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
                >
                  <option value="all">Tous</option>
                  <option value="__missing__">Non definis</option>
                  {appearanceOptions.hair.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wide text-slate-400">
                  Tenue
                </label>
                <select
                  value={outfitFilter}
                  onChange={(event) => setOutfitFilter(event.target.value)}
                  className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
                >
                  <option value="all">Toutes</option>
                  <option value="__missing__">Non definie</option>
                  {appearanceOptions.outfit.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wide text-slate-400">
                  Ethnie
                </label>
                <select
                  value={ethnicityFilter}
                  onChange={(event) => setEthnicityFilter(event.target.value)}
                  className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
                >
                  <option value="all">Toutes</option>
                  <option value="__missing__">Non definie</option>
                  {appearanceOptions.ethnicity.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-full border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-600"
                disabled={!hasFilterSelections && statusFilter === "all"}
              >
                Reinitialiser les filtres
              </button>
              {hasFilterSelections && (
                <span>
                  {filteredAiProfiles.length} resultat{filteredAiProfiles.length > 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {[
                { id: "all", label: "Toutes" },
                { id: "available", label: "Disponibles" },
                { id: "pending", label: "En attente" },
                { id: "suspended", label: "Suspendues" },
                { id: "disabled", label: "Desactivees" },
                { id: "rejected", label: "Refusees" },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setStatusFilter(option.id)}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                    statusFilter === option.id
                      ? "border-emerald-400/70 bg-emerald-500/20 text-emerald-200"
                      : "border-slate-800/80 bg-slate-950/40 text-slate-300 hover:border-slate-600"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="mt-6 space-y-3">
              {aiLoading ? (
                <p className="text-sm text-slate-400">Chargement des IA...</p>
              ) : filteredAiProfiles.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Aucune IA pour ce filtre.
                </p>
              ) : (
                filteredAiProfiles.map((profileItem) => {
                  const statusKey = normalizeStatus(profileItem.status);
                  const hasAvatar = Boolean(profileItem.imageUrl);
                  const conversation = profileItem.id
                    ? conversationsByAi[profileItem.id]
                    : undefined;
                  const ratingSummary = profileItem.id
                    ? ratingSummaryByAi[profileItem.id]
                    : undefined;
                  const ratingLabel = ratingSummary
                    ? formatAverageRating(ratingSummary.average)
                    : evaluationsLoading
                      ? "Chargement..."
                      : "Non notee";
                  const ratingCountLabel = ratingSummary
                    ? `${ratingSummary.count} avis`
                    : evaluationsLoading
                      ? "Avis en cours..."
                      : "Aucun avis";
                  const isBusy = actionId === profileItem.id;
                  const canStart = statusKey === "active" && hasAvatar;
                  const visibilityValue = profileItem.visibility ?? "public";
                  const accessTypeValue = profileItem.accessType ?? "free";
                  const accessBadgeClass =
                    accessTypeValue === "paid"
                      ? "border border-amber-400/70 bg-amber-500/10 text-amber-200"
                      : "border border-emerald-400/70 bg-emerald-500/10 text-emerald-200";
                  const statusNote =
                    statusKey === "pending"
                      ? "IA en attente de validation."
                      : statusKey === "active" && !hasAvatar
                        ? "Avatar en cours de generation."
                        : statusKey === "suspended"
                          ? "IA suspendue."
                          : statusKey === "disabled"
                            ? "IA desactivee."
                            : statusKey === "rejected"
                              ? "IA refusee."
                              : "IA indisponible.";
                  const infoNote = locationBlocked
                    ? "Localisation requise pour discuter."
                    : statusNote;
                  const owner =
                    profileItem.ownerId && usersById[profileItem.ownerId]
                      ? usersById[profileItem.ownerId]
                      : undefined;
                  const ownerLabel =
                    owner && owner.id
                      ? formatOwnerLabel(owner)
                      : profileItem.ownerId
                        ? `Créateur ${profileItem.ownerId.slice(0, 5)}`
                        : "Créateur inconnu";
                  const ownerLink =
                    profileItem.ownerId ? `/ia/owner/${profileItem.ownerId}` : undefined;
                  return (
                    <div
                      key={profileItem.id}
                      className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">
                            {profileItem.name ?? `IA ${profileItem.id.slice(0, 5)}`}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {profileItem.mentality ?? "Mentalite non definie"} ·{" "}
                            {profileItem.voice ?? "Voix non definie"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatLookSummary(profileItem.look)}
                          </p>
                        </div>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${statusStyles[statusKey]}`}
                      >
                        {statusLabels[statusKey]}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                      {visibilityValue === "private" && (
                        <span className="rounded-full border border-slate-700/80 bg-slate-900/60 px-3 py-1 text-xs font-semibold text-slate-200">
                          Privée
                        </span>
                      )}
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${accessBadgeClass}`}
                      >
                        {accessTypeValue === "paid" ? "Payante" : "Gratuite"}
                      </span>
                    </div>

                      <div className="mt-3 text-xs text-slate-400">
                        <p>Rythme vocal: {profileItem.voiceRhythm ?? "Non defini"}</p>
                        <p>
                          Note moyenne: {ratingLabel} · {ratingCountLabel}
                        </p>
                        <p>Mis a jour: {formatDate(profileItem.updatedAt)}</p>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Link
                          href={`/ia/${profileItem.id}`}
                          className="rounded-lg border border-slate-700/70 bg-slate-900/40 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
                        >
                          Consulter
                        </Link>
                        <div className="text-[11px] text-slate-400">
                          Créateur:{" "}
                          {ownerLink ? (
                            <Link
                              href={ownerLink}
                              className="font-semibold text-emerald-300 underline-offset-2 hover:underline"
                            >
                              {ownerLabel}
                            </Link>
                          ) : (
                            <span className="font-semibold text-slate-200">
                              {ownerLabel}
                            </span>
                          )}
                        </div>
                        {locationBlocked ? (
                          <button
                            type="button"
                            onClick={requestLocation}
                            className="rounded-lg border border-amber-400/60 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:border-amber-300"
                          >
                            Activer localisation
                          </button>
                        ) : conversation ? (
                          canStart ? (
                            <Link
                              href={`/conversations/${conversation.id}`}
                              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400"
                            >
                              Continuer
                            </Link>
                          ) : (
                            <span className="rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-1.5 text-xs font-semibold text-slate-500">
                              Indisponible
                            </span>
                          )
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStartConversation(profileItem.id)}
                            disabled={!canStart || isBusy || conversationsLoading}
                            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/40"
                          >
                            {isBusy ? "Ouverture..." : "Demarrer"}
                          </button>
                        )}
                        {(!canStart || locationBlocked) && (
                          <span className="text-[11px] text-slate-500">
                            {infoNote}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}

        {actionError && (
          <p className="text-sm text-rose-300">{actionError}</p>
        )}
      </div>
    </div>
  );
}

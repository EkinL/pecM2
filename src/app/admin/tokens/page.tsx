'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import {
  auth,
  fetchAiProfilesRealTime,
  fetchConversationsRealTime,
  fetchTokenPricingSettingsRealTime,
  fetchUtilisateurById,
  fetchUtilisateursRealTime,
  signOutUser,
  updateTokenPricingSettings,
} from '../../indexFirebase';
import {
  countryLabelByCode,
  countryOptions,
  isValidCountryCode,
  normalizeCountryCodeInput,
} from '../../data/countries';

type Timestamp = {
  seconds?: number;
  nanoseconds?: number;
};

type GeoLocation = {
  lat?: number;
  lng?: number;
  accuracy?: number;
};

type TokenPricing = {
  text?: number;
  image?: number;
};

type TokenPricingSettings = {
  base?: TokenPricing;
  countries?: Record<string, TokenPricing>;
};

type Utilisateur = {
  id: string;
  mail?: string;
  pseudo?: string;
  role?: string;
};

type AiProfile = {
  id: string;
  name?: string;
  status?: string;
};

type Conversation = {
  id: string;
  userId?: string;
  aiId?: string;
  status?: string;
  messageCount?: number;
  location?: GeoLocation;
  locationUpdatedAt?: Timestamp;
  countryCode?: string;
  countryLabel?: string;
  countryUpdatedAt?: Timestamp;
  tokenPricing?: TokenPricing;
  tokenPricingUpdatedAt?: Timestamp;
  updatedAt?: Timestamp;
  [key: string]: unknown;
};

const messageTypes = [
  { id: 'text', label: 'Texte' },
  { id: 'image', label: 'Image' },
];

const defaultCountryCodes = ['FR'];

const formatDate = (value?: Timestamp | string) => {
  if (!value) {
    return '—';
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
  return '—';
};

const formatCoordinates = (location?: GeoLocation | null) => {
  if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
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
  const lng = location.lng ?? 0;
  const lat = location.lat ?? 0;
  const left = lng - delta;
  const right = lng + delta;
  const top = lat + delta;
  const bottom = lat - delta;
  const bbox = `${left},${bottom},${right},${top}`;

  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
    bbox,
  )}&layer=mapnik&marker=${lat}%2C${lng}`;
};

const buildMapLink = (location: GeoLocation) => {
  const lng = location.lng ?? 0;
  const lat = location.lat ?? 0;
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
};

const buildEmptyCountryPricing = (codes: string[]) =>
  codes.reduce<Record<string, { text: string; image: string }>>((acc, code) => {
    acc[code] = { text: '', image: '' };
    return acc;
  }, {});

const formatUserLabel = (user?: Utilisateur) => {
  if (!user) {
    return 'Utilisateur inconnu';
  }
  if (user.pseudo) {
    return user.pseudo;
  }
  if (user.mail) {
    return user.mail;
  }
  return `Utilisateur ${user.id.slice(0, 5)}`;
};

export default function AdminTokenPricingPage() {
  const router = useRouter();
  const [adminChecking, setAdminChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<null | { uid: string; mail?: string | null }>(null);

  const [users, setUsers] = useState<Utilisateur[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [aiProfiles, setAiProfiles] = useState<AiProfile[]>([]);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiError, setAiError] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsError, setConversationsError] = useState<string | null>(null);

  const [tokenSettings, setTokenSettings] = useState<TokenPricingSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsTouched, setSettingsTouched] = useState(false);
  const [settingsForm, setSettingsForm] = useState<{
    base: { text: string; image: string };
    countries: Record<string, { text: string; image: string }>;
  }>({
    base: { text: '', image: '' },
    countries: buildEmptyCountryPricing(defaultCountryCodes),
  });
  const [countrySelect, setCountrySelect] = useState('');
  const [countryInput, setCountryInput] = useState('');
  const [countryInputError, setCountryInputError] = useState<string | null>(null);
  const [settingsAction, setSettingsAction] = useState<{
    status: 'loading' | 'success' | 'error';
    message?: string;
  } | null>(null);
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAdminUser(null);
        setIsAdmin(false);
        setAdminChecking(false);
        router.replace('/auth');
        return;
      }

      setAdminUser({ uid: user.uid, mail: user.email });

      try {
        const profile = (await fetchUtilisateurById(user.uid)) as { role?: string } | null;
        if (profile?.role === 'admin') {
          setIsAdmin(true);
          setAdminError(null);
        } else {
          setIsAdmin(false);
          setAdminError('Acces reserve aux admins.');
        }
      } catch (error) {
        console.error('Erreur lors de la verification du role admin', error);
        setIsAdmin(false);
        setAdminError('Impossible de verifier le role admin.');
      } finally {
        setAdminChecking(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const unsubUsers = fetchUtilisateursRealTime(
      (data: unknown) => {
        setUsers(data as Utilisateur[]);
        setUsersLoading(false);
        setUsersError(null);
      },
      () => {
        setUsersError('Impossible de recuperer les utilisateurs.');
        setUsersLoading(false);
      },
    );
    const unsubAiProfiles = fetchAiProfilesRealTime(
      (data: unknown) => {
        setAiProfiles(data as AiProfile[]);
        setAiLoading(false);
        setAiError(null);
      },
      () => {
        setAiError('Impossible de recuperer les IA.');
        setAiLoading(false);
      },
    );
    const unsubConversations = fetchConversationsRealTime(
      (data: unknown) => {
        setConversations(data as Conversation[]);
        setConversationsLoading(false);
        setConversationsError(null);
      },
      () => {
        setConversationsError('Impossible de recuperer les conversations.');
        setConversationsLoading(false);
      },
    );

    return () => {
      unsubUsers?.();
      unsubAiProfiles?.();
      unsubConversations?.();
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    setSettingsLoading(true);
    const unsubscribe = fetchTokenPricingSettingsRealTime(
      (data: unknown) => {
        const settings = data as TokenPricingSettings | null;
        setTokenSettings(settings);
        setSettingsLoading(false);
        setSettingsError(null);

        if (settingsTouched) {
          return;
        }

        const rawCountries =
          settings && typeof settings.countries === 'object' ? settings.countries : {};
        const countryCodes = Object.keys(rawCountries);
        const normalizedCountryCodes = (countryCodes.length ? countryCodes : defaultCountryCodes)
          .map((code) => normalizeCountryCodeInput(code))
          .filter((code) => isValidCountryCode(code));
        const resolvedCountryCodes = normalizedCountryCodes.length
          ? normalizedCountryCodes
          : defaultCountryCodes;

        setSettingsForm(() => ({
          base: {
            text: typeof settings?.base?.text === 'number' ? String(settings.base.text) : '',
            image: typeof settings?.base?.image === 'number' ? String(settings.base.image) : '',
          },
          countries: resolvedCountryCodes.reduce<Record<string, { text: string; image: string }>>(
            (acc, code) => {
              const current =
                (rawCountries as Record<string, TokenPricing>)[code] ??
                (rawCountries as Record<string, TokenPricing>)[code.toLowerCase()];
              acc[code] = {
                text: typeof current?.text === 'number' ? String(current.text) : '',
                image: typeof current?.image === 'number' ? String(current.image) : '',
              };
              return acc;
            },
            {},
          ),
        }));
      },
      () => {
        setSettingsError('Impossible de recuperer les tarifs tokens.');
        setSettingsLoading(false);
      },
    );

    return () => unsubscribe?.();
  }, [isAdmin, settingsTouched]);

  const usersById = useMemo(() => {
    const map: Record<string, Utilisateur> = {};
    users.forEach((user) => {
      map[user.id] = user;
    });
    return map;
  }, [users]);

  const aiById = useMemo(() => {
    const map: Record<string, AiProfile> = {};
    aiProfiles.forEach((ai) => {
      map[ai.id] = ai;
    });
    return map;
  }, [aiProfiles]);

  const sortedConversations = useMemo(
    () =>
      [...conversations].sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0)),
    [conversations],
  );

  const handleSignOut = async () => {
    setSignOutError(null);
    setSignOutLoading(true);
    try {
      await signOutUser();
      router.replace('/auth');
    } catch (error) {
      console.error('Erreur de deconnexion', error);
      setSignOutError('Impossible de se deconnecter.');
    } finally {
      setSignOutLoading(false);
    }
  };

  const parsePricingInput = (value: string) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
  };

  const countryCodes = useMemo(
    () => Object.keys(settingsForm.countries).sort(),
    [settingsForm.countries],
  );

  const handleAddCountry = () => {
    const selectedCode =
      countrySelect === 'custom'
        ? normalizeCountryCodeInput(countryInput)
        : normalizeCountryCodeInput(countrySelect);

    if (!selectedCode || !isValidCountryCode(selectedCode)) {
      setCountryInputError('Selectionnez un pays ou saisissez un code ISO valide.');
      return;
    }
    setCountryInputError(null);
    setSettingsTouched(true);
    setSettingsForm((prev) => ({
      ...prev,
      countries: {
        ...prev.countries,
        [selectedCode]: prev.countries[selectedCode] ?? {
          text: '',
          image: '',
        },
      },
    }));
    setCountrySelect('');
    setCountryInput('');
  };

  const handleSaveSettings = async () => {
    const base = {
      text: parsePricingInput(settingsForm.base.text),
      image: parsePricingInput(settingsForm.base.image),
    };

    if (!base.text || !base.image) {
      setSettingsAction({
        status: 'error',
        message: 'Renseignez les tarifs de base pour chaque type de message.',
      });
      return;
    }

    const countries = Object.entries(settingsForm.countries).reduce<Record<string, TokenPricing>>(
      (acc, [code, values]) => {
        if (!values) {
          return acc;
        }
        const parsed = {
          text: parsePricingInput(values.text),
          image: parsePricingInput(values.image),
        };
        if (parsed.text && parsed.image) {
          acc[code] = parsed;
        }
        return acc;
      },
      {},
    );

    setSettingsAction({ status: 'loading' });
    try {
      await updateTokenPricingSettings({
        base,
        countries,
        adminId: adminUser?.uid,
        adminMail: adminUser?.mail ?? undefined,
      });
      setSettingsTouched(false);
      setSettingsAction({ status: 'success', message: 'Tarifs mis a jour.' });
    } catch (error) {
      console.error('Erreur lors de la mise a jour des tarifs', error);
      setSettingsAction({
        status: 'error',
        message: 'Impossible de mettre a jour les tarifs.',
      });
    }
  };

  if (adminChecking) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-12">
          <p className="text-sm text-slate-400">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-12">
          <div className="w-full max-w-lg space-y-4 rounded-3xl border border-slate-800/80 bg-slate-900/70 p-8 shadow-2xl">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Acces refuse</p>
            <h1 className="text-2xl font-semibold">Panel admin uniquement</h1>
            <p className="text-sm text-slate-400">
              {adminError ?? "Ce compte n'a pas les droits admin."}
            </p>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signOutLoading}
              className="w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
            >
              {signOutLoading ? 'Deconnexion...' : 'Se deconnecter'}
            </button>
            {signOutError && <p className="text-xs text-rose-300">{signOutError}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 md:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-900/80 via-slate-900 to-slate-950/80 p-6 shadow-2xl shadow-slate-900/40 backdrop-blur">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Tarifs tokens</p>
            <h1 className="text-3xl font-semibold md:text-4xl">Tarification par pays</h1>
            <p className="text-sm text-slate-400 md:text-base">
              Ajustez les couts tokens en fonction du pays detecte.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>{adminUser?.mail ?? 'Compte admin'}</span>
            <Link
              href="/admin/ia"
              className="rounded-full border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-700"
            >
              Retour validation IA
            </Link>
          </div>
        </header>

        <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Tarifs de base</h2>
              <p className="text-sm text-slate-400">
                Appliques par defaut si aucun tarif pays n est defini.
              </p>
            </div>
            <span className="text-xs text-slate-400">
              {settingsLoading ? 'Chargement...' : 'Base + pays'}
            </span>
          </div>

          {(settingsError || settingsAction?.message) && (
            <p
              className={`mt-3 text-sm ${
                settingsAction?.status === 'error' || settingsError
                  ? 'text-rose-300'
                  : 'text-emerald-300'
              }`}
            >
              {settingsError ?? settingsAction?.message}
            </p>
          )}

          <div className="mt-5 grid gap-4 rounded-2xl border border-slate-800/70 bg-slate-950/40 p-4 md:grid-cols-2">
            {messageTypes.map((type) => (
              <div key={type.id} className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-slate-400">
                  {type.label}
                </label>
                <input
                  value={settingsForm.base[type.id as keyof TokenPricing] ?? ''}
                  onChange={(event) => {
                    setSettingsTouched(true);
                    setSettingsForm((prev) => ({
                      ...prev,
                      base: {
                        ...prev.base,
                        [type.id]: event.target.value,
                      },
                    }));
                  }}
                  className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600"
                  placeholder="Tokens"
                  inputMode="numeric"
                />
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Tarifs par pays</h3>
                <p className="text-xs text-slate-500">
                  Laissez vide pour utiliser le tarif de base.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wide text-slate-400">Pays</label>
                  <select
                    value={countrySelect}
                    onChange={(event) => {
                      setCountrySelect(event.target.value);
                      setCountryInputError(null);
                      if (event.target.value !== 'custom') {
                        setCountryInput('');
                      }
                    }}
                    className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
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
                {countrySelect === 'custom' && (
                  <div className="space-y-1">
                    <label className="text-[11px] uppercase tracking-wide text-slate-400">
                      Code ISO
                    </label>
                    <input
                      value={countryInput}
                      onChange={(event) => {
                        setCountryInput(event.target.value);
                        setCountryInputError(null);
                      }}
                      className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600"
                      placeholder="Ex: FR"
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleAddCountry}
                  className="rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
                >
                  Ajouter un pays
                </button>
              </div>
            </div>
            {countryInputError && <p className="text-xs text-rose-300">{countryInputError}</p>}
            {countryCodes.length === 0 ? (
              <p className="text-xs text-slate-500">
                Ajoutez un pays pour definir des tarifs specifiques.
              </p>
            ) : (
              <div className="grid gap-4">
                {countryCodes.map((code) => (
                  <div
                    key={code}
                    className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-100">
                        {countryLabelByCode[code] ?? `Pays ${code}`}
                      </p>
                      <span className="text-xs text-slate-500">Code {code}</span>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {messageTypes.map((type) => (
                        <div key={`${code}-${type.id}`} className="space-y-2">
                          <label className="text-[11px] uppercase tracking-wide text-slate-400">
                            {type.label}
                          </label>
                          <input
                            value={
                              settingsForm.countries?.[code]?.[type.id as keyof TokenPricing] ?? ''
                            }
                            onChange={(event) => {
                              setSettingsTouched(true);
                              setSettingsForm((prev) => ({
                                ...prev,
                                countries: {
                                  ...prev.countries,
                                  [code]: {
                                    ...prev.countries[code],
                                    [type.id]: event.target.value,
                                  },
                                },
                              }));
                            }}
                            className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600"
                            placeholder="Tokens"
                            inputMode="numeric"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={settingsAction?.status === 'loading'}
              className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
            >
              {settingsAction?.status === 'loading' ? 'Mise a jour...' : 'Enregistrer les tarifs'}
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Conversations en live</h2>
              <p className="text-sm text-slate-400">Localisation et tarifs par conversation.</p>
            </div>
            <span className="text-xs text-slate-400">
              {conversationsLoading
                ? 'Chargement...'
                : `${sortedConversations.length} conversations`}
            </span>
          </div>

          {(usersError || aiError || conversationsError) && (
            <p className="mt-3 text-sm text-rose-300">
              {usersError ?? aiError ?? conversationsError}
            </p>
          )}

          <div className="mt-6 space-y-4">
            {conversationsLoading || usersLoading || aiLoading ? (
              <p className="text-sm text-slate-400">Synchronisation...</p>
            ) : sortedConversations.length === 0 ? (
              <p className="text-sm text-slate-400">Aucune conversation disponible.</p>
            ) : (
              sortedConversations.map((conversation) => {
                const user = conversation.userId ? usersById[conversation.userId] : undefined;
                const ai = conversation.aiId ? aiById[conversation.aiId] : undefined;
                const location = conversation.location;
                const hasLocation =
                  typeof location?.lat === 'number' && typeof location?.lng === 'number';
                const countryCode = conversation.countryCode;
                const countryLabel = conversation.countryLabel;
                const countrySettings =
                  countryCode && tokenSettings?.countries
                    ? tokenSettings.countries[countryCode]
                    : undefined;
                const resolveCost = (kind: string, fallback: number) => {
                  const override =
                    typeof conversation.tokenPricing?.[kind as keyof TokenPricing] === 'number'
                      ? (conversation.tokenPricing?.[kind as keyof TokenPricing] as number)
                      : null;
                  const countryCost =
                    typeof countrySettings?.[kind as keyof TokenPricing] === 'number'
                      ? (countrySettings?.[kind as keyof TokenPricing] as number)
                      : null;
                  const baseCost =
                    typeof tokenSettings?.base?.[kind as keyof TokenPricing] === 'number'
                      ? (tokenSettings?.base?.[kind as keyof TokenPricing] as number)
                      : null;
                  const cost = override ?? countryCost ?? baseCost ?? fallback;
                  const source = override
                    ? 'override'
                    : countryCost
                      ? 'country'
                      : baseCost
                        ? 'base'
                        : 'default';
                  return { cost, source };
                };
                return (
                  <div
                    key={conversation.id}
                    className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">
                          {ai?.name ?? `IA ${conversation.aiId?.slice(0, 5) ?? '?'}`}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Client : {formatUserLabel(user)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Pays: {countryLabel ?? countryCode ?? 'Non detecte'}
                        </p>
                      </div>
                      <Link
                        href={`/conversations/${conversation.id}`}
                        className="rounded-lg border border-slate-700/70 bg-slate-900/40 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
                      >
                        Ouvrir le chat
                      </Link>
                    </div>

                    <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
                      <div className="space-y-2 text-xs text-slate-400">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>Position: {formatCoordinates(location)}</span>
                          {hasLocation && <span>{formatAccuracy(location?.accuracy)}</span>}
                        </div>
                        <div>Maj localisation: {formatDate(conversation.locationUpdatedAt)}</div>
                        <div>Maj tarifs: {formatDate(conversation.tokenPricingUpdatedAt)}</div>
                        <div>Messages: {conversation.messageCount ?? 0}</div>
                      </div>
                      {hasLocation ? (
                        <div className="overflow-hidden rounded-xl border border-slate-800/70">
                          <iframe
                            title={`map-${conversation.id}`}
                            src={buildMapEmbedUrl(location as GeoLocation)}
                            className="h-40 w-full"
                            loading="lazy"
                          />
                          <div className="flex items-center justify-between border-t border-slate-800/70 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-400">
                            <span>Vue OpenStreetMap</span>
                            <a
                              href={buildMapLink(location as GeoLocation)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-200 hover:text-emerald-100"
                            >
                              Ouvrir
                            </a>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-800/70 bg-slate-950/40 p-4 text-xs text-slate-500">
                          Aucune localisation partagee pour cette conversation.
                        </div>
                      )}
                    </div>

                    <div className="mt-4 grid gap-3 rounded-2xl border border-slate-800/70 bg-slate-900/40 p-4 md:grid-cols-3">
                      {messageTypes.map((type) => {
                        const resolved = resolveCost(type.id, type.id === 'text' ? 1 : 5);
                        return (
                          <div key={type.id} className="space-y-2 text-xs text-slate-300">
                            <p className="uppercase tracking-wide text-slate-400">{type.label}</p>
                            <p className="text-sm font-semibold text-emerald-200">
                              {resolved.cost} tokens
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {resolved.source === 'country'
                                ? 'Tarif pays'
                                : resolved.source === 'base'
                                  ? 'Tarif de base'
                                  : resolved.source === 'override'
                                    ? 'Tarif personnalise'
                                    : 'Tarif par defaut'}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

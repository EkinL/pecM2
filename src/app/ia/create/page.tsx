'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { addAiProfile, auth, fetchUtilisateurById, signOutUser } from '../../indexFirebase';
import {
  ethnicityOptions,
  genderOptions,
  hairOptions,
  mentalities,
  outfitOptions,
  skinOptions,
  voiceRhythms,
  voiceStyles,
} from '../aiOptions';
import {
  countryLabelByCode,
  countryOptions,
  isValidCountryCode,
  normalizeCountryCodeInput,
  readStoredManualCountry,
  writeStoredManualCountry,
} from '../../data/countries';
import { hasActiveSubscription, SubscriptionAwareProfile } from '../../utils/subscriptionUtils';

const toLookPayload = (values: Record<string, string>) => {
  const look = Object.entries(values).reduce<Record<string, string>>((acc, [key, value]) => {
    const trimmed = value.trim();
    if (trimmed) {
      acc[key] = trimmed;
    }
    return acc;
  }, {});

  return Object.keys(look).length ? look : undefined;
};

const resolveCustomValue = (choice: string, custom: string) =>
  choice === 'Autre' ? custom : choice;

const LOCATION_FAILURE_THRESHOLD = 3;

export default function CreateAiPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<null | { uid: string; email?: string | null }>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [profileRoleLoading, setProfileRoleLoading] = useState(true);
  const [profileRoleError, setProfileRoleError] = useState<string | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<SubscriptionAwareProfile | null>(null);
  const [locationStatus, setLocationStatus] = useState<'pending' | 'ready' | 'error'>('pending');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationFailures, setLocationFailures] = useState(0);
  const [manualCountry, setManualCountry] = useState<{ code: string; label: string } | null>(null);
  const [manualCountrySelect, setManualCountrySelect] = useState('');
  const [manualCountryInput, setManualCountryInput] = useState('');
  const [manualCountryError, setManualCountryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [mentality, setMentality] = useState('');
  const [voice, setVoice] = useState('');
  const [voiceRhythm, setVoiceRhythm] = useState('');
  const [genderChoice, setGenderChoice] = useState('');
  const [genderCustom, setGenderCustom] = useState('');
  const [skinChoice, setSkinChoice] = useState('');
  const [skinCustom, setSkinCustom] = useState('');
  const [hairChoice, setHairChoice] = useState('');
  const [hairCustom, setHairCustom] = useState('');
  const [outfitChoice, setOutfitChoice] = useState('');
  const [outfitCustom, setOutfitCustom] = useState('');
  const [ethnicityChoice, setEthnicityChoice] = useState('');
  const [ethnicityCustom, setEthnicityCustom] = useState('');
  const [physicalDetails, setPhysicalDetails] = useState('');
  const [showAdvancedLook, setShowAdvancedLook] = useState(false);
  const [hairColor, setHairColor] = useState('');
  const [eyeColor, setEyeColor] = useState('');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [bodyType, setBodyType] = useState('');
  const [facialHair, setFacialHair] = useState('');
  const [makeup, setMakeup] = useState('');
  const [glasses, setGlasses] = useState('');
  const [accessories, setAccessories] = useState('');
  const [piercings, setPiercings] = useState('');
  const [tattoos, setTattoos] = useState('');
  const [scars, setScars] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [accessType, setAccessType] = useState<'free' | 'paid'>('free');

  const lookPayload = useMemo(
    () =>
      toLookPayload({
        gender: resolveCustomValue(genderChoice, genderCustom),
        skin: resolveCustomValue(skinChoice, skinCustom),
        hair: resolveCustomValue(hairChoice, hairCustom),
        hairColor,
        eyeColor,
        age,
        height,
        bodyType,
        facialHair,
        makeup,
        glasses,
        accessories,
        piercings,
        tattoos,
        scars,
        outfit: resolveCustomValue(outfitChoice, outfitCustom),
        ethnicity: resolveCustomValue(ethnicityChoice, ethnicityCustom),
        details: physicalDetails,
      }),
    [
      genderChoice,
      genderCustom,
      skinChoice,
      skinCustom,
      hairChoice,
      hairCustom,
      hairColor,
      eyeColor,
      age,
      height,
      bodyType,
      facialHair,
      makeup,
      glasses,
      accessories,
      piercings,
      tattoos,
      scars,
      outfitChoice,
      outfitCustom,
      ethnicityChoice,
      ethnicityCustom,
      physicalDetails,
    ],
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace('/auth');
        setCheckingAuth(false);
        return;
      }
      setAuthUser({ uid: user.uid, email: user.email });
      setCheckingAuth(false);
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!authUser) {
      setProfileRole(null);
      setProfileRoleLoading(false);
      return;
    }

    setProfileRoleLoading(true);
    fetchUtilisateurById(authUser.uid)
      .then((profile: unknown) => {
        setOwnerProfile(profile as any);
        setProfileRole((profile as any)?.role ?? null);
        setProfileRoleError(null);
      })
      .catch((authError) => {
        console.error('Impossible de charger le profil', authError);
        setOwnerProfile(null);
        setProfileRoleError('Profil utilisateur introuvable.');
      })
      .finally(() => {
        setProfileRoleLoading(false);
      });
  }, [authUser]);

  const roleMismatch = Boolean(authUser && profileRole && profileRole !== 'client');
  const locationRequired = Boolean(authUser) && !roleMismatch;
  const locationReady = locationStatus === 'ready' || Boolean(manualCountry);
  const locationBlocked = locationRequired && !locationReady;
  const hasSubscription = useMemo(() => hasActiveSubscription(ownerProfile), [ownerProfile]);

  useEffect(() => {
    const stored = readStoredManualCountry();
    if (stored) {
      setManualCountry(stored);
    }
  }, []);

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationStatus('error');
      setLocationError('Geolocalisation indisponible.');
      setLocationFailures((prev) => Math.max(prev, LOCATION_FAILURE_THRESHOLD));
      return;
    }

    setLocationError(null);
    setLocationStatus('pending');
    navigator.geolocation.getCurrentPosition(
      () => {
        setLocationStatus('ready');
        setLocationError(null);
        setLocationFailures(0);
      },
      () => {
        setLocationStatus('error');
        setLocationError('Localisation requise pour creer une IA.');
        setLocationFailures((prev) => prev + 1);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 },
    );
  }, []);

  useEffect(() => {
    if (!locationRequired) {
      setLocationStatus('pending');
      setLocationError(null);
      setLocationFailures(0);
      return;
    }
    if (manualCountry) {
      setLocationStatus('ready');
      setLocationError(null);
      return;
    }
    requestLocation();
  }, [locationRequired, manualCountry, requestLocation]);

  const applyManualCountry = () => {
    const selectedCode =
      manualCountrySelect === 'custom'
        ? normalizeCountryCodeInput(manualCountryInput)
        : normalizeCountryCodeInput(manualCountrySelect);

    if (!isValidCountryCode(selectedCode)) {
      setManualCountryError('Selectionnez un pays ou un code ISO valide.');
      return;
    }

    const label = countryLabelByCode[selectedCode] ?? `Pays ${selectedCode}`;
    writeStoredManualCountry(selectedCode, label);
    setManualCountry({ code: selectedCode, label });
    setLocationStatus('ready');
    setLocationError(null);
    setLocationFailures(0);
    setManualCountryError(null);
    setManualCountrySelect('');
    setManualCountryInput('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setCreatedId(null);

    if (!authUser) {
      setError('Session invalide. Merci de vous reconnecter.');
      return;
    }
    if (locationBlocked) {
      setError('Localisation requise pour creer une IA.');
      requestLocation();
      return;
    }

    setLoading(true);

    try {
      const docRef = await addAiProfile({
        name,
        mentality,
        voice,
        voiceRhythm,
        look: lookPayload,
        visibility,
        accessType,
      });

      setCreatedId(docRef.id);
      setSuccess('IA creee. En attente de validation admin. Avatar genere apres validation.');
      setName('');
      setMentality('');
      setVoice('');
      setVoiceRhythm('');
      setGenderChoice('');
      setGenderCustom('');
      setSkinChoice('');
      setSkinCustom('');
      setHairChoice('');
      setHairCustom('');
      setOutfitChoice('');
      setOutfitCustom('');
      setEthnicityChoice('');
      setEthnicityCustom('');
      setPhysicalDetails('');
      setHairColor('');
      setEyeColor('');
      setAge('');
      setHeight('');
      setBodyType('');
      setFacialHair('');
      setMakeup('');
      setGlasses('');
      setAccessories('');
      setPiercings('');
      setTattoos('');
      setScars('');
      setVisibility('public');
      setAccessType('free');
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Creation impossible.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    router.replace('/auth');
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-12">
          <p className="text-sm text-slate-400">Chargement...</p>
        </div>
      </div>
    );
  }

  if (roleMismatch) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-12">
          <div className="w-full max-w-lg space-y-4 rounded-3xl border border-slate-800/80 bg-slate-900/70 p-8 shadow-2xl">
            <h1 className="text-2xl font-semibold">Acces reserve aux clients</h1>
            <p className="text-sm text-slate-400">Ce module est reserve aux comptes client.</p>
            <button
              type="button"
              onClick={() => router.replace('/demandes/client')}
              className="mt-2 inline-flex items-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Aller aux demandes client
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-12">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800/80 bg-slate-900/70 p-6 shadow-2xl">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Creation IA</p>
            <h1 className="text-3xl font-semibold">Configurer une nouvelle IA</h1>
            <p className="text-sm text-slate-400">
              Renseignez la personnalite et l apparence. Un admin validera la demande.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>{authUser?.email ?? 'Compte actif'}</span>
            {profileRoleLoading ? (
              <span>Role...</span>
            ) : profileRoleError ? (
              <span className="text-rose-300">{profileRoleError}</span>
            ) : (
              <span>Role: {profileRole ?? 'non defini'}</span>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-full border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-slate-700"
            >
              Se deconnecter
            </button>
          </div>
        </header>

        <form
          onSubmit={handleSubmit}
          className="grid gap-6 rounded-3xl border border-slate-800/80 bg-slate-900/70 p-6 shadow-2xl lg:grid-cols-[1.1fr_0.9fr]"
        >
          <div className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="name" className="text-xs uppercase tracking-wide text-slate-400">
                Nom de l IA
              </label>
              <input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                placeholder="Ex: Luna, Atlas"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="mentality" className="text-xs uppercase tracking-wide text-slate-400">
                Mentalite
              </label>
              <div className="flex flex-wrap gap-2">
                {mentalities.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setMentality(item)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      mentality === item
                        ? 'border-emerald-400/70 bg-emerald-500/20 text-emerald-200'
                        : 'border-slate-800/80 bg-slate-950/40 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <input
                id="mentality"
                value={mentality}
                onChange={(event) => setMentality(event.target.value)}
                className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                placeholder="Autre mentalite (optionnel)"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="voice" className="text-xs uppercase tracking-wide text-slate-400">
                Voix
              </label>
              <select
                id="voice"
                value={voice}
                onChange={(event) => setVoice(event.target.value)}
                className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100"
              >
                <option value="">Selectionner une voix</option>
                {voiceStyles.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="voiceRhythm"
                className="text-xs uppercase tracking-wide text-slate-400"
              >
                Rythme vocal
              </label>
              <select
                id="voiceRhythm"
                value={voiceRhythm}
                onChange={(event) => setVoiceRhythm(event.target.value)}
                className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100"
              >
                <option value="">Choisir un rythme</option>
                {voiceRhythms.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            {locationBlocked && (
              <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-xs text-amber-200">
                <p>
                  {locationStatus === 'pending'
                    ? 'Localisation en cours...'
                    : 'Localisation requise pour creer une IA.'}
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
                    <p>Geolocalisation echouee plusieurs fois. Choisissez un pays manuellement.</p>
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
                            if (event.target.value !== 'custom') {
                              setManualCountryInput('');
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
                      {manualCountrySelect === 'custom' && (
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
            {error && <p className="text-sm text-rose-300">{error}</p>}
            {success && (
              <div className="space-y-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                <p>{success}</p>
                {createdId && <p>ID: {createdId}</p>}
                <button
                  type="button"
                  onClick={() => router.replace('/')}
                  className="mt-2 rounded-full border border-emerald-400/70 px-4 py-2 text-xs font-semibold text-emerald-200 hover:border-emerald-300"
                >
                  Aller au tableau de bord
                </button>
              </div>
            )}
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-800/70 bg-slate-950/40 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Apparence</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="gender" className="text-xs uppercase tracking-wide text-slate-400">
                  Genre
                </label>
                <select
                  id="gender"
                  value={genderChoice}
                  onChange={(event) => {
                    const value = event.target.value;
                    setGenderChoice(value);
                    if (value !== 'Autre') {
                      setGenderCustom('');
                    }
                  }}
                  className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100"
                >
                  <option value="">Selectionner</option>
                  {genderOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                {genderChoice === 'Autre' && (
                  <input
                    value={genderCustom}
                    onChange={(event) => setGenderCustom(event.target.value)}
                    className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                    placeholder="Autre (preciser)"
                  />
                )}
              </div>
              <div className="space-y-2">
                <label htmlFor="skin" className="text-xs uppercase tracking-wide text-slate-400">
                  Peau
                </label>
                <select
                  id="skin"
                  value={skinChoice}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSkinChoice(value);
                    if (value !== 'Autre') {
                      setSkinCustom('');
                    }
                  }}
                  className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100"
                >
                  <option value="">Selectionner</option>
                  {skinOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                {skinChoice === 'Autre' && (
                  <input
                    value={skinCustom}
                    onChange={(event) => setSkinCustom(event.target.value)}
                    className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                    placeholder="Autre (preciser)"
                  />
                )}
              </div>
              <div className="space-y-2">
                <label htmlFor="hair" className="text-xs uppercase tracking-wide text-slate-400">
                  Cheveux
                </label>
                <select
                  id="hair"
                  value={hairChoice}
                  onChange={(event) => {
                    const value = event.target.value;
                    setHairChoice(value);
                    if (value !== 'Autre') {
                      setHairCustom('');
                    }
                  }}
                  className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100"
                >
                  <option value="">Selectionner</option>
                  {hairOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                {hairChoice === 'Autre' && (
                  <input
                    value={hairCustom}
                    onChange={(event) => setHairCustom(event.target.value)}
                    className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                    placeholder="Autre (preciser)"
                  />
                )}
              </div>
              <div className="space-y-2">
                <label htmlFor="outfit" className="text-xs uppercase tracking-wide text-slate-400">
                  Tenue
                </label>
                <select
                  id="outfit"
                  value={outfitChoice}
                  onChange={(event) => {
                    const value = event.target.value;
                    setOutfitChoice(value);
                    if (value !== 'Autre') {
                      setOutfitCustom('');
                    }
                  }}
                  className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100"
                >
                  <option value="">Selectionner</option>
                  {outfitOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                {outfitChoice === 'Autre' && (
                  <input
                    value={outfitCustom}
                    onChange={(event) => setOutfitCustom(event.target.value)}
                    className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                    placeholder="Autre (preciser)"
                  />
                )}
              </div>
              <div className="space-y-2 md:col-span-2">
                <label
                  htmlFor="ethnicity"
                  className="text-xs uppercase tracking-wide text-slate-400"
                >
                  Ethnie
                </label>
                <select
                  id="ethnicity"
                  value={ethnicityChoice}
                  onChange={(event) => {
                    const value = event.target.value;
                    setEthnicityChoice(value);
                    if (value !== 'Autre') {
                      setEthnicityCustom('');
                    }
                  }}
                  className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100"
                >
                  <option value="">Selectionner</option>
                  {ethnicityOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                {ethnicityChoice === 'Autre' && (
                  <input
                    value={ethnicityCustom}
                    onChange={(event) => setEthnicityCustom(event.target.value)}
                    className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                    placeholder="Autre (preciser)"
                  />
                )}
              </div>
              <div className="space-y-2 md:col-span-2">
                <label
                  htmlFor="physicalDetails"
                  className="text-xs uppercase tracking-wide text-slate-400"
                >
                  Details physiques (optionnel)
                </label>
                <textarea
                  id="physicalDetails"
                  value={physicalDetails}
                  onChange={(event) => setPhysicalDetails(event.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                  placeholder="Ex: cicatrice sur la joue, tatouage discret, lunettes"
                />
              </div>
              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={() => setShowAdvancedLook((prev) => !prev)}
                  className="rounded-xl border border-slate-700/70 bg-slate-950/40 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
                >
                  {showAdvancedLook ? 'Masquer les filtres avances' : 'Filtres avances'}
                </button>
              </div>
              {showAdvancedLook && (
                <>
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">
                      Couleur des cheveux
                    </label>
                    <input
                      value={hairColor}
                      onChange={(event) => setHairColor(event.target.value)}
                      className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                      placeholder="Ex: blond, chatain"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">
                      Couleur des yeux
                    </label>
                    <input
                      value={eyeColor}
                      onChange={(event) => setEyeColor(event.target.value)}
                      className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                      placeholder="Ex: marron, bleu"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">Age</label>
                    <input
                      type="number"
                      min={0}
                      value={age}
                      onChange={(event) => setAge(event.target.value)}
                      className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                      placeholder="Ex: 28"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">
                      Taille (cm)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={height}
                      onChange={(event) => setHeight(event.target.value)}
                      className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                      placeholder="Ex: 170"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">
                      Morphologie
                    </label>
                    <input
                      value={bodyType}
                      onChange={(event) => setBodyType(event.target.value)}
                      className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                      placeholder="Ex: mince, athletique"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">
                      Pilosite faciale
                    </label>
                    <input
                      value={facialHair}
                      onChange={(event) => setFacialHair(event.target.value)}
                      className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                      placeholder="Ex: barbe courte, moustache"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">
                      Maquillage
                    </label>
                    <input
                      value={makeup}
                      onChange={(event) => setMakeup(event.target.value)}
                      className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                      placeholder="Ex: naturel, prononce"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">
                      Lunettes
                    </label>
                    <input
                      value={glasses}
                      onChange={(event) => setGlasses(event.target.value)}
                      className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                      placeholder="Ex: aucune, rondes"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">
                      Accessoires
                    </label>
                    <input
                      value={accessories}
                      onChange={(event) => setAccessories(event.target.value)}
                      className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                      placeholder="Ex: boucles d oreilles, chapeau"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">
                      Piercings
                    </label>
                    <input
                      value={piercings}
                      onChange={(event) => setPiercings(event.target.value)}
                      className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                      placeholder="Ex: nez, oreilles"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">
                      Tatouages
                    </label>
                    <input
                      value={tattoos}
                      onChange={(event) => setTattoos(event.target.value)}
                      className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                      placeholder="Ex: discrets, visibles"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">
                      Cicatrices
                    </label>
                    <input
                      value={scars}
                      onChange={(event) => setScars(event.target.value)}
                      className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                      placeholder="Ex: aucune, legeres"
                    />
                  </div>
                </>
              )}
              <div className="space-y-2 border-t border-slate-800/70 pt-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Diffusion</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-[11px] text-slate-400">
                    <span className="font-semibold uppercase tracking-wide">Visibilité</span>
                    <select
                      value={visibility}
                      onChange={(event) => {
                        const value = event.target.value === 'private' ? 'private' : 'public';
                        setVisibility(value);
                      }}
                      className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                    >
                      <option value="public">Publique</option>
                      <option value="private">Privée</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-[11px] text-slate-400">
                    <span className="font-semibold uppercase tracking-wide">Accès</span>
                    <select
                      value={accessType}
                      onChange={(event) => {
                        const value = event.target.value === 'paid' ? 'paid' : 'free';
                        setAccessType(value);
                      }}
                      className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                    >
                      <option value="free">Gratuite</option>
                      <option value="paid" disabled={!hasSubscription}>
                        Payante
                      </option>
                    </select>
                  </label>
                </div>
                <p className="text-[11px] text-slate-400">
                  Les IA privées sont masquées du catalogue public. Les IA payantes exigent un
                  abonnement actif (si vous n&apos;en avez pas, la sélection reste grisée).
                </p>
                {!hasSubscription && (
                  <p className="text-[11px] text-amber-300">
                    Votre compte n&apos;a pas d&apos;abonnement premium. Passez à un abonnement pour
                    activer l&apos;option payante.
                  </p>
                )}
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || locationBlocked}
              className="w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
            >
              {loading ? 'Creation...' : locationBlocked ? 'Localisation requise' : 'Creer l IA'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

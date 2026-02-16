'use client';

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import {
  auth,
  fetchAiProfilesRealTime,
  fetchConversationById,
  fetchConversationMessagesRealTime,
  fetchTokenPricingSettingsRealTime,
  fetchUtilisateurByIdRealTime,
  sendConversationMessageWithTokens,
  updateConversationCountry,
  updateConversationLocation,
} from '../../indexFirebase';
import {
  countryLabelByCode,
  countryOptions,
  isValidCountryCode,
  normalizeCountryCodeInput,
  readStoredManualCountry,
  writeStoredManualCountry,
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

type Profil = {
  id: string;
  mail?: string;
  pseudo?: string;
  role?: string;
  tokens?: number;
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
  createdAt?: Timestamp;
  [key: string]: unknown;
};

type Message = {
  id: string;
  authorId?: string;
  authorRole?: string;
  content?: string;
  kind?: string;
  tokenCost?: number;
  createdAt?: Timestamp;
  metadata?: {
    imageUrl?: string;
    prompt?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type AiProfile = {
  id: string;
  name?: string;
  status?: string;
  voice?: string;
  imageUrl?: string;
  imagePrompt?: string;
  [key: string]: unknown;
};

const messageTypes = [
  { id: 'text', label: 'Texte', cost: 1 },
  { id: 'image', label: 'Image', cost: 5 },
];

const LOCATION_FAILURE_THRESHOLD = 3;

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

export default function ConversationPage() {
  const params = useParams();
  const paramId = (params as { id?: string | string[] }).id;
  const conversationId =
    typeof paramId === 'string' ? paramId : Array.isArray(paramId) ? paramId[0] : '';

  const [userId, setUserId] = useState<string | null>(null);
  const [authMail, setAuthMail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profil | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [conversationLoading, setConversationLoading] = useState(true);
  const [conversationError, setConversationError] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const [aiProfiles, setAiProfiles] = useState<AiProfile[]>([]);
  const [aiProfilesLoading, setAiProfilesLoading] = useState(true);
  const [aiProfilesError, setAiProfilesError] = useState<string | null>(null);

  const [tokenPricingSettings, setTokenPricingSettings] = useState<TokenPricingSettings | null>(
    null,
  );
  const [tokenPricingLoading, setTokenPricingLoading] = useState(true);
  const [tokenPricingError, setTokenPricingError] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [messageKind, setMessageKind] = useState(messageTypes[0].id);
  const [sending, setSending] = useState(false);
  const [aiReplyLoading, setAiReplyLoading] = useState(false);
  const [aiReplyError, setAiReplyError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [locationSyncError, setLocationSyncError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<'pending' | 'ready' | 'error'>('pending');
  const [locationGateError, setLocationGateError] = useState<string | null>(null);
  const [locationFailures, setLocationFailures] = useState(0);
  const [manualCountry, setManualCountry] = useState<{ code: string; label: string } | null>(null);
  const [manualCountrySelect, setManualCountrySelect] = useState('');
  const [manualCountryInput, setManualCountryInput] = useState('');
  const [manualCountryError, setManualCountryError] = useState<string | null>(null);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const isAdmin = profile?.role === 'admin';
  const roleMismatch = Boolean(
    userId && profile?.role && !['client', 'admin'].includes(profile.role),
  );

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastLocationSentAt = useRef(0);
  const lastCountryLookupAt = useRef(0);

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
    const stored = readStoredManualCountry();
    if (stored) {
      setManualCountry(stored);
    }
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
      (data: unknown) => {
        setProfile(data as Profil | null);
        setProfileError(null);
        setProfileLoading(false);
      },
      () => {
        setProfileError('Impossible de recuperer le profil.');
        setProfileLoading(false);
      },
    );

    return () => unsubscribe?.();
  }, [userId]);

  useEffect(() => {
    setAiProfilesLoading(true);
    const unsubscribe = fetchAiProfilesRealTime(
      (data: unknown) => {
        setAiProfiles(data as AiProfile[]);
        setAiProfilesLoading(false);
        setAiProfilesError(null);
      },
      () => {
        setAiProfilesError('Impossible de recuperer les IA.');
        setAiProfilesLoading(false);
      },
    );

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    setTokenPricingLoading(true);
    const unsubscribe = fetchTokenPricingSettingsRealTime(
      (data: unknown) => {
        setTokenPricingSettings(
          data && typeof data === 'object'
            ? {
                base: (data as TokenPricingSettings).base,
                countries: (data as TokenPricingSettings).countries,
              }
            : null,
        );
        setTokenPricingLoading(false);
        setTokenPricingError(null);
      },
      () => {
        setTokenPricingError('Impossible de recuperer les tarifs tokens.');
        setTokenPricingLoading(false);
      },
    );

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setConversationError('Conversation introuvable.');
      setConversationLoading(false);
      return;
    }
    if (!userId || roleMismatch) {
      return;
    }

    setConversationLoading(true);
    fetchConversationById(conversationId)
      .then((data: unknown) => {
        if (!data) {
          setConversationError('Conversation introuvable.');
          setConversation(null);
          return;
        }
        if (
          !isAdmin &&
          (data as { userId?: string }).userId &&
          (data as { userId: string }).userId !== userId
        ) {
          setConversationError('Acces refuse.');
          setConversation(null);
          return;
        }
        setConversation(data as Conversation);
        setConversationError(null);
      })
      .catch(() => {
        setConversationError('Impossible de recuperer la conversation.');
      })
      .finally(() => {
        setConversationLoading(false);
      });
  }, [conversationId, isAdmin, userId, roleMismatch]);

  useEffect(() => {
    if (!conversationId || !userId || conversationError || roleMismatch) {
      return;
    }

    setMessagesLoading(true);
    const unsubscribe = fetchConversationMessagesRealTime({
      conversationId,
      pageSize: 50,
      onData: (data: unknown) => {
        setMessages(data as Message[]);
        setMessagesLoading(false);
        setMessagesError(null);
      },
      onError: () => {
        setMessagesError('Impossible de recuperer les messages.');
        setMessagesLoading(false);
      },
    } as {
      conversationId: string;
      pageSize: number;
      onData: (data: unknown) => void;
      onError: () => void;
    });

    return () => unsubscribe?.();
  }, [conversationId, userId, conversationError, roleMismatch]);

  useEffect(() => {
    if (!bottomRef.current) {
      return;
    }
    bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const syncLocation = useCallback(
    async (position: GeolocationPosition, options?: { forceCountryLookup?: boolean }) => {
      const now = Date.now();
      const forceCountryLookup = options?.forceCountryLookup ?? false;
      if (!forceCountryLookup && now - lastLocationSentAt.current < 30000) {
        return;
      }
      lastLocationSentAt.current = now;

      setLocationStatus('ready');
      setLocationGateError(null);
      setLocationFailures(0);

      if (!conversationId || !conversation) {
        return;
      }

      try {
        await updateConversationLocation({
          conversationId,
          location: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          },
        });
        setLocationSyncError(null);

        if (!forceCountryLookup && now - lastCountryLookupAt.current < 120000) {
          return;
        }
        lastCountryLookupAt.current = now;

        const response = await fetch('/api/location/country', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }),
        });

        if (!response.ok) {
          return;
        }

        const data = await response.json();
        const countryCode = typeof data?.countryCode === 'string' ? data.countryCode : '';
        const countryLabel = typeof data?.countryLabel === 'string' ? data.countryLabel : '';

        if (countryCode && countryCode !== conversation?.countryCode) {
          await updateConversationCountry({
            conversationId,
            countryCode,
            countryLabel,
          });
          setConversation((prev) =>
            prev
              ? {
                  ...prev,
                  countryCode,
                  countryLabel,
                  countryUpdatedAt: {
                    seconds: Math.floor(Date.now() / 1000),
                  },
                }
              : prev,
          );
        }
      } catch (error) {
        console.error('Erreur de synchronisation localisation', error);
        setLocationSyncError('Impossible de synchroniser la localisation.');
      }
    },
    [conversation, conversationId],
  );

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationStatus('error');
      setLocationGateError('Geolocalisation indisponible.');
      setLocationFailures((prev) => Math.max(prev, LOCATION_FAILURE_THRESHOLD));
      return;
    }

    setLocationGateError(null);
    setLocationStatus('pending');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void syncLocation(position, { forceCountryLookup: true });
      },
      () => {
        setLocationStatus('error');
        setLocationGateError('Localisation requise pour discuter.');
        setLocationFailures((prev) => prev + 1);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 },
    );
  }, [syncLocation]);

  const applyCountrySelection = useCallback(
    async (code: string, label?: string) => {
      if (!conversationId) {
        return;
      }
      const normalizedCode = normalizeCountryCodeInput(code);
      if (!isValidCountryCode(normalizedCode)) {
        setManualCountryError('Selectionnez un pays ou un code ISO valide.');
        return;
      }
      const resolvedLabel =
        label && label.trim().length > 0
          ? label.trim()
          : (countryLabelByCode[normalizedCode] ?? `Pays ${normalizedCode}`);

      try {
        await updateConversationCountry({
          conversationId,
          countryCode: normalizedCode,
          countryLabel: resolvedLabel,
        });
        setConversation((prev) =>
          prev
            ? {
                ...prev,
                countryCode: normalizedCode,
                countryLabel: resolvedLabel,
                countryUpdatedAt: {
                  seconds: Math.floor(Date.now() / 1000),
                },
              }
            : prev,
        );
        writeStoredManualCountry(normalizedCode, resolvedLabel);
        setManualCountry({ code: normalizedCode, label: resolvedLabel });
        setLocationStatus('ready');
        setLocationGateError(null);
        setLocationFailures(0);
        setManualCountryError(null);
      } catch (error) {
        console.error('Erreur mise a jour pays', error);
        setManualCountryError('Impossible de sauvegarder le pays.');
        setLocationFailures((prev) => Math.max(prev, LOCATION_FAILURE_THRESHOLD));
      }
    },
    [conversationId],
  );

  const handleManualCountryConfirm = () => {
    const selectedCode =
      manualCountrySelect === 'custom'
        ? normalizeCountryCodeInput(manualCountryInput)
        : normalizeCountryCodeInput(manualCountrySelect);

    if (!isValidCountryCode(selectedCode)) {
      setManualCountryError('Selectionnez un pays ou un code ISO valide.');
      return;
    }

    const label = countryLabelByCode[selectedCode] ?? `Pays ${selectedCode}`;
    void applyCountrySelection(selectedCode, label);
    setManualCountrySelect('');
    setManualCountryInput('');
  };

  useEffect(() => {
    if (!conversationId || !conversation || !manualCountry) {
      return;
    }
    if (conversation.countryCode) {
      return;
    }
    void applyCountrySelection(manualCountry.code, manualCountry.label);
  }, [applyCountrySelection, conversation, conversationId, manualCountry]);

  useEffect(() => {
    if (!conversationId || !userId || roleMismatch || !conversation || manualCountry) {
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationStatus('error');
      setLocationGateError('Geolocalisation indisponible.');
      setLocationFailures((prev) => Math.max(prev, LOCATION_FAILURE_THRESHOLD));
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        void syncLocation(position);
      },
      () => {
        setLocationStatus('error');
        setLocationGateError('Localisation refusee.');
        setLocationFailures((prev) => prev + 1);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [conversation, conversationId, manualCountry, roleMismatch, syncLocation, userId]);

  const aiLookup = useMemo(() => {
    const map: Record<string, AiProfile> = {};
    aiProfiles.forEach((profile) => {
      if (profile.id) {
        map[profile.id] = profile;
      }
    });
    return map;
  }, [aiProfiles]);

  const selectedMessageType = useMemo(
    () => messageTypes.find((type) => type.id === messageKind) ?? messageTypes[0],
    [messageKind],
  );

  const countryPricing = conversation?.countryCode
    ? tokenPricingSettings?.countries?.[conversation.countryCode]
    : undefined;
  const basePricing = tokenPricingSettings?.base;

  const resolveTokenCost = (kind: string, fallback: number) => {
    const override =
      typeof conversation?.tokenPricing?.[kind as keyof TokenPricing] === 'number'
        ? (conversation?.tokenPricing?.[kind as keyof TokenPricing] as number)
        : null;
    const countryCost =
      typeof countryPricing?.[kind as keyof TokenPricing] === 'number'
        ? (countryPricing?.[kind as keyof TokenPricing] as number)
        : null;
    const baseCost =
      typeof basePricing?.[kind as keyof TokenPricing] === 'number'
        ? (basePricing?.[kind as keyof TokenPricing] as number)
        : null;
    const cost = override ?? countryCost ?? baseCost ?? fallback;
    const source = override ? 'override' : countryCost ? 'country' : baseCost ? 'base' : 'default';
    return {
      cost,
      override,
      source,
    };
  };

  const tokensRemaining = typeof profile?.tokens === 'number' ? profile.tokens : 0;
  const resolvedCost = resolveTokenCost(selectedMessageType.id, selectedMessageType.cost);
  const messageCost = resolvedCost.cost;
  const pricingSource = resolvedCost.source;
  const isBlocked = tokensRemaining < messageCost;
  const aiLabel = conversation?.aiId
    ? (aiLookup[conversation.aiId]?.name ?? `IA ${conversation.aiId.slice(0, 5)}`)
    : 'IA inconnue';
  const aiAvatarUrl = conversation?.aiId ? (aiLookup[conversation.aiId]?.imageUrl ?? '') : '';
  const aiHasAvatar = Boolean(aiAvatarUrl);
  const hasAvatarImage = aiHasAvatar;
  const aiStatusKey = conversation?.aiId
    ? (aiLookup[conversation.aiId]?.status ?? '').toLowerCase()
    : '';
  const aiBlocked =
    Boolean(conversation?.aiId) && (aiProfilesLoading || aiStatusKey !== 'active' || !aiHasAvatar);
  const aiStatusNote = aiProfilesLoading
    ? `Statut ${aiLabel} en cours de chargement.`
    : !aiHasAvatar
      ? `Avatar ${aiLabel} en cours de generation.`
      : aiStatusKey === 'pending' || !aiStatusKey
        ? `${aiLabel} en attente de validation par un admin.`
        : aiStatusKey === 'suspended'
          ? `${aiLabel} suspendue.`
          : aiStatusKey === 'disabled'
            ? `${aiLabel} desactivee.`
            : aiStatusKey === 'rejected'
              ? `${aiLabel} refusee.`
              : `${aiLabel} indisponible.`;
  const locationRequired = !isAdmin;
  const locationReady = locationStatus === 'ready' || Boolean(conversation?.countryCode);
  const locationBlocked = locationRequired && !locationReady;
  const locationStatusLabel =
    locationStatus === 'pending'
      ? 'Localisation en cours...'
      : 'Localisation requise pour discuter.';
  const canSend =
    !isBlocked &&
    !aiBlocked &&
    !isAdmin &&
    !locationBlocked &&
    draft.trim().length > 0 &&
    !sending &&
    !aiReplyLoading &&
    Boolean(conversation);
  const aiReplyStatusLabel =
    messageKind === 'image'
      ? `${aiLabel} genere une image...`
      : `${aiLabel} est en train de repondre...`;
  const aiReplyButtonLabel =
    messageKind === 'image' ? `Image ${aiLabel} en cours...` : `${aiLabel} en cours...`;

  const avatarState = useMemo(() => {
    if (isBlocked || aiBlocked || locationBlocked) {
      return 'blocked';
    }
    if (aiReplyLoading) {
      return 'speaking';
    }
    if (draft.trim().length > 0) {
      return 'listening';
    }
    return 'idle';
  }, [aiBlocked, aiReplyLoading, draft, isBlocked]);

  const avatarShellClass =
    avatarState === 'blocked'
      ? 'from-rose-500/20 via-slate-900/80 to-slate-950'
      : avatarState === 'speaking'
        ? 'from-sky-500/40 via-emerald-500/20 to-slate-950'
        : avatarState === 'listening'
          ? 'from-emerald-500/30 via-sky-500/20 to-slate-950'
          : 'from-slate-700/30 via-slate-900/70 to-slate-950';

  const avatarGlowClass =
    avatarState === 'blocked'
      ? 'bg-rose-500/20'
      : avatarState === 'speaking'
        ? 'bg-sky-400/30'
        : avatarState === 'listening'
          ? 'bg-emerald-400/30'
          : 'bg-slate-400/20';

  const avatarPulseClass =
    avatarState === 'speaking'
      ? 'animate-pulse'
      : avatarState === 'listening'
        ? 'animate-pulse'
        : '';
  const avatarFrameClass = avatarState === 'idle' ? 'aspect-[4/5]' : 'aspect-[3/4]';
  const avatarImageClass =
    avatarState === 'idle'
      ? 'h-full w-full object-cover object-top'
      : 'h-full w-full object-contain';

  const formRef = useRef<HTMLFormElement>(null);

  const handleTextareaKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      if (formRef.current?.requestSubmit) {
        formRef.current.requestSubmit();
      } else {
        formRef.current?.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    }
  }, []);

  const playAiSpeech = async (text: string, aiId?: string) => {
    setTtsError(null);

    try {
      const response = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          aiId,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const errorMessage =
          typeof data?.error === 'string' ? data.error : 'Lecture audio indisponible.';
        throw new Error(errorMessage);
      }

      const audioBuffer = await response.arrayBuffer();
      const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = audio;

      const cleanup = () => {
        URL.revokeObjectURL(audioUrl);
      };
      audio.addEventListener('ended', cleanup, { once: true });
      audio.addEventListener('error', cleanup, { once: true });

      await audio.play();
    } catch (error) {
      console.error('Erreur lecture audio', error);
      setTtsError('Lecture audio indisponible.');
    }
  };

  const handleSendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSendError(null);
    setSendSuccess(null);
    setAiReplyError(null);
    setTtsError(null);

    if (!userId) {
      setSendError('Connectez-vous pour envoyer un message.');
      return;
    }
    if (!conversationId || !conversation) {
      setSendError('Conversation indisponible.');
      return;
    }

    const trimmed = draft.trim();
    if (!trimmed) {
      setSendError('Message vide.');
      return;
    }
    if (tokensRemaining < messageCost) {
      setSendError('Solde insuffisant pour ce message.');
      return;
    }

    if (isAdmin) {
      setSendError('Action reservee aux comptes client.');
      return;
    }

    if (locationBlocked) {
      setSendError('Localisation requise pour discuter.');
      requestLocation();
      return;
    }

    if (aiBlocked) {
      setSendError(aiStatusNote);
      return;
    }

    if (!conversation.aiId) {
      setSendError('Aucune IA associee a cette conversation.');
      return;
    }

    setSending(true);
    let messageSent = false;

    try {
      await sendConversationMessageWithTokens({
        conversationId,
        userId,
        authorRole: 'client',
        content: trimmed,
        kind: messageKind,
        tokenCost: messageCost,
        metadata: {},
      });
      setDraft('');
      setSendSuccess('Message envoye.');
      messageSent = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible d'envoyer le message.";
      setSendError(message);
    } finally {
      setSending(false);
    }

    if (!messageSent || !conversation.aiId) {
      return;
    }

    setAiReplyLoading(true);
    try {
      const isImageRequest = messageKind === 'image';
      const endpoint = isImageRequest ? '/api/ai/image' : '/api/ai/reply';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId,
          userId,
          aiId: conversation.aiId,
          message: trimmed,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMessage =
          typeof data?.error === 'string' ? data.error : 'Reponse IA indisponible.';
        throw new Error(errorMessage);
      }

      if (!isImageRequest) {
        const replyText = typeof data?.reply === 'string' ? data.reply.trim() : '';
        if (replyText) {
          void playAiSpeech(replyText, conversation.aiId ?? undefined);
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Impossible de generer la reponse IA.';
      setAiReplyError(message);
    } finally {
      setAiReplyLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 md:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-900/80 via-slate-900 to-slate-950/80 p-6 shadow-2xl shadow-slate-900/40 backdrop-blur">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Conversation live</p>
            <h1 className="text-3xl font-semibold md:text-4xl">{aiLabel}</h1>
            <p className="text-sm text-slate-400 md:text-base">
              Cout du message, tokens restants et avatar de {aiLabel}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>{profile?.mail ?? authMail ?? 'Compte actif'}</span>
            <Link
              href="/historique/client"
              className="rounded-full border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-700"
            >
              Retour a l historique
            </Link>
          </div>
        </header>

        {!userId ? (
          <section className="rounded-3xl border border-slate-800/80 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
            <h2 className="text-lg font-semibold">Connexion requise</h2>
            <p className="mt-2 text-sm text-slate-400">Connectez-vous pour envoyer des messages.</p>
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
              Connectez-vous avec un compte client pour discuter avec {aiLabel}.
            </p>
            <Link
              href="/demandes/client"
              className="mt-4 inline-flex items-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Aller aux demandes client
            </Link>
          </section>
        ) : conversationError ? (
          <section className="rounded-3xl border border-slate-800/80 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
            <h2 className="text-lg font-semibold">Conversation indisponible</h2>
            <p className="mt-2 text-sm text-rose-300">{conversationError}</p>
          </section>
        ) : (
          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <article className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Fil de discussion</h2>
                  <p className="text-sm text-slate-400">
                    {conversationLoading
                      ? 'Chargement...'
                      : `Conversation ${conversation?.id ?? '—'}`}
                  </p>
                </div>
                <span className="text-xs text-slate-400">
                  {messagesLoading ? 'Synchronisation...' : `${messages.length} messages`}
                </span>
              </div>

              {(messagesError || aiProfilesError || tokenPricingError) && (
                <p className="mt-4 text-sm text-rose-300">
                  {messagesError ?? aiProfilesError ?? tokenPricingError}
                </p>
              )}

              <div className="mt-6 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                {messagesLoading ? (
                  <p className="text-sm text-slate-400">Chargement des messages...</p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-slate-400">Aucun message pour le moment.</p>
                ) : (
                  messages.map((message) => {
                    const isMine = message.authorId && message.authorId === userId;
                    const authorLabel = isMine
                      ? 'moi'
                      : message.authorRole === 'ai'
                        ? aiLabel
                        : 'autre';
                    const imageUrl =
                      message.kind === 'image' && typeof message.metadata?.imageUrl === 'string'
                        ? message.metadata.imageUrl
                        : '';
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl border px-4 py-3 text-sm ${
                            isMine
                              ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-100'
                              : 'border-slate-800/80 bg-slate-950/60 text-slate-100'
                          }`}
                        >
                          <p className="text-xs uppercase tracking-[0.15em] text-slate-400">
                            {authorLabel}
                          </p>
                          {imageUrl ? (
                            <div className="mt-2 space-y-2">
                              <img
                                src={imageUrl}
                                alt={`Image ${aiLabel}`}
                                className="w-full rounded-xl border border-white/10 object-cover"
                                loading="lazy"
                              />
                              {message.content && (
                                <p className="text-xs text-slate-400">{message.content}</p>
                              )}
                            </div>
                          ) : (
                            <p className="mt-2 whitespace-pre-wrap">{message.content}</p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                            <span>{formatDate(message.createdAt)}</span>
                            <span>
                              Cout: {typeof message.tokenCost === 'number' ? message.tokenCost : 0}{' '}
                              token
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                {aiReplyLoading && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
                      <p className="text-xs uppercase tracking-[0.15em] text-slate-400">
                        {aiLabel}
                      </p>
                      <p className="mt-2">{aiReplyStatusLabel}</p>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              <form ref={formRef} onSubmit={handleSendMessage} className="mt-6 space-y-4">
                {locationBlocked && (
                  <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                    <p>{locationStatusLabel}</p>
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
                          Geolocalisation echouee plusieurs fois. Choisissez un pays manuellement.
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
                            onClick={handleManualCountryConfirm}
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
                    {locationGateError && (
                      <p className="mt-2 text-[11px] text-amber-300">{locationGateError}</p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {messageTypes.map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setMessageKind(type.id)}
                      className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                        messageKind === type.id
                          ? 'border-emerald-400/70 bg-emerald-500/20 text-emerald-200'
                          : 'border-slate-800/80 bg-slate-950/40 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      {type.label} · {resolveTokenCost(type.id, type.cost).cost} token
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wide text-slate-400">Message</label>
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleTextareaKeyDown}
                    rows={4}
                    disabled={isBlocked || sending || aiReplyLoading || isAdmin || locationBlocked}
                    className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                    placeholder={
                      isAdmin
                        ? 'Lecture seule (admin)'
                        : locationBlocked
                          ? 'Localisation requise pour discuter.'
                          : aiReplyLoading
                            ? `${aiLabel} en train de repondre...`
                            : `Ecrire a ${aiLabel}...`
                    }
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                  <span>
                    Cout du message: {messageCost} token · Solde:{' '}
                    {profileLoading ? '...' : tokensRemaining}
                  </span>
                  {pricingSource === 'country' && (
                    <span className="text-amber-200">
                      Tarif pays {conversation?.countryCode ?? '?'}
                    </span>
                  )}
                  {pricingSource === 'base' && (
                    <span className="text-amber-200">Tarif de base applique.</span>
                  )}
                  {pricingSource === 'override' && (
                    <span className="text-amber-200">Tarif personnalise.</span>
                  )}
                  {isBlocked && (
                    <span className="text-rose-300">
                      Solde insuffisant pour ce type de message.
                    </span>
                  )}
                  {aiBlocked && <span className="text-amber-300">{aiStatusNote}</span>}
                </div>

                {isAdmin && (
                  <p className="text-xs text-amber-300">
                    Mode admin : lecture seule, envoi bloque.
                  </p>
                )}
                {sendError && <p className="text-sm text-rose-300">{sendError}</p>}
                {sendSuccess && <p className="text-sm text-emerald-300">{sendSuccess}</p>}
                {aiReplyError && <p className="text-sm text-amber-300">{aiReplyError}</p>}
                {ttsError && <p className="text-sm text-amber-300">{ttsError}</p>}

                <button
                  type="submit"
                  disabled={!canSend}
                  className="w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/40"
                >
                  {sending
                    ? 'Envoi...'
                    : aiReplyLoading
                      ? aiReplyButtonLabel
                      : 'Envoyer le message'}
                </button>
              </form>
            </article>

            <article className="space-y-6">
              <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">Tokens restants</h2>
                    <p className="text-sm text-slate-400">
                      Blocage automatique si solde insuffisant.
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">
                    {profileLoading ? '...' : `${tokensRemaining} tokens`}
                  </span>
                </div>

                {profileError && <p className="mt-3 text-sm text-rose-300">{profileError}</p>}

                <div className="mt-4 grid gap-3 rounded-2xl border border-slate-800/70 bg-slate-950/40 p-4 text-sm text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>Cout message</span>
                    <span className="font-semibold text-emerald-200">{messageCost} token</span>
                  </div>
                  {pricingSource === 'country' && (
                    <div className="flex items-center justify-between text-xs text-amber-200">
                      <span>Tarif pays</span>
                      <span>{conversation?.countryCode ?? '?'}</span>
                    </div>
                  )}
                  {pricingSource === 'base' && (
                    <div className="flex items-center justify-between text-xs text-amber-200">
                      <span>Tarif</span>
                      <span>base</span>
                    </div>
                  )}
                  {pricingSource === 'override' && (
                    <div className="flex items-center justify-between text-xs text-amber-200">
                      <span>Tarif</span>
                      <span>personnalise</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span>Message type</span>
                    <span>{selectedMessageType.label}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Etat saisie</span>
                    <span>{isBlocked || locationBlocked ? 'bloquee' : 'ouverte'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Pays</span>
                    <span>
                      {conversation?.countryLabel ?? conversation?.countryCode ?? 'Non detecte'}
                    </span>
                  </div>
                </div>
                {tokenPricingLoading && (
                  <p className="mt-3 text-xs text-slate-500">Chargement des tarifs en cours...</p>
                )}
                {locationSyncError && (
                  <p className="mt-3 text-xs text-amber-300">{locationSyncError}</p>
                )}
              </div>

              <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">Avatar {aiLabel}</h2>
                    <p className="text-sm text-slate-400">
                      Image de base generee lors de la creation.
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">
                    {aiProfilesLoading
                      ? 'Sync...'
                      : !aiHasAvatar
                        ? 'Avatar en cours'
                        : aiBlocked
                          ? `${aiLabel} indisponible`
                          : `${aiLabel} en ligne`}
                  </span>
                </div>

                <div className="mt-6 flex items-center justify-center">
                  <div className={`relative ${avatarFrameClass} w-full max-w-[260px]`}>
                    <div
                      className={`absolute inset-0 rounded-[32%] bg-gradient-to-br ${avatarShellClass} ${avatarPulseClass}`}
                    />
                    <div className={`absolute inset-6 rounded-[30%] blur-2xl ${avatarGlowClass}`} />
                    {hasAvatarImage ? (
                      <>
                        <div className="absolute inset-6 rounded-[28%] border border-white/10 bg-slate-950/50" />
                        <div className="absolute inset-8 rounded-[26%] overflow-hidden">
                          <img
                            src={aiAvatarUrl}
                            alt={`Avatar de ${aiLabel}`}
                            className={avatarImageClass}
                            loading="lazy"
                          />
                        </div>
                        <div className="absolute inset-8 rounded-[26%] ring-1 ring-white/10" />
                      </>
                    ) : (
                      <>
                        <div className="absolute inset-10 rounded-[36%] border border-white/10 bg-slate-950/60" />
                        <div className="absolute inset-16 rounded-full border border-white/10 bg-gradient-to-br from-slate-800/60 to-slate-950/80" />
                      </>
                    )}
                    <div className="absolute inset-0 flex items-end justify-center pb-6">
                      <span className="rounded-full border border-slate-700/70 bg-slate-950/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                        {avatarState === 'blocked'
                          ? 'bloque'
                          : avatarState === 'speaking'
                            ? 'reagit'
                            : avatarState === 'listening'
                              ? 'ecoute'
                              : 'idle'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-xs text-slate-400">
                  {avatarState === 'blocked'
                    ? aiHasAvatar
                      ? 'Rechargez pour relancer l experience.'
                      : 'Avatar en cours de generation.'
                    : avatarState === 'speaking'
                      ? 'L avatar repond a votre message.'
                      : avatarState === 'listening'
                        ? 'L avatar capte votre saisie.'
                        : 'L avatar attend un message.'}
                </div>
              </div>
            </article>
          </section>
        )}
      </div>
    </div>
  );
}

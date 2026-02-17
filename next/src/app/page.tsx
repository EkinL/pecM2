'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import {
  auth,
  fetchUtilisateurById,
  fetchAiProfilesRealTime,
  fetchConversationsRealTime,
  fetchConversationsForUserRealTime,
  fetchUtilisateursRealTime,
  grantUserTokensWithPassword,
  signOutUser,
  updateAiProfileDetails,
  updateAiProfileStatus,
  updateConversationStatus,
  updateUtilisateurRole,
} from './indexFirebase';
import { apiFetch } from './utils/apiFetch';
import { logActivity } from './utils/logActivity';
import { HeroHeader } from './components/dashboard/HeroHeader';
import { UsersSection } from './components/dashboard/UsersSection';
import { AiValidationSection } from './components/dashboard/AiValidationSection';
import { AiProfilesSection } from './components/dashboard/AiProfilesSection';
import { AiManagementSection } from './components/dashboard/AiManagementSection';
import { KpiCard } from './components/dashboard/KpiCard';
import { MarketingLineChart } from './components/dashboard/MarketingLineChart';
import { InsightsPanel } from './components/dashboard/InsightsPanel';
import {
  appendMetricsSnapshot,
  buildMonitoringInsights,
  buildMonitoringSeries,
  computePeriodDelta,
  createMetricsSnapshot,
  formatObservedWindow,
  getObservedWindowMs,
  histogramQuantile,
  MetricsSnapshot,
  TrendDirection,
} from './utils/prometheusMonitoring';
import { AiProfile, Conversation, Timestamp, Utilisateur } from './types/dashboard';

const statusBucket = (status?: string) => {
  const normalized = status?.toLowerCase() ?? '';
  if (['pending', 'nouveau', 'queued', 'en attente', ''].includes(normalized)) {
    return 'pending';
  }
  if (['in progress', 'en cours', 'ongoing', 'matched', 'actif', 'accepted'].includes(normalized)) {
    return 'running';
  }
  if (['completed', 'done', 'terminé', 'closed', 'ended', 'cancelled'].includes(normalized)) {
    return 'completed';
  }
  return 'other';
};

const statusLabels: Record<string, string> = {
  pending: 'Ouverte',
  running: 'Ouverte',
  completed: 'Fermee',
  other: 'Ouverte',
};

const statusBadgeStyles: Record<string, string> = {
  pending: 'bg-amber-100/80 text-amber-700 border border-amber-400/70',
  running: 'bg-emerald-100/80 text-emerald-700 border border-emerald-400/70',
  completed: 'bg-sky-100/80 text-sky-700 border border-sky-400/70',
  other: 'bg-slate-100/80 text-slate-700 border border-slate-300/80',
};

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

const formatUserLabel = (user: Utilisateur) => {
  if (user.pseudo) {
    return user.pseudo;
  }
  if (typeof user.mail === 'string' && user.mail.length > 0) {
    return user.mail;
  }
  return `Utilisateur ${user.id.slice(0, 5)}`;
};

const formatLookSummary = (profile: AiProfile) => {
  if (!profile.look) {
    return 'Apparence en attente';
  }
  const parts = [
    profile.look.gender && `Genre ${profile.look.gender}`,
    profile.look.skin && `Peau ${profile.look.skin}`,
    profile.look.hair && `Cheveux ${profile.look.hair}`,
    profile.look.outfit && `Tenue ${profile.look.outfit}`,
    profile.look.ethnicity && `Ethnie ${profile.look.ethnicity}`,
  ].filter(Boolean);

  return parts.join(' · ') || 'Apparence partiellement renseignée';
};

const normalizeAiStatus = (status?: string) => {
  const normalized = status?.toLowerCase() ?? 'pending';
  if (['pending', 'active', 'suspended', 'disabled', 'rejected'].includes(normalized)) {
    return normalized;
  }
  return 'pending';
};

const aiStatusLabels: Record<string, string> = {
  pending: 'En attente',
  active: 'Active',
  suspended: 'Suspendue',
  disabled: 'Desactivee',
  rejected: 'Refusee',
};

const aiStatusStyles: Record<string, string> = {
  pending: 'bg-amber-100/80 text-amber-700 border border-amber-400/70',
  active: 'bg-emerald-100/80 text-emerald-700 border border-emerald-400/70',
  suspended: 'bg-sky-100/80 text-sky-700 border border-sky-400/70',
  disabled: 'bg-slate-100/80 text-slate-700 border border-slate-300/80',
  rejected: 'bg-rose-100/80 text-rose-700 border border-rose-400/70',
};

type AdminMetricsSummary = {
  scrapeRequestsTotal?: number | null;
  apiRequestsTotal?: number | null;
  apiErrorsTotal?: number | null;
  businessMessagesTotal?: number | null;
};

type AdminMetricsProbeResult = {
  ok?: boolean;
  source?: string;
  durationMs?: number;
  summary?: AdminMetricsSummary;
  rawMetrics?: string;
  error?: string;
  failures?: Array<{ source: string; status?: number; error: string }>;
  targets?: string[];
};

const formatMetricValue = (value?: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  return value.toLocaleString('fr-FR');
};

type TrendTone = 'positive' | 'warning' | 'neutral';

const formatDecimal = (value: number, digits = 1) => value.toFixed(digits).replace('.', ',');

const formatRatePerMinute = (value?: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  return `${formatDecimal(value, value >= 100 ? 0 : 1)} req/min`;
};

const formatPercentValue = (value?: number | null, digits = 2) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  return `${formatDecimal(value, digits)}%`;
};

const formatLatencyValue = (value?: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  return `${formatDecimal(value, value >= 100 ? 0 : 1)} ms`;
};

const formatMemoryValue = (value?: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  return `${formatDecimal(value, value >= 1024 ? 0 : 1)} MB`;
};

const formatUptimeValue = (value?: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  const totalSeconds = Math.max(0, Math.floor(value));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) {
    return `${days}j ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${totalSeconds}s`;
};

const buildTrendTone = (direction: TrendDirection, higherIsBetter: boolean): TrendTone => {
  if (direction === 'flat') {
    return 'neutral';
  }
  if (higherIsBetter) {
    return direction === 'up' ? 'positive' : 'warning';
  }
  return direction === 'down' ? 'positive' : 'warning';
};

const buildTrendLabel = (percentage: number | null, previous: number | null) => {
  if (percentage !== null) {
    return `${formatDecimal(Math.abs(percentage), 1)}% vs periode precedente`;
  }
  if (previous !== null) {
    return 'Variation faible';
  }
  return 'Variation en cours';
};

const toSparkline = (values: Array<number | null>) => values.slice(-24);

const buildLookPayload = (values: Record<string, string>) => {
  const next = Object.entries(values).reduce<Record<string, string>>((acc, [key, value]) => {
    const trimmed = value.trim();
    if (trimmed) {
      acc[key] = trimmed;
    }
    return acc;
  }, {});

  return Object.keys(next).length ? next : undefined;
};

export default function AdminDashboard() {
  const router = useRouter();
  const [adminChecking, setAdminChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<null | { uid: string; mail?: string | null }>(null);
  const [profile, setProfile] = useState<Utilisateur | null>(null);
  const [adminHasPassword, setAdminHasPassword] = useState(false);
  const [users, setUsers] = useState<Utilisateur[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [conversationSearch, setConversationSearch] = useState('');
  const [conversationStatusFilter, setConversationStatusFilter] = useState('all');
  const [conversationPage, setConversationPage] = useState(1);
  const [conversationAction, setConversationAction] = useState<{
    id: string;
    type: 'open' | 'close';
  } | null>(null);
  const [conversationActionError, setConversationActionError] = useState<string | null>(null);
  const [conversationActionSuccess, setConversationActionSuccess] = useState<string | null>(null);
  const [closeConversationDialog, setCloseConversationDialog] = useState<null | {
    id: string;
    label: string;
  }>(null);
  const [aiAction, setAiAction] = useState<{
    id: string;
    type: 'approve' | 'reject' | 'activate' | 'suspend' | 'disable';
  } | null>(null);
  const [aiActionError, setAiActionError] = useState<string | null>(null);
  const [aiActionSuccess, setAiActionSuccess] = useState<string | null>(null);
  const [aiActionImageUrl, setAiActionImageUrl] = useState<string | null>(null);
  const [aiEditId, setAiEditId] = useState<string | null>(null);
  const [aiEditForm, setAiEditForm] = useState({
    name: '',
    mentality: '',
    voice: '',
    gender: '',
    skin: '',
    hair: '',
    hairColor: '',
    eyeColor: '',
    age: '',
    height: '',
    bodyType: '',
    facialHair: '',
    makeup: '',
    glasses: '',
    accessories: '',
    piercings: '',
    tattoos: '',
    scars: '',
    outfit: '',
    ethnicity: '',
    details: '',
  });
  const [aiEditLoading, setAiEditLoading] = useState(false);
  const [aiEditError, setAiEditError] = useState<string | null>(null);
  const [aiEditSuccess, setAiEditSuccess] = useState<string | null>(null);
  const [aiProfiles, setAiProfiles] = useState<AiProfile[]>([]);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiError, setAiError] = useState<string | null>(null);
  const [userRoleAction, setUserRoleAction] = useState<{
    id: string;
    status: 'loading' | 'success' | 'error';
    message?: string;
  } | null>(null);
  const [tokenGrantInputs, setTokenGrantInputs] = useState<
    Record<string, { amount: string; password: string }>
  >({});
  const [tokenGrantAction, setTokenGrantAction] = useState<{
    id: string;
    status: 'loading' | 'success' | 'error';
    message?: string;
  } | null>(null);
  const [clientConversations, setClientConversations] = useState<Conversation[]>([]);
  const [clientConversationsLoading, setClientConversationsLoading] = useState(true);
  const [clientConversationsError, setClientConversationsError] = useState<string | null>(null);
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [metricsProbe, setMetricsProbe] = useState<AdminMetricsProbeResult | null>(null);
  const [metricsProbeRaw, setMetricsProbeRaw] = useState('');
  const [metricsProbeFetching, setMetricsProbeFetching] = useState(false);
  const [metricsProbeError, setMetricsProbeError] = useState<string | null>(null);
  const [metricsProbeUpdatedAt, setMetricsProbeUpdatedAt] = useState<string | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<MetricsSnapshot[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAdminUser(null);
        setProfile(null);
        setIsAdmin(false);
        setUserRole(null);
        setAdminChecking(false);
        router.replace('/auth');
        return;
      }

      const providerIds = (user.providerData ?? [])
        .map((provider) => provider?.providerId)
        .filter(Boolean);
      setAdminHasPassword(providerIds.includes('password'));
      setAdminUser({ uid: user.uid, mail: user.email });

      try {
        const profileData = (await fetchUtilisateurById(user.uid)) as { role?: string } | null;
        const role = typeof profileData?.role === 'string' ? profileData.role : null;
        setProfile(profileData ?? (null as any));
        setUserRole(role);
        if (role === 'admin') {
          setIsAdmin(true);
          setAdminError(null);
        } else {
          setIsAdmin(false);
          setAdminError(role ? null : 'Acces reserve aux admins.');
        }
      } catch (error) {
        console.error('Erreur lors de la verification du role admin', error);
        setIsAdmin(false);
        setUserRole(null);
        setAdminError('Impossible de verifier le role admin.');
      } finally {
        setAdminChecking(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (userRole !== 'client') {
      return;
    }

    setAiLoading(true);
    const unsubAiProfiles = fetchAiProfilesRealTime(
      (data: unknown) => {
        setAiProfiles(data as AiProfile[]);
        setAiLoading(false);
        setAiError(null);
      },
      () => {
        setAiError('Impossible de récupérer les IA créées.');
        setAiLoading(false);
      },
    );

    return () => unsubAiProfiles?.();
  }, [userRole]);

  useEffect(() => {
    if (!adminUser?.uid || userRole !== 'client') {
      setClientConversations([]);
      setClientConversationsLoading(false);
      return;
    }

    setClientConversationsLoading(true);
    const unsub = fetchConversationsForUserRealTime(
      adminUser.uid,
      (data: unknown) => {
        setClientConversations(data as Conversation[]);
        setClientConversationsLoading(false);
        setClientConversationsError(null);
      },
      () => {
        setClientConversationsError('Impossible de récupérer vos chats IA.');
        setClientConversationsLoading(false);
      },
    );

    return () => unsub?.();
  }, [adminUser?.uid, userRole]);

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
        setUsersError('Impossible de récupérer les utilisateurs.');
        setUsersLoading(false);
      },
    );
    const unsubConversations = fetchConversationsRealTime(
      (data: unknown) => {
        setConversations(data as Conversation[]);
        setConversationsLoading(false);
        setConversationsError(null);
      },
      () => {
        setConversationsError('Impossible de récupérer les conversations.');
        setConversationsLoading(false);
      },
    );
    const unsubAiProfiles = fetchAiProfilesRealTime(
      (data: unknown) => {
        setAiProfiles(data as AiProfile[]);
        setAiLoading(false);
        setAiError(null);
      },
      () => {
        setAiError('Impossible de récupérer les IA créées.');
        setAiLoading(false);
      },
    );

    return () => {
      unsubUsers?.();
      unsubConversations?.();
      unsubAiProfiles?.();
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setMetricsProbe(null);
      setMetricsProbeRaw('');
      setMetricsProbeFetching(false);
      setMetricsProbeError(null);
      setMetricsProbeUpdatedAt(null);
      setMetricsHistory([]);
      return;
    }

    const probeMetrics = async () => {
      setMetricsProbeFetching(true);
      try {
        const capturedAt = Date.now();
        const response = await apiFetch('/api/admin/metrics/probe?includeRaw=1', {
          method: 'GET',
          cache: 'no-store',
        });
        const data = await response.json().catch(() => ({}));
        const payload = data && typeof data === 'object' ? (data as AdminMetricsProbeResult) : null;
        setMetricsProbeUpdatedAt(
          new Date(capturedAt).toLocaleString('fr-FR', {
            dateStyle: 'short',
            timeStyle: 'short',
          }),
        );
        setMetricsProbe(payload);
        setMetricsProbeRaw(typeof payload?.rawMetrics === 'string' ? payload.rawMetrics : '');

        if (!response.ok) {
          const errorMessage =
            typeof payload?.error === 'string'
              ? payload.error
              : 'Sonde metrics admin indisponible.';
          setMetricsProbeError(errorMessage);
          console.error('Sonde metrics admin en echec', payload);
          return;
        }

        setMetricsProbeError(null);
        const snapshot = createMetricsSnapshot({
          rawMetrics: payload?.rawMetrics,
          summary: payload?.summary,
          capturedAt,
        });
        if (snapshot) {
          setMetricsHistory((history) => appendMetricsSnapshot(history, snapshot));
        }
        console.info('Sonde metrics admin ok', payload);
      } catch (error) {
        setMetricsProbeError('Erreur sonde metrics admin.');
        console.error('Erreur sonde metrics admin', error);
      } finally {
        setMetricsProbeFetching(false);
      }
    };

    void probeMetrics();
    const intervalId = window.setInterval(() => {
      void probeMetrics();
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isAdmin]);

  useEffect(() => {
    setConversationPage(1);
  }, [conversationSearch, conversationStatusFilter]);

  const handleSignOut = async () => {
    setSignOutError(null);
    setSignOutLoading(true);

    try {
      await signOutUser();
      router.replace('/auth');
    } catch (error) {
      console.error('Erreur lors de la deconnexion', error);
      setSignOutError('Impossible de se deconnecter.');
    } finally {
      setSignOutLoading(false);
    }
  };

  const handleOpenConversation = async (conversationId: string) => {
    setConversationActionError(null);
    setConversationActionSuccess(null);
    setConversationAction({ id: conversationId, type: 'open' });

    try {
      await updateConversationStatus({
        conversationId,
        status: 'running',
        note: 'opened by admin',
      });
      setConversationActionSuccess('Conversation ouverte.');
    } catch (error) {
      console.error("Erreur lors de l'ouverture", error);
      setConversationActionError("Impossible d'ouvrir la conversation.");
    } finally {
      setConversationAction(null);
    }
  };

  const handleRequestCloseConversation = (conversationId: string, label: string) => {
    setCloseConversationDialog({ id: conversationId, label });
  };

  const handleConfirmCloseConversation = async () => {
    if (!closeConversationDialog) {
      return;
    }

    const { id } = closeConversationDialog;
    setCloseConversationDialog(null);
    await handleCloseConversation(id);
  };

  const handleCloseConversation = async (conversationId: string) => {
    setConversationActionError(null);
    setConversationActionSuccess(null);
    setConversationAction({ id: conversationId, type: 'close' });

    try {
      await updateConversationStatus({
        conversationId,
        status: 'completed',
        note: 'closed by admin',
      });
      setConversationActionSuccess('Conversation fermee.');
    } catch (error) {
      console.error('Erreur lors de la fermeture', error);
      setConversationActionError('Impossible de fermer la conversation.');
    } finally {
      setConversationAction(null);
    }
  };

  const triggerAvatarGeneration = async (profileId: string) => {
    let token: string | null = null;
    try {
      const user = auth.currentUser;
      token = user ? await user.getIdToken() : null;
    } catch (error) {
      console.warn("Impossible d'obtenir le token Firebase pour l'avatar IA", error);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-pecm2-platform': 'web',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await apiFetch('/api/ai/image', {
      method: 'POST',
      headers,
      keepalive: true,
      body: JSON.stringify({
        aiId: profileId,
        mode: 'base',
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorMessage =
        typeof data?.error === 'string' ? data.error : 'Erreur generation avatar IA.';
      throw new Error(errorMessage);
    }
    const imageUrl = typeof data?.imageUrl === 'string' ? data.imageUrl.trim() : '';
    const updateError = typeof data?.updateError === 'string' ? data.updateError : null;
    return {
      imageUrl: imageUrl || null,
      updateError,
    };
  };

  const handleApproveAi = async (profileId: string) => {
    setAiActionError(null);
    setAiActionSuccess(null);
    setAiActionImageUrl(null);
    setAiAction({ id: profileId, type: 'approve' });

    try {
      const targetProfile = aiProfiles.find((profile) => profile.id === profileId);
      const hasAvatar = Boolean(targetProfile?.imageUrl);

      await updateAiProfileStatus({
        profileId,
        status: 'active',
        adminId: adminUser?.uid,
        adminMail: adminUser?.mail ?? undefined,
        note: undefined,
      });
      void logActivity({
        action: 'ai_profile_status',
        targetType: 'aiProfile',
        targetId: profileId,
        details: { status: 'active' },
      });
      if (!hasAvatar) {
        const { imageUrl: generatedImageUrl, updateError } =
          await triggerAvatarGeneration(profileId);
        if (!generatedImageUrl) {
          throw new Error('Avatar indisponible.');
        }
        setAiActionImageUrl(generatedImageUrl);
        if (updateError) {
          setAiActionError(updateError);
        }
        setAiActionSuccess(
          updateError
            ? 'IA validee. Avatar genere mais la mise a jour Firestore a echoue.'
            : 'IA validee. Avatar genere.',
        );
        return;
      }
      const existingImageUrl =
        typeof targetProfile?.imageUrl === 'string' ? targetProfile.imageUrl.trim() : '';
      if (existingImageUrl) {
        setAiActionImageUrl(existingImageUrl);
      }
      setAiActionSuccess('IA validee.');
    } catch (error) {
      console.error('Erreur lors de la validation IA', error);
      const message = error instanceof Error ? error.message : 'Impossible de valider l IA.';
      setAiActionError(message);
    } finally {
      setAiAction(null);
    }
  };

  const handleRejectAi = async (profileId: string) => {
    const confirmed = window.confirm('Refuser cette IA ?');
    if (!confirmed) {
      return;
    }

    setAiActionError(null);
    setAiActionSuccess(null);
    setAiAction({ id: profileId, type: 'reject' });

    try {
      await updateAiProfileStatus({
        profileId,
        status: 'rejected',
        adminId: adminUser?.uid,
        adminMail: adminUser?.mail ?? undefined,
        note: undefined,
      });
      void logActivity({
        action: 'ai_profile_status',
        targetType: 'aiProfile',
        targetId: profileId,
        details: { status: 'rejected' },
      });
      setAiActionSuccess('IA refusee.');
    } catch (error) {
      console.error('Erreur lors du refus IA', error);
      setAiActionError('Impossible de refuser l IA.');
    } finally {
      setAiAction(null);
    }
  };

  const handleAiStatusUpdate = async (
    profileId: string,
    status: 'active' | 'suspended' | 'disabled',
  ) => {
    const confirmLabel =
      status === 'disabled'
        ? 'Desactiver cette IA ?'
        : status === 'suspended'
          ? 'Suspendre cette IA ?'
          : null;

    if (confirmLabel && !window.confirm(confirmLabel)) {
      return;
    }

    setAiActionError(null);
    setAiActionSuccess(null);
    setAiActionImageUrl(null);
    setAiAction({
      id: profileId,
      type: status === 'active' ? 'activate' : status === 'suspended' ? 'suspend' : 'disable',
    });

    try {
      await updateAiProfileStatus({
        profileId,
        status,
        adminId: adminUser?.uid,
        adminMail: adminUser?.mail ?? undefined,
        note: undefined,
      });
      void logActivity({
        action: 'ai_profile_status',
        targetType: 'aiProfile',
        targetId: profileId,
        details: { status },
      });
      if (status === 'active') {
        const targetProfile = aiProfiles.find((profile) => profile.id === profileId);
        const hasAvatar = Boolean(targetProfile?.imageUrl);
        if (!hasAvatar) {
          const { imageUrl: generatedImageUrl, updateError } =
            await triggerAvatarGeneration(profileId);
          if (!generatedImageUrl) {
            throw new Error('Avatar indisponible.');
          }
          setAiActionImageUrl(generatedImageUrl);
          if (updateError) {
            setAiActionError(updateError);
          }
          setAiActionSuccess(
            updateError
              ? 'IA activee. Avatar genere mais la mise a jour Firestore a echoue.'
              : 'IA activee. Avatar genere.',
          );
          return;
        }
        if (hasAvatar) {
          const existingImageUrl =
            typeof targetProfile?.imageUrl === 'string' ? targetProfile.imageUrl.trim() : '';
          if (existingImageUrl) {
            setAiActionImageUrl(existingImageUrl);
          }
        }
      }
      setAiActionSuccess(
        status === 'active'
          ? 'IA activee.'
          : status === 'suspended'
            ? 'IA suspendue.'
            : 'IA desactivee.',
      );
    } catch (error) {
      console.error('Erreur lors de la mise a jour IA', error);
      const message =
        error instanceof Error ? error.message : 'Impossible de mettre a jour cette IA.';
      setAiActionError(message);
    } finally {
      setAiAction(null);
    }
  };

  const handlePromoteToAdmin = async (userId: string) => {
    if (!adminUser?.uid) {
      return;
    }

    const confirmed = window.confirm('Passer cet utilisateur en admin ?');
    if (!confirmed) {
      return;
    }

    setUserRoleAction({ id: userId, status: 'loading' });

    try {
      await updateUtilisateurRole({
        userId,
        role: 'admin',
        adminId: adminUser.uid,
        adminMail: adminUser.mail ?? undefined,
      });
      void logActivity({
        action: 'user_role_update',
        targetType: 'user',
        targetId: userId,
        details: { role: 'admin' },
      });
      setUserRoleAction({
        id: userId,
        status: 'success',
        message: 'Utilisateur promu admin.',
      });
    } catch (error) {
      console.error('Erreur lors de la promotion admin', error);
      setUserRoleAction({
        id: userId,
        status: 'error',
        message: 'Impossible de promouvoir cet utilisateur.',
      });
    }
  };

  const updateTokenGrantInput = (userId: string, field: 'amount' | 'password', value: string) => {
    setTokenGrantInputs((prev) => ({
      ...prev,
      [userId]: {
        amount: prev[userId]?.amount ?? '',
        password: prev[userId]?.password ?? '',
        [field]: value,
      },
    }));
  };

  const handleGrantTokens = async (userId: string) => {
    if (!adminUser?.uid) {
      return;
    }

    const input = tokenGrantInputs[userId] ?? { amount: '', password: '' };
    const amount = Number(input.amount);
    let password = input.password.trim();

    if (!input.amount || Number.isNaN(amount) || amount <= 0) {
      setTokenGrantAction({
        id: userId,
        status: 'error',
        message: 'Montant invalide.',
      });
      return;
    }
    if (!password) {
      const promptLabel = adminHasPassword
        ? 'Mot de passe admin requis pour confirmer.'
        : 'Definissez un mot de passe admin pour securiser l action.';
      const prompted = window.prompt(promptLabel);
      if (!prompted) {
        setTokenGrantAction({
          id: userId,
          status: 'error',
          message: 'Mot de passe admin requis.',
        });
        return;
      }
      password = prompted.trim();
      if (!password) {
        setTokenGrantAction({
          id: userId,
          status: 'error',
          message: 'Mot de passe admin requis.',
        });
        return;
      }
    }

    setTokenGrantAction({ id: userId, status: 'loading' });

    try {
      await grantUserTokensWithPassword({
        targetUserId: userId,
        amount,
        adminId: adminUser.uid,
        adminMail: adminUser.mail ?? undefined,
        adminPassword: password,
      });
      void logActivity({
        action: 'user_tokens_grant',
        targetType: 'user',
        targetId: userId,
        details: { amount },
      });
      setTokenGrantAction({
        id: userId,
        status: 'success',
        message: `${amount} tokens ajoutes.`,
      });
      setTokenGrantInputs((prev) => ({
        ...prev,
        [userId]: { amount: '', password: '' },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible d'ajouter des tokens.";
      setTokenGrantAction({
        id: userId,
        status: 'error',
        message,
      });
    }
  };

  const startAiEdit = (profile: AiProfile) => {
    setAiEditId(profile.id);
    setAiEditForm({
      name: profile.name ?? '',
      mentality: profile.mentality ?? '',
      voice: profile.voice ?? '',
      gender: profile.look?.gender ?? '',
      skin: profile.look?.skin ?? '',
      hair: profile.look?.hair ?? '',
      hairColor: profile.look?.hairColor ?? '',
      eyeColor: profile.look?.eyeColor ?? '',
      age: profile.look?.age ?? '',
      height: profile.look?.height ?? '',
      bodyType: profile.look?.bodyType ?? '',
      facialHair: profile.look?.facialHair ?? '',
      makeup: profile.look?.makeup ?? '',
      glasses: profile.look?.glasses ?? '',
      accessories: profile.look?.accessories ?? '',
      piercings: profile.look?.piercings ?? '',
      tattoos: profile.look?.tattoos ?? '',
      scars: profile.look?.scars ?? '',
      outfit: profile.look?.outfit ?? '',
      ethnicity: profile.look?.ethnicity ?? '',
      details: profile.look?.details ?? '',
    });
    setAiEditError(null);
    setAiEditSuccess(null);
  };

  const handleAiEditSave = async () => {
    if (!aiEditId) {
      return;
    }

    setAiEditError(null);
    setAiEditSuccess(null);
    setAiEditLoading(true);

    try {
      await updateAiProfileDetails({
        profileId: aiEditId,
        updates: {
          name: aiEditForm.name,
          mentality: aiEditForm.mentality,
          voice: aiEditForm.voice,
          look: buildLookPayload({
            gender: aiEditForm.gender,
            skin: aiEditForm.skin,
            hair: aiEditForm.hair,
            hairColor: aiEditForm.hairColor,
            eyeColor: aiEditForm.eyeColor,
            age: aiEditForm.age,
            height: aiEditForm.height,
            bodyType: aiEditForm.bodyType,
            facialHair: aiEditForm.facialHair,
            makeup: aiEditForm.makeup,
            glasses: aiEditForm.glasses,
            accessories: aiEditForm.accessories,
            piercings: aiEditForm.piercings,
            tattoos: aiEditForm.tattoos,
            scars: aiEditForm.scars,
            outfit: aiEditForm.outfit,
            ethnicity: aiEditForm.ethnicity,
            details: aiEditForm.details,
          }),
        },
        adminId: adminUser?.uid,
        adminMail: adminUser?.mail ?? undefined,
      });
      void logActivity({
        action: 'ai_profile_update',
        targetType: 'aiProfile',
        targetId: aiEditId,
        details: { fields: ['name', 'mentality', 'voice', 'look'] },
      });
      setAiEditSuccess('IA mise a jour.');
    } catch (error) {
      console.error('Erreur lors de la mise a jour IA', error);
      setAiEditError('Impossible de mettre a jour l IA.');
    } finally {
      setAiEditLoading(false);
    }
  };

  const handleAiEditCancel = () => {
    setAiEditId(null);
  };

  const snapshotTime = new Date().toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const metricsSummary = metricsProbe?.summary;
  const metricsProbeDurationLabel =
    typeof metricsProbe?.durationMs === 'number' && Number.isFinite(metricsProbe.durationMs)
      ? `${metricsProbe.durationMs} ms`
      : '—';

  const monitoringSeries = useMemo(() => buildMonitoringSeries(metricsHistory), [metricsHistory]);

  const monitoringObservedWindowMs = useMemo(
    () => getObservedWindowMs(monitoringSeries),
    [monitoringSeries],
  );

  const monitoringObservedWindowLabel = useMemo(
    () => formatObservedWindow(monitoringObservedWindowMs),
    [monitoringObservedWindowMs],
  );

  const monitoringInsights = useMemo(
    () => buildMonitoringInsights(monitoringSeries),
    [monitoringSeries],
  );

  const latestMetricsSnapshot =
    metricsHistory.length > 0 ? metricsHistory[metricsHistory.length - 1] : null;
  const latestMonitoringPoint =
    monitoringSeries.length > 0 ? monitoringSeries[monitoringSeries.length - 1] : null;

  const fallbackRequestsPerMin = useMemo(() => {
    if (!latestMetricsSnapshot?.apiRequestsTotal || !latestMetricsSnapshot?.uptimeSeconds) {
      return null;
    }
    const uptimeMinutes = latestMetricsSnapshot.uptimeSeconds / 60;
    if (uptimeMinutes <= 0) {
      return null;
    }
    return latestMetricsSnapshot.apiRequestsTotal / uptimeMinutes;
  }, [latestMetricsSnapshot]);

  const fallbackErrorRatePercent = useMemo(() => {
    if (
      !latestMetricsSnapshot?.apiRequestsTotal ||
      typeof latestMetricsSnapshot.apiErrorsTotal !== 'number' ||
      latestMetricsSnapshot.apiRequestsTotal <= 0
    ) {
      return null;
    }
    return (latestMetricsSnapshot.apiErrorsTotal / latestMetricsSnapshot.apiRequestsTotal) * 100;
  }, [latestMetricsSnapshot]);

  const fallbackP95LatencyMs = useMemo(() => {
    if (!latestMetricsSnapshot?.apiLatencyBuckets?.length) {
      return null;
    }
    const p95Seconds = histogramQuantile(latestMetricsSnapshot.apiLatencyBuckets, 0.95);
    return typeof p95Seconds === 'number' && Number.isFinite(p95Seconds) ? p95Seconds * 1000 : null;
  }, [latestMetricsSnapshot]);

  const currentUptimeSeconds =
    latestMonitoringPoint?.uptimeSeconds ?? latestMetricsSnapshot?.uptimeSeconds ?? null;
  const currentRequestsPerMin = latestMonitoringPoint?.requestsPerMin ?? fallbackRequestsPerMin;
  const currentErrorRatePercent = latestMonitoringPoint?.errorRatePercent ?? fallbackErrorRatePercent;
  const currentP95LatencyMs = latestMonitoringPoint?.p95LatencyMs ?? fallbackP95LatencyMs;
  const currentCpuPercent = latestMonitoringPoint?.cpuPercent ?? null;
  const currentRamMb =
    latestMonitoringPoint?.ramMb ??
    (typeof latestMetricsSnapshot?.residentMemoryBytes === 'number'
      ? latestMetricsSnapshot.residentMemoryBytes / (1024 * 1024)
      : null);

  const uptimeDelta = useMemo(
    () => computePeriodDelta(monitoringSeries.map((point) => point.uptimeSeconds)),
    [monitoringSeries],
  );
  const requestsDelta = useMemo(
    () => computePeriodDelta(monitoringSeries.map((point) => point.requestsPerMin)),
    [monitoringSeries],
  );
  const errorsDelta = useMemo(
    () => computePeriodDelta(monitoringSeries.map((point) => point.errorRatePercent)),
    [monitoringSeries],
  );
  const p95Delta = useMemo(
    () => computePeriodDelta(monitoringSeries.map((point) => point.p95LatencyMs)),
    [monitoringSeries],
  );
  const infraDelta = useMemo(
    () => computePeriodDelta(monitoringSeries.map((point) => point.cpuPercent)),
    [monitoringSeries],
  );

  const monitoringChartPoints = useMemo(
    () =>
      monitoringSeries.map((point) => ({
        timestamp: point.timestamp,
        requestsPerMin: point.requestsPerMin,
        errorRatePercent: point.errorRatePercent,
        p50LatencyMs: point.p50LatencyMs,
        p95LatencyMs: point.p95LatencyMs,
        cpuPercent: point.cpuPercent,
        ramMb: point.ramMb,
      })),
    [monitoringSeries],
  );

  const hasInfraChartData = useMemo(
    () =>
      monitoringChartPoints.some(
        (point) =>
          (typeof point.cpuPercent === 'number' && Number.isFinite(point.cpuPercent)) ||
          (typeof point.ramMb === 'number' && Number.isFinite(point.ramMb)),
      ),
    [monitoringChartPoints],
  );

  const uptimeSparkline = useMemo(
    () => toSparkline(monitoringSeries.map((point) => point.uptimeSeconds)),
    [monitoringSeries],
  );
  const requestsSparkline = useMemo(
    () => toSparkline(monitoringSeries.map((point) => point.requestsPerMin)),
    [monitoringSeries],
  );
  const errorsSparkline = useMemo(
    () => toSparkline(monitoringSeries.map((point) => point.errorRatePercent)),
    [monitoringSeries],
  );
  const p95Sparkline = useMemo(
    () => toSparkline(monitoringSeries.map((point) => point.p95LatencyMs)),
    [monitoringSeries],
  );
  const cpuSparkline = useMemo(
    () => toSparkline(monitoringSeries.map((point) => point.cpuPercent)),
    [monitoringSeries],
  );

  const totalTokens = useMemo(
    () =>
      users.reduce((acc, user) => {
        const value = typeof user.tokens === 'number' ? user.tokens : 0;
        return acc + value;
      }, 0),
    [users],
  );

  const usersWithTokens = useMemo(
    () => users.filter((user) => typeof user.tokens === 'number').length,
    [users],
  );

  const averageTokens = usersWithTokens ? Math.round(totalTokens / usersWithTokens) : 0;

  const activeConversations = useMemo(
    () =>
      conversations.filter((conversation) => statusBucket(conversation.status) === 'running')
        .length,
    [conversations],
  );

  const conversationBuckets = useMemo(() => {
    const counters = {
      pending: 0,
      running: 0,
      completed: 0,
      other: 0,
    };

    conversations.forEach((conversation) => {
      const bucket = statusBucket(conversation.status);
      counters[bucket] += 1;
    });

    return counters;
  }, [conversations]);

  const latestUsers = useMemo(
    () =>
      [...users]
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
        .slice(0, 6),
    [users],
  );

  const topAiProfiles = useMemo(
    () => [...aiProfiles].sort((a, b) => (b.tokensSpent ?? 0) - (a.tokensSpent ?? 0)).slice(0, 5),
    [aiProfiles],
  );

  const aiLookup = useMemo(() => {
    const map: Record<string, AiProfile> = {};
    aiProfiles.forEach((profile) => {
      if (profile.id) {
        map[profile.id] = profile;
      }
    });
    return map;
  }, [aiProfiles]);

  const usersById = useMemo(() => {
    const map: Record<string, Utilisateur> = {};
    users.forEach((user) => {
      map[user.id] = user;
    });
    return map;
  }, [users]);

  const filteredConversations = useMemo(() => {
    const search = conversationSearch.trim().toLowerCase();

    return [...conversations]
      .sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0))
      .filter((conversation) => {
        const bucket = statusBucket(conversation.status);
        if (conversationStatusFilter !== 'all' && bucket !== conversationStatusFilter) {
          return false;
        }
        if (!search) {
          return true;
        }
        const owner = conversation.userId ? usersById[conversation.userId] : undefined;
        const aiRef = conversation.aiId ? aiLookup[conversation.aiId] : undefined;
        const haystack = [
          conversation.id,
          conversation.status,
          owner ? formatUserLabel(owner) : '',
          aiRef ? (aiRef.name ?? aiRef.id) : (conversation.aiId ?? ''),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(search);
      });
  }, [conversations, conversationSearch, conversationStatusFilter, usersById, aiLookup]);

  const conversationsPageSize = 5;
  const totalConversationPages = Math.max(
    1,
    Math.ceil(filteredConversations.length / conversationsPageSize),
  );
  const currentConversationPage = Math.min(conversationPage, totalConversationPages);
  const paginatedConversations = useMemo(() => {
    const start = (currentConversationPage - 1) * conversationsPageSize;
    return filteredConversations.slice(start, start + conversationsPageSize);
  }, [filteredConversations, currentConversationPage]);

  const pendingAiProfiles = useMemo(
    () =>
      [...aiProfiles]
        .filter((profile) => {
          const normalized = (profile.status ?? '').toLowerCase();
          return !normalized || normalized === 'pending';
        })
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)),
    [aiProfiles],
  );

  const managedAiProfiles = useMemo(
    () => [...aiProfiles].sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)),
    [aiProfiles],
  );

  const clientAiLookup = useMemo(() => {
    const map: Record<string, AiProfile> = {};
    aiProfiles.forEach((profile) => {
      if (profile.id) {
        map[profile.id] = profile;
      }
    });
    return map;
  }, [aiProfiles]);

  const clientSortedConversations = useMemo(
    () =>
      [...clientConversations].sort(
        (a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0),
      ),
    [clientConversations],
  );

  if (adminChecking) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-12">
          <p className="text-sm text-slate-400">Chargement...</p>
        </div>
      </div>
    );
  }

  if (userRole === 'client') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 md:px-6 lg:px-8">
          <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-900/80 via-slate-900 to-slate-950/80 p-6 shadow-2xl shadow-slate-900/40 backdrop-blur">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Accueil client</p>
              <h1 className="text-3xl font-semibold md:text-4xl">Chats IA</h1>
              <p className="text-sm text-slate-400 md:text-base">
                Reprenez une discussion et continuez avec votre IA.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>{adminUser?.mail ?? 'Compte actif'}</span>
              <Link
                href="/ia"
                className="rounded-full border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-700"
              >
                Voir le catalogue
              </Link>
            </div>
          </header>

          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <article className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Reprendre un chat IA</h2>
                  <p className="text-sm text-slate-400">
                    Continuez la conversation la ou vous l&apos;avez laissee.
                  </p>
                </div>
                <span className="text-xs text-slate-400">
                  {clientConversationsLoading
                    ? 'Chargement...'
                    : `${clientSortedConversations.length} chats IA`}
                </span>
              </div>

              <div className="mt-6 space-y-3">
                {clientConversationsLoading ? (
                  <p className="text-sm text-slate-400">Chargement des chats IA...</p>
                ) : clientConversationsError ? (
                  <p className="text-sm text-rose-300">{clientConversationsError}</p>
                ) : clientSortedConversations.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    Aucun chat IA pour le moment. Lancez une IA depuis le catalogue.
                  </p>
                ) : (
                  clientSortedConversations.map((conversation) => {
                    const bucket = statusBucket(conversation.status);
                    const aiRef = conversation.aiId ? clientAiLookup[conversation.aiId] : undefined;
                    const aiStatusKey = normalizeAiStatus(aiRef?.status);
                    const canResume = aiStatusKey === 'active';
                    const aiStatusNote =
                      aiStatusKey === 'pending'
                        ? 'IA en attente de validation.'
                        : aiStatusKey === 'suspended'
                          ? 'IA suspendue.'
                          : aiStatusKey === 'disabled'
                            ? 'IA desactivee.'
                            : aiStatusKey === 'rejected'
                              ? 'IA refusee.'
                              : 'IA indisponible.';
                    return (
                      <div
                        key={conversation.id}
                        className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold">
                            {aiRef?.name ?? `IA ${conversation.aiId?.slice(0, 5) ?? '?'}`}
                          </p>
                          <span
                            className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${statusBadgeStyles[bucket]}`}
                          >
                            {statusLabels[bucket]}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-400">
                          Messages: {conversation.messageCount ?? 0}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Derniere activite: {formatDate(conversation.updatedAt)}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {canResume ? (
                            <Link
                              href={`/conversations/${conversation.id}`}
                              className="rounded-lg border border-slate-700/70 bg-slate-900/40 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
                            >
                              Reprendre la conversation
                            </Link>
                          ) : (
                            <span className="rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-1.5 text-xs font-semibold text-slate-500">
                              Indisponible
                            </span>
                          )}
                          <Link
                            href="/historique/client"
                            className="rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:border-slate-600"
                          >
                            Voir l&apos;historique
                          </Link>
                          {!canResume && (
                            <span className="text-[11px] text-slate-500">{aiStatusNote}</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </article>

            <article className="space-y-6">
              <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">Actions rapides</h2>
                    <p className="text-sm text-slate-400">
                      Trouvez une IA et reprenez vos discussions.
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-3 text-sm">
                  <Link
                    href="/ia"
                    className="flex items-center justify-between rounded-2xl border border-slate-800/80 bg-slate-950/40 px-4 py-3 text-slate-200 transition hover:border-emerald-400/70"
                  >
                    <span>Explorer le catalogue IA</span>
                    <span className="text-xs text-slate-400">→</span>
                  </Link>
                  <Link
                    href="/demandes/client"
                    className="flex items-center justify-between rounded-2xl border border-slate-800/80 bg-slate-950/40 px-4 py-3 text-slate-200 transition hover:border-slate-600"
                  >
                    <span>Voir mes demandes</span>
                    <span className="text-xs text-slate-400">→</span>
                  </Link>
                  <Link
                    href="/historique/client"
                    className="flex items-center justify-between rounded-2xl border border-slate-800/80 bg-slate-950/40 px-4 py-3 text-slate-200 transition hover:border-slate-600"
                  >
                    <span>Historique des chats IA</span>
                    <span className="text-xs text-slate-400">→</span>
                  </Link>
                </div>

                {(aiLoading || clientConversationsLoading) && (
                  <p className="mt-4 text-xs text-slate-500">
                    Synchronisation des donnees en cours...
                  </p>
                )}
                {(aiError || clientConversationsError) && (
                  <p className="mt-3 text-xs text-rose-300">
                    {aiError ?? clientConversationsError}
                  </p>
                )}
              </div>
            </article>
          </section>
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
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 md:px-6 lg:px-8">
        <HeroHeader
          adminChecking={adminChecking}
          adminUser={adminUser}
          profile={profile}
          signOutLoading={signOutLoading}
          signOutError={signOutError}
          handleSignOut={handleSignOut}
        >
          <p className="text-sm text-slate-400 md:text-base">
            Snapshot : {snapshotTime} · Synchronisation Firebase Auth + Firestore (utilisateurs,
            conversations, IA).
          </p>
          <div className="grid gap-3 pt-6 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4 shadow-inner shadow-black/30">
              <p className="text-xs uppercase tracking-wide text-slate-400">Utilisateurs</p>
              <p className="mt-2 text-2xl font-semibold">
                {usersLoading ? '…' : users.length.toLocaleString('fr-FR')}
              </p>
              <p className="text-xs text-slate-500">{usersError ?? 'data temps réel'}</p>
            </div>
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4 shadow-inner shadow-black/30">
              <p className="text-xs uppercase tracking-wide text-slate-400">Conversations</p>
              <p className="mt-2 text-2xl font-semibold">
                {conversationsLoading ? '…' : conversations.length}
              </p>
              <p className="text-xs text-slate-500">
                Actives : {conversationsLoading ? '…' : activeConversations}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4 shadow-inner shadow-black/30">
              <p className="text-xs uppercase tracking-wide text-slate-400">IA créées</p>
              <p className="mt-2 text-2xl font-semibold">{aiLoading ? '…' : aiProfiles.length}</p>
              <p className="text-xs text-slate-500">{aiError ?? 'matching & mémoire'}</p>
            </div>
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4 shadow-inner shadow-black/30">
              <p className="text-xs uppercase tracking-wide text-slate-400">Tokens</p>
              <p className="mt-2 text-2xl font-semibold">
                {usersLoading ? '…' : totalTokens.toLocaleString('fr-FR')}
              </p>
              <p className="text-xs text-slate-500">
                Moyenne : {usersLoading ? '…' : `${averageTokens.toLocaleString('fr-FR')} tokens`}
              </p>
            </div>
          </div>
        </HeroHeader>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <UsersSection
              usersLoading={usersLoading}
              usersError={usersError}
              latestUsers={latestUsers}
              conversations={conversations}
              userRoleAction={userRoleAction}
              tokenGrantInputs={tokenGrantInputs}
              tokenGrantAction={tokenGrantAction}
              handlePromoteToAdmin={handlePromoteToAdmin}
              updateTokenGrantInput={updateTokenGrantInput}
              handleGrantTokens={handleGrantTokens}
              formatUserLabel={formatUserLabel}
              formatDate={formatDate}
            />
          </div>
          <div className="space-y-6">
            <AiValidationSection
              aiLoading={aiLoading}
              aiError={aiError}
              pendingAiProfiles={pendingAiProfiles}
              usersById={usersById}
              aiAction={aiAction}
              handleApproveAi={handleApproveAi}
              handleRejectAi={handleRejectAi}
              aiActionError={aiActionError}
              aiActionSuccess={aiActionSuccess}
              aiActionImageUrl={aiActionImageUrl}
              formatUserLabel={formatUserLabel}
              formatLookSummary={formatLookSummary}
              formatDate={formatDate}
            />
            <AiProfilesSection
              aiLoading={aiLoading}
              aiError={aiError}
              topAiProfiles={topAiProfiles}
              usersById={usersById}
              formatUserLabel={formatUserLabel}
              formatLookSummary={formatLookSummary}
              formatDate={formatDate}
            />
            <AiManagementSection
              aiLoading={aiLoading}
              aiError={aiError}
              managedAiProfiles={managedAiProfiles}
              usersById={usersById}
              aiAction={aiAction}
              aiActionError={aiActionError}
              aiActionSuccess={aiActionSuccess}
              aiActionImageUrl={aiActionImageUrl}
              aiStatusStyles={aiStatusStyles}
              aiStatusLabels={aiStatusLabels}
              handleAiStatusUpdate={handleAiStatusUpdate}
              aiEditId={aiEditId}
              startAiEdit={startAiEdit}
              handleAiEditCancel={handleAiEditCancel}
              aiEditForm={aiEditForm}
              setAiEditForm={setAiEditForm as any}
              aiEditLoading={aiEditLoading}
              handleAiEditSave={handleAiEditSave}
              formatUserLabel={formatUserLabel}
              formatLookSummary={formatLookSummary}
              formatDate={formatDate}
            />
          </div>
        </section>
      </div>
      {closeConversationDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/95 p-6 text-slate-100 shadow-2xl">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Confirmation</p>
            <h3 className="mt-2 text-lg font-semibold">Fermer la conversation ?</h3>
            <p className="mt-1 text-sm text-slate-400">{closeConversationDialog.label}</p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCloseConversationDialog(null)}
                className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmCloseConversation}
                className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-rose-400"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

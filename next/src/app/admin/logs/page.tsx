'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import {
  Timestamp,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type QueryConstraint,
} from 'firebase/firestore';
import {
  auth,
  fetchUtilisateurById,
  fetchUtilisateursRealTime,
  signOutUser,
} from '../../indexFirebase';
import { adminLogs } from '../../firebase/collections';
import { KpiCard } from '../../components/dashboard/KpiCard';
import { MarketingLineChart } from '../../components/dashboard/MarketingLineChart';
import { InsightsPanel } from '../../components/dashboard/InsightsPanel';
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
} from '../../utils/prometheusMonitoring';
import { apiFetch } from '../../utils/apiFetch';

type Utilisateur = {
  id: string;
  mail?: string;
  pseudo?: string;
};

type ActivityLog = {
  id: string;
  action?: string;
  actorId?: string;
  actorMail?: string;
  actorRole?: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  createdAt?: unknown;
  platform?: string;
  ip?: string;
  userAgent?: string;
};

const formatLogsError = (error: unknown) => {
  const codeValue =
    error && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : null;
  const code = typeof codeValue === 'string' ? codeValue : null;
  const message = error instanceof Error ? error.message : '';

  if (code === 'permission-denied') {
    return "Permission refusée. Vérifiez que votre compte a role='admin' et que `firestore.rules` est déployé.";
  }
  if (code === 'failed-precondition' && message.toLowerCase().includes('index')) {
    return "Index Firestore manquant pour cette requête. Déployez `firestore.indexes.json` (ou créez l'index proposé par Firebase).";
  }
  if (message) {
    return message;
  }
  return 'Impossible de charger les logs.';
};

const formatDate = (value?: unknown) => {
  if (!value) {
    return '—';
  }
  if (
    typeof value === 'object' &&
    value &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date })
      .toDate()
      .toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }
  if (
    typeof value === 'object' &&
    value &&
    'seconds' in value &&
    typeof (value as { seconds?: unknown }).seconds === 'number'
  ) {
    return new Date((value as { seconds: number }).seconds * 1000).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }
  if (typeof value === 'string') {
    return new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }
  return '—';
};

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
  return `Utilisateur ${user.id.slice(0, 6)}`;
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

type DatePreset = '24h' | '7d' | '30d' | 'custom' | 'all';

const computeDateRange = (preset: DatePreset, customStart: string, customEnd: string) => {
  if (preset === 'all') {
    return { start: null as Date | null, end: null as Date | null };
  }
  const now = new Date();

  if (preset === '24h') {
    return { start: new Date(now.getTime() - 24 * 60 * 60 * 1000), end: null };
  }
  if (preset === '7d') {
    return { start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), end: null };
  }
  if (preset === '30d') {
    return { start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), end: null };
  }

  const start = customStart ? new Date(`${customStart}T00:00:00`) : null;
  const end = customEnd ? new Date(`${customEnd}T23:59:59`) : null;
  return { start, end };
};

export default function AdminLogsPage() {
  const router = useRouter();
  const [adminChecking, setAdminChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<null | { uid: string; mail?: string | null }>(null);

  const [users, setUsers] = useState<Utilisateur[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [userSearch, setUserSearch] = useState('');
  const [actorIdFilter, setActorIdFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [metricsProbe, setMetricsProbe] = useState<AdminMetricsProbeResult | null>(null);
  const [metricsProbeRaw, setMetricsProbeRaw] = useState('');
  const [metricsProbeFetching, setMetricsProbeFetching] = useState(false);
  const [metricsProbeError, setMetricsProbeError] = useState<string | null>(null);
  const [metricsProbeUpdatedAt, setMetricsProbeUpdatedAt] = useState<string | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<MetricsSnapshot[]>([]);

  const pageSize = 40;

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

    return () => unsubUsers?.();
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
        const payload =
          data && typeof data === 'object' ? (data as AdminMetricsProbeResult) : null;
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

  const usersById = useMemo(() => {
    const map: Record<string, Utilisateur> = {};
    users.forEach((user) => {
      map[user.id] = user;
    });
    return map;
  }, [users]);

  const filteredUsers = useMemo(() => {
    const search = userSearch.trim().toLowerCase();
    const base = [...users].sort((a, b) =>
      (a.pseudo ?? a.mail ?? '').localeCompare(b.pseudo ?? b.mail ?? ''),
    );
    if (!search) {
      return base.slice(0, 40);
    }
    return base
      .filter((user) => {
        const haystack = [user.id, user.mail, user.pseudo].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(search);
      })
      .slice(0, 40);
  }, [userSearch, users]);

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

  const loadLogsPage = async ({ reset }: { reset: boolean }) => {
    if (!isAdmin) {
      return;
    }
    if (logsLoading) {
      return;
    }

    setLogsError(null);
    setLogsLoading(true);

    const { start, end } = computeDateRange(datePreset, customStart, customEnd);

    try {
      const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc'), limit(pageSize)];

      if (!reset && cursor) {
        constraints.push(startAfter(cursor));
      }
      if (actorIdFilter.trim()) {
        constraints.push(where('actorId', '==', actorIdFilter.trim()));
      }
      if (actionFilter.trim()) {
        constraints.push(where('action', '==', actionFilter.trim()));
      }
      if (start) {
        constraints.push(where('createdAt', '>=', Timestamp.fromDate(start)));
      }
      if (end) {
        constraints.push(where('createdAt', '<=', Timestamp.fromDate(end)));
      }

      const snapshot = await getDocs(query(adminLogs, ...constraints));
      const items: ActivityLog[] = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Record<string, unknown>),
      })) as ActivityLog[];

      const nextCursor = snapshot.docs[snapshot.docs.length - 1] ?? null;
      setCursor(nextCursor);
      setHasMore(snapshot.size === pageSize);
      setLogs((prev) => (reset ? items : [...prev, ...items]));
    } catch (error) {
      console.error('Erreur chargement logs', error);
      setLogsError(formatLogsError(error));
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    setCursor(null);
    setHasMore(true);
    void loadLogsPage({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, actorIdFilter, actionFilter, datePreset, customStart, customEnd]);

  const handleSignOut = async () => {
    try {
      await signOutUser();
      router.replace('/auth');
    } catch (error) {
      console.error('Erreur de deconnexion', error);
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
              className="w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Se deconnecter
            </button>
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
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Panel admin</p>
            <h1 className="text-3xl font-semibold md:text-4xl">Logs</h1>
            <p className="text-sm text-slate-400 md:text-base">
              Activite utilisateurs et actions admin, filtrables et paginees.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>{adminUser?.mail ?? 'Compte admin'}</span>
            <Link
              href="/"
              className="rounded-full border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-700"
            >
              Retour dashboard
            </Link>
          </div>
        </header>

        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/75 p-6 shadow-xl shadow-black/45">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_46%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.12),transparent_50%)]" />
          <div className="relative">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/80">
                  Monitoring Prometheus
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-50 md:text-2xl">
                  KPI operationnels et tendances live
                </h2>
                <p className="mt-1 text-sm text-slate-300 md:text-base">
                  Lecture marketing des metriques Prometheus, sans changer la sonde source.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200">
                <span className="rounded-full border border-slate-700/80 bg-slate-950/50 px-3 py-1">
                  Periode: {monitoringObservedWindowLabel}
                </span>
                <span className="rounded-full border border-slate-700/80 bg-slate-950/50 px-3 py-1">
                  {metricsProbeFetching
                    ? 'Sonde en cours...'
                    : metricsProbeUpdatedAt
                      ? `Derniere mise a jour: ${metricsProbeUpdatedAt}`
                      : 'Aucune sonde'}
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-slate-700/70 bg-slate-950/50 px-3 py-1 text-slate-200">
                Source: {metricsProbe?.source ?? '—'}
              </span>
              <span className="rounded-full border border-slate-700/70 bg-slate-950/50 px-3 py-1 text-slate-200">
                Duree sonde: {metricsProbeDurationLabel}
              </span>
              <span
                className={`rounded-full border px-3 py-1 ${
                  metricsProbeError
                    ? 'border-rose-400/60 bg-rose-500/15 text-rose-200'
                    : 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200'
                }`}
              >
                {metricsProbeError ? `Etat: ${metricsProbeError}` : 'Etat: Sonde admin OK'}
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <KpiCard
                title="Uptime"
                value={formatUptimeValue(currentUptimeSeconds)}
                subtitle={`Scrapes: ${formatMetricValue(metricsSummary?.scrapeRequestsTotal)}`}
                trendDirection={uptimeDelta.direction}
                trendLabel={buildTrendLabel(uptimeDelta.percentage, uptimeDelta.previous)}
                trendTone={buildTrendTone(uptimeDelta.direction, true)}
                tooltip="Temps de fonctionnement du process Node.js."
                sparklineValues={uptimeSparkline}
                sparklineStroke="#38bdf8"
                sparklineFill="rgba(56, 189, 248, 0.18)"
              />
              <KpiCard
                title="Requests / min"
                value={formatRatePerMinute(currentRequestsPerMin)}
                subtitle={`Total API: ${formatMetricValue(metricsSummary?.apiRequestsTotal)}`}
                trendDirection={requestsDelta.direction}
                trendLabel={buildTrendLabel(requestsDelta.percentage, requestsDelta.previous)}
                trendTone={buildTrendTone(requestsDelta.direction, true)}
                tooltip="Debit par minute calcule avec le delta du compteur app_api_requests_total."
                sparklineValues={requestsSparkline}
                sparklineStroke="#22d3ee"
                sparklineFill="rgba(34, 211, 238, 0.18)"
              />
              <KpiCard
                title="Error rate"
                value={formatPercentValue(currentErrorRatePercent, 2)}
                subtitle={`Erreurs API: ${formatMetricValue(metricsSummary?.apiErrorsTotal)}`}
                trendDirection={errorsDelta.direction}
                trendLabel={buildTrendLabel(errorsDelta.percentage, errorsDelta.previous)}
                trendTone={buildTrendTone(errorsDelta.direction, false)}
                tooltip="Taux d erreur calcule a partir des deltas app_api_errors_total / app_api_requests_total."
                sparklineValues={errorsSparkline}
                sparklineStroke="#fb7185"
                sparklineFill="rgba(251, 113, 133, 0.18)"
              />
              <KpiCard
                title="P95 latency"
                value={formatLatencyValue(currentP95LatencyMs)}
                subtitle={`P50: ${formatLatencyValue(latestMonitoringPoint?.p50LatencyMs ?? null)}`}
                trendDirection={p95Delta.direction}
                trendLabel={buildTrendLabel(p95Delta.percentage, p95Delta.previous)}
                trendTone={buildTrendTone(p95Delta.direction, false)}
                tooltip="P95 estime via l histogramme app_api_request_duration_seconds_bucket."
                sparklineValues={p95Sparkline}
                sparklineStroke="#f97316"
                sparklineFill="rgba(249, 115, 22, 0.18)"
              />
              <KpiCard
                title="CPU / RAM"
                value={formatPercentValue(currentCpuPercent, 1)}
                subtitle={`RAM: ${formatMemoryValue(currentRamMb)}`}
                trendDirection={infraDelta.direction}
                trendLabel={buildTrendLabel(infraDelta.percentage, infraDelta.previous)}
                trendTone={buildTrendTone(infraDelta.direction, false)}
                tooltip="CPU calcule via delta process_cpu_user_seconds_total + process_cpu_system_seconds_total."
                sparklineValues={cpuSparkline}
                sparklineStroke="#34d399"
                sparklineFill="rgba(52, 211, 153, 0.18)"
              />
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              <MarketingLineChart
                title="Traffic"
                subtitle="Requetes API par minute"
                points={monitoringChartPoints}
                series={[
                  {
                    key: 'requestsPerMin',
                    label: 'Req/min',
                    color: '#22d3ee',
                    fill: '#22d3ee',
                    showArea: true,
                    formatter: (value) => formatRatePerMinute(value),
                  },
                ]}
                yAxisFormatter={(value) => formatDecimal(value, value >= 100 ? 0 : 1)}
                emptyLabel="Traffic indisponible: echantillons insuffisants."
              />

              <MarketingLineChart
                title="Latency"
                subtitle="Evolution des percentiles p50 / p95"
                points={monitoringChartPoints}
                series={[
                  {
                    key: 'p50LatencyMs',
                    label: 'p50',
                    color: '#f59e0b',
                    formatter: (value) => formatLatencyValue(value),
                  },
                  {
                    key: 'p95LatencyMs',
                    label: 'p95',
                    color: '#fb7185',
                    fill: '#fb7185',
                    showArea: true,
                    formatter: (value) => formatLatencyValue(value),
                  },
                ]}
                yAxisFormatter={(value) => `${formatDecimal(value, value >= 100 ? 0 : 1)} ms`}
                emptyLabel="Latence indisponible: histogramme encore trop court."
              />

              <MarketingLineChart
                title="Errors"
                subtitle="Taux d erreur API (%)"
                points={monitoringChartPoints}
                series={[
                  {
                    key: 'errorRatePercent',
                    label: 'Error rate',
                    color: '#fb7185',
                    fill: '#fb7185',
                    showArea: true,
                    formatter: (value) => formatPercentValue(value, 2),
                  },
                ]}
                yAxisFormatter={(value) => `${formatDecimal(value, 2)}%`}
                emptyLabel="Erreur rate indisponible: volume de requetes insuffisant."
              />

              {hasInfraChartData ? (
                <MarketingLineChart
                  title="Infra health"
                  subtitle="CPU (%) et RAM (MB)"
                  points={monitoringChartPoints}
                  series={[
                    {
                      key: 'cpuPercent',
                      label: 'CPU',
                      color: '#34d399',
                      formatter: (value) => formatPercentValue(value, 1),
                    },
                    {
                      key: 'ramMb',
                      label: 'RAM',
                      color: '#a78bfa',
                      formatter: (value) => formatMemoryValue(value),
                    },
                  ]}
                  yAxisFormatter={(value) => formatDecimal(value, value >= 100 ? 0 : 1)}
                  emptyLabel="Infra health indisponible."
                />
              ) : null}
            </div>

            <div className="mt-6">
              <InsightsPanel
                insights={monitoringInsights}
                observedWindowLabel={monitoringObservedWindowLabel}
              />
            </div>

            <details className="mt-5 rounded-2xl border border-slate-800/80 bg-slate-950/45 p-4">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-slate-200">
                Payload brut scrape /api/metrics
              </summary>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950/75 p-3 text-[11px] text-slate-300">
                {metricsProbeRaw || 'Aucune metrique brute recue.'}
              </pre>
            </details>
          </div>
        </section>

        <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.6fr]">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Utilisateur
              </p>
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Rechercher (mail, pseudo, uid)"
                className="w-full rounded-xl border border-slate-800/80 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
              />
              <select
                value={actorIdFilter}
                onChange={(e) => setActorIdFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-800/80 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
              >
                <option value="">Tous</option>
                {filteredUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {formatUserLabel(user)} · {user.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              {usersLoading ? (
                <p className="text-xs text-slate-500">Chargement utilisateurs…</p>
              ) : usersError ? (
                <p className="text-xs text-rose-300">{usersError}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Action
              </p>
              <input
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                placeholder="Ex: message_send"
                className="w-full rounded-xl border border-slate-800/80 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
              />
              <p className="text-xs text-slate-500">Filtre exact (egalite).</p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Periode
              </p>
              <select
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value as DatePreset)}
                className="w-full rounded-xl border border-slate-800/80 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
              >
                <option value="24h">Dernieres 24h</option>
                <option value="7d">7 jours</option>
                <option value="30d">30 jours</option>
                <option value="custom">Personnalisee</option>
                <option value="all">Tout</option>
              </select>

              {datePreset === 'custom' ? (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full rounded-xl border border-slate-800/80 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                  />
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full rounded-xl border border-slate-800/80 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Actions
              </p>
              <button
                type="button"
                onClick={() => {
                  setCursor(null);
                  setHasMore(true);
                  void loadLogsPage({ reset: true });
                }}
                className="w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
                disabled={logsLoading}
              >
                {logsLoading ? 'Chargement…' : 'Rafraichir'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setUserSearch('');
                  setActorIdFilter('');
                  setActionFilter('');
                  setDatePreset('7d');
                  setCustomStart('');
                  setCustomEnd('');
                }}
                className="w-full rounded-xl border border-slate-800/80 bg-slate-950/40 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-700"
              >
                Reset
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Resultats</h2>
            <span className="text-xs text-slate-400">
              {logsLoading ? '↻ Chargement...' : `${logs.length} logs`}
            </span>
          </div>

          {logsError ? <p className="mt-3 text-sm text-rose-300">{logsError}</p> : null}

          <div className="mt-5 space-y-3">
            {logs.length === 0 && !logsLoading ? (
              <p className="text-sm text-slate-400">Aucun log pour ces filtres.</p>
            ) : null}

            {logs.map((log) => {
              const actorId = log.actorId ?? '';
              const actor = actorId ? usersById[actorId] : undefined;
              const actorLabel = actor
                ? formatUserLabel(actor)
                : actorId
                  ? actorId.slice(0, 10)
                  : '—';
              const detailsJson = log.details ? JSON.stringify(log.details, null, 2) : '';

              return (
                <div
                  key={log.id}
                  className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">{log.action ?? '—'}</p>
                      <p className="text-xs text-slate-400">
                        {formatDate(log.createdAt)} · {log.platform ?? '—'} · {log.actorRole ?? '—'}
                      </p>
                    </div>
                    {actorId ? (
                      <Link
                        href={`/admin/users/${actorId}/logs`}
                        className="rounded-full border border-slate-800/80 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-700"
                      >
                        Logs user
                      </Link>
                    ) : null}
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-slate-400 md:grid-cols-3">
                    <p>
                      <span className="text-slate-500">Actor:</span> {actorLabel}
                      {log.actorMail ? ` · ${log.actorMail}` : ''}
                    </p>
                    <p>
                      <span className="text-slate-500">Target:</span> {log.targetType ?? '—'}{' '}
                      {log.targetId ? `· ${log.targetId}` : ''}
                    </p>
                    <p className="break-all">
                      <span className="text-slate-500">IP/UA:</span> {log.ip ?? '—'}{' '}
                      {log.userAgent ? `· ${log.userAgent}` : ''}
                    </p>
                  </div>

                  {detailsJson ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-semibold text-emerald-200">
                        Details
                      </summary>
                      <pre className="mt-2 overflow-auto rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 text-[11px] text-slate-200">
                        {detailsJson}
                      </pre>
                    </details>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => void loadLogsPage({ reset: false })}
              disabled={!hasMore || logsLoading}
              className="rounded-xl border border-slate-800/80 bg-slate-950/40 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-700 disabled:cursor-not-allowed disabled:text-slate-500"
            >
              {logsLoading ? 'Chargement…' : hasMore ? 'Charger plus' : 'Fin'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

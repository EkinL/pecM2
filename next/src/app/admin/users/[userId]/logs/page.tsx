'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
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
import { auth, fetchUtilisateurById, signOutUser } from '../../../../indexFirebase';
import { adminLogs } from '../../../../firebase/collections';

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

type DatePreset = '24h' | '7d' | '30d' | 'custom' | 'all';

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

export default function AdminUserLogsPage() {
  const params = useParams() as { userId?: string };
  const router = useRouter();
  const userId = typeof params.userId === 'string' ? params.userId : '';

  const [adminChecking, setAdminChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminUserMail, setAdminUserMail] = useState<string | null>(null);

  const [userProfile, setUserProfile] = useState<null | {
    id: string;
    mail?: string;
    pseudo?: string;
    role?: string;
  }>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [actionFilter, setActionFilter] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const pageSize = 40;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsAdmin(false);
        setAdminChecking(false);
        router.replace('/auth');
        return;
      }

      setAdminUserMail(user.email ?? null);

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
    if (!isAdmin || !userId) {
      return;
    }
    setProfileError(null);
    void (async () => {
      try {
        const profile = (await fetchUtilisateurById(userId)) as unknown;
        if (!profile || typeof profile !== 'object') {
          setUserProfile(null);
          return;
        }
        const data = profile as { mail?: unknown; pseudo?: unknown; role?: unknown };
        setUserProfile({
          id: userId,
          mail: typeof data.mail === 'string' ? data.mail : undefined,
          pseudo: typeof data.pseudo === 'string' ? data.pseudo : undefined,
          role: typeof data.role === 'string' ? data.role : undefined,
        });
      } catch (error) {
        console.error('Erreur chargement profil user logs', error);
        setUserProfile(null);
        setProfileError('Impossible de charger le profil utilisateur.');
      }
    })();
  }, [isAdmin, userId]);

  const titleLabel = useMemo(() => {
    if (!userId) {
      return 'Utilisateur';
    }
    const base = userProfile?.pseudo ?? userProfile?.mail ?? userId.slice(0, 10);
    return base;
  }, [userId, userProfile]);

  const loadLogsPage = async ({ reset }: { reset: boolean }) => {
    if (!isAdmin || !userId) {
      return;
    }
    if (logsLoading) {
      return;
    }

    setLogsError(null);
    setLogsLoading(true);

    const { start, end } = computeDateRange(datePreset, customStart, customEnd);

    try {
      const constraints: QueryConstraint[] = [
        where('actorId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(pageSize),
      ];

      if (!reset && cursor) {
        constraints.push(startAfter(cursor));
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
      console.error('Erreur chargement logs user', error);
      setLogsError(formatLogsError(error));
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin || !userId) {
      return;
    }
    setCursor(null);
    setHasMore(true);
    void loadLogsPage({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, userId, actionFilter, datePreset, customStart, customEnd]);

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
            <h1 className="text-3xl font-semibold md:text-4xl">Logs · {titleLabel}</h1>
            <p className="text-sm text-slate-400 md:text-base">
              UID: <span className="font-mono text-xs">{userId || '—'}</span>
            </p>
            {profileError ? <p className="text-xs text-rose-300">{profileError}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>{adminUserMail ?? 'Compte admin'}</span>
            <Link
              href="/admin/logs"
              className="rounded-full border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-700"
            >
              Retour logs
            </Link>
          </div>
        </header>

        <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
          <div className="grid gap-4 md:grid-cols-3">
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
              const detailsJson = log.details ? JSON.stringify(log.details, null, 2) : '';
              return (
                <div
                  key={log.id}
                  className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">{log.action ?? '—'}</p>
                    <p className="text-xs text-slate-400">
                      {formatDate(log.createdAt)} · {log.platform ?? '—'} · {log.actorRole ?? '—'}
                    </p>
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-slate-400 md:grid-cols-3">
                    <p className="break-all">
                      <span className="text-slate-500">Target:</span> {log.targetType ?? '—'}{' '}
                      {log.targetId ? `· ${log.targetId}` : ''}
                    </p>
                    <p className="break-all">
                      <span className="text-slate-500">IP/UA:</span> {log.ip ?? '—'}{' '}
                      {log.userAgent ? `· ${log.userAgent}` : ''}
                    </p>
                    <p className="break-all">
                      <span className="text-slate-500">Mail:</span> {log.actorMail ?? '—'}
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

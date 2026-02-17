'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import {
  auth,
  fetchUtilisateurById,
  fetchUtilisateursRealTime,
  signOutUser,
  updateUtilisateurDeletionRequestStatus,
} from '../../indexFirebase';
import { logActivity } from '../../utils/logActivity';

type Utilisateur = {
  id: string;
  mail?: string;
  pseudo?: string;
  role?: string;
  accountDeletionRequestedAt?: unknown;
  accountDeletionRequestStatus?: string;
  accountDeletionRequestSource?: string;
  accountDeletionRequestContactEmail?: string;
  accountDeletionRequestPseudo?: string;
  accountDeletionReviewedAt?: unknown;
  accountDeletionReviewedBy?: string;
  accountDeletionReviewedByMail?: string;
  accountDeletionReviewNote?: string;
  updatedAt?: unknown;
  [key: string]: unknown;
};

type DeletionStatus = 'all' | 'pending' | 'in_review' | 'completed' | 'rejected';

const statusLabels: Record<Exclude<DeletionStatus, 'all'>, string> = {
  pending: 'En attente',
  in_review: 'En cours',
  completed: 'Traitee',
  rejected: 'Refusee',
};

const statusStyles: Record<Exclude<DeletionStatus, 'all'>, string> = {
  pending: 'bg-amber-100/80 text-amber-700 border border-amber-400/70',
  in_review: 'bg-sky-100/80 text-sky-700 border border-sky-400/70',
  completed: 'bg-emerald-100/80 text-emerald-700 border border-emerald-400/70',
  rejected: 'bg-rose-100/80 text-rose-700 border border-rose-400/70',
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

const formatDate = (value?: unknown) => {
  const millis = toMillis(value);
  if (!millis) {
    return '—';
  }
  return new Date(millis).toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
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

export default function AdminRgpdPage() {
  const router = useRouter();
  const [adminChecking, setAdminChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<null | { uid: string; mail?: string | null }>(null);

  const [users, setUsers] = useState<Utilisateur[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DeletionStatus>('pending');
  const [actionState, setActionState] = useState<null | {
    userId: string;
    status: Exclude<DeletionStatus, 'all'>;
  }>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
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
        setUsers((Array.isArray(data) ? data : []) as Utilisateur[]);
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

  const deletionRequests = useMemo(() => {
    return [...users]
      .filter((user) => {
        const hasRequestedAt = Boolean(user.accountDeletionRequestedAt);
        const status = user.accountDeletionRequestStatus?.trim();
        return hasRequestedAt || Boolean(status);
      })
      .sort((a, b) => {
        const aRequest = toMillis(a.accountDeletionRequestedAt) ?? 0;
        const bRequest = toMillis(b.accountDeletionRequestedAt) ?? 0;
        if (aRequest !== bRequest) {
          return bRequest - aRequest;
        }
        const aUpdated = toMillis(a.updatedAt) ?? 0;
        const bUpdated = toMillis(b.updatedAt) ?? 0;
        return bUpdated - aUpdated;
      });
  }, [users]);

  const stats = useMemo(() => {
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

  const filteredRequests = useMemo(() => {
    const query = search.trim().toLowerCase();
    return deletionRequests.filter((user) => {
      const status = normalizeDeletionStatus(user.accountDeletionRequestStatus);
      if (statusFilter !== 'all' && status !== statusFilter) {
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
  }, [deletionRequests, search, statusFilter]);

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

  const handleUpdateStatus = async (
    user: Utilisateur,
    nextStatus: Exclude<DeletionStatus, 'all'>,
  ) => {
    const currentStatus = normalizeDeletionStatus(user.accountDeletionRequestStatus);
    if (currentStatus === nextStatus) {
      return;
    }

    if (nextStatus === 'completed' || nextStatus === 'rejected') {
      const actionLabel = nextStatus === 'completed' ? 'traitee' : 'refusee';
      const confirmed = window.confirm(
        `Confirmer: marquer la demande de ${formatUserLabel(user)} comme ${actionLabel} ?`,
      );
      if (!confirmed) {
        return;
      }
    }

    setActionError(null);
    setActionSuccess(null);
    setActionState({ userId: user.id, status: nextStatus });

    try {
      await updateUtilisateurDeletionRequestStatus({
        userId: user.id,
        status: nextStatus,
        adminId: adminUser?.uid,
        adminMail: adminUser?.mail ?? undefined,
      });

      void logActivity({
        action: 'account_deletion_request_status_update',
        targetType: 'user',
        targetId: user.id,
        details: {
          previousStatus: currentStatus,
          nextStatus,
        },
      });

      setActionSuccess(
        `Demande de ${formatUserLabel(user)} mise a jour: ${statusLabels[nextStatus]}.`,
      );
    } catch (error) {
      console.error('Erreur lors de la mise a jour de la demande RGPD', error);
      setActionError('Impossible de mettre a jour le statut de la demande.');
    } finally {
      setActionState(null);
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
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Panel admin</p>
            <h1 className="text-3xl font-semibold md:text-4xl">Demandes RGPD</h1>
            <p className="text-sm text-slate-400 md:text-base">
              Suivi des demandes de suppression de compte.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>{adminUser?.mail ?? 'Compte admin'}</span>
            <Link
              href="/admin/logs"
              className="rounded-full border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-700"
            >
              Logs
            </Link>
            <Link
              href="/"
              className="rounded-full border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-700"
            >
              Retour dashboard
            </Link>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-4">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Total</p>
            <p className="mt-1 text-2xl font-semibold">{stats.total}</p>
          </div>
          <div className="rounded-2xl border border-amber-700/30 bg-slate-900/70 p-4">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">En attente</p>
            <p className="mt-1 text-2xl font-semibold text-amber-300">{stats.pending}</p>
          </div>
          <div className="rounded-2xl border border-sky-700/30 bg-slate-900/70 p-4">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">En cours</p>
            <p className="mt-1 text-2xl font-semibold text-sky-300">{stats.in_review}</p>
          </div>
          <div className="rounded-2xl border border-emerald-700/30 bg-slate-900/70 p-4">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Traitees</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-300">{stats.completed}</p>
          </div>
          <div className="rounded-2xl border border-rose-700/30 bg-slate-900/70 p-4">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Refusees</p>
            <p className="mt-1 text-2xl font-semibold text-rose-300">{stats.rejected}</p>
          </div>
        </section>

        <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
          <div className="grid gap-3 md:grid-cols-[1.3fr_0.7fr]">
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wide text-slate-400">
                Recherche
              </label>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600"
                placeholder="Mail, pseudo, uid..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wide text-slate-400">
                Filtre statut
              </label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as DeletionStatus)}
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

          {(usersError || actionError || actionSuccess) && (
            <div className="mt-4 text-xs">
              {usersError && <p className="text-rose-300">{usersError}</p>}
              {actionError && <p className="text-rose-300">{actionError}</p>}
              {actionSuccess && <p className="text-emerald-300">{actionSuccess}</p>}
            </div>
          )}

          <div className="mt-6 space-y-3">
            {usersLoading ? (
              <p className="text-sm text-slate-400">Chargement des demandes...</p>
            ) : filteredRequests.length === 0 ? (
              <p className="text-sm text-slate-400">Aucune demande pour ce filtre.</p>
            ) : (
              filteredRequests.map((user) => {
                const status = normalizeDeletionStatus(user.accountDeletionRequestStatus);
                const isBusy = actionState?.userId === user.id;

                return (
                  <article
                    key={user.id}
                    className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{formatUserLabel(user)}</p>
                        <p className="text-xs text-slate-500">
                          {user.mail ?? 'Email indisponible'} · UID{' '}
                          <span className="font-mono">{user.id}</span>
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${statusStyles[status]}`}
                      >
                        {statusLabels[status]}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-slate-400 md:grid-cols-2">
                      <p>
                        <span className="text-slate-500">Demande:</span>{' '}
                        {formatDate(user.accountDeletionRequestedAt)}
                      </p>
                      <p>
                        <span className="text-slate-500">Source:</span>{' '}
                        {user.accountDeletionRequestSource ?? '—'}
                      </p>
                      <p>
                        <span className="text-slate-500">Contact:</span>{' '}
                        {user.accountDeletionRequestContactEmail ?? user.mail ?? '—'}
                      </p>
                      <p>
                        <span className="text-slate-500">Pseudo saisi:</span>{' '}
                        {user.accountDeletionRequestPseudo ?? user.pseudo ?? '—'}
                      </p>
                      <p>
                        <span className="text-slate-500">Derniere revue:</span>{' '}
                        {formatDate(user.accountDeletionReviewedAt)}
                      </p>
                      <p>
                        <span className="text-slate-500">Admin:</span>{' '}
                        {user.accountDeletionReviewedByMail ??
                          user.accountDeletionReviewedBy ??
                          '—'}
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
                        onClick={() => void handleUpdateStatus(user, 'in_review')}
                        disabled={isBusy || status === 'in_review'}
                        className="rounded-lg border border-sky-400/60 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200 transition hover:border-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isBusy && actionState?.status === 'in_review'
                          ? 'Mise a jour...'
                          : 'Prendre en charge'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleUpdateStatus(user, 'completed')}
                        disabled={isBusy || status === 'completed'}
                        className="rounded-lg border border-emerald-400/60 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isBusy && actionState?.status === 'completed'
                          ? 'Mise a jour...'
                          : 'Marquer traitee'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleUpdateStatus(user, 'rejected')}
                        disabled={isBusy || status === 'rejected'}
                        className="rounded-lg border border-rose-400/60 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isBusy && actionState?.status === 'rejected'
                          ? 'Mise a jour...'
                          : 'Refuser'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleUpdateStatus(user, 'pending')}
                        disabled={isBusy || status === 'pending'}
                        className="rounded-lg border border-amber-400/60 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:border-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isBusy && actionState?.status === 'pending'
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
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import {
  auth,
  fetchAiProfilesRealTime,
  fetchUtilisateurById,
  fetchUtilisateursRealTime,
  signOutUser,
  deleteAiProfileAndConversations,
  updateAiProfileStatus,
} from '../../indexFirebase';
import { formatLookSummary } from '../../ia/aiOptions';

type Timestamp = {
  seconds?: number;
  nanoseconds?: number;
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
  ownerMail?: string;
  name?: string;
  mentality?: string;
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
    details?: string;
  };
  imageUrl?: string;
  status?: string;
  statusNote?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  ownerNotification?: string;
  hiddenFromCatalogue?: boolean;
  safetyWarnings?: string[];
  warningCount?: number;
};

const statusLabels: Record<string, string> = {
  pending: 'En attente',
  active: 'Active',
  suspended: 'Suspendue',
  disabled: 'Desactivee',
  rejected: 'Refusee',
};

const statusStyles: Record<string, string> = {
  pending: 'bg-amber-100/80 text-amber-700 border border-amber-400/70',
  active: 'bg-emerald-100/80 text-emerald-700 border border-emerald-400/70',
  suspended: 'bg-sky-100/80 text-sky-700 border border-sky-400/70',
  disabled: 'bg-slate-100/80 text-slate-700 border border-slate-300/80',
  rejected: 'bg-rose-100/80 text-rose-700 border border-rose-400/70',
};

const normalizeStatus = (status?: string) => {
  const normalized = status?.toLowerCase() ?? 'pending';
  if (['pending', 'active', 'suspended', 'disabled', 'rejected'].includes(normalized)) {
    return normalized;
  }
  return 'pending';
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

const formatOwnerLabel = (owner?: Utilisateur) => {
  if (!owner) {
    return 'Inconnu';
  }
  if (owner.pseudo) {
    return owner.pseudo;
  }
  if (owner.mail) {
    return owner.mail;
  }
  return `Utilisateur ${owner.id.slice(0, 5)}`;
};

export default function AdminIaPage() {
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

  const [aiAction, setAiAction] = useState<{
    id: string;
    type: 'approve' | 'reject' | 'delete';
  } | null>(null);
  const [aiActionError, setAiActionError] = useState<string | null>(null);
  const [aiActionSuccess, setAiActionSuccess] = useState<string | null>(null);
  const [aiActionImageUrl, setAiActionImageUrl] = useState<string | null>(null);
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

    return () => {
      unsubUsers?.();
      unsubAiProfiles?.();
    };
  }, [isAdmin]);

  const usersById = useMemo(() => {
    const map: Record<string, Utilisateur> = {};
    users.forEach((user) => {
      map[user.id] = user;
    });
    return map;
  }, [users]);

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

  const allAiProfiles = useMemo(
    () => [...aiProfiles].sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0)),
    [aiProfiles],
  );

  const triggerAvatarGeneration = async (profileId: string) => {
    const response = await fetch('/api/ai/image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
      if (!hasAvatar) {
        const { imageUrl: generatedImageUrl, updateError } =
          await triggerAvatarGeneration(profileId);
        if (!generatedImageUrl) {
          throw new Error('Avatar indisponible.');
        }
        setAiActionImageUrl(generatedImageUrl);
        setAiActionSuccess(
          updateError
            ? 'IA validee. Avatar genere mais la mise a jour Firestore a echoue.'
            : 'IA validee. Avatar genere.',
        );
        if (updateError) {
          setAiActionError(updateError);
        }
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
      setAiActionSuccess('IA refusee.');
    } catch (error) {
      console.error('Erreur lors du refus IA', error);
      setAiActionError('Impossible de refuser l IA.');
    } finally {
      setAiAction(null);
    }
  };

  const handleDeleteAi = async (profileId: string) => {
    const confirmed = window.confirm(
      'Supprimer cette IA ? Les conversations et messages lies seront aussi supprimes.',
    );
    if (!confirmed) {
      return;
    }

    setAiActionError(null);
    setAiActionSuccess(null);
    setAiAction({ id: profileId, type: 'delete' });

    try {
      await deleteAiProfileAndConversations({
        profileId,
        adminId: adminUser?.uid,
        adminMail: adminUser?.mail ?? undefined,
      });
      setAiActionSuccess('IA supprimee avec ses conversations.');
    } catch (error) {
      console.error('Erreur lors de la suppression IA', error);
      setAiActionError('Impossible de supprimer l IA ou ses conversations.');
    } finally {
      setAiAction(null);
    }
  };

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
            <h1 className="text-3xl font-semibold md:text-4xl">Validation IA</h1>
            <p className="text-sm text-slate-400 md:text-base">
              Toutes les IA et les demandes en attente.
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

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Demandes IA en attente</h2>
                <p className="text-sm text-slate-400">
                  Validez ou refusez les IA demandees par les utilisateurs.
                </p>
              </div>
              <span className="text-xs text-slate-400">
                {aiLoading ? 'Chargement…' : `${pendingAiProfiles.length} en attente`}
              </span>
            </div>
            {(aiActionError || aiActionSuccess) && (
              <div className="mt-4 space-y-2 text-xs">
                {aiActionError && <p className="text-rose-300">{aiActionError}</p>}
                {aiActionSuccess && <p className="text-emerald-300">{aiActionSuccess}</p>}
                {aiActionImageUrl && (
                  <p className="text-emerald-200">
                    Avatar URL:{' '}
                    <a
                      href={aiActionImageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all underline"
                    >
                      {aiActionImageUrl}
                    </a>
                  </p>
                )}
              </div>
            )}
            <div className="mt-5 space-y-3">
              {aiLoading ? (
                <p className="text-sm text-slate-400">Connexion Firestore…</p>
              ) : aiError ? (
                <p className="text-sm text-red-400">{aiError}</p>
              ) : pendingAiProfiles.length === 0 ? (
                <p className="text-sm text-slate-400">Aucune IA en attente.</p>
              ) : (
                pendingAiProfiles.map((profile) => {
                  const owner = profile.ownerId ? usersById[profile.ownerId] : undefined;
                  const isBusy = aiAction?.id === profile.id;
                  const warningCount = profile.safetyWarnings?.length ?? profile.warningCount ?? 0;
                  const warningNote = profile.ownerNotification ?? profile.statusNote ?? undefined;
                  const hasWarnings = warningCount > 0 || Boolean(warningNote);
                  const warningLabel =
                    warningCount === 1
                      ? '1 avertissement de sécurité'
                      : `${warningCount} avertissements de sécurité`;

                  return (
                    <div
                      key={profile.id}
                      className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4"
                    >
                      {hasWarnings && (
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200">
                          ⚠️ {warningLabel}
                          {warningNote ? ` · ${warningNote}` : ''}
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">
                          {profile.name ?? `IA ${profile.id.slice(0, 5)}`}
                        </p>
                        <span className="rounded-full border border-amber-400/70 bg-amber-100/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                          En attente
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        Proprietaire : {formatOwnerLabel(owner)}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {profile.mentality ?? 'Mentalite libre'} · {formatLookSummary(profile.look)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Creee le {formatDate(profile.createdAt)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleApproveAi(profile.id)}
                          disabled={isBusy}
                          className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
                        >
                          {isBusy && aiAction?.type === 'approve' ? 'Validation...' : 'Valider'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectAi(profile.id)}
                          disabled={isBusy}
                          className="rounded-lg border border-rose-400/60 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:border-rose-300 disabled:cursor-not-allowed"
                        >
                          {isBusy && aiAction?.type === 'reject' ? 'Refus...' : 'Refuser'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAi(profile.id)}
                          disabled={isBusy}
                          className="rounded-lg border border-rose-500/70 bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:border-rose-400 disabled:cursor-not-allowed"
                        >
                          {isBusy && aiAction?.type === 'delete' ? 'Suppression...' : 'Supprimer'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Toutes les IA</h2>
                <p className="text-sm text-slate-400">Vue globale des IA et de leur statut.</p>
              </div>
              <span className="text-xs text-slate-400">
                {aiLoading ? 'Chargement…' : `${allAiProfiles.length} IA`}
              </span>
            </div>
            {(usersError || aiError) && (
              <p className="mt-3 text-sm text-rose-300">{usersError ?? aiError}</p>
            )}
            <div className="mt-5 space-y-3">
              {aiLoading || usersLoading ? (
                <p className="text-sm text-slate-400">Chargement...</p>
              ) : allAiProfiles.length === 0 ? (
                <p className="text-sm text-slate-400">Aucune IA disponible.</p>
              ) : (
                allAiProfiles.map((profile) => {
                  const owner = profile.ownerId ? usersById[profile.ownerId] : undefined;
                  const statusKey = normalizeStatus(profile.status);
                  const isBusy = aiAction?.id === profile.id;
                  const isPending = statusKey === 'pending';
                  const canActivate = statusKey !== 'active';
                  const warningCount = profile.safetyWarnings?.length ?? profile.warningCount ?? 0;
                  const warningNote = profile.ownerNotification ?? profile.statusNote ?? undefined;
                  const hasWarnings = warningCount > 0 || Boolean(warningNote);
                  const warningLabel =
                    warningCount === 1
                      ? '1 avertissement de sécurité'
                      : `${warningCount} avertissements de sécurité`;
                  return (
                    <div
                      key={profile.id}
                      className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4"
                    >
                      {hasWarnings && (
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200">
                          ⚠️ {warningLabel}
                          {warningNote ? ` · ${warningNote}` : ''}
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">
                          {profile.name ?? `IA ${profile.id.slice(0, 5)}`}
                        </p>
                        <span
                          className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${statusStyles[statusKey]}`}
                        >
                          {statusLabels[statusKey]}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        Proprietaire : {formatOwnerLabel(owner)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {profile.mentality ?? 'Mentalite libre'} · {formatLookSummary(profile.look)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Maj {formatDate(profile.updatedAt)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canActivate && (
                          <button
                            type="button"
                            onClick={() => handleApproveAi(profile.id)}
                            disabled={isBusy}
                            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
                          >
                            {isBusy && aiAction?.type === 'approve'
                              ? 'Validation...'
                              : isPending
                                ? 'Valider'
                                : 'Activer'}
                          </button>
                        )}
                        {isPending && (
                          <button
                            type="button"
                            onClick={() => handleRejectAi(profile.id)}
                            disabled={isBusy}
                            className="rounded-lg border border-rose-400/60 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:border-rose-300 disabled:cursor-not-allowed"
                          >
                            {isBusy && aiAction?.type === 'reject' ? 'Refus...' : 'Refuser'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteAi(profile.id)}
                          disabled={isBusy}
                          className="rounded-lg border border-rose-500/70 bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:border-rose-400 disabled:cursor-not-allowed"
                        >
                          {isBusy && aiAction?.type === 'delete' ? 'Suppression...' : 'Supprimer'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}

'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import {
  addAiEvaluation,
  auth,
  fetchAiEvaluationsForUserRealTime,
  fetchAiProfilesRealTime,
  fetchConversationsForUserRealTime,
  fetchUtilisateurById,
} from '../../indexFirebase';

type Timestamp = {
  seconds?: number;
  nanoseconds?: number;
};

type Profil = {
  id: string;
  mail?: string;
  pseudo?: string;
  role?: string;
};

type Conversation = {
  id: string;
  userId?: string;
  aiId?: string;
  status?: string;
  messageCount?: number;
  updatedAt?: Timestamp;
  createdAt?: Timestamp;
  [key: string]: unknown;
};

type AiProfile = {
  id: string;
  name?: string;
  status?: string;
  [key: string]: unknown;
};

type AiEvaluation = {
  id: string;
  aiId?: string;
  conversationId?: string;
  rating?: number;
  comment?: string;
  tags?: string[];
  createdAt?: Timestamp;
  [key: string]: unknown;
};

const evaluationTags = [
  'Empathie',
  'Pertinence',
  'Clarte',
  'Vitesse',
  'Creativite',
  'Voix naturelle',
];
const MIN_MESSAGES_FOR_EVALUATION = 10;
const canEvaluateConversation = (conversation: Conversation) =>
  Boolean(conversation.aiId) && (conversation.messageCount ?? 0) > MIN_MESSAGES_FOR_EVALUATION;

const statusBucket = (status?: string) => {
  const normalized = status?.toLowerCase() ?? '';
  if (['pending', 'nouveau', 'queued', 'en attente', ''].includes(normalized)) {
    return 'pending';
  }
  if (['in progress', 'en cours', 'ongoing', 'matched', 'actif', 'accepted'].includes(normalized)) {
    return 'running';
  }
  if (
    ['completed', 'done', 'termine', 'terminee', 'closed', 'ended', 'cancelled'].includes(
      normalized,
    )
  ) {
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

const statusStyles: Record<string, string> = {
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

const formatRating = (rating?: number) => {
  if (!rating) {
    return 'Non note';
  }
  return `${rating}/5`;
};

export default function ClientHistoriquePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authMail, setAuthMail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profil | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsError, setConversationsError] = useState<string | null>(null);

  const [aiProfiles, setAiProfiles] = useState<AiProfile[]>([]);
  const [aiProfilesLoading, setAiProfilesLoading] = useState(true);
  const [aiProfilesError, setAiProfilesError] = useState<string | null>(null);

  const [evaluations, setEvaluations] = useState<AiEvaluation[]>([]);
  const [evaluationsLoading, setEvaluationsLoading] = useState(true);
  const [evaluationsError, setEvaluationsError] = useState<string | null>(null);

  const [missionView, setMissionView] = useState<'running' | 'completed'>('running');
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [rating, setRating] = useState(5);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [evaluationSuccess, setEvaluationSuccess] = useState<string | null>(null);
  const roleMismatch = Boolean(userId && profile?.role && profile.role !== 'client');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
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
    if (!userId || roleMismatch) {
      setConversations([]);
      setConversationsLoading(false);
      return;
    }

    setConversationsLoading(true);
    const unsubscribe = fetchConversationsForUserRealTime(
      userId,
      (data: unknown) => {
        setConversations(data as Conversation[]);
        setConversationsLoading(false);
        setConversationsError(null);
      },
      () => {
        setConversationsError('Impossible de recuperer les chats IA.');
        setConversationsLoading(false);
      },
    );

    return () => unsubscribe?.();
  }, [userId, roleMismatch]);

  useEffect(() => {
    if (!userId || roleMismatch) {
      setEvaluations([]);
      setEvaluationsLoading(false);
      return;
    }

    setEvaluationsLoading(true);
    const unsubscribe = fetchAiEvaluationsForUserRealTime(
      userId,
      (data: unknown) => {
        setEvaluations(data as AiEvaluation[]);
        setEvaluationsLoading(false);
        setEvaluationsError(null);
      },
      () => {
        setEvaluationsError('Impossible de recuperer les evaluations.');
        setEvaluationsLoading(false);
      },
    );

    return () => unsubscribe?.();
  }, [userId, roleMismatch]);

  const aiLookup = useMemo(() => {
    const map: Record<string, AiProfile> = {};
    aiProfiles.forEach((profile) => {
      if (profile.id) {
        map[profile.id] = profile;
      }
    });
    return map;
  }, [aiProfiles]);

  const sortedConversations = useMemo(
    () =>
      [...conversations].sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0)),
    [conversations],
  );

  const missionCounters = useMemo(() => {
    return sortedConversations.reduce(
      (acc, conversation) => {
        const bucket = statusBucket(conversation.status);
        acc[bucket] = (acc[bucket] ?? 0) + 1;
        return acc;
      },
      { pending: 0, running: 0, completed: 0, other: 0 } as Record<string, number>,
    );
  }, [sortedConversations]);

  const runningMissions = useMemo(
    () =>
      sortedConversations.filter((conversation) => statusBucket(conversation.status) === 'running'),
    [sortedConversations],
  );
  const completedMissions = useMemo(
    () =>
      sortedConversations.filter(
        (conversation) => statusBucket(conversation.status) === 'completed',
      ),
    [sortedConversations],
  );

  const missionList = missionView === 'running' ? runningMissions : completedMissions;
  const eligibleConversations = useMemo(
    () => sortedConversations.filter(canEvaluateConversation),
    [sortedConversations],
  );

  const evaluationsByConversation = useMemo(() => {
    const map: Record<string, AiEvaluation> = {};
    evaluations.forEach((evaluation) => {
      if (evaluation.conversationId) {
        map[evaluation.conversationId] = evaluation;
      }
    });
    return map;
  }, [evaluations]);

  const selectedConversation = useMemo(
    () =>
      eligibleConversations.find((conversation) => conversation.id === selectedConversationId) ??
      null,
    [eligibleConversations, selectedConversationId],
  );

  const selectedAi = selectedConversation?.aiId ? aiLookup[selectedConversation.aiId] : undefined;

  const selectedEvaluation = selectedConversationId
    ? evaluationsByConversation[selectedConversationId]
    : undefined;

  const sortedEvaluations = useMemo(
    () =>
      [...evaluations].sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)),
    [evaluations],
  );

  useEffect(() => {
    if (!selectedConversationId && eligibleConversations.length > 0) {
      setSelectedConversationId(eligibleConversations[0].id);
    }
    if (
      selectedConversationId &&
      !eligibleConversations.some((conversation) => conversation.id === selectedConversationId)
    ) {
      setSelectedConversationId(eligibleConversations[0]?.id ?? '');
    }
  }, [eligibleConversations, selectedConversationId]);

  useEffect(() => {
    setEvaluationError(null);
    setEvaluationSuccess(null);
  }, [selectedConversationId]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
    );
  };

  const handleSubmitEvaluation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEvaluationError(null);
    setEvaluationSuccess(null);

    if (!userId) {
      setEvaluationError('Connectez-vous pour evaluer une IA.');
      return;
    }

    if (!selectedConversation) {
      setEvaluationError('Selectionnez un chat IA eligible.');
      return;
    }

    if (!selectedConversation.aiId) {
      setEvaluationError("Impossible d'identifier l'IA.");
      return;
    }

    if (selectedEvaluation) {
      setEvaluationError('Vous avez deja evalue ce chat IA.');
      return;
    }

    setEvaluationLoading(true);

    try {
      await addAiEvaluation({
        userId,
        userMail: profile?.mail ?? authMail ?? undefined,
        aiId: selectedConversation.aiId,
        conversationId: selectedConversation.id,
        rating,
        comment,
        tags: selectedTags,
      });
      setEvaluationSuccess('Merci pour votre evaluation.');
      setRating(5);
      setSelectedTags([]);
      setComment('');
    } catch (error) {
      console.error("Erreur lors de l'evaluation", error);
      setEvaluationError("Impossible d'envoyer l'evaluation.");
    } finally {
      setEvaluationLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 md:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-900/80 via-slate-900 to-slate-950/80 p-6 shadow-2xl shadow-slate-900/40 backdrop-blur">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Historique client</p>
            <h1 className="text-3xl font-semibold md:text-4xl">Chats IA & evaluations</h1>
            <p className="text-sm text-slate-400 md:text-base">
              Suivez vos chats IA en cours, termines et partagez votre ressenti.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>{profile?.mail ?? authMail ?? 'Compte actif'}</span>
            <Link
              href="/demandes/client"
              className="rounded-full border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-700"
            >
              Retour aux demandes
            </Link>
          </div>
        </header>

        {!userId ? (
          <section className="rounded-3xl border border-slate-800/80 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
            <h2 className="text-lg font-semibold">Connexion requise</h2>
            <p className="mt-2 text-sm text-slate-400">
              Connectez-vous pour consulter votre historique et noter vos IA.
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
              Connectez-vous avec un compte client pour acceder a l historique.
            </p>
            <Link
              href="/demandes/client"
              className="mt-4 inline-flex items-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Aller aux demandes client
            </Link>
          </section>
        ) : (
          <>
            <section className="mx-auto w-full max-w-3xl">
              <article className="space-y-6">
                <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold">Evaluation IA</h2>
                      <p className="text-sm text-slate-400">
                        Notez votre experience des que le chat depasse 10 messages.
                      </p>
                    </div>
                    <span className="text-xs text-slate-400">
                      {eligibleConversations.length} chats IA eligibles
                    </span>
                  </div>

                  <form className="mt-5 space-y-4" onSubmit={handleSubmitEvaluation}>
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-wide text-slate-400">
                        Chat IA (10+ messages)
                      </label>
                      <select
                        value={selectedConversationId}
                        onChange={(event) => setSelectedConversationId(event.target.value)}
                        className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
                      >
                        {eligibleConversations.length === 0 && (
                          <option value="">Aucun chat IA eligible</option>
                        )}
                        {eligibleConversations.map((conversation) => {
                          const aiRef = conversation.aiId ? aiLookup[conversation.aiId] : undefined;
                          return (
                            <option key={conversation.id} value={conversation.id}>
                              {aiRef?.name ?? `IA ${conversation.aiId?.slice(0, 5) ?? '?'}`} ·{' '}
                              {formatDate(conversation.updatedAt)}
                            </option>
                          );
                        })}
                      </select>
                      <p className="text-[11px] text-slate-500">
                        IA selectionnee: {selectedAi?.name ?? 'Non definie'}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-wide text-slate-400">Note</label>
                      <div className="flex flex-wrap gap-2">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setRating(value)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                              rating === value
                                ? 'border-emerald-400/70 bg-emerald-500/20 text-emerald-200'
                                : 'border-slate-800/80 bg-slate-950/40 text-slate-300 hover:border-slate-600'
                            }`}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-wide text-slate-400">
                        Points cles
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {evaluationTags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleTag(tag)}
                            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                              selectedTags.includes(tag)
                                ? 'border-sky-400/70 bg-sky-500/20 text-sky-200'
                                : 'border-slate-800/80 bg-slate-950/40 text-slate-400 hover:border-slate-600'
                            }`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-wide text-slate-400">
                        Commentaire
                      </label>
                      <textarea
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        rows={3}
                        className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600"
                        placeholder="Qu'est-ce qui pourrait etre ameliore ?"
                      />
                    </div>

                    {evaluationError && <p className="text-sm text-rose-300">{evaluationError}</p>}
                    {evaluationSuccess && (
                      <p className="text-sm text-emerald-300">{evaluationSuccess}</p>
                    )}
                    {selectedEvaluation && (
                      <p className="text-xs text-slate-500">
                        Evaluation deja enregistree le {formatDate(selectedEvaluation.createdAt)}.
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={evaluationLoading || eligibleConversations.length === 0}
                      className="w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/40"
                    >
                      {evaluationLoading ? 'Envoi...' : "Envoyer l'evaluation"}
                    </button>
                  </form>
                </div>

                <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">Historique des evaluations</h2>
                      <p className="text-xs text-slate-400">
                        {evaluationsLoading ? 'Chargement...' : `${evaluations.length} avis`}
                      </p>
                    </div>
                    {(aiProfilesLoading || evaluationsLoading) && (
                      <span className="text-xs text-slate-500">Synchronisation...</span>
                    )}
                  </div>

                  {(evaluationsError || aiProfilesError) && (
                    <p className="mt-3 text-sm text-rose-300">
                      {evaluationsError ?? aiProfilesError}
                    </p>
                  )}

                  <div className="mt-4 space-y-3">
                    {sortedEvaluations.length === 0 ? (
                      <p className="text-sm text-slate-400">Aucune evaluation pour le moment.</p>
                    ) : (
                      sortedEvaluations.slice(0, 6).map((evaluation) => {
                        const aiRef = evaluation.aiId ? aiLookup[evaluation.aiId] : undefined;
                        return (
                          <div
                            key={evaluation.id}
                            className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4"
                          >
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold">
                                {aiRef?.name ?? `IA ${evaluation.aiId?.slice(0, 5) ?? '?'}`}
                              </p>
                              <span className="text-xs text-emerald-200">
                                {formatRating(evaluation.rating)}
                              </span>
                            </div>
                            {evaluation.tags && evaluation.tags.length > 0 && (
                              <p className="mt-1 text-[11px] text-slate-400">
                                {evaluation.tags.join(' · ')}
                              </p>
                            )}
                            {evaluation.comment && (
                              <p className="mt-2 text-xs text-slate-500">{evaluation.comment}</p>
                            )}
                            <p className="mt-2 text-[11px] text-slate-500">
                              {formatDate(evaluation.createdAt)}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </article>
            </section>

            {(profileLoading || aiProfilesLoading) && (
              <p className="text-xs text-slate-500">Synchronisation des donnees en cours...</p>
            )}
            {profileError && <p className="text-xs text-rose-300">{profileError}</p>}
          </>
        )}
      </div>
    </div>
  );
}

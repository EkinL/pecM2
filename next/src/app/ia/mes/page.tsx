'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  auth,
  fetchAiProfilesByOwnerRealTime,
  fetchUtilisateurById,
  updateAiProfileForOwner,
} from '../../indexFirebase';
import { OwnerAiCard, OwnerAiHeader } from './components';
import { hasActiveSubscription, SubscriptionAwareProfile } from '../../utils/subscriptionUtils';
import type { AiProfile } from '../types';

type Utilisateur = SubscriptionAwareProfile & {
  id: string;
  pseudo?: string;
  mail?: string;
  role?: string;
};

const ownerLabelFor = (owner: Utilisateur | null, userId: string | null) => {
  if (owner?.pseudo) {
    return owner.pseudo;
  }
  if (owner?.mail) {
    return owner.mail;
  }
  if (userId) {
    return `Mon IA (${userId.slice(0, 5)})`;
  }
  return 'Mes IA';
};

export default function MyAiListPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [owner, setOwner] = useState<Utilisateur | null>(null);
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [aiProfiles, setAiProfiles] = useState<AiProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessUpdatingId, setAccessUpdatingId] = useState<string | null>(null);
  const [accessErrors, setAccessErrors] = useState<Record<string, string>>({});
  const hasSubscription = useMemo(() => hasActiveSubscription(owner), [owner]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUserId(null);
        setOwner(null);
        setLoading(false);
        return;
      }

      setUserId(user.uid);
      setLoading(true);
      setOwnerLoading(true);

      try {
        const fetched = (await fetchUtilisateurById(user.uid)) as Utilisateur | null;
        setOwner(fetched);
        setError(null);
      } catch (err) {
        console.error('Impossible de recuperer le profil createur', err);
        setOwner(null);
        setError('Profil createur indisponible.');
      } finally {
        setOwnerLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) {
      setAiProfiles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = fetchAiProfilesByOwnerRealTime(
      userId,
      (data: unknown) => {
        setAiProfiles(data as AiProfile[]);
        setLoading(false);
        setError(null);
      },
      (err: unknown) => {
        console.error('Impossible de recuperer les IA', err);
        setError('Impossible de recuperer vos IA.');
        setLoading(false);
      },
    );

    return () => unsubscribe?.();
  }, [userId]);

  const setAccessError = (profileId: string, message?: string | null) => {
    setAccessErrors((prev) => {
      const next = { ...prev };
      if (!message) {
        delete next[profileId];
      } else {
        next[profileId] = message;
      }
      return next;
    });
  };

  const handleAccessUpdate = async (
    profileId: string,
    updates: { visibility?: 'public' | 'private'; accessType?: 'free' | 'paid' },
  ) => {
    setAccessUpdatingId(profileId);
    setAccessError(profileId, null);
    try {
      await updateAiProfileForOwner({ profileId, updates });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Impossible de mettre à jour la configuration.';
      setAccessError(profileId, message);
    } finally {
      setAccessUpdatingId(null);
    }
  };

  const sortedProfiles = useMemo(
    () => [...aiProfiles].sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)),
    [aiProfiles],
  );

  const ownerLabel = ownerLabelFor(owner, userId);

  const handleVisibilitySelection = (
    profileId: string,
    nextValue: 'public' | 'private',
    currentValue: 'public' | 'private',
  ) => {
    if (nextValue === currentValue) {
      return;
    }
    handleAccessUpdate(profileId, { visibility: nextValue });
  };

  const handleAccessTypeSelection = (
    profileId: string,
    nextValue: 'free' | 'paid',
    currentValue: 'free' | 'paid',
  ) => {
    if (nextValue === currentValue) {
      return;
    }
    if (nextValue === 'paid' && !hasSubscription) {
      setAccessError(profileId, "Un abonnement premium est requis pour activer l'option payante.");
      return;
    }
    handleAccessUpdate(profileId, { accessType: nextValue });
  };

  if (!userId) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-5xl space-y-6 px-6 py-16">
          <section className="rounded-3xl border border-slate-800/80 bg-slate-900/70 p-8 shadow-2xl">
            <h1 className="text-2xl font-semibold">Mes IA</h1>
            <p className="mt-2 text-sm text-slate-400">
              Connectez-vous pour voir et gérer les IA que vous avez créées.
            </p>
            <Link
              href="/auth"
              className="mt-4 inline-flex items-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Se connecter
            </Link>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 md:px-6 lg:px-8">
        <OwnerAiHeader ownerLoading={ownerLoading} ownerLabel={ownerLabel} />

        <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
          {loading ? (
            <p className="text-sm text-slate-400">Chargement des IA...</p>
          ) : error ? (
            <p className="text-sm text-rose-300">{error}</p>
          ) : sortedProfiles.length === 0 ? (
            <p className="text-sm text-slate-400">Vous n&apos;avez encore créé aucune IA.</p>
          ) : (
            <div className="space-y-4">
              {sortedProfiles.map((profile) => (
                <OwnerAiCard
                  key={profile.id}
                  profile={profile}
                  hasSubscription={hasSubscription}
                  isUpdating={accessUpdatingId === profile.id}
                  accessError={accessErrors[profile.id]}
                  onVisibilityChange={(value) =>
                    handleVisibilitySelection(
                      profile.id,
                      value,
                      (profile.visibility ?? 'public') as 'public' | 'private',
                    )
                  }
                  onAccessTypeChange={(value) =>
                    handleAccessTypeSelection(
                      profile.id,
                      value,
                      (profile.accessType ?? 'free') as 'free' | 'paid',
                    )
                  }
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import {
  auth,
  ensureUtilisateurProfile,
  fetchUtilisateurById,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from '../indexFirebase';

const roleOptions = [{ value: 'client', label: 'Client' }];

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Authentification impossible. Reessayez.';
};

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [role, setRole] = useState('client');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [authUser, setAuthUser] = useState<null | { uid: string; email?: string | null }>(null);
  const redirectingRef = useRef(false);

  const heading = useMemo(() => (mode === 'signin' ? 'Connexion' : 'Inscription'), [mode]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAuthUser(null);
        setNeedsProfile(false);
        setCheckingSession(false);
        return;
      }

      setAuthUser({ uid: user.uid, email: user.email });

      if (redirectingRef.current) {
        setCheckingSession(false);
        return;
      }

      try {
        const profile = await fetchUtilisateurById(user.uid);
        if (profile) {
          router.replace('/');
          return;
        }
        setNeedsProfile(true);
      } catch (authError) {
        setError(getErrorMessage(authError));
      } finally {
        setCheckingSession(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (authUser && !needsProfile) {
      router.replace('/');
    }
  }, [authUser, needsProfile, router]);

  const handleRedirect = async (
    user: { uid: string; email?: string | null },
    payload?: { pseudo?: string },
  ) => {
    if (redirectingRef.current) {
      return;
    }

    redirectingRef.current = true;
    const profileResult = await ensureUtilisateurProfile({
      user,
      role,
      pseudo: payload?.pseudo,
    });

    const destination = profileResult.isNew ? '/ia/create' : '/';
    router.replace(destination);
  };

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const credential =
        mode === 'signup'
          ? await signUpWithEmail({ email, password })
          : await signInWithEmail({ email, password });

      await handleRedirect(credential.user, { pseudo: mode === 'signup' ? pseudo : undefined });
    } catch (authError) {
      redirectingRef.current = false;
      setError(getErrorMessage(authError));
    } finally {
      setLoading(false);
    }
  };

  const handleProviderSignIn = async (provider: 'google' | 'apple') => {
    setError(null);
    setLoading(true);

    try {
      const credential = provider === 'google' ? await signInWithGoogle() : await signInWithApple();
      await handleRedirect(credential.user);
    } catch (authError) {
      redirectingRef.current = false;
      setError(getErrorMessage(authError));
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteProfile = async () => {
    if (!authUser) {
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await handleRedirect(authUser, { pseudo });
    } catch (authError) {
      redirectingRef.current = false;
      setError(getErrorMessage(authError));
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-12">
          <p className="text-sm text-slate-400">Chargement...</p>
        </div>
      </div>
    );
  }

  if (needsProfile && authUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-12">
          <div className="w-full max-w-lg space-y-6 rounded-3xl border border-slate-800/80 bg-slate-900/70 p-8 shadow-2xl">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Profil requis</p>
              <h1 className="text-2xl font-semibold">Finaliser votre role</h1>
              <p className="text-sm text-slate-400">
                Nous avons besoin de votre role pour poursuivre la creation de votre IA.
              </p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-slate-400">Role</label>
                <div className="grid grid-cols-2 gap-3">
                  {roleOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setRole(option.value)}
                      className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                        role === option.value
                          ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200'
                          : 'border-slate-800/80 bg-slate-950/40 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="pseudo" className="text-xs uppercase tracking-wide text-slate-400">
                  Pseudo (optionnel)
                </label>
                <input
                  id="pseudo"
                  value={pseudo}
                  onChange={(event) => setPseudo(event.target.value)}
                  className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                  placeholder="Nom public"
                />
              </div>
              {error && <p className="text-sm text-rose-300">{error}</p>}
              <button
                type="button"
                onClick={handleCompleteProfile}
                disabled={loading}
                className="w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
              >
                {loading ? 'Validation...' : 'Continuer'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-10 px-6 py-12 lg:flex-row lg:items-stretch">
        <div className="w-full max-w-md space-y-5 rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-900/80 via-slate-900 to-slate-950/80 p-8 shadow-2xl">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Auth Firebase</p>
          <h1 className="text-3xl font-semibold">{heading}</h1>
          <p className="text-sm text-slate-400">
            Choisissez votre role, puis connectez-vous via email ou un fournisseur.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-4">
            {roleOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRole(option.value)}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                  role === option.value
                    ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200'
                    : 'border-slate-800/80 bg-slate-950/40 text-slate-300 hover:border-slate-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={() => handleProviderSignIn('google')}
              disabled={loading}
              className="flex w-full items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/50 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-700 disabled:cursor-not-allowed"
            >
              <span>Continuer avec Google</span>
              <span className="text-xs text-slate-400">OAuth</span>
            </button>
            <button
              type="button"
              onClick={() => handleProviderSignIn('apple')}
              disabled={loading}
              className="flex w-full items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/50 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-700 disabled:cursor-not-allowed"
            >
              <span>Continuer avec Apple</span>
              <span className="text-xs text-slate-400">OAuth</span>
            </button>
          </div>
        </div>

        <div className="w-full max-w-md space-y-6 rounded-3xl border border-slate-800/80 bg-slate-900/70 p-8 shadow-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">{heading}</h2>
            <button
              type="button"
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              className="text-xs uppercase tracking-wide text-emerald-300"
            >
              {mode === 'signin' ? 'Passer en inscription' : 'Deja un compte'}
            </button>
          </div>
          <form className="space-y-4" onSubmit={handleEmailSubmit}>
            <div className="space-y-2">
              <label htmlFor="email" className="text-xs uppercase tracking-wide text-slate-400">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                placeholder="email@exemple.com"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-xs uppercase tracking-wide text-slate-400">
                Mot de passe
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                placeholder="********"
                required
              />
            </div>
            {mode === 'signup' && (
              <div className="space-y-2">
                <label
                  htmlFor="pseudo-email"
                  className="text-xs uppercase tracking-wide text-slate-400"
                >
                  Pseudo (optionnel)
                </label>
                <input
                  id="pseudo-email"
                  value={pseudo}
                  onChange={(event) => setPseudo(event.target.value)}
                  className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                  placeholder="Nom public"
                />
              </div>
            )}
            {error && <p className="text-sm text-rose-300">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
            >
              {loading ? 'Traitement...' : heading}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

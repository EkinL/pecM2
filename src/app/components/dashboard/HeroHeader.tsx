import Link from "next/link";
import { ReactNode } from "react";

type HeroHeaderProps = {
  adminChecking: boolean;
  adminUser: { uid: string; mail?: string | null } | null;
  profile: { mail?: string; tokens?: number } | null;
  signOutLoading: boolean;
  signOutError: string | null;
  handleSignOut: () => Promise<void>;
  children?: ReactNode;
};

export const HeroHeader = ({
  adminChecking,
  adminUser,
  profile,
  signOutLoading,
  signOutError,
  handleSignOut,
  children,
}: HeroHeaderProps) => (
  <header className="flex flex-col gap-4 rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-900/80 via-slate-900 to-slate-950/80 p-6 shadow-2xl shadow-slate-900/40 backdrop-blur">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Admin</p>
        <h1 className="text-3xl font-semibold md:text-4xl">Tableau de bord</h1>
        <p className="text-sm text-slate-400 md:text-base">
          Supervision en temps réel, modération FAIR et pilotage du produit.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span>{adminChecking ? "Connexion..." : adminUser?.mail ?? "Compte actif"}</span>
        <span>{profile?.mail ?? "Profil non chargé"}</span>
        <span>{profile?.tokens ?? 0} tokens</span>
        <Link
          href="/demandes/client"
          className="rounded-full border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-700"
        >
          Retour aux demandes
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signOutLoading}
          className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
            signOutLoading
              ? "border-rose-500 text-rose-300 bg-rose-500/10 cursor-wait"
              : "border-white/20 text-slate-200 bg-slate-900/60 hover:border-white/40"
          }`}
        >
          {signOutLoading ? "Déconnexion..." : "Déconnecter"}
        </button>
      </div>
    </div>
    {signOutError && (
      <p className="text-xs text-rose-300">{signOutError}</p>
    )}
    {children}
  </header>
);

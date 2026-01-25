import Link from "next/link";

type OwnerAiHeaderProps = {
  ownerLoading: boolean;
  ownerLabel: string;
};

export const OwnerAiHeader = ({ ownerLoading, ownerLabel }: OwnerAiHeaderProps) => (
  <header className="space-y-2 rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-900/80 via-slate-900 to-slate-950/80 p-6 shadow-2xl shadow-slate-900/40">
    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Mes IA</p>
    <h1 className="text-3xl font-semibold">Créations privées</h1>
    <p className="text-sm text-slate-400">
      {ownerLoading ? "Chargement du créateur..." : `Créateur: ${ownerLabel}`}
    </p>
    <div className="flex flex-wrap gap-3 text-xs">
      <Link
        href="/ia"
        className="rounded-full border border-slate-800/80 bg-slate-950/60 px-4 py-2 font-semibold text-slate-200 transition hover:border-slate-700"
      >
        Voir le catalogue
      </Link>
      <Link
        href="/ia/create"
        className="rounded-full border border-emerald-500/80 bg-emerald-500/10 px-4 py-2 font-semibold text-emerald-200 transition hover:border-emerald-400"
      >
        Ajouter une IA
      </Link>
    </div>
  </header>
);

import { AiProfile, Timestamp, Utilisateur } from "../../types/dashboard";

type AiProfilesSectionProps = {
  aiLoading: boolean;
  aiError: string | null;
  topAiProfiles: AiProfile[];
  usersById: Record<string, Utilisateur | undefined>;
  formatUserLabel: (user: Utilisateur) => string;
  formatLookSummary: (profile: AiProfile) => string;
  formatDate: (value?: Timestamp | string) => string;
};

export const AiProfilesSection = ({
  aiLoading,
  aiError,
  topAiProfiles,
  usersById,
  formatUserLabel,
  formatLookSummary,
  formatDate,
}: AiProfilesSectionProps) => (
  <article className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-semibold">IA créées par utilisateur</h2>
      <span className="text-xs text-slate-400">
        {aiLoading ? "Chargement…" : `${topAiProfiles.length} IA`}
      </span>
    </div>
    <div className="mt-5 grid gap-4">
      {aiLoading ? (
        <p className="text-sm text-slate-400">Connexion Firestore…</p>
      ) : aiError ? (
        <p className="text-sm text-red-400">{aiError}</p>
      ) : topAiProfiles.length === 0 ? (
        <p className="text-sm text-slate-400">Aucune IA enregistrée.</p>
      ) : (
        topAiProfiles.map((profile) => {
          const owner = profile.ownerId ? usersById[profile.ownerId] : undefined;

          return (
            <div
              key={profile.id}
              className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {profile.name ?? `IA ${profile.id.slice(0, 5)}`}
                </p>
                <span className="text-xs text-slate-500">
                  {profile.mentality ?? "Mentalité libre"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Propriétaire : {owner ? formatUserLabel(owner) : "Inconnu"}
              </p>
              <p className="mt-1 text-xs text-slate-400">{formatLookSummary(profile)}</p>
              <p className="mt-1 text-xs text-slate-400">
                Voix : {profile.voice ?? "Non définie"}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {profile.tokensSpent
                  ? `${profile.tokensSpent.toLocaleString("fr-FR")} tokens dépensés`
                  : "Aucune dépense enregistrée"}
              </p>
              <p className="mt-1 text-xs text-slate-500">Créée le {formatDate(profile.createdAt)}</p>
            </div>
          );
        })
      )}
    </div>
  </article>
);

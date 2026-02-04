import { AiProfile, Timestamp, Utilisateur } from '../../types/dashboard';

type AiValidationSectionProps = {
  aiLoading: boolean;
  aiError: string | null;
  pendingAiProfiles: AiProfile[];
  usersById: Record<string, Utilisateur | undefined>;
  aiAction: { id: string; type: string } | null;
  handleApproveAi: (profileId: string) => Promise<void>;
  handleRejectAi: (profileId: string) => Promise<void>;
  aiActionError: string | null;
  aiActionSuccess: string | null;
  aiActionImageUrl: string | null;
  formatUserLabel: (user: Utilisateur) => string;
  formatLookSummary: (profile: AiProfile) => string;
  formatDate: (value?: Timestamp | string) => string;
};

export const AiValidationSection = ({
  aiLoading,
  aiError,
  pendingAiProfiles,
  usersById,
  aiAction,
  handleApproveAi,
  handleRejectAi,
  aiActionError,
  aiActionSuccess,
  aiActionImageUrl,
  formatUserLabel,
  formatLookSummary,
  formatDate,
}: AiValidationSectionProps) => (
  <article className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-xl font-semibold">Validation IA</h2>
        <p className="text-sm text-slate-400">
          Validez ou refusez les IA demandées par les utilisateurs.
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

          return (
            <div
              key={profile.id}
              className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {profile.name ?? `IA ${profile.id.slice(0, 5)}`}
                </p>
                <span className="rounded-full border border-amber-400/70 bg-amber-100/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                  En attente
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Propriétaire : {owner ? formatUserLabel(owner) : 'Inconnu'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {profile.mentality ?? 'Mentalité libre'} · {formatLookSummary(profile)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Créée le {formatDate(profile.createdAt)}
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
              </div>
            </div>
          );
        })
      )}
    </div>
  </article>
);

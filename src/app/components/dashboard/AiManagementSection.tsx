import { AiProfile, Timestamp, Utilisateur } from "../../types/dashboard";
import { Dispatch, SetStateAction } from "react";

type AiManagementSectionProps = {
  aiLoading: boolean;
  aiError: string | null;
  managedAiProfiles: AiProfile[];
  usersById: Record<string, Utilisateur | undefined>;
  aiAction: { id: string; type: string } | null;
  aiActionError: string | null;
  aiActionSuccess: string | null;
  aiActionImageUrl: string | null;
  aiStatusStyles: Record<string, string>;
  aiStatusLabels: Record<string, string>;
  handleAiStatusUpdate: (profileId: string, status: "active" | "suspended" | "disabled") => void;
  aiEditId: string | null;
  startAiEdit: (profile: AiProfile) => void;
  handleAiEditCancel: () => void;
  aiEditForm: Record<string, string>;
  setAiEditForm: Dispatch<SetStateAction<Record<string, string>>>;
  aiEditLoading: boolean;
  handleAiEditSave: () => Promise<void>;
  formatUserLabel: (user: Utilisateur) => string;
  formatLookSummary: (profile: AiProfile) => string;
  formatDate: (value?: Timestamp | string) => string;
};

export const AiManagementSection = ({
  aiLoading,
  aiError,
  managedAiProfiles,
  usersById,
  aiAction,
  aiActionError,
  aiActionSuccess,
  aiActionImageUrl,
  aiStatusStyles,
  aiStatusLabels,
  handleAiStatusUpdate,
  aiEditId,
  startAiEdit,
  handleAiEditCancel,
  aiEditForm,
  setAiEditForm,
  aiEditLoading,
  handleAiEditSave,
  formatUserLabel,
  formatLookSummary,
  formatDate,
}: AiManagementSectionProps) => (
  <article className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-xl font-semibold">Gestion IA</h2>
        <p className="text-sm text-slate-400">Modifier les infos, suspendre ou désactiver les IA.</p>
      </div>
      <span className="text-xs text-slate-400">
        {aiLoading ? "Chargement…" : `${managedAiProfiles.length} IA`}
      </span>
    </div>

    {(aiActionError || aiActionSuccess) && (
      <div className="mt-4 space-y-2 text-xs">
        {aiActionError && <p className="text-rose-300">{aiActionError}</p>}
        {aiActionSuccess && <p className="text-emerald-300">{aiActionSuccess}</p>}
        {aiActionImageUrl && (
          <p className="text-emerald-200">
            Avatar URL:{" "}
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
      ) : managedAiProfiles.length === 0 ? (
        <p className="text-sm text-slate-400">Aucune IA disponible.</p>
      ) : (
        managedAiProfiles.map((profile) => {
          const owner = profile.ownerId ? usersById[profile.ownerId] : undefined;
          const statusKey = normalizeStatusLabel(profile.status);
          const isActionBusy = aiAction?.id === profile.id;
          const isEditing = aiEditId === profile.id;
          const canActivate = statusKey !== "active";
          const canSuspend = statusKey === "active";
          const canDisable = statusKey !== "disabled";

          return (
            <div
              key={profile.id}
              className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  {profile.name ?? `IA ${profile.id.slice(0, 5)}`}
                </p>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${aiStatusStyles[statusKey]}`}
                >
                  {aiStatusLabels[statusKey]}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Propriétaire : {owner ? formatUserLabel(owner) : "Inconnu"}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {profile.mentality ?? "Mentalité libre"} · {formatLookSummary(profile)}
              </p>
              <p className="mt-1 text-xs text-slate-500">Créée le {formatDate(profile.createdAt)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {canActivate && (
                  <button
                    type="button"
                    onClick={() => handleAiStatusUpdate(profile.id, "active")}
                    disabled={isActionBusy}
                    className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
                  >
                    {isActionBusy && aiAction?.type === "activate" ? "Activation..." : "Activer"}
                  </button>
                )}
                {canSuspend && (
                  <button
                    type="button"
                    onClick={() => handleAiStatusUpdate(profile.id, "suspended")}
                    disabled={isActionBusy}
                    className="rounded-lg border border-sky-400/60 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200 transition hover:border-sky-300 disabled:cursor-not-allowed"
                  >
                    {isActionBusy && aiAction?.type === "suspend" ? "Suspension..." : "Suspendre"}
                  </button>
                )}
                {canDisable && (
                  <button
                    type="button"
                    onClick={() => handleAiStatusUpdate(profile.id, "disabled")}
                    disabled={isActionBusy}
                    className="rounded-lg border border-rose-400/60 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:border-rose-300 disabled:cursor-not-allowed"
                  >
                    {isActionBusy && aiAction?.type === "disable" ? "Désactivation..." : "Désactiver"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (isEditing ? handleAiEditCancel() : startAiEdit(profile))}
                  className="rounded-lg border border-slate-700/70 bg-slate-900/40 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
                >
                  {isEditing ? "Fermer" : "Modifier"}
                </button>
              </div>
              {isEditing && (
                <div className="mt-4 grid gap-3 rounded-2xl border border-slate-800/70 bg-slate-900/40 p-4 md:grid-cols-2">
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">Nom</label>
                    <input
                      value={aiEditForm.name ?? ""}
                      onChange={(event) =>
                        setAiEditForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
                      placeholder="Nom IA"
                    />
                  </div>
                  {[
                    { label: "Mentalité", key: "mentality" },
                    { label: "Voix", key: "voice" },
                    { label: "Genre", key: "gender" },
                    { label: "Peau", key: "skin" },
                    { label: "Cheveux", key: "hair" },
                    { label: "Couleur cheveux", key: "hairColor" },
                    { label: "Couleur yeux", key: "eyeColor" },
                    { label: "Age", key: "age", type: "number" },
                    { label: "Taille", key: "height", type: "number" },
                    { label: "Morphologie", key: "bodyType" },
                    { label: "Pilosité", key: "facialHair" },
                    { label: "Maquillage", key: "makeup" },
                    { label: "Lunettes", key: "glasses" },
                  ].map((field) => (
                    <div className="space-y-1" key={field.key}>
                      <label className="text-xs uppercase tracking-wide text-slate-400">{field.label}</label>
                      <input
                        type={field.type ?? "text"}
                        value={aiEditForm[field.key] ?? ""}
                        onChange={(event) =>
                          setAiEditForm((prev) => ({ ...prev, [field.key]: event.target.value }))
                        }
                        className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
                        placeholder={field.label}
                      />
                    </div>
                  ))}
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">Détails</label>
                    <textarea
                      value={aiEditForm.details ?? ""}
                      onChange={(event) =>
                        setAiEditForm((prev) => ({ ...prev, details: event.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
                      placeholder="Précisez les détails physiques (optionnel)"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAiEditSave}
                    disabled={aiEditLoading}
                    className="w-full rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/40 md:col-span-2"
                  >
                    {aiEditLoading ? "Sauvegarde..." : "Sauvegarder"}
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  </article>
);

const normalizeStatusLabel = (status?: string) => {
  const normalized = status?.toLowerCase() ?? "pending";
  if (["pending", "active", "suspended", "disabled", "rejected"].includes(normalized)) {
    return normalized;
  }
  return "pending";
};

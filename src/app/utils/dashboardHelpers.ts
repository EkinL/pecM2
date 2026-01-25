import { AiProfile, Timestamp, Utilisateur } from "../types/dashboard";

export const statusBucket = (status?: string) => {
  const normalized = status?.toLowerCase() ?? "";
  if (["pending", "nouveau", "queued", "en attente", ""].includes(normalized)) {
    return "pending";
  }
  if (["in progress", "en cours", "ongoing", "matched", "actif", "accepted"].includes(normalized)) {
    return "running";
  }
  if (["completed", "done", "terminé", "closed", "ended", "cancelled"].includes(normalized)) {
    return "completed";
  }
  return "other";
};

export const statusLabels: Record<string, string> = {
  pending: "Ouverte",
  running: "Ouverte",
  completed: "Fermee",
  other: "Ouverte",
};

export const statusBadgeStyles: Record<string, string> = {
  pending: "bg-amber-100/80 text-amber-700 border border-amber-400/70",
  running: "bg-emerald-100/80 text-emerald-700 border border-emerald-400/70",
  completed: "bg-sky-100/80 text-sky-700 border border-sky-400/70",
  other: "bg-slate-100/80 text-slate-700 border border-slate-300/80",
};

export const normalizeAiStatus = (status?: string) => {
  const normalized = status?.toLowerCase() ?? "pending";
  if (["pending", "active", "suspended", "disabled", "rejected"].includes(normalized)) {
    return normalized;
  }
  return "pending";
};

export const aiStatusLabels: Record<string, string> = {
  pending: "En attente",
  active: "Active",
  suspended: "Suspendue",
  disabled: "Desactivee",
  rejected: "Refusee",
};

export const aiStatusStyles: Record<string, string> = {
  pending: "bg-amber-100/80 text-amber-700 border border-amber-400/70",
  active: "bg-emerald-100/80 text-emerald-700 border border-emerald-400/70",
  suspended: "bg-sky-100/80 text-sky-700 border border-sky-400/70",
  disabled: "bg-slate-100/80 text-slate-700 border border-slate-300/80",
  rejected: "bg-rose-100/80 text-rose-700 border border-rose-400/70",
};

export const formatDate = (value?: Timestamp | string) => {
  if (!value) {
    return "—";
  }
  if (typeof value === "string") {
    return new Date(value).toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }
  if (typeof value === "object" && value?.seconds) {
    return new Date(value.seconds * 1000).toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }
  return "—";
};

export const formatUserLabel = (user: Utilisateur) => {
  if (user.pseudo) {
    return user.pseudo;
  }
  if (typeof user.mail === "string" && user.mail.length > 0) {
    return user.mail;
  }
  return `Utilisateur ${user.id.slice(0, 5)}`;
};

export const formatLookSummary = (profile: AiProfile) => {
  if (!profile.look) {
    return "Apparence en attente";
  }
  const parts = [
    profile.look.gender && `Genre ${profile.look.gender}`,
    profile.look.skin && `Peau ${profile.look.skin}`,
    profile.look.hair && `Cheveux ${profile.look.hair}`,
    profile.look.outfit && `Tenue ${profile.look.outfit}`,
    profile.look.ethnicity && `Ethnie ${profile.look.ethnicity}`,
  ].filter(Boolean);

  return parts.join(" · ") || "Apparence partiellement renseignée";
};

export const buildLookPayload = (values: Record<string, string>) => {
  const next = Object.entries(values).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      const trimmed = value.trim();
      if (trimmed) {
        acc[key] = trimmed;
      }
      return acc;
    },
    {}
  );
  return Object.keys(next).length ? next : undefined;
};

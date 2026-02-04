'use client';

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  fetchAiProfilesByOwnerRealTime,
  fetchUtilisateurById,
} from "../../../indexFirebase";
import { formatLookSummary } from "../../aiOptions";

type Timestamp = {
  seconds?: number;
  nanoseconds?: number;
};

type AiProfile = {
  id: string;
  name?: string;
  mentality?: string;
  voice?: string;
  voiceRhythm?: string;
  look?: {
    gender?: string;
    skin?: string;
    hair?: string;
    outfit?: string;
    ethnicity?: string;
  };
  status?: string;
  imageUrl?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

type Utilisateur = {
  id: string;
  pseudo?: string;
  mail?: string;
};

const normalizeStatus = (status?: string) => {
  const normalized = status?.toLowerCase() ?? "pending";
  if (["pending", "active", "suspended", "disabled", "rejected"].includes(normalized)) {
    return normalized;
  }
  return "pending";
};

const statusLabels: Record<string, string> = {
  pending: "En attente",
  active: "Active",
  suspended: "Suspendue",
  disabled: "Desactivee",
  rejected: "Refusee",
};

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100/80 text-amber-700 border border-amber-400/70",
  active: "bg-emerald-100/80 text-emerald-700 border border-emerald-400/70",
  suspended: "bg-sky-100/80 text-sky-700 border border-sky-400/70",
  disabled: "bg-slate-100/80 text-slate-700 border border-slate-300/80",
  rejected: "bg-rose-100/80 text-rose-700 border border-rose-400/70",
};

const formatDate = (value?: Timestamp | string) => {
  if (!value) {
    return "—";
  }
  if (typeof value === "string") {
    return new Date(value).toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }
  if (typeof value === "object" && value.seconds) {
    return new Date(value.seconds * 1000).toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }
  return "—";
};

export default function OwnerAiPage() {
  const params = useParams();
  const ownerId = typeof params?.ownerId === "string" ? params.ownerId : "";
  const [owner, setOwner] = useState<Utilisateur | null>(null);
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [aiProfiles, setAiProfiles] = useState<AiProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ownerId) {
      setOwner(null);
      return;
    }
    let isActive = true;
    setOwnerLoading(true);
    fetchUtilisateurById(ownerId)
      .then((data: unknown) => {
        if (isActive) {
          setOwner(data as Utilisateur | null);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        console.error("Impossible de charger le createur", err);
        if (isActive) {
          setOwner(null);
          setError("Créateur introuvable.");
        }
      })
      .finally(() => {
        if (isActive) {
          setOwnerLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId) {
      setAiProfiles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = fetchAiProfilesByOwnerRealTime(
      ownerId,
      (data: unknown) => {
        setAiProfiles(data as AiProfile[]);
        setLoading(false);
        setError(null);
      },
      (err: unknown) => {
        console.error("Impossible de recuperer les IA du createur", err);
        setError("Impossible de recuperer les IA.");
        setLoading(false);
      }
    );

    return () => unsubscribe?.();
  }, [ownerId]);

  const sortedProfiles = useMemo(
    () =>
      [...aiProfiles].sort(
        (a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
      ),
    [aiProfiles]
  );

  const ownerLabel =
    owner?.pseudo ?? owner?.mail ?? (ownerId ? `Créateur ${ownerId.slice(0, 5)}` : "Créateur");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 md:px-6 lg:px-8">
        <header className="space-y-2 rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-900/80 via-slate-900 to-slate-950/80 p-6 shadow-2xl shadow-slate-900/40">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Créateur IA
          </p>
          <h1 className="text-3xl font-semibold">Toutes les IA de {ownerLabel}</h1>
          <p className="text-sm text-slate-400">
            {ownerLoading
              ? "Chargement du profil..."
              : `Connectez-vous pour contacter ${ownerLabel} ou découvrir ses créations.`}
          </p>
          <div className="flex flex-wrap gap-3 text-xs">
            <Link
              href="/ia"
              className="rounded-full border border-slate-800/80 bg-slate-950/60 px-4 py-2 font-semibold text-slate-200 transition hover:border-slate-700"
            >
              Voir le catalogue
            </Link>
          </div>
        </header>

        <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
          {loading ? (
            <p className="text-sm text-slate-400">Chargement des IA...</p>
          ) : error ? (
            <p className="text-sm text-rose-300">{error}</p>
          ) : sortedProfiles.length === 0 ? (
            <p className="text-sm text-slate-400">
              Aucune IA trouvée pour ce créateur.
            </p>
          ) : (
            <div className="space-y-4">
              {sortedProfiles.map((profile) => (
                <div
                  key={profile.id}
                  className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {profile.name ?? `IA ${profile.id.slice(0, 5)}`}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {profile.mentality ?? "Mentalité non définie"} ·{" "}
                        {profile.voice ?? "Voix non définie"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatLookSummary(profile.look)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${statusStyles[normalizeStatus(
                        profile.status
                      )]}`}
                    >
                      {statusLabels[normalizeStatus(profile.status)]}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                    <p>Mis à jour: {formatDate(profile.updatedAt)}</p>
                    <Link
                      href={`/ia/${profile.id}`}
                      className="rounded-full border border-slate-700/80 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:border-slate-500"
                    >
                      Découvrir
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

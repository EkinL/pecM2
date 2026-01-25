'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  auth,
  fetchAiProfileById,
  fetchUtilisateurByIdRealTime,
} from "../../indexFirebase";
import { formatLookSummary } from "../aiOptions";

type Timestamp = {
  seconds?: number;
  nanoseconds?: number;
};

type Profil = {
  id: string;
  mail?: string;
  pseudo?: string;
  role?: string;
  tokens?: number;
};

type AiProfile = {
  id: string;
  ownerId?: string;
  ownerMail?: string;
  name?: string;
  mentality?: string;
  voice?: string;
  voiceRhythm?: string;
  look?: {
    gender?: string;
    skin?: string;
    hair?: string;
    hairColor?: string;
    eyeColor?: string;
    age?: string;
    height?: string;
    bodyType?: string;
    facialHair?: string;
    makeup?: string;
    glasses?: string;
    accessories?: string;
    piercings?: string;
    tattoos?: string;
    scars?: string;
    outfit?: string;
    ethnicity?: string;
    details?: string;
  };
  status?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  [key: string]: unknown;
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
  if (typeof value === "object" && value?.seconds) {
    return new Date(value.seconds * 1000).toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }
  return "—";
};

const toLookPayload = (values: Record<string, string>) => {
  const look = Object.entries(values).reduce<Record<string, string>>((acc, [key, value]) => {
    const trimmed = value.trim();
    if (trimmed) {
      acc[key] = trimmed;
    }
    return acc;
  }, {});

  return Object.keys(look).length ? look : undefined;
};

const resolveCustomValue = (choice: string, custom: string) =>
  choice === "Autre" ? custom : choice;

const resolveChoiceAndCustom = (value: string | undefined, options: string[]) => {
  if (!value) {
    return { choice: "", custom: "" };
  }
  if (options.includes(value)) {
    return { choice: value, custom: "" };
  }
  return { choice: "Autre", custom: value };
};

export default function IaProfilePage() {
  const params = useParams();
  const paramId = (params as { id?: string | string[] }).id;
  const profileId =
    typeof paramId === "string" ? paramId : Array.isArray(paramId) ? paramId[0] : "";

  const [userId, setUserId] = useState<string | null>(null);
  const [authMail, setAuthMail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profil | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [aiProfile, setAiProfile] = useState<AiProfile | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiError, setAiError] = useState<string | null>(null);

  const roleMismatch = Boolean(userId && profile?.role && profile.role !== "client");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
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
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    const unsubscribe = fetchUtilisateurByIdRealTime(userId, (data) => {
      setProfile(data as Profil | null);
      setProfileLoading(false);
    });

    return () => unsubscribe?.();
  }, [userId]);

  useEffect(() => {
    if (!profileId) {
      setAiError("Profil IA introuvable.");
      setAiLoading(false);
      return;
    }

    setAiLoading(true);
    fetchAiProfileById(profileId)
      .then((data) => {
        setAiProfile(data as AiProfile | null);
        setAiError(null);
      })
      .catch(() => {
        setAiError("Impossible de recuperer le profil IA.");
      })
      .finally(() => {
        setAiLoading(false);
      });
  }, [profileId]);

  const isOwner = Boolean(userId && aiProfile?.ownerId && userId === aiProfile.ownerId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 md:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-900/80 via-slate-900 to-slate-950/80 p-6 shadow-2xl shadow-slate-900/40 backdrop-blur">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Profil IA</p>
            <h1 className="text-3xl font-semibold md:text-4xl">
              {aiProfile?.name ?? "IA"}
            </h1>
            <p className="text-sm text-slate-400 md:text-base">
              Personnalite, apparence et actions de reset/sauvegarde.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>{profile?.mail ?? authMail ?? "Compte actif"}</span>
            <span>{profileLoading ? "..." : `${profile?.tokens ?? 0} tokens`}</span>
            <Link
              href="/ia"
              className="rounded-full border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-700"
            >
              Retour au catalogue
            </Link>
          </div>
        </header>

        {aiProfile?.ownerNotification && isOwner && (
          <section className="rounded-3xl border border-amber-400/60 bg-amber-500/5 p-6 text-amber-200">
            <p className="text-sm font-semibold">{aiProfile.ownerNotification}</p>
            <p className="mt-2 text-xs text-amber-100">
              Cette IA est masquée du catalogue public. Modifiez votre description ou contactez un admin pour lever l&apos;avertissement.
            </p>
          </section>
        )}

        {aiLoading ? (
          <section className="rounded-3xl border border-slate-800/80 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
            <p className="text-sm text-slate-400">Chargement du profil...</p>
          </section>
        ) : roleMismatch ? (
          <section className="rounded-3xl border border-slate-800/80 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
            <h2 className="text-lg font-semibold">Acces reserve aux clients</h2>
            <p className="mt-2 text-sm text-slate-400">
              Ce profil est reserve aux comptes client.
            </p>
            <Link
              href="/demandes/client"
              className="mt-4 inline-flex items-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Aller aux demandes client
            </Link>
          </section>
        ) : aiError || !aiProfile ? (
          <section className="rounded-3xl border border-slate-800/80 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
            <p className="text-sm text-rose-300">{aiError ?? "Profil introuvable."}</p>
          </section>
        ) : (
          <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <article className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Resume IA</h2>
                  <p className="text-sm text-slate-400">
                    {formatLookSummary(aiProfile.look)}
                  </p>
                </div>
                <div className="text-xs text-slate-400">
                  Mis a jour {formatDate(aiProfile.updatedAt)}
                </div>
              </div>

              <div className="mt-4 space-y-2 text-sm text-slate-400">
                <p>Mentalite: {aiProfile.mentality ?? "Non definie"}</p>
                <p>Voix: {aiProfile.voice ?? "Non definie"}</p>
                <p>Rythme vocal: {aiProfile.voiceRhythm ?? "Non defini"}</p>
              </div>

              <div className="mt-4 text-xs text-slate-500">
                {isOwner
                  ? "La modification et le reset sont désactivés ici ; seules des suppressions depuis 'Mes IA' sont possibles."
                  : "Lecture seule : contactez le propriétaire ou un admin pour toute action."}
              </div>

            </article>

            <article className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Configurateur IA</h2>
                <span className="text-xs text-slate-400">Lecture seule</span>
              </div>

              <div className="mt-5 space-y-3 text-sm text-slate-400">
                <p>Nom: {aiProfile.name ?? "Non defini"}</p>
                <p>Mentalite: {aiProfile.mentality ?? "Non definie"}</p>
                <p>Voix: {aiProfile.voice ?? "Non definie"}</p>
                <p>Rythme vocal: {aiProfile.voiceRhythm ?? "Non defini"}</p>
                <p>Apparence: {formatLookSummary(aiProfile.look)}</p>
                <p>
                  Details physiques:{" "}
                  {aiProfile.look?.details?.trim() ? aiProfile.look.details : "Non definis"}
                </p>
              </div>

              <div className="mt-4 text-xs text-slate-500">
                {isOwner
                  ? "La modification et le reset sont désactivés ici ; la suppression se passe depuis « Mes IA »."
                  : "Lecture seule : contactez le propriétaire ou un admin pour toute autre action."}
              </div>
            </article>
          </section>
        )}
      </div>
    </div>
  );
}

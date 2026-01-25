'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  auth,
  fetchAiProfilesRealTime,
  fetchConversationsRealTime,
  fetchUtilisateurById,
  fetchUtilisateursRealTime,
  deleteConversationWithMessages,
  signOutUser,
  updateConversationStatus,
} from "../../indexFirebase";

type Timestamp = {
  seconds?: number;
  nanoseconds?: number;
};

type Utilisateur = {
  id: string;
  mail?: string;
  pseudo?: string;
};

type Conversation = {
  id: string;
  userId?: string;
  aiId?: string;
  status?: string;
  messageCount?: number;
  updatedAt?: Timestamp;
  createdAt?: Timestamp;
};

type AiProfile = {
  id: string;
  name?: string;
};

const statusBucket = (status?: string) => {
  const normalized = status?.toLowerCase() ?? "";
  if (["pending", "nouveau", "queued", "en attente", ""].includes(normalized)) {
    return "pending";
  }
  if (["in progress", "en cours", "ongoing", "matched", "actif", "accepted"].includes(normalized)) {
    return "running";
  }
  if (["completed", "done", "termine", "terminee", "closed", "ended", "cancelled"].includes(normalized)) {
    return "completed";
  }
  return "other";
};

const statusLabels: Record<string, string> = {
  pending: "Ouverte",
  running: "Ouverte",
  completed: "Fermee",
  other: "Ouverte",
};

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100/80 text-amber-700 border border-amber-400/70",
  running: "bg-emerald-100/80 text-emerald-700 border border-emerald-400/70",
  completed: "bg-sky-100/80 text-sky-700 border border-sky-400/70",
  other: "bg-slate-100/80 text-slate-700 border border-slate-300/80",
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

const formatUserLabel = (user?: Utilisateur) => {
  if (!user) {
    return "Utilisateur inconnu";
  }
  if (user.pseudo) {
    return user.pseudo;
  }
  if (user.mail) {
    return user.mail;
  }
  return `Utilisateur ${user.id.slice(0, 5)}`;
};

export default function AdminConversationsPage() {
  const router = useRouter();
  const [adminChecking, setAdminChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<null | { uid: string; mail?: string | null }>(
    null
  );

  const [users, setUsers] = useState<Utilisateur[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [aiProfiles, setAiProfiles] = useState<AiProfile[]>([]);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiError, setAiError] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversationStatusFilter, setConversationStatusFilter] = useState("all");
  const [conversationPage, setConversationPage] = useState(1);
  const [conversationAction, setConversationAction] = useState<{
    id: string;
    type: "open" | "close" | "delete";
  } | null>(null);
  const [conversationActionError, setConversationActionError] = useState<string | null>(null);
  const [conversationActionSuccess, setConversationActionSuccess] = useState<string | null>(null);
  const [closeConversationDialog, setCloseConversationDialog] = useState<null | {
    id: string;
    label: string;
  }>(null);
  const [deleteConversationDialog, setDeleteConversationDialog] = useState<null | {
    id: string;
    label: string;
  }>(null);
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAdminUser(null);
        setIsAdmin(false);
        setAdminChecking(false);
        router.replace("/auth");
        return;
      }

      setAdminUser({ uid: user.uid, mail: user.email });

      try {
        const profile = await fetchUtilisateurById(user.uid);
        if (profile?.role === "admin") {
          setIsAdmin(true);
          setAdminError(null);
        } else {
          setIsAdmin(false);
          setAdminError("Acces reserve aux admins.");
        }
      } catch (error) {
        console.error("Erreur lors de la verification du role admin", error);
        setIsAdmin(false);
        setAdminError("Impossible de verifier le role admin.");
      } finally {
        setAdminChecking(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const unsubUsers = fetchUtilisateursRealTime(
      (data) => {
        setUsers(data as Utilisateur[]);
        setUsersLoading(false);
        setUsersError(null);
      },
      () => {
        setUsersError("Impossible de recuperer les utilisateurs.");
        setUsersLoading(false);
      }
    );
    const unsubAiProfiles = fetchAiProfilesRealTime(
      (data) => {
        setAiProfiles(data as AiProfile[]);
        setAiLoading(false);
        setAiError(null);
      },
      () => {
        setAiError("Impossible de recuperer les IA.");
        setAiLoading(false);
      }
    );
    const unsubConversations = fetchConversationsRealTime(
      (data) => {
        setConversations(data as Conversation[]);
        setConversationsLoading(false);
        setConversationsError(null);
      },
      () => {
        setConversationsError("Impossible de recuperer les conversations.");
        setConversationsLoading(false);
      }
    );

    return () => {
      unsubUsers?.();
      unsubAiProfiles?.();
      unsubConversations?.();
    };
  }, [isAdmin]);

  useEffect(() => {
    setConversationPage(1);
  }, [conversationSearch, conversationStatusFilter]);

  const usersById = useMemo(() => {
    const map: Record<string, Utilisateur> = {};
    users.forEach((user) => {
      map[user.id] = user;
    });
    return map;
  }, [users]);

  const aiLookup = useMemo(() => {
    const map: Record<string, AiProfile> = {};
    aiProfiles.forEach((profile) => {
      if (profile.id) {
        map[profile.id] = profile;
      }
    });
    return map;
  }, [aiProfiles]);

  const filteredConversations = useMemo(() => {
    const search = conversationSearch.trim().toLowerCase();
    return [...conversations]
      .sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0))
      .filter((conversation) => {
        const bucket = statusBucket(conversation.status);
        if (conversationStatusFilter !== "all" && bucket !== conversationStatusFilter) {
          return false;
        }
        if (!search) {
          return true;
        }
        const owner = conversation.userId ? usersById[conversation.userId] : undefined;
        const aiRef = conversation.aiId ? aiLookup[conversation.aiId] : undefined;
        const haystack = [
          conversation.id,
          conversation.status,
          owner ? formatUserLabel(owner) : "",
          aiRef ? aiRef.name ?? aiRef.id : conversation.aiId ?? "",
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(search);
      });
  }, [aiLookup, conversationSearch, conversationStatusFilter, conversations, usersById]);

  const conversationsPageSize = 10;
  const totalConversationPages = Math.max(
    1,
    Math.ceil(filteredConversations.length / conversationsPageSize)
  );
  const currentConversationPage = Math.min(conversationPage, totalConversationPages);
  const paginatedConversations = useMemo(() => {
    const start = (currentConversationPage - 1) * conversationsPageSize;
    return filteredConversations.slice(start, start + conversationsPageSize);
  }, [currentConversationPage, filteredConversations]);

  const handleSignOut = async () => {
    setSignOutError(null);
    setSignOutLoading(true);
    try {
      await signOutUser();
      router.replace("/auth");
    } catch (error) {
      console.error("Erreur lors de la deconnexion", error);
      setSignOutError("Impossible de se deconnecter.");
    } finally {
      setSignOutLoading(false);
    }
  };

  const handleOpenConversation = async (conversationId: string) => {
    setConversationActionError(null);
    setConversationActionSuccess(null);
    setConversationAction({ id: conversationId, type: "open" });

    try {
      await updateConversationStatus({
        conversationId,
        status: "running",
        note: "opened by admin",
      });
      setConversationActionSuccess("Conversation ouverte.");
    } catch (error) {
      console.error("Erreur lors de l'ouverture", error);
      setConversationActionError("Impossible d'ouvrir la conversation.");
    } finally {
      setConversationAction(null);
    }
  };

  const handleRequestCloseConversation = (conversationId: string, label: string) => {
    setCloseConversationDialog({ id: conversationId, label });
  };

  const handleConfirmCloseConversation = async () => {
    if (!closeConversationDialog) {
      return;
    }

    const { id } = closeConversationDialog;
    setCloseConversationDialog(null);
    await handleCloseConversation(id);
  };

  const handleCloseConversation = async (conversationId: string) => {
    setConversationActionError(null);
    setConversationActionSuccess(null);
    setConversationAction({ id: conversationId, type: "close" });

    try {
      await updateConversationStatus({
        conversationId,
        status: "completed",
        note: "closed by admin",
      });
      setConversationActionSuccess("Conversation fermee.");
    } catch (error) {
      console.error("Erreur lors de la fermeture", error);
      setConversationActionError("Impossible de fermer la conversation.");
    } finally {
      setConversationAction(null);
    }
  };

  const handleRequestDeleteConversation = (conversationId: string, label: string) => {
    setDeleteConversationDialog({ id: conversationId, label });
  };

  const handleConfirmDeleteConversation = async () => {
    if (!deleteConversationDialog) {
      return;
    }

    const { id } = deleteConversationDialog;
    setDeleteConversationDialog(null);
    await handleDeleteConversation(id);
  };

  const handleDeleteConversation = async (conversationId: string) => {
    setConversationActionError(null);
    setConversationActionSuccess(null);
    setConversationAction({ id: conversationId, type: "delete" });

    try {
      await deleteConversationWithMessages({
        conversationId,
        adminId: adminUser?.uid,
        adminMail: adminUser?.mail ?? undefined,
      });
      setConversationActionSuccess("Conversation supprimee.");
    } catch (error) {
      console.error("Erreur lors de la suppression", error);
      setConversationActionError("Impossible de supprimer la conversation.");
    } finally {
      setConversationAction(null);
    }
  };

  if (adminChecking) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-12">
          <p className="text-sm text-slate-400">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-12">
          <div className="w-full max-w-lg space-y-4 rounded-3xl border border-slate-800/80 bg-slate-900/70 p-8 shadow-2xl">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Acces refuse</p>
            <h1 className="text-2xl font-semibold">Panel admin uniquement</h1>
            <p className="text-sm text-slate-400">
              {adminError ?? "Ce compte n'a pas les droits admin."}
            </p>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signOutLoading}
              className="w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
            >
              {signOutLoading ? "Deconnexion..." : "Se deconnecter"}
            </button>
            {signOutError && <p className="text-xs text-rose-300">{signOutError}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 md:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-900/80 via-slate-900 to-slate-950/80 p-6 shadow-2xl shadow-slate-900/40 backdrop-blur">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Panel admin</p>
            <h1 className="text-3xl font-semibold md:text-4xl">Conversations</h1>
            <p className="text-sm text-slate-400 md:text-base">
              Filtrer, valider et ouvrir les conversations utilisateurs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>{adminUser?.mail ?? "Compte admin"}</span>
            <Link
              href="/"
              className="rounded-full border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-700"
            >
              Retour dashboard
            </Link>
          </div>
        </header>

        <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Liste des conversations</h2>
              <p className="text-sm text-slate-400">
                Recherche par client, IA ou statut.
              </p>
            </div>
            <span className="text-xs text-slate-400">
              {conversationsLoading ? "Chargement..." : `${filteredConversations.length} resultats`}
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1.3fr_0.7fr]">
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wide text-slate-400">
                Recherche
              </label>
              <input
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
                className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600"
                placeholder="Utilisateur, IA, statut..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wide text-slate-400">
                Filtre statut
              </label>
              <select
                value={conversationStatusFilter}
                onChange={(event) => setConversationStatusFilter(event.target.value)}
                className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
              >
                <option value="all">Tous</option>
                <option value="pending">En attente</option>
                <option value="running">En cours</option>
                <option value="completed">Terminee</option>
                <option value="other">Autre</option>
              </select>
            </div>
          </div>

          {(usersError || aiError || conversationsError) && (
            <p className="mt-3 text-sm text-rose-300">
              {usersError ?? aiError ?? conversationsError}
            </p>
          )}
          {(conversationActionError || conversationActionSuccess) && (
            <div className="mt-4 text-xs">
              {conversationActionError && (
                <p className="text-rose-300">{conversationActionError}</p>
              )}
              {conversationActionSuccess && (
                <p className="text-emerald-300">{conversationActionSuccess}</p>
              )}
            </div>
          )}

          <div className="mt-6 space-y-3">
            {conversationsLoading || usersLoading || aiLoading ? (
              <p className="text-sm text-slate-400">Chargement des conversations...</p>
            ) : filteredConversations.length === 0 ? (
              <p className="text-sm text-slate-400">Aucune conversation pour ce filtre.</p>
            ) : (
              paginatedConversations.map((conversation) => {
                const bucket = statusBucket(conversation.status);
                const owner = conversation.userId ? usersById[conversation.userId] : undefined;
                const aiRef = conversation.aiId ? aiLookup[conversation.aiId] : undefined;
                const isBusy = conversationAction?.id === conversation.id;
                const canAccept =
                  bucket === "pending" || bucket === "other" || bucket === "completed";
                const canCancel = bucket !== "completed";
                return (
                  <div
                    key={conversation.id}
                    className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">
                        {owner ? formatUserLabel(owner) : "Conversation anonyme"}
                      </p>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${statusStyles[bucket]}`}
                      >
                        {statusLabels[bucket]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      IA · {aiRef ? aiRef.name ?? `IA ${aiRef.id.slice(0, 5)}` : `ID ${conversation.aiId?.slice(0, 5) ?? "?"}`}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Messages : {conversation.messageCount ?? 0} · Maj {formatDate(conversation.updatedAt)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/conversations/${conversation.id}`}
                        className="rounded-lg border border-slate-700/70 bg-slate-900/40 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
                      >
                        Voir les messages
                      </Link>
                      {canAccept && (
                        <button
                          type="button"
                          onClick={() => handleOpenConversation(conversation.id)}
                          disabled={isBusy}
                          className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
                        >
                          {isBusy && conversationAction?.type === "open"
                            ? "Ouverture..."
                            : bucket === "completed"
                              ? "Reouvrir"
                              : "Ouvrir"}
                        </button>
                      )}
                      {canCancel && (
                        <button
                          type="button"
                          onClick={() =>
                            handleRequestCloseConversation(
                              conversation.id,
                              owner ? formatUserLabel(owner) : "Conversation anonyme"
                            )
                          }
                          disabled={isBusy}
                          className="rounded-lg border border-rose-400/60 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:border-rose-300 disabled:cursor-not-allowed"
                        >
                          {isBusy && conversationAction?.type === "close"
                            ? "Fermeture..."
                            : "Fermer"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          handleRequestDeleteConversation(
                            conversation.id,
                            owner ? formatUserLabel(owner) : "Conversation anonyme"
                          )
                        }
                        disabled={isBusy}
                        className="rounded-lg border border-rose-500/70 bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:border-rose-400 disabled:cursor-not-allowed"
                      >
                        {isBusy && conversationAction?.type === "delete"
                          ? "Suppression..."
                          : "Supprimer"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {!conversationsLoading && filteredConversations.length > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setConversationPage((prev) => Math.max(1, prev - 1))}
                disabled={currentConversationPage === 1}
                className="rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-600 disabled:cursor-not-allowed disabled:text-slate-600"
              >
                Page precedente
              </button>
              <button
                type="button"
                onClick={() =>
                  setConversationPage((prev) => Math.min(totalConversationPages, prev + 1))
                }
                disabled={currentConversationPage === totalConversationPages}
                className="rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-600 disabled:cursor-not-allowed disabled:text-slate-600"
              >
                Page suivante
              </button>
            </div>
          )}
        </section>
      </div>
      {closeConversationDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/95 p-6 text-slate-100 shadow-2xl">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
              Confirmation
            </p>
            <h3 className="mt-2 text-lg font-semibold">Fermer la conversation ?</h3>
            <p className="mt-1 text-sm text-slate-400">
              {closeConversationDialog.label}
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCloseConversationDialog(null)}
                className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmCloseConversation}
                className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-rose-400"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteConversationDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/95 p-6 text-slate-100 shadow-2xl">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
              Confirmation
            </p>
            <h3 className="mt-2 text-lg font-semibold">Supprimer la conversation ?</h3>
            <p className="mt-1 text-sm text-slate-400">
              {deleteConversationDialog.label}
            </p>
            <p className="mt-2 text-xs text-rose-200">
              Cette action supprime aussi tous les messages associes.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConversationDialog(null)}
                className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteConversation}
                className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-rose-400"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, fetchUtilisateurByIdRealTime, signOutUser } from "../indexFirebase";

const isActivePath = (pathname: string, href: string, exact?: boolean) => {
  if (exact) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
};

export default function TopNav() {
  const pathname = usePathname() ?? "";
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [signOutLoading, setSignOutLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setUserId(null);
        setRole(null);
        return;
      }
      setUserId(user.uid);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) {
      setRole(null);
      return;
    }

    const unsubscribe = fetchUtilisateurByIdRealTime(
      userId,
      (data) => {
        setRole(typeof data?.role === "string" ? data.role : null);
      },
      () => {
        setRole(null);
      }
    );

    return () => unsubscribe?.();
  }, [userId]);

  const handleSignOut = async () => {
    setSignOutLoading(true);
    try {
      await signOutUser();
    } finally {
      setSignOutLoading(false);
    }
  };

  const navItems = useMemo(() => {
    const normalizedRole = role === "prestataire" ? "client" : role;
    if (normalizedRole === "admin") {
      return [
        { href: "/", label: "Dashboard", exact: true },
        { href: "/admin/conversations", label: "Conversations" },
        { href: "/demandes/prestataire", label: "Demandes admin" },
        { href: "/admin/ia", label: "Validation IA" },
        { href: "/admin/tokens", label: "Tarifs tokens" },
      ];
    }
    if (normalizedRole === "client") {
      return [
        { href: "/", label: "Accueil", exact: true },
        { href: "/ia", label: "Catalogue IA" },
        { href: "/demandes/client", label: "Demandes client" },
        { href: "/historique/client", label: "Historique" },
        { href: "/ia/create", label: "Creer IA" },
      ];
    }
    return [{ href: "/auth", label: "Connexion", exact: true }];
  }, [role]);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-emerald-400/40 bg-emerald-500/10 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">
            P2
          </div>
          <div className="hidden text-xs uppercase tracking-[0.3em] text-slate-400 sm:block">
            PECM2
          </div>
        </div>

        <div className="flex-1 overflow-x-auto">
          <div className="flex items-center gap-2 sm:justify-center">
            {navItems.map((item) => {
              const isActive = isActivePath(pathname, item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    isActive
                      ? "border-emerald-400/70 bg-emerald-500/20 text-emerald-200"
                      : "border-slate-800/80 bg-slate-950/40 text-slate-300 hover:border-slate-600"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {userId ? (
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signOutLoading}
              className="rounded-full border border-slate-800/80 bg-slate-950/40 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-600 disabled:cursor-not-allowed disabled:text-slate-500"
            >
              {signOutLoading ? "Deconnexion..." : "Se deconnecter"}
            </button>
          ) : null}
          <span className="hidden text-xs text-slate-400 md:block">
            Modules unifies
          </span>
        </div>
      </div>
    </nav>
  );
}

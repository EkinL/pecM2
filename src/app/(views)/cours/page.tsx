'use client';

import { useEffect, useState } from "react";
import { fetchCours } from "../../indexFirebase";

type Utilisateur = {
  id: string;
  [key: string]: unknown;
};

const formatUtilisateurLabel = (utilisateur: Utilisateur) => {
  const fallback = `Utilisateur ${utilisateur.id}`;
  const nom = (utilisateur.nom || utilisateur.name) as string | undefined;
  return nom ?? fallback;
};

const formatHours = (hours: unknown) => {
  if (typeof hours === "number" && Number.isFinite(hours)) {
    return `${hours}`;
  }
  if (typeof hours === "string") {
    const trimmed = hours.trim();
    return trimmed.length ? trimmed : null;
  }
  return null;
};

export default function Home() {
  const [cours, setCours] = useState<Utilisateur[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadCours = async () => {
      try {
        const data = (await fetchCours()) as Utilisateur[];
        if (isMounted) {
          setCours(data);
        }
      } catch (fetchError) {
        console.error("Impossible de récupérer les cours.", fetchError);
        if (isMounted) {
          setError("Impossible de récupérer les cours.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadCours();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        <section className="w-full max-w-xl rounded-2xl border border-black/10 dark:border-white/20 bg-white/60 dark:bg-black/40 p-6 shadow-lg space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">
            Cours Firestore
          </h2>
          {isLoading && (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Chargement des Cours...
            </p>
          )}
          {error && (
            <p className="text-sm text-red-500">
              {error}
            </p>
          )}
          {!isLoading && !error && (
            <ul className="space-y-2">
              {cours.length === 0 && (
                <li className="text-sm text-gray-600 dark:text-gray-300">
                  Aucun cours dans la collection.
                </li>
              )}
              {cours.map((cour) => {
                const hoursLabel = formatHours(cour.hours);

                return (
                  <li
                    key={cour.id}
                    className="rounded-lg border border-black/5 dark:border-white/10 px-4 py-2"
                  >
                    <p className="text-sm font-medium">
                      {typeof cour.coursName === 'string' && cour.coursName.length > 0
                        ? cour.coursName
                        : formatUtilisateurLabel(cour)}
                    </p>
                    {hoursLabel ? (
                      <p className="text-sm font-medium">
                        {hoursLabel} heures
                      </p>
                    ) : null}
                    <p className="text-xs text-gray-500">
                      Nom du prof: {cour.prof}
                    </p>
                    <p className="text-xs text-gray-500">
                      ID: {cour.id}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

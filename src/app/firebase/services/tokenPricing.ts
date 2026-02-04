import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import {
  normalizeCountryPricingMap,
  normalizeOptionalNumber,
  normalizeOptionalTokenPricing,
  omitUndefinedFields,
  sanitizeOptionalString,
} from "../helpers";
import { settings } from "../collections";
import { auth } from "../init";

export const fetchTokenPricingSettingsRealTime = (onData: any, onError: any) => {
  try {
    const docRef = doc(settings, "tokenPricingIdf");
    return onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          onData?.(null);
          return;
        }
        onData?.({ id: snapshot.id, ...snapshot.data() });
      },
      (error) => {
        console.error("Erreur du flux temps reel token pricing", error);
        onError?.(error);
      }
    );
  } catch (err) {
    console.error("Impossible d'ecouter les tarifs tokens", err);
    onError?.(err);
    return () => {};
  }
};

export const updateTokenPricingSettings = async ({ base, countries, adminId, adminMail }: any) => {
  const normalizedBase = normalizeOptionalTokenPricing(base);
  const normalizedCountries = normalizeCountryPricingMap(countries);
  const docRef = doc(settings, "tokenPricingIdf");

  if (!normalizedBase) {
    throw new Error("Tarifs de base invalides.");
  }

  return setDoc(
    docRef,
    {
      base: normalizedBase,
      countries: normalizedCountries,
      updatedAt: serverTimestamp(),
      updatedBy: sanitizeOptionalString(adminId),
      updatedMail: sanitizeOptionalString(adminMail),
    },
    { merge: true }
  );
};

export const getTokenPrice = async ({ lat, lng, currency, zoneId }: any = {}) => {
  const payload = omitUndefinedFields({
    lat: normalizeOptionalNumber(lat),
    lng: normalizeOptionalNumber(lng),
    currency: sanitizeOptionalString(currency),
    zoneId: sanitizeOptionalString(zoneId),
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.warn("Impossible d'obtenir le token utilisateur pour la tarification", error);
    }
  }

  const response = await fetch("/api/token-price", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const responseBody = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      responseBody && typeof responseBody === "object" && "error" in responseBody
        ? responseBody.error
        : response.statusText;
    throw new Error(
      typeof message === "string" && message.length
        ? message
        : "Erreur lors de la récupération du tarif dynamique."
    );
  }

  return responseBody ?? null;
};

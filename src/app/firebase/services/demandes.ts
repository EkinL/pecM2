import { addDoc, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { demandes, utilisateurs } from "../collections";
import {
  createRealtimeListener,
  mapSnapshot,
  normalizeOptionalLocation,
  normalizeOptionalNumber,
  normalizeRequiredString,
  omitUndefinedFields,
  sanitizeOptionalString,
  pickRandomItem,
} from "../helpers";

export const fetchDemandesRealTime = (onData, onError) =>
  createRealtimeListener(demandes, onData, onError, "demandes");

export const fetchDemandesForClientRealTime = (clientId, onData, onError) => {
  try {
    const normalizedId = normalizeRequiredString(clientId, "Client ID");
    const ref = query(demandes, where("clientId", "==", normalizedId));
    return createRealtimeListener(ref, onData, onError, "demandes client");
  } catch (err) {
    console.error("Impossible d'écouter les demandes client", err);
    onError?.(err);
    return () => {};
  }
};

export const fetchDemandesForPrestataireRealTime = (prestataireId, onData, onError) => {
  try {
    const normalizedId = normalizeRequiredString(prestataireId, "Client ID");
    const ref = query(demandes, where("prestataireId", "==", normalizedId));
    return createRealtimeListener(ref, onData, onError, "demandes client");
  } catch (err) {
    console.error("Impossible d'écouter les demandes client", err);
    onError?.(err);
    return () => {};
  }
};

export const addDemande = async ({
  clientId,
  clientMail,
  clientPseudo,
  title,
  description,
  category,
  budget,
  city,
  availability,
  location,
}) => {
  const normalizedClientId = normalizeRequiredString(clientId, "Client ID");
  const normalizedTitle = normalizeRequiredString(title, "Titre");
  const normalizedDescription = normalizeRequiredString(description, "Description");
  const normalizedLocation = normalizeOptionalLocation(location);

  const prestatairesSnapshot = await getDocs(
    query(utilisateurs, where("role", "in", ["client", "admin"]))
  );
  const prestataires = mapSnapshot(prestatairesSnapshot);
  const matchedPrestataire =
    prestataires.length > 0 ? pickRandomItem(prestataires) : undefined;

  const payload = {
    clientId: normalizedClientId,
    clientMail: sanitizeOptionalString(clientMail),
    clientPseudo: sanitizeOptionalString(clientPseudo),
    title: normalizedTitle,
    description: normalizedDescription,
    category: sanitizeOptionalString(category),
    budget: normalizeOptionalNumber(budget),
    city: sanitizeOptionalString(city),
    availability: sanitizeOptionalString(availability),
    location: normalizedLocation,
    locationUpdatedAt: normalizedLocation ? serverTimestamp() : undefined,
    prestataireId: matchedPrestataire?.id,
    prestatairePseudo: sanitizeOptionalString(matchedPrestataire?.pseudo),
    prestataireMail: sanitizeOptionalString(matchedPrestataire?.mail),
    status: matchedPrestataire ? "matched" : "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  return addDoc(demandes, omitUndefinedFields(payload));
};

export const updateDemandeLocation = async ({ demandeId, location }) => {
  const normalizedDemandeId = normalizeRequiredString(demandeId, "Demande ID");
  const normalizedLocation = normalizeOptionalLocation(location);

  if (!normalizedLocation) {
    throw new Error("Localisation invalide.");
  }

  return updateDoc(doc(demandes, normalizedDemandeId), {
    location: normalizedLocation,
    locationUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const acceptDemande = async ({ demandeId, prestataireId }) => {
  const normalizedDemandeId = normalizeRequiredString(demandeId, "Demande ID");
  const normalizedPrestataireId = normalizeRequiredString(prestataireId, "Prestataire ID");

  return updateDoc(doc(demandes, normalizedDemandeId), {
    status: "accepted",
    prestataireId: normalizedPrestataireId,
    acceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const cancelDemande = async ({ demandeId, reason }) => {
  const normalizedDemandeId = normalizeRequiredString(demandeId, "Demande ID");

  return updateDoc(doc(demandes, normalizedDemandeId), {
    status: "cancelled",
    cancelReason: sanitizeOptionalString(reason),
    cancelledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

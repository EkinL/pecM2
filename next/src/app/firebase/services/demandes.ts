import { addDoc, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { demandes, utilisateurs } from '../collections';
import {
  createRealtimeListener,
  mapSnapshot,
  normalizeOptionalLocation,
  normalizeOptionalNumber,
  normalizeRequiredString,
  omitUndefinedFields,
  sanitizeOptionalString,
  pickRandomItem,
} from '../helpers';
import {
  isAiDemandeRequest,
  normalizeDemandeRequestType,
  type DemandeAiPayload,
  type DemandeRequestType,
} from '../../demandes/types';

const toSanitizedPayload = (payload: unknown): DemandeAiPayload | undefined => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }

  const sanitize = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : undefined;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (Array.isArray(value)) {
      const items = value
        .map((item) => sanitize(item))
        .filter((item) => item !== undefined);
      return items.length ? items : undefined;
    }
    if (value && typeof value === 'object') {
      const objectEntries = Object.entries(value as Record<string, unknown>)
        .map(([key, nestedValue]) => [key, sanitize(nestedValue)] as const)
        .filter(([, nestedValue]) => nestedValue !== undefined);
      return objectEntries.length ? Object.fromEntries(objectEntries) : undefined;
    }
    return undefined;
  };

  const entries = Object.entries(payload as Record<string, unknown>)
    .map(([key, value]) => [key, sanitize(value)] as const)
    .filter(([, value]) => value !== undefined);

  return entries.length ? (Object.fromEntries(entries) as DemandeAiPayload) : undefined;
};

const pickMatchedPrestataire = async ({ prioritizeAdmin }: { prioritizeAdmin: boolean }) => {
  if (prioritizeAdmin) {
    const adminsSnapshot = await getDocs(query(utilisateurs, where('role', '==', 'admin')));
    const admins = mapSnapshot(adminsSnapshot);
    if (admins.length > 0) {
      return pickRandomItem(admins);
    }
  }

  const prestatairesSnapshot = await getDocs(
    query(utilisateurs, where('role', 'in', ['client', 'admin'])),
  );
  const prestataires = mapSnapshot(prestatairesSnapshot);
  return prestataires.length > 0 ? pickRandomItem(prestataires) : undefined;
};

export const fetchDemandesRealTime = (onData: any, onError: any) =>
  createRealtimeListener(demandes, onData, onError, 'demandes');

export const fetchDemandesForClientRealTime = (clientId: any, onData: any, onError: any) => {
  try {
    const normalizedId = normalizeRequiredString(clientId, 'Client ID');
    const ref = query(demandes, where('clientId', '==', normalizedId));
    return createRealtimeListener(ref, onData, onError, 'demandes client');
  } catch (err) {
    console.error("Impossible d'écouter les demandes client", err);
    onError?.(err);
    return () => {};
  }
};

export const fetchDemandesForPrestataireRealTime = (
  prestataireId: any,
  onData: any,
  onError: any,
) => {
  try {
    const normalizedId = normalizeRequiredString(prestataireId, 'Client ID');
    const ref = query(demandes, where('prestataireId', '==', normalizedId));
    return createRealtimeListener(ref, onData, onError, 'demandes client');
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
  aiId,
  aiName,
  requestType,
  payload: aiPayloadInput,
}: any) => {
  const normalizedClientId = normalizeRequiredString(clientId, 'Client ID');
  const normalizedTitle = normalizeRequiredString(title, 'Titre');
  const normalizedDescription = normalizeRequiredString(description, 'Description');
  const normalizedLocation = normalizeOptionalLocation(location);
  const normalizedRequestType = normalizeDemandeRequestType(requestType);
  const normalizedPayload = toSanitizedPayload(aiPayloadInput);
  const isAiRequest =
    isAiDemandeRequest(normalizedRequestType) ||
    Boolean(sanitizeOptionalString(aiId) || sanitizeOptionalString(aiName) || normalizedPayload);

  const matchedPrestataire = await pickMatchedPrestataire({ prioritizeAdmin: isAiRequest });

  const demandePayload = {
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
    aiId: sanitizeOptionalString(aiId),
    aiName: sanitizeOptionalString(aiName),
    requestType: normalizedRequestType as DemandeRequestType,
    payload: normalizedPayload,
    prestataireId: matchedPrestataire?.id,
    prestatairePseudo: sanitizeOptionalString(matchedPrestataire?.pseudo),
    prestataireMail: sanitizeOptionalString(matchedPrestataire?.mail),
    status: matchedPrestataire ? 'matched' : 'pending',
    matchedAt: matchedPrestataire ? serverTimestamp() : undefined,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  return addDoc(demandes, omitUndefinedFields(demandePayload));
};

export const updateDemandeLocation = async ({ demandeId, location }: any) => {
  const normalizedDemandeId = normalizeRequiredString(demandeId, 'Demande ID');
  const normalizedLocation = normalizeOptionalLocation(location);

  if (!normalizedLocation) {
    throw new Error('Localisation invalide.');
  }

  return updateDoc(doc(demandes, normalizedDemandeId), {
    location: normalizedLocation,
    locationUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const acceptDemande = async ({ demandeId, prestataireId }: any) => {
  const normalizedDemandeId = normalizeRequiredString(demandeId, 'Demande ID');
  const normalizedPrestataireId = normalizeRequiredString(prestataireId, 'Prestataire ID');

  return updateDoc(doc(demandes, normalizedDemandeId), {
    status: 'accepted',
    prestataireId: normalizedPrestataireId,
    acceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const cancelDemande = async ({ demandeId, reason }: any) => {
  const normalizedDemandeId = normalizeRequiredString(demandeId, 'Demande ID');

  return updateDoc(doc(demandes, normalizedDemandeId), {
    status: 'cancelled',
    cancelReason: sanitizeOptionalString(reason),
    cancelledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const updateDemandeAdminNote = async ({ demandeId, adminNote }: any) => {
  const normalizedDemandeId = normalizeRequiredString(demandeId, 'Demande ID');
  return updateDoc(doc(demandes, normalizedDemandeId), {
    adminNote: sanitizeOptionalString(adminNote),
    updatedAt: serverTimestamp(),
  });
};

export const attachDemandeAiProfile = async ({ demandeId, aiId, aiName }: any) => {
  const normalizedDemandeId = normalizeRequiredString(demandeId, 'Demande ID');
  const normalizedAiId = normalizeRequiredString(aiId, 'IA ID');

  return updateDoc(doc(demandes, normalizedDemandeId), {
    aiId: normalizedAiId,
    aiName: sanitizeOptionalString(aiName),
    updatedAt: serverTimestamp(),
  });
};

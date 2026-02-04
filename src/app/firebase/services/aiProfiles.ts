import {
  addDoc,
  arrayUnion,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  where,
  increment,
} from 'firebase/firestore';
import { auth, firestore } from '../init';
import { aiEvaluations, adminLogs, conversations, iaProfiles } from '../collections';
import { deleteConversationWithMessages } from './conversations';
import {
  createAdminLogPayload,
  createRealtimeListener,
  normalizeAccessTypeValue,
  normalizeOptionalLook,
  normalizeOptionalNumber,
  normalizeOptionalStringArray,
  normalizeRequiredString,
  normalizeVisibilityValue,
  omitUndefinedFields,
  sanitizeOptionalString,
} from '../helpers';

export const fetchAiProfilesRealTime = (onData: any, onError: any) =>
  createRealtimeListener(iaProfiles, onData, onError, 'profils IA');

export const fetchAiProfilesByOwnerRealTime = (ownerId: any, onData: any, onError: any) => {
  try {
    const normalizedId = normalizeRequiredString(ownerId, 'Owner ID');
    const ref = query(iaProfiles, where('ownerId', '==', normalizedId));
    return createRealtimeListener(ref, onData, onError, 'profils IA owner');
  } catch (err) {
    console.error("Impossible d'écouter les IA de l'auteur", err);
    onError?.(err);
    return () => {};
  }
};

export const fetchAiEvaluationsRealTime = (onData: any, onError: any) =>
  createRealtimeListener(aiEvaluations, onData, onError, 'evaluations IA');

export const fetchAiProfileById = async (profileId: any) => {
  try {
    const normalizedId = normalizeRequiredString(profileId, 'Profil IA ID');
    const snapshot = await getDoc(doc(iaProfiles, normalizedId));

    if (!snapshot.exists()) {
      return null;
    }

    return {
      id: snapshot.id,
      ...snapshot.data(),
    };
  } catch (err) {
    console.error('Erreur lors de la recuperation du profil IA', err);
    throw err;
  }
};

export const fetchAiEvaluationsForUserRealTime = (userId: any, onData: any, onError: any) => {
  try {
    const normalizedId = normalizeRequiredString(userId, 'User ID');
    const ref = query(aiEvaluations, where('userId', '==', normalizedId));
    return createRealtimeListener(ref, onData, onError, 'evaluations IA');
  } catch (err) {
    console.error("Impossible d'écouter les evaluations IA", err);
    onError?.(err);
    return () => {};
  }
};

export const addAiProfile = async ({
  name,
  mentality,
  voice,
  voiceRhythm,
  look,
  visibility,
  accessType,
}: any = {}) => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Session utilisateur invalide.');
  }

  const payload = {
    ownerId: normalizeRequiredString(currentUser.uid, 'Owner ID'),
    ownerMail: sanitizeOptionalString(currentUser.email ?? undefined),
    name: sanitizeOptionalString(name),
    mentality: sanitizeOptionalString(mentality),
    voice: sanitizeOptionalString(voice),
    voiceRhythm: sanitizeOptionalString(voiceRhythm),
    look: normalizeOptionalLook(look),
    visibility: normalizeVisibilityValue(visibility) ?? 'public',
    accessType: normalizeAccessTypeValue(accessType) ?? 'free',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    status: 'pending',
  };

  return addDoc(iaProfiles, omitUndefinedFields(payload));
};

const allowedStatuses = ['pending', 'active', 'rejected', 'suspended', 'disabled'];

export const updateAiProfileStatus = async ({
  profileId,
  status,
  adminId,
  adminMail,
  note,
}: any) => {
  const normalizedId = normalizeRequiredString(profileId, 'Profil IA ID');
  const normalizedStatus = normalizeRequiredString(status, 'Statut');

  if (!allowedStatuses.includes(normalizedStatus)) {
    throw new Error('Statut IA invalide.');
  }

  const docRef = doc(iaProfiles, normalizedId);
  const updatePayload = omitUndefinedFields({
    status: normalizedStatus,
    statusNote: sanitizeOptionalString(note),
    reviewedBy: sanitizeOptionalString(adminId),
    reviewedMail: sanitizeOptionalString(adminMail),
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await updateDoc(docRef, updatePayload);

  const logPayload = createAdminLogPayload({
    action: 'ai_profile_status',
    targetType: 'iaProfile',
    targetId: normalizedId,
    adminId,
    adminMail,
    details: omitUndefinedFields({
      status: normalizedStatus,
      note: sanitizeOptionalString(note),
    }),
  });

  try {
    await setDoc(doc(adminLogs), logPayload);
  } catch (err) {
    console.warn("Impossible d'ecrire le log admin IA", err);
  }
};

export const flagAiProfileSafetyViolation = async ({
  profileId,
  warning,
  note,
  adminId,
  adminMail,
}: any) => {
  const normalizedId = normalizeRequiredString(profileId, 'Profil IA ID');
  const sanitizedWarning =
    sanitizeOptionalString(warning) ??
    "La génération d'image a été rejetée par le système de sécurité.";
  const sanitizedNote = sanitizeOptionalString(note) ?? sanitizedWarning;

  const docRef = doc(iaProfiles, normalizedId);
  const updatePayload = omitUndefinedFields({
    status: 'rejected',
    statusNote: sanitizedNote,
    ownerNotification: sanitizedWarning,
    hiddenFromCatalogue: true,
    safetyWarnings: arrayUnion(sanitizedWarning),
    warningCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  const logPayload = createAdminLogPayload({
    action: 'ai_profile_safety_violation',
    targetType: 'iaProfile',
    targetId: normalizedId,
    adminId,
    adminMail,
    details: omitUndefinedFields({
      warning: sanitizedWarning,
      note: sanitizedNote,
    }),
  });

  const batch = writeBatch(firestore);
  batch.update(docRef, updatePayload);
  batch.set(doc(adminLogs), logPayload);
  return batch.commit();
};

export const updateAiProfileDetails = async ({ profileId, updates, adminId, adminMail }: any) => {
  const normalizedId = normalizeRequiredString(profileId, 'Profil IA ID');
  const normalizedUpdates = {
    name: sanitizeOptionalString(updates?.name),
    mentality: sanitizeOptionalString(updates?.mentality),
    voice: sanitizeOptionalString(updates?.voice),
    voiceRhythm: sanitizeOptionalString(updates?.voiceRhythm),
    imageUrl: sanitizeOptionalString(updates?.imageUrl),
    imagePrompt: sanitizeOptionalString(updates?.imagePrompt),
    look: normalizeOptionalLook(updates?.look),
    visibility: normalizeVisibilityValue(updates?.visibility),
    accessType: normalizeAccessTypeValue(updates?.accessType),
  };
  const updatePayload = omitUndefinedFields({
    ...normalizedUpdates,
    updatedAt: serverTimestamp(),
  });

  if (Object.keys(updatePayload).length <= 1) {
    throw new Error('Aucune modification IA.');
  }

  const docRef = doc(iaProfiles, normalizedId);
  const batch = writeBatch(firestore);
  batch.update(docRef, updatePayload);
  batch.set(
    doc(adminLogs),
    createAdminLogPayload({
      action: 'ai_profile_update',
      targetType: 'iaProfile',
      targetId: normalizedId,
      adminId,
      adminMail,
      details: omitUndefinedFields(normalizedUpdates),
    }),
  );

  return batch.commit();
};

export const updateAiProfileForOwner = async ({ profileId, updates }: any) => {
  const normalizedId = normalizeRequiredString(profileId, 'Profil IA ID');
  const normalizedUpdates = {
    name: sanitizeOptionalString(updates?.name),
    mentality: sanitizeOptionalString(updates?.mentality),
    voice: sanitizeOptionalString(updates?.voice),
    voiceRhythm: sanitizeOptionalString(updates?.voiceRhythm),
    imageUrl: sanitizeOptionalString(updates?.imageUrl),
    imagePrompt: sanitizeOptionalString(updates?.imagePrompt),
    look: normalizeOptionalLook(updates?.look),
    visibility: normalizeVisibilityValue(updates?.visibility),
    accessType: normalizeAccessTypeValue(updates?.accessType),
  };
  const updatePayload = omitUndefinedFields({
    ...normalizedUpdates,
    updatedAt: serverTimestamp(),
  });

  if (Object.keys(updatePayload).length <= 1) {
    throw new Error('Aucune modification IA.');
  }

  const docRef = doc(iaProfiles, normalizedId);
  return updateDoc(docRef, updatePayload);
};

export const deleteAiProfile = async ({ profileId, adminId, adminMail }: any) => {
  const normalizedId = normalizeRequiredString(profileId, 'Profil IA ID');
  const docRef = doc(iaProfiles, normalizedId);

  await deleteDoc(docRef);

  const logPayload = createAdminLogPayload({
    action: 'ai_profile_delete',
    targetType: 'iaProfile',
    targetId: normalizedId,
    adminId,
    adminMail,
    details: {},
  });

  try {
    await setDoc(doc(adminLogs), logPayload);
  } catch (err) {
    console.warn("Impossible d'ecrire le log admin suppression IA", err);
  }
};

export const deleteAiProfileAndConversations = async ({ profileId, adminId, adminMail }: any) => {
  const normalizedId = normalizeRequiredString(profileId, 'Profil IA ID');
  let deletedConversations = 0;
  let deletedMessages = 0;

  try {
    const snapshot = await getDocs(query(conversations, where('aiId', '==', normalizedId)));

    for (const docItem of snapshot.docs) {
      const result = await deleteConversationWithMessages({
        conversationId: docItem.id,
        adminId,
        adminMail,
      });
      deletedConversations += 1;
      deletedMessages += result?.messagesDeleted ?? 0;
    }
  } catch (err) {
    console.error('Erreur suppression conversations liees a l IA', err);
    throw err;
  }

  await deleteDoc(doc(iaProfiles, normalizedId));

  const logPayload = createAdminLogPayload({
    action: 'ai_profile_delete',
    targetType: 'iaProfile',
    targetId: normalizedId,
    adminId,
    adminMail,
    details: omitUndefinedFields({
      conversationsDeleted: deletedConversations,
      messagesDeleted: deletedMessages,
    }),
  });

  try {
    await setDoc(doc(adminLogs), logPayload);
  } catch (err) {
    console.warn("Impossible d'ecrire le log admin suppression IA", err);
  }

  return { conversationsDeleted: deletedConversations, messagesDeleted: deletedMessages };
};

export const resetAiProfile = async ({ profileId }: any) => {
  const normalizedId = normalizeRequiredString(profileId, 'Profil IA ID');
  const docRef = doc(iaProfiles, normalizedId);

  return updateDoc(docRef, {
    mentality: deleteField(),
    voice: deleteField(),
    voiceRhythm: deleteField(),
    look: deleteField(),
    updatedAt: serverTimestamp(),
  });
};

export const addAiEvaluation = async ({
  userId,
  userMail,
  aiId,
  conversationId,
  rating,
  comment,
  tags,
}: any) => {
  const normalizedUserId = normalizeRequiredString(userId, 'User ID');
  const normalizedAiId = normalizeRequiredString(aiId, 'IA ID');
  const normalizedConversationId = normalizeRequiredString(conversationId, 'Conversation ID');
  const normalizedRating = normalizeOptionalNumber(rating);

  if (
    normalizedRating === undefined ||
    !Number.isInteger(normalizedRating) ||
    normalizedRating < 1 ||
    normalizedRating > 5
  ) {
    throw new Error('Note invalide.');
  }

  const conversationRef = doc(conversations, normalizedConversationId);
  const conversationSnapshot = await getDoc(conversationRef);
  if (!conversationSnapshot.exists()) {
    throw new Error('Conversation introuvable.');
  }
  const conversationData = conversationSnapshot.data();
  if (conversationData.userId !== normalizedUserId) {
    throw new Error('Conversation non autorisee.');
  }
  if (conversationData.aiId && conversationData.aiId !== normalizedAiId) {
    throw new Error('IA non associee a cette conversation.');
  }

  const payload = {
    userId: normalizedUserId,
    userMail: sanitizeOptionalString(userMail),
    aiId: normalizedAiId,
    conversationId: normalizedConversationId,
    rating: normalizedRating,
    tags: normalizeOptionalStringArray(tags),
    comment: sanitizeOptionalString(comment),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  return addDoc(aiEvaluations, omitUndefinedFields(payload));
};

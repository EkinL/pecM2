import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  writeBatch,
  increment,
  where,
} from "firebase/firestore";
import {
  conversations,
  conversationMessages,
  iaProfiles,
  adminLogs,
  settings,
  utilisateurs,
} from "../collections";
import { firestore } from "../init";
import {
  createAdminLogPayload,
  createRealtimeListener,
  mapSnapshot,
  normalizeCountryCode,
  normalizeOptionalLocation,
  normalizeOptionalNumber,
  normalizeOptionalTokenPricing,
  normalizeRequiredString,
  omitUndefinedFields,
  sanitizeOptionalString,
} from "../helpers";

const allowedStatuses = ["pending", "running", "completed"];

export const fetchConversationsRealTime = (onData, onError) =>
  createRealtimeListener(conversations, onData, onError, "conversations");

export const fetchConversationsForUserRealTime = (userId, onData, onError) => {
  try {
    const normalizedId = normalizeRequiredString(userId, "User ID");
    const ref = query(conversations, where("userId", "==", normalizedId));
    return createRealtimeListener(ref, onData, onError, "conversations user");
  } catch (err) {
    console.error("Impossible d'ecouter les conversations user", err);
    onError?.(err);
    return () => {};
  }
};

export const fetchConversationById = async (conversationId) => {
  try {
    const normalizedId = normalizeRequiredString(conversationId, "Conversation ID");
    const snapshot = await getDoc(doc(conversations, normalizedId));

    if (!snapshot.exists()) {
      return null;
    }

    return {
      id: snapshot.id,
      ...snapshot.data(),
    };
  } catch (err) {
    console.error("Erreur lors de la recuperation de la conversation", err);
    throw err;
  }
};

export const updateConversationStatus = async ({ conversationId, status, note }) => {
  const normalizedId = normalizeRequiredString(conversationId, "Conversation ID");
  const normalizedStatus = normalizeRequiredString(status, "Statut");
  if (!allowedStatuses.includes(normalizedStatus)) {
    throw new Error("Statut conversation invalide.");
  }
  return updateDoc(doc(conversations, normalizedId), {
    status: normalizedStatus,
    statusNote: sanitizeOptionalString(note),
    updatedAt: serverTimestamp(),
  });
};

export const deleteConversationWithMessages = async ({ conversationId, adminId, adminMail }) => {
  const normalizedId = normalizeRequiredString(conversationId, "Conversation ID");
  const messagesRef = conversationMessages(normalizedId);
  const batchSize = 400;
  let lastDoc;
  let deletedMessages = 0;

  while (true) {
    const constraints = [orderBy("__name__"), limit(batchSize)];
    if (lastDoc) {
      constraints.splice(1, 0, startAfter(lastDoc));
    }
    const snapshot = await getDocs(query(messagesRef, ...constraints));
    if (snapshot.empty) {
      break;
    }

    const batch = writeBatch(firestore);
    snapshot.docs.forEach((docItem) => batch.delete(docItem.ref));
    await batch.commit();
    deletedMessages += snapshot.size;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];

    if (snapshot.size < batchSize) {
      break;
    }
  }

  await deleteDoc(doc(conversations, normalizedId));

  const logPayload = createAdminLogPayload({
    action: "conversation_delete",
    targetType: "conversation",
    targetId: normalizedId,
    adminId,
    adminMail,
    details: { messagesDeleted: deletedMessages },
  });

  try {
    await setDoc(doc(adminLogs), logPayload);
  } catch (err) {
    console.warn("Impossible d'ecrire le log admin suppression conversation", err);
  }

  return { messagesDeleted: deletedMessages };
};

export const updateConversationLocation = async ({ conversationId, location }) => {
  const normalizedId = normalizeRequiredString(conversationId, "Conversation ID");
  const normalizedLocation = normalizeOptionalLocation(location);

  if (!normalizedLocation) {
    throw new Error("Localisation invalide.");
  }

  return updateDoc(doc(conversations, normalizedId), {
    location: normalizedLocation,
    locationUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const updateConversationCountry = async ({ conversationId, countryCode, countryLabel }) => {
  const normalizedId = normalizeRequiredString(conversationId, "Conversation ID");
  const normalizedCode = normalizeCountryCode(countryCode);

  if (!normalizedCode) {
    throw new Error("Pays invalide.");
  }

  return updateDoc(doc(conversations, normalizedId), {
    countryCode: normalizedCode,
    countryLabel: sanitizeOptionalString(countryLabel),
    countryUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const updateConversationTokenPricing = async ({
  conversationId,
  pricing,
  adminId,
  adminMail,
  note,
}) => {
  const normalizedId = normalizeRequiredString(conversationId, "Conversation ID");
  const normalizedPricing = normalizeOptionalTokenPricing(pricing);

  if (!normalizedPricing) {
    throw new Error("Tarifs tokens invalides.");
  }

  return updateDoc(doc(conversations, normalizedId), {
    tokenPricing: normalizedPricing,
    tokenPricingNote: sanitizeOptionalString(note),
    tokenPricingUpdatedAt: serverTimestamp(),
    tokenPricingUpdatedBy: sanitizeOptionalString(adminId),
    tokenPricingUpdatedMail: sanitizeOptionalString(adminMail),
    updatedAt: serverTimestamp(),
  });
};

export const addConversationMessage = async ({
  conversationId,
  authorId,
  authorRole,
  content,
  kind = "text",
  metadata,
  tokenCost,
}) => {
  const normalizedConversationId = normalizeRequiredString(conversationId, "Conversation ID");
  const normalizedContent = normalizeRequiredString(content, "Message");
  const normalizedKind = sanitizeOptionalString(kind) ?? "text";
  const normalizedTokenCost = normalizeOptionalNumber(tokenCost);
  const messagesRef = conversationMessages(normalizedConversationId);
  const conversationRef = doc(conversations, normalizedConversationId);
  const messageRef = doc(messagesRef);

  const payload = omitUndefinedFields({
    conversationId: normalizedConversationId,
    authorId: sanitizeOptionalString(authorId),
    authorRole: sanitizeOptionalString(authorRole),
    kind: normalizedKind,
    content: normalizedContent,
    tokenCost: normalizedTokenCost,
    metadata: typeof metadata === "object" && metadata ? metadata : undefined,
    createdAt: serverTimestamp(),
  });

  const batch = writeBatch(firestore);
  batch.set(messageRef, payload);
  batch.set(
    conversationRef,
    {
      updatedAt: serverTimestamp(),
      messageCount: increment(1),
    },
    { merge: true }
  );

  await batch.commit();

  return {
    id: messageRef.id,
    ...payload,
  };
};

export const createConversation = async ({ userId, aiId, status = "running" }) => {
  const normalizedUserId = normalizeRequiredString(userId, "User ID");
  const normalizedAiId = normalizeRequiredString(aiId, "IA ID");
  const normalizedStatus = sanitizeOptionalString(status) ?? "running";
  const aiRef = doc(iaProfiles, normalizedAiId);
  const aiSnapshot = await getDoc(aiRef);

  if (!aiSnapshot.exists()) {
    throw new Error("IA introuvable.");
  }

  const aiStatusRaw = sanitizeOptionalString(aiSnapshot.data()?.status) ?? "pending";
  const aiStatus = aiStatusRaw.toLowerCase();
  if (aiStatus !== "active") {
    throw new Error("IA non active.");
  }
  const aiImageUrl = sanitizeOptionalString(aiSnapshot.data()?.imageUrl);
  if (!aiImageUrl) {
    throw new Error("Avatar IA en cours de generation.");
  }
  const docRef = doc(conversations);

  const payload = {
    userId: normalizedUserId,
    aiId: normalizedAiId,
    status: normalizedStatus,
    messageCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(docRef, payload);

  return {
    id: docRef.id,
    ...payload,
  };
};

export const sendConversationMessageWithTokens = async ({
  conversationId,
  userId,
  authorRole,
  content,
  kind = "text",
  metadata,
  tokenCost,
}) => {
  const normalizedConversationId = normalizeRequiredString(conversationId, "Conversation ID");
  const normalizedUserId = normalizeRequiredString(userId, "User ID");
  const normalizedContent = normalizeRequiredString(content, "Message");
  const normalizedKind = sanitizeOptionalString(kind) ?? "text";
  const normalizedTokenCost = normalizeOptionalNumber(tokenCost);

  const messagesRef = conversationMessages(normalizedConversationId);
  const messageRef = doc(messagesRef);
  const conversationRef = doc(conversations, normalizedConversationId);
  const userRef = doc(utilisateurs, normalizedUserId);
  let payload;

  await runTransaction(firestore, async (transaction) => {
    const conversationSnapshot = await transaction.get(conversationRef);
    if (!conversationSnapshot.exists()) {
      throw new Error("Conversation introuvable.");
    }
    const conversationData = conversationSnapshot.data() ?? {};
    const countryCode = normalizeCountryCode(conversationData?.countryCode);
    const locationData = conversationData?.location;
    const hasLocation =
      typeof locationData?.lat === "number" && typeof locationData?.lng === "number";
    if (!hasLocation && !countryCode) {
      throw new Error("Localisation requise.");
    }
    const aiId = sanitizeOptionalString(conversationData.aiId);
    if (!aiId) {
      throw new Error("IA introuvable.");
    }

    const aiRef = doc(iaProfiles, aiId);
    const aiSnapshot = await transaction.get(aiRef);
    if (!aiSnapshot.exists()) {
      throw new Error("IA introuvable.");
    }
    const aiStatusRaw = sanitizeOptionalString(aiSnapshot.data()?.status) ?? "pending";
    const aiStatus = aiStatusRaw.toLowerCase();
    if (aiStatus !== "active") {
      throw new Error("IA non active.");
    }
    const aiImageUrl = sanitizeOptionalString(aiSnapshot.data()?.imageUrl);
    if (!aiImageUrl) {
      throw new Error("Avatar IA en cours de generation.");
    }

    const settingsSnapshot = await transaction.get(doc(settings, "tokenPricingIdf"));
    const settingsData = settingsSnapshot.exists() ? settingsSnapshot.data() ?? {} : {};
    const basePricing = typeof settingsData.base === "object" ? settingsData.base : {};
    const countryPricing =
      countryCode && typeof settingsData.countries === "object"
        ? settingsData.countries?.[countryCode] ?? {}
        : {};

    const baseCosts = {
      text: 1,
      image: 5,
    };
    const overrideCost = normalizeOptionalNumber(
      conversationData?.tokenPricing?.[normalizedKind]
    );
    const countryCost = normalizeOptionalNumber(countryPricing?.[normalizedKind]);
    const baseCost = normalizeOptionalNumber(basePricing?.[normalizedKind]);
    const fallbackCost = baseCosts[normalizedKind] ?? normalizedTokenCost;
    const finalTokenCost = overrideCost ?? countryCost ?? baseCost ?? fallbackCost;

    if (!finalTokenCost || finalTokenCost <= 0) {
      throw new Error("Cout token invalide.");
    }

    const userSnapshot = await transaction.get(userRef);
    if (!userSnapshot.exists()) {
      throw new Error("Utilisateur introuvable.");
    }
    const currentTokens =
      typeof userSnapshot.data().tokens === "number" ? userSnapshot.data().tokens : 0;

    if (currentTokens < finalTokenCost) {
      throw new Error("Solde insuffisant.");
    }

    payload = omitUndefinedFields({
      conversationId: normalizedConversationId,
      authorId: normalizedUserId,
      authorRole: sanitizeOptionalString(authorRole),
      kind: normalizedKind,
      content: normalizedContent,
      tokenCost: finalTokenCost,
      metadata: typeof metadata === "object" && metadata ? metadata : undefined,
      createdAt: serverTimestamp(),
    });

    transaction.set(messageRef, payload);
    transaction.set(
      conversationRef,
      {
        updatedAt: serverTimestamp(),
        messageCount: increment(1),
      },
      { merge: true }
    );
    transaction.update(userRef, {
      tokens: currentTokens - finalTokenCost,
      updatedAt: serverTimestamp(),
    });
  });

  return {
    id: messageRef.id,
    ...(payload ?? {}),
  };
};

export const fetchConversationMessagesRealTime = (
  { conversationId, pageSize = 25, onData, onError } = {}
) => {
  try {
    const normalizedConversationId = normalizeRequiredString(conversationId, "Conversation ID");
    const messagesRef = conversationMessages(normalizedConversationId);
    const ref = query(messagesRef, orderBy("createdAt", "desc"), limit(pageSize));

    return onSnapshot(
      ref,
      (snapshot) => {
        const messages = mapSnapshot(snapshot).reverse();
        onData?.(messages);
      },
      (error) => {
        console.error("Erreur du flux temps réel messages", error);
        onError?.(error);
      }
    );
  } catch (err) {
    console.error("Impossible d'écouter les messages", err);
    onError?.(err);
    return () => {};
  }
};

export const fetchConversationMessagesPage = async ({
  conversationId,
  pageSize = 25,
  cursor,
} = {}) => {
  try {
    const normalizedConversationId = normalizeRequiredString(conversationId, "Conversation ID");
    const messagesRef = conversationMessages(normalizedConversationId);
    const constraints = [orderBy("createdAt", "desc"), limit(pageSize)];

    if (cursor) {
      constraints.push(startAfter(cursor));
    }

    const snapshot = await getDocs(query(messagesRef, ...constraints));
    const messages = mapSnapshot(snapshot).reverse();
    const nextCursor = snapshot.docs[snapshot.docs.length - 1] ?? null;

    return {
      messages,
      cursor: nextCursor,
      hasMore: snapshot.size === pageSize,
    };
  } catch (err) {
    console.error("Erreur lors de la pagination des messages", err);
    throw err;
  }
};

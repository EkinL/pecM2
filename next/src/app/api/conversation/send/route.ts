import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import {
  getIpFromRequest,
  getPlatformFromRequest,
  getUserAgentFromRequest,
  verifyActorFromRequest,
  writeActivityLog,
} from '../../_lib/activityLogs';
import { getFirebaseAdminFirestore } from '../../_lib/firebaseAdmin';

class ApiHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const normalizeRequiredString = (value: unknown, label: string) => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new ApiHttpError(400, `${label} requis.`);
  }
  return normalized;
};

const intValue = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const isFirebaseAdminConfigurationError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes('credential introuvable') ||
    message.includes('default credentials') ||
    message.includes('application default') ||
    message.includes('unable to detect a project id') ||
    message.includes('project id') ||
    message.includes('projectid') ||
    message.includes('google_cloud_project') ||
    message.includes('gcloud_project')
  );
};

const toApiError = (error: unknown) => {
  if (error instanceof ApiHttpError) {
    return {
      status: error.status,
      message: error.message,
    };
  }

  return {
    status: 500,
    message: 'Erreur envoi message.',
  };
};

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) ?? {};
  } catch (error) {
    console.warn('Impossible de parser /api/conversation/send', error);
  }

  const platform = getPlatformFromRequest(request);
  const ip = getIpFromRequest(request);
  const userAgent = getUserAgentFromRequest(request);

  try {
    const conversationId = normalizeRequiredString(body.conversationId, 'Conversation');
    const aiId = normalizeRequiredString(body.aiId, 'IA');
    const message = normalizeRequiredString(body.message, 'Message');
    const kind = normalizeOptionalString(body.kind) ?? 'text';

    const actor = await verifyActorFromRequest(request).catch(() => null);
    if (!actor?.uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let firestore: admin.firestore.Firestore;
    try {
      firestore = getFirebaseAdminFirestore();
    } catch (error) {
      if (isFirebaseAdminConfigurationError(error)) {
        return NextResponse.json({ error: 'Service indisponible.' }, { status: 503 });
      }
      throw error;
    }

    const conversationRef = firestore.collection('conversations').doc(conversationId);
    const userRef = firestore.collection('utilisateurs').doc(actor.uid);
    const settingsRef = firestore.collection('settings').doc('tokenPricingIdf');

    let tokenCostUsed = 0;
    let messageId = '';

    await firestore.runTransaction(async (transaction) => {
      const conversationSnapshot = await transaction.get(conversationRef);
      if (!conversationSnapshot.exists) {
        throw new ApiHttpError(404, 'Conversation introuvable.');
      }
      const conversationData = conversationSnapshot.data() ?? {};

      const conversationUserId = normalizeOptionalString(conversationData.userId);
      if (!conversationUserId || conversationUserId !== actor.uid) {
        throw new ApiHttpError(403, 'Conversation non autorisee.');
      }

      const conversationAiId = normalizeOptionalString(conversationData.aiId);
      if (!conversationAiId) {
        throw new ApiHttpError(404, 'IA introuvable.');
      }
      if (conversationAiId !== aiId) {
        throw new ApiHttpError(403, 'IA non associee a cette conversation.');
      }

      const aiRef = firestore.collection('iaProfiles').doc(conversationAiId);
      const aiSnapshot = await transaction.get(aiRef);
      if (!aiSnapshot.exists) {
        throw new ApiHttpError(404, 'IA introuvable.');
      }
      const aiData = aiSnapshot.data() ?? {};
      const aiStatus = (normalizeOptionalString(aiData.status) ?? 'pending').toLowerCase();
      if (aiStatus !== 'active') {
        throw new ApiHttpError(403, 'IA non active.');
      }
      const aiImageUrl = normalizeOptionalString(aiData.imageUrl);
      if (!aiImageUrl) {
        throw new ApiHttpError(403, 'Avatar IA en cours de generation.');
      }

      const userSnapshot = await transaction.get(userRef);
      if (!userSnapshot.exists) {
        throw new ApiHttpError(404, 'Utilisateur introuvable.');
      }
      const userData = userSnapshot.data() ?? {};
      const useLiveLocationPricing = userData.useLiveLocationPricing === true;
      const currentTokens = intValue(userData.tokens) ?? 0;

      const rawCountryCode = normalizeOptionalString(conversationData.countryCode);
      const countryCodeForPricing = useLiveLocationPricing ? rawCountryCode : undefined;

      const settingsSnapshot = await transaction.get(settingsRef);
      const settingsData = settingsSnapshot.data() ?? {};
      const basePricing =
        settingsData.base && typeof settingsData.base === 'object'
          ? (settingsData.base as Record<string, unknown>)
          : {};
      const countriesPricing =
        settingsData.countries && typeof settingsData.countries === 'object'
          ? (settingsData.countries as Record<string, unknown>)
          : {};
      const countryPricingRaw =
        countryCodeForPricing && countriesPricing[countryCodeForPricing]
          ? countriesPricing[countryCodeForPricing]
          : undefined;
      const countryPricing =
        countryPricingRaw && typeof countryPricingRaw === 'object'
          ? (countryPricingRaw as Record<string, unknown>)
          : {};
      const conversationPricing =
        conversationData.tokenPricing && typeof conversationData.tokenPricing === 'object'
          ? (conversationData.tokenPricing as Record<string, unknown>)
          : {};

      const defaultCosts: Record<string, number> = {
        text: 1,
        image: 5,
      };

      const overrideCost = intValue(conversationPricing[kind]);
      const countryCost = intValue(countryPricing[kind]);
      const baseCost = intValue(basePricing[kind]);
      const fallbackCost = defaultCosts[kind] ?? 1;
      let finalTokenCost = overrideCost ?? countryCost ?? baseCost ?? fallbackCost;
      if (finalTokenCost <= 0) {
        finalTokenCost = Math.max(fallbackCost, 1);
      }

      if (currentTokens < finalTokenCost) {
        throw new ApiHttpError(403, 'Solde insuffisant. Demandez des tokens a un admin.');
      }

      tokenCostUsed = finalTokenCost;
      const messageRef = conversationRef.collection('messages').doc();
      messageId = messageRef.id;

      transaction.set(messageRef, {
        conversationId,
        authorId: actor.uid,
        authorRole: 'client',
        kind,
        content: message,
        tokenCost: finalTokenCost,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      transaction.set(
        conversationRef,
        {
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          messageCount: admin.firestore.FieldValue.increment(1),
        },
        { merge: true },
      );

      transaction.set(
        userRef,
        {
          tokens: currentTokens - finalTokenCost,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });

    try {
      await writeActivityLog({
        action: 'message_send',
        actorId: actor.uid,
        actorMail: actor.email,
        targetType: 'conversation',
        targetId: conversationId,
        platform,
        ip,
        userAgent,
        details: {
          messageId,
          kind,
          tokenCost: tokenCostUsed,
          source: 'api',
        },
      });
    } catch (logError) {
      console.warn("Impossible d'ecrire le log message_send (api)", logError);
    }

    return NextResponse.json({
      messageId,
      tokenCost: tokenCostUsed,
    });
  } catch (error) {
    const apiError = toApiError(error);
    return NextResponse.json(
      {
        error: apiError.message,
      },
      { status: apiError.status },
    );
  }
}

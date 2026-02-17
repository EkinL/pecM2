import { NextResponse } from 'next/server';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import crypto from 'node:crypto';
import admin from 'firebase-admin';
import {
  getIpFromRequest,
  getPlatformFromRequest,
  getUserAgentFromRequest,
  verifyActorFromRequest,
  writeActivityLog,
} from '../../_lib/activityLogs';
import { getFirebaseAdminApp, getFirebaseAdminFirestore } from '../../_lib/firebaseAdmin';

export const runtime = 'nodejs';

type AiProfile = {
  id: string;
  name?: string;
  mentality?: string;
  expressions?: string[];
  imageUrl?: string;
  imagePrompt?: string;
  status?: string;
  look?: {
    gender?: string;
    skin?: string;
    hair?: string;
    outfit?: string;
    ethnicity?: string;
    details?: string;
  };
};

const normalizePromptValue = (value?: string) => (typeof value === 'string' ? value.trim() : '');

const IMAGE_CACHE_DIR = path.join(os.tmpdir(), 'pecm2-ai-images');

const extensionFromContentType = (contentType?: string) => {
  const lower = contentType?.toLowerCase() ?? '';
  if (lower.includes('webp')) {
    return 'webp';
  }
  if (lower.includes('jpeg')) {
    return 'jpeg';
  }
  if (lower.includes('jpg')) {
    return 'jpg';
  }
  if (lower.includes('png')) {
    return 'png';
  }
  return 'png';
};

const persistBufferImage = async (buffer: Buffer, aiId: string, extension = 'png') => {
  await fs.mkdir(IMAGE_CACHE_DIR, { recursive: true });
  const fileName = `${aiId}-${Date.now()}.${extension}`;
  const filePath = path.join(IMAGE_CACHE_DIR, fileName);
  await fs.writeFile(filePath, buffer);
  return fileName;
};

const buildCachedImageUrl = (fileName: string, request: Request) => {
  try {
    const origin = new URL(request.url).origin;
    return `${origin}/api/ai/image/file/${fileName}`;
  } catch {
    return `/api/ai/image/file/${fileName}`;
  }
};

const resolveStorageBucketName = () => {
  const candidates = [
    process.env.FIREBASE_STORAGE_BUCKET,
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  ];
  const bucketName = candidates.find((value) => typeof value === 'string' && value.trim());
  if (bucketName?.trim()) {
    return bucketName.trim();
  }

  const projectIdCandidates = [
    process.env.FIREBASE_PROJECT_ID,
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  ];
  const projectId = projectIdCandidates.find((value) => typeof value === 'string' && value.trim());
  if (projectId?.trim()) {
    return `${projectId.trim()}.appspot.com`;
  }

  return null;
};

const resolveStorageBucketCandidates = (bucketName: string) => {
  const candidates = [bucketName];

  if (bucketName.endsWith('.firebasestorage.app')) {
    candidates.push(bucketName.replace(/\.firebasestorage\.app$/, '.appspot.com'));
  }

  const projectIdCandidates = [
    process.env.FIREBASE_PROJECT_ID,
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  ];
  const projectId = projectIdCandidates.find((value) => typeof value === 'string' && value.trim());
  if (projectId?.trim()) {
    candidates.push(`${projectId.trim()}.appspot.com`);
  }

  return [...new Set(candidates.map((value) => value.trim()).filter(Boolean))];
};

const extractHttpStatus = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const asRecord = error as Record<string, unknown>;
  const directCandidates = [asRecord.code, asRecord.status, asRecord.statusCode];
  for (const candidate of directCandidates) {
    if (typeof candidate === 'number') {
      return candidate;
    }
  }
  const response = asRecord.response;
  if (
    response &&
    typeof response === 'object' &&
    typeof (response as { status?: unknown }).status === 'number'
  ) {
    return (response as { status: number }).status;
  }
  return undefined;
};

const buildFirebaseDownloadUrl = ({
  bucketName,
  filePath,
  token,
}: {
  bucketName: string;
  filePath: string;
  token: string;
}) => {
  const encodedPath = encodeURIComponent(filePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${token}`;
};

const uploadBufferToFirebaseStorage = async (
  buffer: Buffer,
  aiId: string,
  contentType?: string,
): Promise<string | null> => {
  const bucketName = resolveStorageBucketName();
  if (!bucketName) {
    return null;
  }
  const app = getFirebaseAdminApp();
  const extension = extensionFromContentType(contentType);
  const filePath = `ai-avatars/${aiId}-${Date.now()}.${extension}`;

  const candidates = resolveStorageBucketCandidates(bucketName);
  for (const candidateName of candidates) {
    const bucket = admin.storage(app).bucket(candidateName);
    const file = bucket.file(filePath);
    const downloadToken = crypto.randomUUID();

    try {
      await file.save(buffer, {
        metadata: {
          contentType: contentType ?? 'image/png',
          metadata: {
            firebaseStorageDownloadTokens: downloadToken,
          },
        },
      });
      return buildFirebaseDownloadUrl({
        bucketName: bucket.name,
        filePath: file.name,
        token: downloadToken,
      });
    } catch (error) {
      const status = extractHttpStatus(error);
      const isBucketNotFound =
        status === 404 &&
        (error instanceof Error
          ? error.message.toLowerCase().includes('bucket') &&
            error.message.toLowerCase().includes('does not exist')
          : false);

      if (isBucketNotFound) {
        console.warn('Bucket Firebase Storage introuvable, fallback Firestore/cache', {
          bucket: candidateName,
          status,
        });
        continue;
      }

      console.error(
        'Erreur upload image sur Firebase Storage',
        { bucket: candidateName, status },
        error,
      );
      return null;
    }
  }

  return null;
};

const buildIdentityPrompt = (aiProfile: AiProfile | null) => {
  const stored = normalizePromptValue(aiProfile?.imagePrompt);
  if (stored) {
    return stored;
  }

  const look = aiProfile?.look ?? {};
  const parts: string[] = [];

  if (look.gender) {
    parts.push(`genre ${look.gender.toLowerCase()}`);
  }
  if (look.skin) {
    parts.push(`peau ${look.skin.toLowerCase()}`);
  }
  if (look.hair) {
    parts.push(`cheveux ${look.hair.toLowerCase()}`);
  }
  if (look.outfit) {
    parts.push(`tenue ${look.outfit.toLowerCase()}`);
  }
  if (look.ethnicity) {
    parts.push(`ethnie ${look.ethnicity.toLowerCase()}`);
  }
  if (look.details) {
    const details = look.details.trim();
    if (details) {
      parts.push(`details physiques ${details}`);
    }
  }

  return parts.length ? parts.join(', ') : 'apparence neutre';
};

const buildBaseImagePrompt = (aiProfile: AiProfile | null, identityPrompt: string) => {
  const expressions = aiProfile?.expressions?.length
    ? aiProfile.expressions.join(', ')
    : 'expression calme et naturelle';

  const mentality = normalizePromptValue(aiProfile?.mentality);
  const name = normalizePromptValue(aiProfile?.name);

  const personality = [
    name ? `Prénom : ${name}.` : null,
    mentality ? `État émotionnel dominant : ${mentality}.` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return [
    // Brief photo réaliste et crédible
    `Photographie studio réaliste d’une personne humaine, style portrait professionnel ou photo de casting.`,

    // Appareil & optique réalistes
    `Photo prise avec un appareil photo plein format, objectif portrait 50mm ou 85mm, rendu naturel et équilibré.`,

    // Cadrage & composition (centrage explicite)
    `Cadrage vertical : de la tête jusqu’aux hanches.`,
    `Sujet parfaitement centré dans l’image, aligné sur l’axe vertical.`,
    `Composition symétrique, sujet placé exactement au centre du cadre.`,
    `La personne occupe le centre exact du cadre, avec des marges équilibrées à gauche et à droite.`,
    `Posture naturelle, épaules visibles, corps face à l’objectif.`,

    // Identité
    `Description de la personne : ${identityPrompt}.`,
    personality,
    `Expression du visage : ${expressions}, sourire naturel, regard vivant et crédible dirigé vers l’objectif.`,

    // Peau & visage réalistes
    `Peau humaine naturelle avec texture subtile, légères imperfections normales, traits du visage réalistes.`,
    `Yeux nets avec reflets naturels, expression authentique.`,

    // Lumière réaliste (clé du rendu)
    `Éclairage studio simple et réaliste, lumière douce frontale légèrement latérale.`,
    `Ombres légères et naturelles sous le menton et le cou.`,
    `Balance des blancs neutre, couleurs naturelles, contraste modéré.`,

    // Fond & ambiance
    `Fond studio uni gris ou beige clair, homogène et centré derrière le sujet.`,
    `Ambiance sobre et professionnelle, sans mise en scène artistique.`,

    // Contraintes claires
    `Une seule personne, entièrement visible dans le cadre.`,
    `Aucun texte, aucun logo, aucun watermark.`,
  ]
    .filter(Boolean)
    .join(' ');
};

const buildConversationImagePrompt = (identityPrompt: string, userMessage: string) => {
  const request = userMessage.trim();
  return [
    'Meme personne que l avatar de base.',
    `Identite: ${identityPrompt}.`,
    'Conserver exactement les traits du visage, la coiffure et la tenue.',
    request ? `Adapter la pose et la scene selon: ${request}.` : '',
    'Plan plein pied, corps entier visible, hanches visibles, pieds dans le cadre.',
    'Full-length photograph, full body visible.',
    'Une seule personne, aucun autre sujet dans l image.',
    'Apparence soignee, naturelle et esthetique.',
    'Photographie ultra realiste, qualite elevee.',
    'Texture peau naturelle, details fins, rendu photo.',
    'Eclairage naturel ou studio selon la scene, couleurs realistes.',
    'Pas de style illustration, pas de CGI, pas de rendu 3D.',
    'Pas de texte, pas de watermark.',
  ]
    .filter(Boolean)
    .join(' ');
};

type OpenAiImagePayload = {
  url?: string;
  base64?: string;
};

const extractImagePayload = (data: unknown): OpenAiImagePayload | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const payload = Array.isArray((data as { data?: unknown[] }).data)
    ? (data as { data: Array<{ url?: string; b64_json?: string }> }).data[0]
    : undefined;

  if (!payload) {
    return null;
  }

  const url = typeof payload?.url === 'string' ? payload.url : undefined;
  const base64 = typeof payload?.b64_json === 'string' ? payload.b64_json : undefined;
  if (!url && !base64) {
    return null;
  }
  return { url, base64 };
};

type ResolvedImageUrl = {
  imageUrl: string;
  persisted: boolean;
  buffer?: Buffer;
  contentType?: string;
};

const AVATAR_CHUNK_SIZE = 450_000;

const buildAvatarProxyUrl = ({
  aiId,
  request,
  version,
}: {
  aiId: string;
  request: Request;
  version?: string;
}) => {
  const encoded = encodeURIComponent(aiId);
  const base = (() => {
    try {
      const origin = new URL(request.url).origin;
      return `${origin}/api/ai/avatar/${encoded}`;
    } catch {
      return `/api/ai/avatar/${encoded}`;
    }
  })();

  if (!version) {
    return base;
  }
  return `${base}?v=${encodeURIComponent(version)}`;
};

const storeAvatarInFirestore = async ({
  firestore,
  aiId,
  buffer,
  contentType,
}: {
  firestore: admin.firestore.Firestore;
  aiId: string;
  buffer: Buffer;
  contentType?: string;
}) => {
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const chunkCount = Math.max(1, Math.ceil(buffer.length / AVATAR_CHUNK_SIZE));
  const avatarRef = firestore.collection('iaProfiles').doc(aiId).collection('assets').doc('avatar');
  const chunksRef = avatarRef.collection('chunks');
  const batch = firestore.batch();

  batch.set(
    avatarRef,
    {
      contentType: contentType ?? 'image/png',
      size: buffer.length,
      sha256,
      chunkCount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  for (let index = 0; index < chunkCount; index += 1) {
    const start = index * AVATAR_CHUNK_SIZE;
    const end = Math.min(buffer.length, start + AVATAR_CHUNK_SIZE);
    const chunk = buffer.subarray(start, end);
    const chunkId = `chunk_${String(index).padStart(4, '0')}`;
    batch.set(
      chunksRef.doc(chunkId),
      {
        index,
        data: chunk,
      },
      { merge: true },
    );
  }

  await batch.commit();

  return {
    sha256,
    chunkCount,
    size: buffer.length,
  };
};

const resolveImageUrl = async (
  data: unknown,
  aiId: string,
  request: Request,
): Promise<ResolvedImageUrl | null> => {
  const payload = extractImagePayload(data);
  if (!payload) {
    return null;
  }

  let buffer: Buffer | null = null;
  let detectedContentType: string | undefined;
  let fallbackUrl: string | undefined;

  if (payload.base64) {
    buffer = Buffer.from(payload.base64, 'base64');
    detectedContentType = 'image/png';
  } else if (payload.url) {
    fallbackUrl = payload.url;
    try {
      const response = await fetch(payload.url);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
        detectedContentType = response.headers.get('content-type') ?? undefined;
      }
    } catch (error) {
      console.error("Erreur lors de la recuperation de l'image OpenAI", error);
    }
  }

  if (buffer) {
    const firebaseUrl = await uploadBufferToFirebaseStorage(buffer, aiId, detectedContentType);
    if (firebaseUrl) {
      return {
        imageUrl: firebaseUrl,
        persisted: true,
        buffer,
        contentType: detectedContentType,
      };
    }
    try {
      const extension = extensionFromContentType(detectedContentType);
      const fileName = await persistBufferImage(buffer, aiId, extension);
      return {
        imageUrl: buildCachedImageUrl(fileName, request),
        persisted: false,
        buffer,
        contentType: detectedContentType,
      };
    } catch (error) {
      console.error("Impossible d'ecrire l'image en cache", error);
    }
  }

  return fallbackUrl ? { imageUrl: fallbackUrl, persisted: false } : null;
};

type SafetyViolationInfo = {
  message: string;
  violations?: string[];
};

const extractSafetyViolationInfo = (data: unknown): SafetyViolationInfo | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const errorObject = (data as { error?: Record<string, unknown> }).error;
  const violationsCandidate = Array.isArray(errorObject?.safety_violations)
    ? errorObject?.safety_violations
    : Array.isArray((data as { safety_violations?: unknown[] }).safety_violations)
      ? (data as { safety_violations?: unknown[] }).safety_violations
      : undefined;
  if (!violationsCandidate || !violationsCandidate.length) {
    return null;
  }
  const violations = violationsCandidate.filter((value) => typeof value === 'string') as string[];
  const message: string =
    typeof errorObject?.message === 'string'
      ? (errorObject.message as string)
      : typeof (data as { message?: string }).message === 'string'
        ? ((data as { message?: string }).message as string)
        : 'Requête rejetée par le système de sécurité OpenAI.';
  return { message, violations };
};

const formatSafetyViolationNote = (info: SafetyViolationInfo) => {
  if (!info.violations?.length) {
    return info.message;
  }
  return `${info.message} (violations : ${info.violations.join(', ')})`;
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

const isPersistedImageUrl = (value: string) =>
  value.startsWith('https://storage.googleapis.com/') ||
  value.startsWith('https://firebasestorage.googleapis.com/');

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) ?? {};
  } catch (error) {
    console.warn('Impossible de parser /api/ai/image', error);
  }

  try {
    const mode = typeof body?.mode === 'string' ? body.mode.trim().toLowerCase() : '';
    const isBaseRequest = mode === 'base';
    const conversationId =
      typeof body?.conversationId === 'string' ? body.conversationId.trim() : '';
    const requestedUserId = typeof body?.userId === 'string' ? body.userId.trim() : '';
    const aiId = typeof body?.aiId === 'string' ? body.aiId.trim() : '';
    const userMessage = typeof body?.message === 'string' ? body.message.trim() : '';

    if (!aiId) {
      return NextResponse.json({ error: 'IA manquante.' }, { status: 400 });
    }

    if (!isBaseRequest && (!conversationId || !userMessage)) {
      return NextResponse.json({ error: 'Parametres invalides.' }, { status: 400 });
    }

    let actor: { uid: string; email?: string } | null = null;
    try {
      actor = await verifyActorFromRequest(request);
    } catch (error) {
      if (isFirebaseAdminConfigurationError(error)) {
        console.error('Firebase Admin non configuré pour /api/ai/image', error);
        return NextResponse.json(
          {
            error:
              process.env.NODE_ENV === 'production'
                ? 'Service indisponible.'
                : 'Firebase Admin non configuré (FIREBASE_SERVICE_ACCOUNT_KEY / FIREBASE_PROJECT_ID manquant).',
          },
          { status: 503 },
        );
      }
      console.warn('Token Firebase invalide pour /api/ai/image', error);
      actor = null;
    }

    if (!actor?.uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const actorId = actor.uid;
    const actorMail = actor.email;
    const platform = getPlatformFromRequest(request);
    const ip = getIpFromRequest(request);
    const userAgent = getUserAgentFromRequest(request);

    if (requestedUserId && requestedUserId !== actorId) {
      return NextResponse.json({ error: 'Action non autorisee.' }, { status: 403 });
    }

    let firestore: admin.firestore.Firestore;
    try {
      firestore = getFirebaseAdminFirestore();
    } catch (error) {
      if (isFirebaseAdminConfigurationError(error)) {
        console.error('Firebase Admin non configuré pour /api/ai/image', error);
        return NextResponse.json(
          {
            error:
              process.env.NODE_ENV === 'production'
                ? 'Service indisponible.'
                : 'Firebase Admin non configuré (FIREBASE_SERVICE_ACCOUNT_KEY / FIREBASE_PROJECT_ID manquant).',
          },
          { status: 503 },
        );
      }
      throw error;
    }

    if (isBaseRequest) {
      try {
        const userSnap = await firestore.collection('utilisateurs').doc(actorId).get();
        const roleValue =
          userSnap.exists && typeof userSnap.data()?.role === 'string'
            ? (userSnap.data()?.role as string).trim().toLowerCase()
            : '';
        if (!['admin', 'superadmin'].includes(roleValue)) {
          return NextResponse.json({ error: 'Action reservee aux admins.' }, { status: 403 });
        }
      } catch (error) {
        console.error("Impossible de verifier le role admin pour l'image IA", error);
        return NextResponse.json({ error: 'Action reservee aux admins.' }, { status: 403 });
      }
    }

    const aiRef = firestore.collection('iaProfiles').doc(aiId);
    const aiSnap = await aiRef.get();
    if (!aiSnap.exists) {
      return NextResponse.json({ error: 'Profil IA introuvable.' }, { status: 404 });
    }

    const aiProfile = {
      id: aiSnap.id,
      ...(aiSnap.data() ?? {}),
    } as AiProfile;

    let conversationRef: admin.firestore.DocumentReference | null = null;
    if (!isBaseRequest) {
      conversationRef = firestore.collection('conversations').doc(conversationId);
      const conversationSnap = await conversationRef.get();
      if (!conversationSnap.exists) {
        return NextResponse.json({ error: 'Conversation introuvable.' }, { status: 404 });
      }

      const conversationData = conversationSnap.data() ?? {};
      const conversationUserId =
        typeof conversationData.userId === 'string' ? conversationData.userId.trim() : '';
      const conversationAiId =
        typeof conversationData.aiId === 'string' ? conversationData.aiId.trim() : '';

      if (!conversationUserId || conversationUserId !== actorId) {
        return NextResponse.json({ error: 'Conversation non autorisee.' }, { status: 403 });
      }
      if (conversationAiId && conversationAiId !== aiId) {
        return NextResponse.json(
          { error: 'IA non associee a cette conversation.' },
          { status: 403 },
        );
      }

      const aiStatus = typeof aiProfile.status === 'string' ? aiProfile.status.toLowerCase() : '';
      if (aiStatus !== 'active') {
        return NextResponse.json(
          { error: 'IA non active. Validation admin requise.' },
          { status: 403 },
        );
      }
      const aiImageUrl = typeof aiProfile.imageUrl === 'string' ? aiProfile.imageUrl.trim() : '';
      if (!aiImageUrl) {
        return NextResponse.json({ error: 'Avatar IA en cours de generation.' }, { status: 403 });
      }
    }

    const rawOpenAiKey =
      process.env.OPENAI_API_KEY ??
      process.env.OPENAI_TOKEN ??
      process.env.NEXT_PUBLIC_OPENAI_API_KEY ??
      '';
    const openAiKey = typeof rawOpenAiKey === 'string' ? rawOpenAiKey.trim() : '';
    const hasOpenAiKey =
      Boolean(openAiKey) && openAiKey !== '0' && openAiKey !== 'undefined' && openAiKey !== 'null';

    if (!hasOpenAiKey) {
      return NextResponse.json({ error: 'Cle OpenAI manquante.' }, { status: 502 });
    }

    const identityPrompt = buildIdentityPrompt(aiProfile);
    const prompt = isBaseRequest
      ? buildBaseImagePrompt(aiProfile, identityPrompt)
      : buildConversationImagePrompt(identityPrompt, userMessage);

    const model = normalizePromptValue(process.env.OPENAI_IMAGE_MODEL) || 'gpt-image-1';
    const normalizedModel = model.toLowerCase();
    const usesDalle3Options = normalizedModel.startsWith('dall-e-3');
    const usesGptImage = normalizedModel.startsWith('gpt-image-1');
    const qualityOverride = normalizePromptValue(process.env.OPENAI_IMAGE_QUALITY);
    const styleOverride = normalizePromptValue(process.env.OPENAI_IMAGE_STYLE);
    const requestBody: Record<string, unknown> = {
      model,
      prompt,
      n: 1,
      size: '1024x1024',
    };

    if (usesDalle3Options) {
      requestBody.quality = qualityOverride || 'hd';
      requestBody.style = styleOverride || 'natural';
      requestBody.response_format = 'url';
    } else if (usesGptImage) {
      requestBody.quality = qualityOverride || 'high';
    }

    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur reseau OpenAI.';
      return NextResponse.json(
        { error: process.env.NODE_ENV === 'production' ? 'Requete OpenAI impossible.' : message },
        { status: 502 },
      );
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const safetyInfo = extractSafetyViolationInfo(data);
      if (safetyInfo) {
        const note = formatSafetyViolationNote(safetyInfo);
        try {
          await aiRef.set(
            {
              status: 'rejected',
              statusNote: safetyInfo.message,
              ownerNotification: note,
              hiddenFromCatalogue: true,
              safetyWarnings: admin.firestore.FieldValue.arrayUnion(note),
              warningCount: admin.firestore.FieldValue.increment(1),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        } catch (flagError) {
          console.error('Erreur en signalant la violation de sécurité IA', flagError);
        }

        try {
          await writeActivityLog({
            action: 'ai_image_rejected',
            actorId,
            actorMail,
            targetType: isBaseRequest ? 'aiProfile' : 'conversation',
            targetId: isBaseRequest ? aiId : conversationId,
            platform,
            ip,
            userAgent,
            details: {
              aiId,
              mode: isBaseRequest ? 'base' : 'conversation',
              reason: 'safety',
              message: safetyInfo.message,
              violations: safetyInfo.violations,
            },
          });
        } catch (logError) {
          console.warn("Impossible d'ecrire le log ai_image_rejected", logError);
        }

        return NextResponse.json(
          {
            error: safetyInfo.message,
            safetyViolation: {
              message: safetyInfo.message,
              violations: safetyInfo.violations,
            },
          },
          { status: 403 },
        );
      }
      const errorMessage =
        typeof data?.error?.message === 'string'
          ? data.error.message
          : typeof data?.error === 'string'
            ? data.error
            : `Erreur OpenAI (${response.status})`;
      return NextResponse.json({ error: errorMessage }, { status: 502 });
    }

    const data = await response.json().catch(() => null);
    const resolvedUrl = await resolveImageUrl(data, aiId, request);
    if (!resolvedUrl?.imageUrl) {
      return NextResponse.json({ error: 'Image OpenAI indisponible.' }, { status: 502 });
    }

    let imageUrl = resolvedUrl.imageUrl;
    let persisted = resolvedUrl.persisted && isPersistedImageUrl(imageUrl);
    let persistedIn: 'storage' | 'firestore' | 'cache' | 'openai' = persisted ? 'storage' : 'cache';
    if (!resolvedUrl.buffer) {
      persistedIn = 'openai';
    }

    let updateError: string | null = null;
    if (isBaseRequest) {
      if (!persisted) {
        if (resolvedUrl.buffer) {
          try {
            const stored = await storeAvatarInFirestore({
              firestore,
              aiId,
              buffer: resolvedUrl.buffer,
              contentType: resolvedUrl.contentType,
            });
            const version = stored.sha256.slice(0, 12);
            const avatarUrl = buildAvatarProxyUrl({ aiId, request, version });

            await aiRef.set(
              {
                imageUrl: avatarUrl,
                imageStorage: 'firestore',
                ...(identityPrompt ? { imagePrompt: identityPrompt } : {}),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true },
            );

            imageUrl = avatarUrl;
            persisted = true;
            persistedIn = 'firestore';
          } catch (error) {
            const message =
              error instanceof Error ? error.message : 'Erreur sauvegarde avatar Firestore.';
            console.error('Erreur sauvegarde avatar Firestore', error);
            updateError = message;
          }
        } else {
          updateError =
            "Avatar genere mais non persisté (Firebase Storage indisponible). Impossible de sauvegarder l'avatar.";
        }
      } else {
        try {
          await aiRef.set(
            {
              imageUrl,
              imageStorage: 'storage',
              ...(identityPrompt ? { imagePrompt: identityPrompt } : {}),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erreur mise a jour avatar IA.';
          console.error('Erreur mise a jour avatar IA', error);
          updateError = message;
        }
      }
    } else {
      if (!persisted || !conversationRef) {
        return NextResponse.json(
          { error: 'Upload Firebase Storage indisponible.' },
          { status: 502 },
        );
      }

      const content = `Image generee: ${userMessage}`;
      const messageRef = conversationRef.collection('messages').doc();
      const messagePayload = {
        conversationId,
        authorId: aiId,
        authorRole: 'ai',
        kind: 'image',
        content,
        tokenCost: 0,
        metadata: {
          imageUrl,
          prompt,
          model,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const batch = firestore.batch();
      batch.set(messageRef, messagePayload);
      batch.set(
        conversationRef,
        {
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          messageCount: admin.firestore.FieldValue.increment(1),
        },
        { merge: true },
      );
      await batch.commit();
    }

    console.info('Image IA generee', { aiId, mode, model, imageUrl, persisted, persistedIn });

    try {
      await writeActivityLog({
        action: 'ai_image_generated',
        actorId,
        actorMail,
        targetType: isBaseRequest ? 'aiProfile' : 'conversation',
        targetId: isBaseRequest ? aiId : conversationId,
        platform,
        ip,
        userAgent,
        details: {
          aiId,
          mode: isBaseRequest ? 'base' : 'conversation',
          model,
          persisted,
          persistedIn,
          updateError: updateError || undefined,
        },
      });
    } catch (logError) {
      console.warn("Impossible d'ecrire le log ai_image_generated", logError);
    }

    return NextResponse.json({
      imageUrl,
      prompt,
      identityPrompt,
      model,
      persisted,
      persistedIn,
      updateError: updateError || undefined,
    });
  } catch (error) {
    console.error('Erreur image IA', error);
    const message = error instanceof Error ? error.message : 'Erreur generation image.';
    return NextResponse.json(
      {
        error: process.env.NODE_ENV === 'production' ? 'Erreur generation image.' : message,
      },
      { status: 500 },
    );
  }
}

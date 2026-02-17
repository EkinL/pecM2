import admin from 'firebase-admin';
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from './firebaseAdmin';

export type LogPlatform = 'web' | 'ios';

export type VerifiedActor = {
  uid: string;
  email?: string;
};

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const normalizeRequiredString = (value: unknown) => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new Error('Champ requis manquant.');
  }
  return normalized;
};

const omitUndefinedFields = <T extends Record<string, unknown>>(payload: T) =>
  Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  ) as Partial<T>;

const MAX_DETAILS_LENGTH = 8_000;

const sanitizeDetails = (details: unknown): Record<string, unknown> | undefined => {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return undefined;
  }
  try {
    const raw = JSON.stringify(details);
    if (raw.length > MAX_DETAILS_LENGTH) {
      return {
        _truncated: true,
        _originalLength: raw.length,
      };
    }
  } catch {
    return undefined;
  }
  return details as Record<string, unknown>;
};

export const getPlatformFromRequest = (request: Request): LogPlatform => {
  const header = request.headers.get('x-pecm2-platform') ?? request.headers.get('x-platform');
  const normalized = header?.trim().toLowerCase();
  if (normalized === 'ios') {
    return 'ios';
  }
  return 'web';
};

export const getUserAgentFromRequest = (request: Request) =>
  normalizeOptionalString(request.headers.get('user-agent'));

export const getIpFromRequest = (request: Request) => {
  const forwarded = normalizeOptionalString(request.headers.get('x-forwarded-for'));
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    return first || undefined;
  }
  return normalizeOptionalString(request.headers.get('x-real-ip'));
};

export const getBearerTokenFromRequest = (request: Request) => {
  const authorization =
    normalizeOptionalString(request.headers.get('authorization')) ??
    normalizeOptionalString(request.headers.get('Authorization'));
  if (!authorization) {
    return null;
  }
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ? match[1].trim() : null;
};

export const verifyActorFromRequest = async (request: Request): Promise<VerifiedActor | null> => {
  const token = getBearerTokenFromRequest(request);
  if (!token) {
    return null;
  }
  const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
  return {
    uid: decoded.uid,
    email: typeof decoded.email === 'string' ? decoded.email : undefined,
  };
};

export type ActivityLogWriteInput = {
  action: string;
  actorId: string;
  actorMail?: string;
  actorRole?: string;
  targetType: string;
  targetId?: string;
  details?: unknown;
  createdAt?: admin.firestore.FieldValue;
  ip?: string;
  userAgent?: string;
  platform: LogPlatform;
  schoolId?: string;
};

const normalizeRoleValue = (role: unknown) => {
  if (typeof role !== 'string') {
    return undefined;
  }
  const normalized = role.trim();
  if (!normalized) {
    return undefined;
  }
  return normalized === 'prestataire' ? 'client' : normalized;
};

export const writeActivityLog = async (input: ActivityLogWriteInput) => {
  const firestore = getFirebaseAdminFirestore();

  const actorId = normalizeRequiredString(input.actorId);
  const action = normalizeRequiredString(input.action);
  const targetType = normalizeRequiredString(input.targetType);
  const targetId = normalizeOptionalString(input.targetId);
  const platform = input.platform;

  let actorRole = normalizeRoleValue(input.actorRole);
  let actorMail = normalizeOptionalString(input.actorMail);
  let schoolId = normalizeOptionalString(input.schoolId);

  if (!actorRole || !actorMail || !schoolId) {
    try {
      const snapshot = await firestore.collection('utilisateurs').doc(actorId).get();
      if (snapshot.exists) {
        const data = snapshot.data() ?? {};
        if (!actorRole) {
          actorRole = normalizeRoleValue(data.role) ?? 'client';
        }
        if (!actorMail) {
          actorMail = normalizeOptionalString(data.mail);
        }
        if (!schoolId) {
          schoolId = normalizeOptionalString(data.schoolId);
        }
      }
    } catch (error) {
      console.warn('Impossible de resoudre les infos utilisateur pour le log', error);
    }
  }
  if (!actorRole) {
    actorRole = 'client';
  }

  const details = sanitizeDetails(input.details);
  const payload = omitUndefinedFields({
    action,
    actorId,
    actorMail,
    actorRole,
    targetType,
    targetId,
    details,
    createdAt: input.createdAt ?? admin.firestore.FieldValue.serverTimestamp(),
    ip: normalizeOptionalString(input.ip),
    userAgent: normalizeOptionalString(input.userAgent),
    platform,
    schoolId,
  });

  await firestore.collection('adminLogs').doc().set(payload);
};

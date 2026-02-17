import { onSnapshot, serverTimestamp } from 'firebase/firestore';

export const normalizeRequiredString = (value: unknown, label: string): string => {
  if (typeof value !== 'string') {
    throw new Error(`${label} est obligatoire`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} est obligatoire`);
  }
  return trimmed;
};

export const normalizeOptionalNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export const omitUndefinedFields = <T extends Record<string, unknown>>(
  payload: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } =>
  Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };

export const normalizeOptionalLocation = (
  location: unknown,
): { lat: number; lng: number; accuracy?: number } | undefined => {
  if (!location || typeof location !== 'object') {
    return undefined;
  }
  const loc = location as { lat?: unknown; lng?: unknown; accuracy?: unknown };
  const lat = normalizeOptionalNumber(loc.lat);
  const lng = normalizeOptionalNumber(loc.lng);
  if (lat === undefined || lng === undefined) {
    return undefined;
  }
  const accuracy = normalizeOptionalNumber(loc.accuracy);

  return omitUndefinedFields({ lat, lng, accuracy }) as {
    lat: number;
    lng: number;
    accuracy?: number;
  };
};

export const normalizeOptionalTokenPricing = (
  pricing: unknown,
): { text?: number; image?: number } | undefined => {
  if (!pricing || typeof pricing !== 'object') {
    return undefined;
  }
  const p = pricing as { text?: unknown; image?: unknown };
  const text = normalizeOptionalNumber(p.text);
  const image = normalizeOptionalNumber(p.image);
  const payload = omitUndefinedFields({ text, image });

  return Object.keys(payload).length ? (payload as { text?: number; image?: number }) : undefined;
};

export const normalizeCountryCode = (code: unknown): string | undefined => {
  if (typeof code !== 'string') {
    return undefined;
  }
  const trimmed = code.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : undefined;
};

export const normalizeCountryPricingMap = (
  countries: unknown,
): Record<string, { text?: number; image?: number }> | undefined => {
  if (!countries || typeof countries !== 'object') {
    return undefined;
  }
  const normalized = Object.entries(countries).reduce(
    (acc, [code, value]) => {
      const normalizedCode = normalizeCountryCode(code);
      const pricing = normalizeOptionalTokenPricing(value);
      if (normalizedCode && pricing) {
        acc[normalizedCode] = pricing;
      }
      return acc;
    },
    {} as Record<string, { text?: number; image?: number }>,
  );

  return Object.keys(normalized).length ? normalized : undefined;
};

export const sanitizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

export const normalizeOptionalString = sanitizeOptionalString;

export const normalizeOptionalLook = (look: unknown): Record<string, string> | undefined => {
  if (!look || typeof look !== 'object') {
    return undefined;
  }
  const entries = Object.entries(look).reduce(
    (acc, [key, value]) => {
      const sanitized = sanitizeOptionalString(value);
      if (sanitized) {
        acc[key] = sanitized;
      }
      return acc;
    },
    {} as Record<string, string>,
  );

  return Object.keys(entries).length ? entries : undefined;
};

export const normalizeRoleValue = (role: unknown): unknown =>
  role === 'prestataire' ? 'client' : role;

export const normalizeUtilisateurRole = (user: unknown): unknown => {
  if (!user || typeof user !== 'object') {
    return user;
  }
  const u = user as { role?: unknown };
  const normalizedRole = normalizeRoleValue(u.role);
  if (normalizedRole === u.role) {
    return user;
  }
  return {
    ...user,
    role: normalizedRole,
  };
};

export const normalizeOptionalStringArray = (values: unknown): string[] | undefined => {
  if (!Array.isArray(values)) {
    return undefined;
  }
  const sanitized = values
    .map((value) => sanitizeOptionalString(value))
    .filter(Boolean) as string[];
  return sanitized.length ? sanitized : undefined;
};

export const normalizeVisibilityValue = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (['public', 'private'].includes(normalized)) {
    return normalized;
  }
  return undefined;
};

export const normalizeAccessTypeValue = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (['free', 'paid'].includes(normalized)) {
    return normalized;
  }
  return undefined;
};

export const normalizeRequiredPassword = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new Error('Mot de passe est obligatoire');
  }
  if (!value.length) {
    throw new Error('Mot de passe est obligatoire');
  }
  return value;
};

export const createAdminLogPayload = ({
  action,
  targetType,
  targetId,
  adminId,
  adminMail,
  details,
}: {
  action: unknown;
  targetType: unknown;
  targetId: unknown;
  adminId: unknown;
  adminMail: unknown;
  details: unknown;
}) =>
  omitUndefinedFields({
    action: normalizeRequiredString(action, 'Action'),
    targetType: normalizeRequiredString(targetType, 'Type'),
    targetId: normalizeRequiredString(targetId, 'Cible ID'),
    adminId: sanitizeOptionalString(adminId),
    adminMail: sanitizeOptionalString(adminMail),
    details: typeof details === 'object' && details ? details : undefined,
    createdAt: serverTimestamp(),
  });

export const mapSnapshot = (snapshot: {
  docs: Array<{ id: string; data: () => Record<string, unknown> }>;
}): Array<{ id: string; [key: string]: unknown }> =>
  snapshot.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id,
  }));

export const pickRandomItem = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

const isPermissionDeniedError = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const asRecord = error as { code?: unknown; message?: unknown };
  const code = typeof asRecord.code === 'string' ? asRecord.code.toLowerCase() : '';
  if (code.includes('permission-denied')) {
    return true;
  }

  const message = typeof asRecord.message === 'string' ? asRecord.message.toLowerCase() : '';
  return (
    message.includes('missing or insufficient permissions') ||
    message.includes('insufficient permissions') ||
    message.includes('permission denied')
  );
};

export const createRealtimeListener = (
  reference: any,
  onData: any,
  onError: any,
  label: string,
) => {
  try {
    return onSnapshot(
      reference,
      (snapshot: any) => {
        onData?.(mapSnapshot(snapshot));
      },
      (error: any) => {
        if (!isPermissionDeniedError(error)) {
          console.error(`Erreur du flux temps réel ${label}`, error);
        }
        onError?.(error);
      },
    );
  } catch (err) {
    console.error(`Impossible d'écouter ${label}`, err);
    onError?.(err);
    return () => {};
  }
};

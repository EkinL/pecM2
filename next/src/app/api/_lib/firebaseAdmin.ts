import admin from 'firebase-admin';

let cachedApp: admin.app.App | null = null;

const FIREBASE_ADMIN_CONFIG_ERROR_PATTERNS = [
  'credential introuvable',
  'default credentials',
  'application default credential',
  'could not load the default credentials',
  'credential implementation provided',
  'unable to detect a project id',
  'failed to determine project id',
  'service account',
  'private key',
  'client_email',
  'invalid grant',
  'invalid_grant',
];

const FIREBASE_ADMIN_CONFIG_ERROR_CODES = new Set([
  'app/invalid-credential',
  'app/invalid-app-options',
  'auth/invalid-credential',
  'auth/project-not-found',
]);

type ErrorWithCode = {
  code?: unknown;
  message?: unknown;
};

export const isFirebaseAdminConfigurationError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }
  const rawCode = (error as ErrorWithCode).code;
  const code = typeof rawCode === 'string' ? rawCode.trim().toLowerCase() : '';
  if (code && FIREBASE_ADMIN_CONFIG_ERROR_CODES.has(code)) {
    return true;
  }

  const message = error.message.toLowerCase();
  return FIREBASE_ADMIN_CONFIG_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
};

export const getFirebaseAdminConfigurationErrorMessage = (error: unknown) => {
  if (process.env.NODE_ENV === 'production') {
    return 'Service indisponible.';
  }
  if (error instanceof Error && error.message.trim()) {
    return `Firebase Admin non configure (${error.message.trim()}).`;
  }
  return 'Firebase Admin non configure.';
};

const pickString = (...candidates: unknown[]) => {
  const value = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim());
  return typeof value === 'string' ? value.trim() : undefined;
};

const parseServiceAccountKey = (rawValue: string): Record<string, unknown> => {
  const tryParse = (value: string) => {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Payload JSON invalide.');
    }
    return parsed as Record<string, unknown>;
  };

  const trimmed = rawValue.trim();
  if (!trimmed) {
    throw new Error('Firebase service account invalide (valeur vide).');
  }

  try {
    return tryParse(trimmed);
  } catch {
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
      return tryParse(decoded);
    } catch {
      throw new Error('Firebase service account invalide (FIREBASE_SERVICE_ACCOUNT_KEY).');
    }
  }
};

const resolveProjectId = () => {
  const candidates = [
    process.env.FIREBASE_PROJECT_ID,
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    process.env.GOOGLE_CLOUD_PROJECT,
    process.env.GCLOUD_PROJECT,
  ];
  const projectId = candidates.find((value) => typeof value === 'string' && value.trim());
  return projectId?.trim() || undefined;
};

const buildAdminOptions = (): {
  credential: admin.credential.Credential;
  projectId?: string;
} | null => {
  const envProjectId = resolveProjectId();
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountRaw) {
    const parsed = parseServiceAccountKey(serviceAccountRaw);
    const normalizedAccount: admin.ServiceAccount = {
      projectId: pickString(parsed.project_id, parsed.projectId),
      clientEmail: pickString(parsed.client_email, parsed.clientEmail),
      privateKey: pickString(parsed.private_key, parsed.privateKey)?.replace(/\\n/g, '\n'),
    };
    const projectId =
      pickString(normalizedAccount.projectId, parsed.project_id, parsed.projectId) ?? envProjectId;
    return {
      credential: admin.credential.cert(normalizedAccount),
      projectId,
    };
  }

  try {
    return {
      credential: admin.credential.applicationDefault(),
      projectId: envProjectId,
    };
  } catch (error) {
    console.error("Impossible d'utiliser les identifiants Firebase Admin par défaut", error);
  }

  return null;
};

export const getFirebaseAdminApp = (): admin.app.App => {
  if (cachedApp) {
    return cachedApp;
  }
  if (admin.apps.length) {
    cachedApp = admin.apps[0]!;
    return cachedApp;
  }

  const options = buildAdminOptions();
  if (!options?.credential) {
    throw new Error('Firebase Admin credential introuvable.');
  }

  cachedApp = admin.initializeApp({
    credential: options.credential,
    projectId: options.projectId,
  });
  return cachedApp;
};

export const getFirebaseAdminAuth = () => admin.auth(getFirebaseAdminApp());

export const getFirebaseAdminFirestore = () => admin.firestore(getFirebaseAdminApp());

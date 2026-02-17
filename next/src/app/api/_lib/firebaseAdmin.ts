import admin from 'firebase-admin';

let cachedApp: admin.app.App | null = null;

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

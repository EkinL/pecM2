import admin from 'firebase-admin';

let cachedApp: admin.app.App | null = null;

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
    try {
      const parsed = JSON.parse(serviceAccountRaw) as { project_id?: string };
      const projectId =
        (typeof parsed?.project_id === 'string' && parsed.project_id.trim()
          ? parsed.project_id.trim()
          : undefined) ?? envProjectId;
      return {
        credential: admin.credential.cert(parsed as admin.ServiceAccount),
        projectId,
      };
    } catch (error) {
      console.error("Impossible d'analyser FIREBASE_SERVICE_ACCOUNT_KEY", error);
    }
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

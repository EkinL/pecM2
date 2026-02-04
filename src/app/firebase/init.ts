import { getApp, getApps, initializeApp } from "firebase/app";
import { getAnalytics, isSupported as isAnalyticsSupported } from "firebase/analytics";
import { getFunctions } from "firebase/functions";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseEnv = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const missingKeys = Object.entries({
  NEXT_PUBLIC_FIREBASE_API_KEY: firebaseEnv.apiKey,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: firebaseEnv.authDomain,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: firebaseEnv.projectId,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: firebaseEnv.storageBucket,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: firebaseEnv.messagingSenderId,
  NEXT_PUBLIC_FIREBASE_APP_ID: firebaseEnv.appId,
})
  .flatMap(([key, value]) => (value ? [] : [key]));

if (missingKeys.length > 0) {
  throw new Error(`Missing ${missingKeys.join(", ")}. Define it in .env.local.`);
}

const firebaseConfig: {
  apiKey: string | undefined;
  authDomain: string | undefined;
  projectId: string | undefined;
  storageBucket: string | undefined;
  messagingSenderId: string | undefined;
  appId: string | undefined;
  measurementId?: string | undefined;
} = {
  apiKey: firebaseEnv.apiKey,
  authDomain: firebaseEnv.authDomain,
  projectId: firebaseEnv.projectId,
  storageBucket: firebaseEnv.storageBucket,
  messagingSenderId: firebaseEnv.messagingSenderId,
  appId: firebaseEnv.appId,
};

if (firebaseEnv.measurementId) {
  firebaseConfig.measurementId = firebaseEnv.measurementId;
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const functions = getFunctions(app);
export const auth = getAuth(app);
export const firestore = db;
export const analyticsPromise = isAnalyticsSupported()
  .then((supported) => {
    if (supported) {
      return getAnalytics(app);
    }
    return null;
  })
  .catch(() => null);

export { app, functions };

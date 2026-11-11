import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import defaultConfig from '../../firebase-applet-config.json';

const metaEnv = ((import.meta as any).env || (typeof process !== 'undefined' ? process.env : {}) || {}) as Record<string, string | undefined>;

const firebaseConfig = {
  projectId: metaEnv.FIREBASE_PROJECT_ID || metaEnv.VITE_FIREBASE_PROJECT_ID || defaultConfig.projectId,
  appId: metaEnv.FIREBASE_APP_ID || metaEnv.VITE_FIREBASE_APP_ID || defaultConfig.appId,
  apiKey: metaEnv.FIREBASE_API_KEY || metaEnv.VITE_FIREBASE_API_KEY || defaultConfig.apiKey,
  authDomain: metaEnv.FIREBASE_AUTH_DOMAIN || metaEnv.VITE_FIREBASE_AUTH_DOMAIN || defaultConfig.authDomain,
  firestoreDatabaseId:
    metaEnv.FIREBASE_FIRESTORE_DATABASE_ID ||
    metaEnv.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
    defaultConfig.firestoreDatabaseId,
  storageBucket:
    metaEnv.FIREBASE_STORAGE_BUCKET || metaEnv.VITE_FIREBASE_STORAGE_BUCKET || defaultConfig.storageBucket,
  messagingSenderId:
    metaEnv.FIREBASE_MESSAGING_SENDER_ID ||
    metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    defaultConfig.messagingSenderId,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export default app;

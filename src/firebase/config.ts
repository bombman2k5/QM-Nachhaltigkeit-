import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import defaultConfig from '../../firebase-applet-config.json';

const firebaseConfig = {
  projectId: (import.meta.env.FIREBASE_PROJECT_ID as string) || (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || defaultConfig.projectId,
  appId: (import.meta.env.FIREBASE_APP_ID as string) || (import.meta.env.VITE_FIREBASE_APP_ID as string) || defaultConfig.appId,
  apiKey: (import.meta.env.FIREBASE_API_KEY as string) || (import.meta.env.VITE_FIREBASE_API_KEY as string) || defaultConfig.apiKey,
  authDomain: (import.meta.env.FIREBASE_AUTH_DOMAIN as string) || (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string) || defaultConfig.authDomain,
  firestoreDatabaseId: (import.meta.env.FIREBASE_FIRESTORE_DATABASE_ID as string) || (import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID as string) || defaultConfig.firestoreDatabaseId,
  storageBucket: (import.meta.env.FIREBASE_STORAGE_BUCKET as string) || (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string) || defaultConfig.storageBucket,
  messagingSenderId: (import.meta.env.FIREBASE_MESSAGING_SENDER_ID as string) || (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string) || defaultConfig.messagingSenderId,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export default app;

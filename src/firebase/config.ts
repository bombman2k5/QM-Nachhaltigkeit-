import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import defaultConfig from '../../firebase-applet-config.json';

const metaEnv = ((import.meta as any).env || (typeof process !== 'undefined' ? process.env : {}) || {}) as Record<string, string | undefined>;

function cleanConfigValue(envVal: string | undefined, fallback: string): string {
  const cleaned = (envVal || '').replace(/^['"]+|['"]+$/g, '').trim();
  if (!cleaned || cleaned.startsWith('MY_')) return fallback;
  return cleaned;
}

/**
 * Normalizes the Firestore Database ID so that if an environment variable was configured
 * without the mandatory `ai-studio-` prefix (e.g. `dgnbenv12qmprfto-...`), it automatically
 * resolves to the actual provisioned database `ai-studio-dgnbenv12qmprfto-...`.
 */
export function normalizeFirestoreDatabaseId(
  candidate?: string | null,
  fallback: string = defaultConfig.firestoreDatabaseId
): string {
  const cleaned = (candidate || '').replace(/^['"]+|['"]+$/g, '').trim();
  if (!cleaned || cleaned.startsWith('MY_')) return fallback;
  if (!cleaned.startsWith('ai-studio-') && fallback.startsWith('ai-studio-') && fallback.endsWith(cleaned)) {
    return fallback;
  }
  if (cleaned.startsWith('dgnbenv12qmprfto-')) {
    return `ai-studio-${cleaned}`;
  }
  return cleaned;
}

export const firebaseConfig = {
  projectId: cleanConfigValue(
    metaEnv.FIREBASE_PROJECT_ID || metaEnv.VITE_FIREBASE_PROJECT_ID,
    defaultConfig.projectId
  ),
  appId: cleanConfigValue(
    metaEnv.FIREBASE_APP_ID || metaEnv.VITE_FIREBASE_APP_ID,
    defaultConfig.appId
  ),
  apiKey: cleanConfigValue(
    metaEnv.FIREBASE_API_KEY || metaEnv.VITE_FIREBASE_API_KEY,
    defaultConfig.apiKey
  ),
  authDomain: cleanConfigValue(
    metaEnv.FIREBASE_AUTH_DOMAIN || metaEnv.VITE_FIREBASE_AUTH_DOMAIN,
    defaultConfig.authDomain
  ),
  firestoreDatabaseId: normalizeFirestoreDatabaseId(
    metaEnv.FIREBASE_FIRESTORE_DATABASE_ID || metaEnv.VITE_FIREBASE_FIRESTORE_DATABASE_ID,
    defaultConfig.firestoreDatabaseId
  ),
  storageBucket: cleanConfigValue(
    metaEnv.FIREBASE_STORAGE_BUCKET || metaEnv.VITE_FIREBASE_STORAGE_BUCKET,
    defaultConfig.storageBucket
  ),
  messagingSenderId: cleanConfigValue(
    metaEnv.FIREBASE_MESSAGING_SENDER_ID || metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
    defaultConfig.messagingSenderId
  ),
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on boot in browser context
if (typeof window !== 'undefined') {
  (async function testConnection() {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (error) {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.error('Please check your Firebase configuration.');
      }
    }
  })();
}

export default app;

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  setDoc,
  Unsubscribe,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from '../firebase/config';
import { safeFetchJson } from './safeFetch';

export const ADMIN_EMAILS = ['brian.lackmann@kaubit.de', 'brianlackmann@gmail.com'] as const;

export const LOCAL_VAULT_KEY = 'qm_company_vault_v2';

export interface CompanyVaultData {
  hasPassphraseConfigured: boolean;
  saltHex: string;
  verifierHex: string;
  authorizedEmails: string[];
  updatedAt?: string;
  updatedByEmail?: string;
  source?: 'firestore' | 'server' | 'local' | 'default';
  verifiedFromServer?: boolean;
}

export interface SaveCompanyVaultResult {
  authorizedEmails: string[];
  persistedToFirestore: boolean;
  verifiedFromServer: boolean;
  updatedAt: string;
  source: 'firestore' | 'server' | 'local';
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return ADMIN_EMAILS.includes(normalized as any);
}

export function normalizeEmailList(emails: string[]): string[] {
  return Array.from(
    new Set([
      ...ADMIN_EMAILS,
      ...(emails || [])
        .map((e) => (typeof e === 'string' ? e.trim().toLowerCase() : ''))
        .filter((e) => Boolean(e && e.includes('@'))),
    ])
  );
}

export function emailToEmployeeDocId(email: string): string {
  return (email || '')
    .trim()
    .toLowerCase()
    .replace(/@/g, '_at_')
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 120);
}

export function isCorporateEmailAuthorized(
  corporateEmail: string,
  authorizedEmails: string[]
): boolean {
  const clean = (corporateEmail || '').trim().toLowerCase();
  if (!clean || !clean.includes('@')) return false;
  if (isAdminEmail(clean)) return true;
  const normalizedList = normalizeEmailList(authorizedEmails);
  return normalizedList.includes(clean);
}

interface LocalVaultCache {
  saltHex?: string;
  verifierHex?: string;
  authorizedEmails?: string[];
  updatedAt?: string;
  syncedToFirestore?: boolean;
}

function readLocalVaultCache(): LocalVaultCache | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_VAULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as LocalVaultCache;
  } catch {
    return null;
  }
}

function writeLocalVaultCache(cache: LocalVaultCache): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_VAULT_KEY, JSON.stringify(cache));
  } catch {}
}

function getEffectiveUser(passedUser?: User | null): User | null {
  return passedUser || auth.currentUser || null;
}

function getEffectiveUserEmail(user: User | null): string {
  if (!user) return '';
  if (user.email) return user.email.trim().toLowerCase();
  const providerEmail = user.providerData?.find((p) => p?.email)?.email;
  return (providerEmail || '').trim().toLowerCase();
}

/**
 * Synchronizes individual employee documents in `/employees/{employeeId}` in Firestore
 * alongside `vault/company` so every authorized corporate email is also visible and queryable
 * as an individual Firestore document.
 */
async function syncEmployeeCollectionInFirestore(
  normalizedEmails: string[],
  adminEmail: string,
  adminUid: string,
  nowIso: string
): Promise<void> {
  const expectedIds = new Set<string>();

  // 1. Upsert all currently authorized employee emails
  for (const email of normalizedEmails) {
    const docId = emailToEmployeeDocId(email);
    if (!docId) continue;
    expectedIds.add(docId);
    await setDoc(
      doc(db, 'employees', docId),
      {
        email,
        role: isAdminEmail(email) ? 'admin' : 'employee',
        updatedAt: nowIso,
        addedByEmail: adminEmail,
        addedByUid: adminUid,
      },
      { merge: true }
    );
  }

  // 2. Remove any deleted non-admin employee documents
  try {
    const existingSnap = await getDocs(collection(db, 'employees'));
    const deletions: Promise<void>[] = [];
    existingSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const docEmail = typeof data?.email === 'string' ? data.email.trim().toLowerCase() : '';
      if (!expectedIds.has(docSnap.id) && !isAdminEmail(docEmail)) {
        deletions.push(deleteDoc(doc(db, 'employees', docSnap.id)));
      }
    });
    if (deletions.length > 0) {
      await Promise.all(deletions);
    }
  } catch (cleanupErr) {
    console.warn('Firestore employees collection cleanup note:', cleanupErr);
  }
}

/**
 * Loads the company vault configuration (saltHex, verifierHex, authorizedEmails)
 * primarily from Firebase Firestore (`vault/company` + `employees` collection),
 * with automatic migration of any un-synced legacy local data and fallback to server/localStorage.
 */
export async function loadCompanyVault(
  currentUser: User | null,
  token?: string,
  options?: { skipLocalFallback?: boolean }
): Promise<CompanyVaultData> {
  const effectiveUser = getEffectiveUser(currentUser);
  const effectiveEmail = getEffectiveUserEmail(effectiveUser);
  const localCache = readLocalVaultCache();

  let hasPassphraseConfigured = false;
  let saltHex = '';
  let verifierHex = '';
  let authorizedEmails: string[] = [...ADMIN_EMAILS];
  let updatedAt: string | undefined;
  let updatedByEmail: string | undefined;
  let source: 'firestore' | 'server' | 'local' | 'default' = 'default';
  let verifiedFromServer = false;
  let firestoreVaultExists = false;

  // 1. Primary source: Firebase Firestore (`vault/company` + `employees`)
  if (effectiveUser) {
    try {
      let vaultSnap;
      try {
        vaultSnap = await getDocFromServer(doc(db, 'vault', 'company'));
        verifiedFromServer = true;
      } catch {
        vaultSnap = await getDoc(doc(db, 'vault', 'company'));
      }

      const firestoreEmailBucket: string[] = [];

      if (vaultSnap.exists()) {
        firestoreVaultExists = true;
        source = 'firestore';
        const vdata = vaultSnap.data();

        if (typeof vdata?.saltHex === 'string' && typeof vdata?.verifierHex === 'string') {
          const cleanSalt = vdata.saltHex.trim();
          const cleanVerifier = vdata.verifierHex.trim();
          if (cleanSalt.length >= 16 && cleanVerifier.length >= 16) {
            hasPassphraseConfigured = true;
            saltHex = cleanSalt;
            verifierHex = cleanVerifier;
          }
        }

        if (Array.isArray(vdata?.authorizedEmails)) {
          firestoreEmailBucket.push(...vdata.authorizedEmails);
        }
        if (typeof vdata?.updatedAt === 'string') {
          updatedAt = vdata.updatedAt;
        }
        if (typeof vdata?.updatedByEmail === 'string') {
          updatedByEmail = vdata.updatedByEmail;
        }
      }

      // Also check `/employees` collection in Firestore
      try {
        let empSnap;
        try {
          empSnap = await getDocsFromServer(collection(db, 'employees'));
          verifiedFromServer = true;
        } catch {
          empSnap = await getDocs(collection(db, 'employees'));
        }
        if (!empSnap.empty) {
          source = 'firestore';
          empSnap.forEach((docItem) => {
            const d = docItem.data();
            if (typeof d?.email === 'string' && d.email.includes('@')) {
              firestoreEmailBucket.push(d.email);
            }
          });
        }
      } catch (empErr) {
        console.warn('Firestore employees read note:', empErr);
      }

      if (firestoreEmailBucket.length > 0) {
        authorizedEmails = normalizeEmailList(firestoreEmailBucket);
      }

      // Legacy migration check: if passphrase was stored on `users/{uid}` in an older version
      if (!hasPassphraseConfigured && isAdminEmail(effectiveEmail)) {
        try {
          const userSnap = await getDoc(doc(db, 'users', effectiveUser.uid));
          if (userSnap.exists()) {
            const udata = userSnap.data();
            if (
              typeof udata?.passphraseSalt === 'string' &&
              udata.passphraseSalt.length >= 16 &&
              typeof udata?.passphraseVerifier === 'string' &&
              udata.passphraseVerifier.length >= 16
            ) {
              hasPassphraseConfigured = true;
              saltHex = udata.passphraseSalt;
              verifierHex = udata.passphraseVerifier;
            }
          }
        } catch {}
      }

      // Self-healing migration: If Admin has un-synced local cache (from before Firestore rules were deployed)
      // or if Firestore `vault/company` does not exist yet while localCache has data, migrate to Firestore immediately!
      if (isAdminEmail(effectiveEmail) && localCache && !options?.skipLocalFallback) {
        const needsMigrationToFirestore =
          !firestoreVaultExists ||
          localCache.syncedToFirestore !== true ||
          (!hasPassphraseConfigured && Boolean(localCache.saltHex && localCache.verifierHex));

        if (needsMigrationToFirestore) {
          const mergedSalt = saltHex || localCache.saltHex || '';
          const mergedVerifier = verifierHex || localCache.verifierHex || '';
          const mergedEmails = normalizeEmailList([
            ...authorizedEmails,
            ...(Array.isArray(localCache.authorizedEmails) ? localCache.authorizedEmails : []),
          ]);

          if (mergedSalt && mergedVerifier) {
            hasPassphraseConfigured = true;
            saltHex = mergedSalt;
            verifierHex = mergedVerifier;
          }
          authorizedEmails = mergedEmails;

          try {
            const effectiveToken = token || (await effectiveUser.getIdToken());
            await saveCompanyVault(effectiveUser, effectiveToken, {
              saltHex: mergedSalt,
              verifierHex: mergedVerifier,
              authorizedEmails: mergedEmails,
            });
            source = 'firestore';
            verifiedFromServer = true;
          } catch (migErr) {
            console.warn('Firestore auto-migration note:', migErr);
          }
        }
      }

      // Mirror authoritative Firestore state to localStorage cache
      if (source === 'firestore') {
        writeLocalVaultCache({
          saltHex,
          verifierHex,
          authorizedEmails,
          updatedAt: updatedAt || new Date().toISOString(),
          syncedToFirestore: true,
        });
      }
    } catch (err) {
      console.warn('Firestore vault/company read note:', err);
    }
  }

  // 2. Fallback: Server session state (which also syncs with Firestore REST API & server disk)
  if (source !== 'firestore') {
    let effectiveToken = token || '';
    if (!effectiveToken && effectiveUser) {
      try {
        effectiveToken = await effectiveUser.getIdToken();
      } catch {}
    }

    if (effectiveToken) {
      const verifyRes = await safeFetchJson<{
        success: boolean;
        hasPassphraseConfigured?: boolean;
        saltHex?: string | null;
        verifierHex?: string | null;
        authorizedEmails?: string[];
        updatedAt?: string;
      }>('/api/auth/verify-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${effectiveToken}`,
        },
        body: JSON.stringify({ idToken: effectiveToken }),
      });

      if (verifyRes.ok && verifyRes.data?.success) {
        if (verifyRes.data.saltHex && verifyRes.data.verifierHex) {
          hasPassphraseConfigured = true;
          saltHex = verifyRes.data.saltHex;
          verifierHex = verifyRes.data.verifierHex;
          source = 'server';
        }
        if (Array.isArray(verifyRes.data.authorizedEmails) && verifyRes.data.authorizedEmails.length > 0) {
          authorizedEmails = normalizeEmailList(verifyRes.data.authorizedEmails);
          if (source === 'default') source = 'server';
        }
      }
    }
  }

  // 3. Last-resort fallback: LocalStorage vault cache (unless explicitly skipped for persistence verification)
  if (source === 'default' && !options?.skipLocalFallback && localCache) {
    if (localCache.saltHex && localCache.verifierHex) {
      hasPassphraseConfigured = true;
      saltHex = String(localCache.saltHex);
      verifierHex = String(localCache.verifierHex);
      source = 'local';
    }
    if (Array.isArray(localCache.authorizedEmails)) {
      authorizedEmails = normalizeEmailList(localCache.authorizedEmails);
      if (source === 'default') source = 'local';
    }
  }

  return {
    hasPassphraseConfigured,
    saltHex,
    verifierHex,
    authorizedEmails,
    updatedAt,
    updatedByEmail,
    source,
    verifiedFromServer,
  };
}

/**
 * Saves the company passphrase verifier and/or authorized employee emails to Firebase Firestore
 * (`vault/company` + `employees` collection), verifies the server write, and updates server + local cache.
 */
export async function saveCompanyVaultWithStatus(
  currentUser: User | null,
  token: string,
  payload: {
    saltHex?: string;
    verifierHex?: string;
    authorizedEmails: string[];
  }
): Promise<SaveCompanyVaultResult> {
  const effectiveUser = getEffectiveUser(currentUser);
  const effectiveEmail = getEffectiveUserEmail(effectiveUser);
  const normalizedEmails = normalizeEmailList(payload.authorizedEmails);
  const nowIso = new Date().toISOString();

  // Preserve existing saltHex / verifierHex if caller only passed authorizedEmails
  const localCache = readLocalVaultCache();
  let effectiveSaltHex = (payload.saltHex || localCache?.saltHex || '').trim();
  let effectiveVerifierHex = (payload.verifierHex || localCache?.verifierHex || '').trim();

  let persistedToFirestore = false;
  let verifiedFromServer = false;

  // 1. Primary Persistence: Save to Firebase Firestore `vault/company` AND `employees/{id}`
  if (effectiveUser && isAdminEmail(effectiveEmail)) {
    try {
      // If saltHex/verifierHex are still empty, check if Firestore already has them so we don't lose them
      if (!effectiveSaltHex || !effectiveVerifierHex) {
        try {
          const existingSnap = await getDoc(doc(db, 'vault', 'company'));
          if (existingSnap.exists()) {
            const existingData = existingSnap.data();
            if (!effectiveSaltHex && typeof existingData?.saltHex === 'string') {
              effectiveSaltHex = existingData.saltHex;
            }
            if (!effectiveVerifierHex && typeof existingData?.verifierHex === 'string') {
              effectiveVerifierHex = existingData.verifierHex;
            }
          }
        } catch {}
      }

      const firestoreVaultPayload: Record<string, any> = {
        updatedAt: nowIso,
        updatedByEmail: effectiveEmail,
        updatedByUid: effectiveUser.uid,
        authorizedEmails: normalizedEmails,
      };
      if (effectiveSaltHex.length >= 16 && effectiveVerifierHex.length >= 16) {
        firestoreVaultPayload.saltHex = effectiveSaltHex;
        firestoreVaultPayload.verifierHex = effectiveVerifierHex;
      }

      await setDoc(doc(db, 'vault', 'company'), firestoreVaultPayload, { merge: true });

      // Sync individual documents in `/employees/{employeeId}`
      await syncEmployeeCollectionInFirestore(
        normalizedEmails,
        effectiveEmail,
        effectiveUser.uid,
        nowIso
      );

      persistedToFirestore = true;

      // Verify by reading directly from the remote Firebase Firestore server
      try {
        const serverSnap = await getDocFromServer(doc(db, 'vault', 'company'));
        if (serverSnap.exists()) {
          const serverData = serverSnap.data();
          if (Array.isArray(serverData?.authorizedEmails)) {
            verifiedFromServer = true;
          }
        }
      } catch (verifyErr) {
        console.warn('Firestore server verification read note:', verifyErr);
      }
    } catch (err) {
      console.error('Firestore vault/company write failed:', err);
      try {
        handleFirestoreError(err, OperationType.WRITE, 'vault/company');
      } catch (structuredErr) {
        // Re-throw if server fallback cannot save either, or log structured error for diagnostics
        console.error(structuredErr);
      }
    }
  }

  // 2. Save to Backend Server (which also persists to Firestore REST API + disk)
  let effectiveToken = token;
  if (!effectiveToken && effectiveUser) {
    try {
      effectiveToken = await effectiveUser.getIdToken();
    } catch {}
  }

  let savedOnServer = false;
  if (effectiveToken) {
    const endpoint =
      effectiveSaltHex && effectiveVerifierHex
        ? '/api/auth/save-passphrase-verifier'
        : '/api/auth/manage-employees';

    const serverRes = await safeFetchJson<{
      success: boolean;
      authorizedEmails?: string[];
      persistedToFirestore?: boolean;
    }>(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${effectiveToken}`,
      },
      body: JSON.stringify({
        idToken: effectiveToken,
        saltHex: effectiveSaltHex || undefined,
        verifierHex: effectiveVerifierHex || undefined,
        authorizedEmails: normalizedEmails,
      }),
    });

    if (serverRes.ok && serverRes.data?.success) {
      savedOnServer = true;
      if (serverRes.data.persistedToFirestore) {
        persistedToFirestore = true;
        verifiedFromServer = true;
      }
    }
  }

  // 3. Mirror to LocalStorage cache with explicit sync flag
  writeLocalVaultCache({
    saltHex: effectiveSaltHex,
    verifierHex: effectiveVerifierHex,
    authorizedEmails: normalizedEmails,
    updatedAt: nowIso,
    syncedToFirestore: persistedToFirestore,
  });

  return {
    authorizedEmails: normalizedEmails,
    persistedToFirestore,
    verifiedFromServer,
    updatedAt: nowIso,
    source: persistedToFirestore ? 'firestore' : savedOnServer ? 'server' : 'local',
  };
}

/**
 * Backward-compatible wrapper returning the normalized list of authorized emails.
 */
export async function saveCompanyVault(
  currentUser: User | null,
  token: string,
  payload: {
    saltHex: string;
    verifierHex: string;
    authorizedEmails: string[];
  }
): Promise<string[]> {
  const res = await saveCompanyVaultWithStatus(currentUser, token, payload);
  return res.authorizedEmails;
}

/**
 * Updates the list of authorized employee business email accounts (Admin only).
 * Persists immediately to Firebase Firestore (`vault/company` & `employees` collection)
 * even if `saltHex`/`verifierHex` are not passed.
 */
export async function updateAuthorizedEmployeeEmails(
  currentUser: User | null,
  token: string,
  currentVault: { saltHex?: string; verifierHex?: string },
  authorizedEmails: string[]
): Promise<string[]> {
  const res = await saveCompanyVaultWithStatus(currentUser, token, {
    saltHex: currentVault?.saltHex || '',
    verifierHex: currentVault?.verifierHex || '',
    authorizedEmails,
  });
  return res.authorizedEmails;
}

/**
 * Clears the local vault cache (`localStorage`) and reloads the company vault and employee emails
 * strictly from Firebase Firestore (`getDocFromServer`) / backend server to prove persistence.
 */
export async function verifyVaultPersistenceWithoutLocalCache(
  currentUser: User | null,
  token?: string
): Promise<CompanyVaultData> {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(LOCAL_VAULT_KEY);
    } catch {}
  }
  return loadCompanyVault(currentUser, token, { skipLocalFallback: true });
}

/**
 * Subscribes in real time to Firebase Firestore `vault/company` changes when a user is authenticated.
 */
export function subscribeToCompanyVault(
  currentUser: User | null,
  onUpdate: (vault: CompanyVaultData) => void
): Unsubscribe | null {
  const effectiveUser = getEffectiveUser(currentUser);
  if (!effectiveUser) return null;

  return onSnapshot(
    doc(db, 'vault', 'company'),
    (snap) => {
      if (!snap.exists()) return;
      const vdata = snap.data();
      const cleanSalt = typeof vdata?.saltHex === 'string' ? vdata.saltHex.trim() : '';
      const cleanVerifier = typeof vdata?.verifierHex === 'string' ? vdata.verifierHex.trim() : '';
      const hasPassphraseConfigured = cleanSalt.length >= 16 && cleanVerifier.length >= 16;
      const authorizedEmails = normalizeEmailList(
        Array.isArray(vdata?.authorizedEmails) ? vdata.authorizedEmails : []
      );

      writeLocalVaultCache({
        saltHex: cleanSalt,
        verifierHex: cleanVerifier,
        authorizedEmails,
        updatedAt: typeof vdata?.updatedAt === 'string' ? vdata.updatedAt : new Date().toISOString(),
        syncedToFirestore: true,
      });

      onUpdate({
        hasPassphraseConfigured,
        saltHex: cleanSalt,
        verifierHex: cleanVerifier,
        authorizedEmails,
        updatedAt: typeof vdata?.updatedAt === 'string' ? vdata.updatedAt : undefined,
        updatedByEmail: typeof vdata?.updatedByEmail === 'string' ? vdata.updatedByEmail : undefined,
        source: 'firestore',
        verifiedFromServer: true,
      });
    },
    (error) => {
      console.warn('Firestore vault/company listener note:', error);
    }
  );
}

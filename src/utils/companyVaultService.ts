import { doc, getDoc, setDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../firebase/config';
import { safeFetchJson } from './safeFetch';

export const ADMIN_EMAILS = ['brian.lackmann@kaubit.de', 'brianlackmann@gmail.com'] as const;

const LOCAL_VAULT_KEY = 'qm_company_vault_v2';

export interface CompanyVaultData {
  hasPassphraseConfigured: boolean;
  saltHex: string;
  verifierHex: string;
  authorizedEmails: string[];
  updatedAt?: string;
  updatedByEmail?: string;
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
      ...(emails || []).map((e) => (e || '').trim().toLowerCase()).filter(Boolean),
    ])
  );
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

/**
 * Loads the company vault configuration (saltHex, verifierHex, authorizedEmails)
 * from Firestore (`vault/company`), with fallback to server and localStorage.
 */
export async function loadCompanyVault(
  currentUser: User | null,
  token?: string
): Promise<CompanyVaultData> {
  let hasPassphraseConfigured = false;
  let saltHex = '';
  let verifierHex = '';
  let authorizedEmails: string[] = [...ADMIN_EMAILS];

  // 1. Primary source: Firestore `vault/company`
  if (currentUser) {
    try {
      const vaultSnap = await getDoc(doc(db, 'vault', 'company'));
      if (vaultSnap.exists()) {
        const vdata = vaultSnap.data();
        if (vdata?.saltHex && vdata?.verifierHex) {
          hasPassphraseConfigured = true;
          saltHex = String(vdata.saltHex);
          verifierHex = String(vdata.verifierHex);
          if (Array.isArray(vdata.authorizedEmails)) {
            authorizedEmails = normalizeEmailList(vdata.authorizedEmails);
          }
        }
      }
    } catch (err) {
      console.warn('Firestore vault/company read note:', err);
    }
  }

  // 2. Fallback: LocalStorage vault cache
  if (!hasPassphraseConfigured && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_VAULT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.saltHex && parsed?.verifierHex) {
          hasPassphraseConfigured = true;
          saltHex = String(parsed.saltHex);
          verifierHex = String(parsed.verifierHex);
          if (Array.isArray(parsed.authorizedEmails)) {
            authorizedEmails = normalizeEmailList(parsed.authorizedEmails);
          }
        }
      }
    } catch {}
  }

  // 3. Fallback: Server session state
  if (!hasPassphraseConfigured && token) {
    const verifyRes = await safeFetchJson<{
      success: boolean;
      hasPassphraseConfigured?: boolean;
      saltHex?: string | null;
      verifierHex?: string | null;
      authorizedEmails?: string[];
    }>('/api/auth/verify-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ idToken: token }),
    });

    if (verifyRes.ok && verifyRes.data?.hasPassphraseConfigured && verifyRes.data.saltHex && verifyRes.data.verifierHex) {
      hasPassphraseConfigured = true;
      saltHex = verifyRes.data.saltHex;
      verifierHex = verifyRes.data.verifierHex;
      if (Array.isArray(verifyRes.data.authorizedEmails)) {
        authorizedEmails = normalizeEmailList(verifyRes.data.authorizedEmails);
      }
    }
  }

  return {
    hasPassphraseConfigured,
    saltHex,
    verifierHex,
    authorizedEmails,
  };
}

/**
 * Saves the company passphrase verifier and authorized employee emails (Admin only).
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
  const normalizedEmails = normalizeEmailList(payload.authorizedEmails);
  const nowIso = new Date().toISOString();

  // 1. Save to Firestore `vault/company`
  if (currentUser && isAdminEmail(currentUser.email)) {
    try {
      await setDoc(
        doc(db, 'vault', 'company'),
        {
          saltHex: payload.saltHex,
          verifierHex: payload.verifierHex,
          updatedAt: nowIso,
          updatedByEmail: (currentUser.email || '').trim(),
          updatedByUid: currentUser.uid,
          authorizedEmails: normalizedEmails,
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('Firestore vault/company write note:', err);
    }
  }

  // 2. Save to LocalStorage
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(
        LOCAL_VAULT_KEY,
        JSON.stringify({
          saltHex: payload.saltHex,
          verifierHex: payload.verifierHex,
          authorizedEmails: normalizedEmails,
          updatedAt: nowIso,
        })
      );
    } catch {}
  }

  // 3. Save to server
  await safeFetchJson('/api/auth/save-passphrase-verifier', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      idToken: token,
      saltHex: payload.saltHex,
      verifierHex: payload.verifierHex,
      authorizedEmails: normalizedEmails,
    }),
  });

  return normalizedEmails;
}

/**
 * Updates the list of authorized employee business email accounts (Admin only).
 */
export async function updateAuthorizedEmployeeEmails(
  currentUser: User | null,
  token: string,
  currentVault: { saltHex: string; verifierHex: string },
  authorizedEmails: string[]
): Promise<string[]> {
  return saveCompanyVault(currentUser, token, {
    saltHex: currentVault.saltHex,
    verifierHex: currentVault.verifierHex,
    authorizedEmails,
  });
}

import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  limit,
  deleteDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { ParameterEvaluation, ProductEvaluationResult } from '../types/dgnb';
import { encryptData, decryptData } from './crypto';
import { evaluateDgnbCompliance, evaluateTestDateAge } from './dgnbEvaluation';

export const CURRENT_SCHEMA_VERSION = 2;

export interface StoredProductRecord {
  id: string;
  userId: string;
  userEmail: string;
  projectName: string;
  productName: string;
  manufacturer: string;
  qualityLevel: number;
  auditDate: string;
  encryptedPayload: string; // AES-256-GCM hex ciphertext (or legacy JSON string)
  createdAt: string;
  criteriaRowNr?: string;
  schemaVersion?: number;
  isProvisional?: boolean;
  selectedStandardCodes?: string[];
}

export interface CachedEvaluationMatch {
  record: StoredProductRecord;
  result: ProductEvaluationResult;
  source: 'firestore' | 'local';
  warnings: string[];
  isLegacySchema: boolean;
  testDateExpiredNow: boolean;
}

const LOCAL_STORAGE_KEY = 'qm_sustainability_product_audits_v1';

function normalizeSegment(value?: string): string {
  return (value || '')
    .replace(/ä/gi, 'ae')
    .replace(/ö/gi, 'oe')
    .replace(/ü/gi, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Normalizes product name and manufacturer (preserving German umlauts via transliteration)
 * for collision-resistant lookup.
 */
export function normalizeProductKey(name: string, manufacturer?: string): string {
  return `${normalizeSegment(manufacturer)}_${normalizeSegment(name)}`;
}

/**
 * Extracts the primary (DGNB) criteriaRowNr from a ProductEvaluationResult.
 */
export function getPrimaryCriteriaRowNr(result: ProductEvaluationResult): string {
  const dgnbRow = result.standardsEvaluations?.['DGNB']?.matchedCriteriaRowNr;
  if (dgnbRow) return String(dgnbRow);
  const firstStd = Object.values(result.standardsEvaluations || {})[0];
  return firstStd?.matchedCriteriaRowNr ? String(firstStd.matchedCriteriaRowNr) : '1';
}

/**
 * Encrypts a ProductEvaluationResult with the session AES-256-GCM key when available.
 */
export async function encodeStoredPayload(
  result: ProductEvaluationResult,
  encryptionKey?: CryptoKey | null
): Promise<string> {
  if (encryptionKey) {
    return encryptData(result, encryptionKey);
  }
  return JSON.stringify(result);
}

/**
 * Decrypts an AES-256-GCM payload or parses legacy plaintext JSON records backward-compatibly.
 */
export async function decodeStoredPayload(
  encryptedPayload: string,
  encryptionKey?: CryptoKey | null
): Promise<ProductEvaluationResult | null> {
  if (!encryptedPayload || typeof encryptedPayload !== 'string') return null;
  const trimmed = encryptedPayload.trim();

  // Backward compatibility for legacy unencrypted JSON entries
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed) as ProductEvaluationResult;
    } catch {
      return null;
    }
  }

  if (!encryptionKey) {
    return null;
  }

  return decryptData<ProductEvaluationResult>(trimmed, encryptionKey);
}

/**
 * Re-validates a cached evaluation against the current year (e.g. test report age expiry)
 * and checks schema version consistency.
 */
export function revalidateCachedResult(
  cached: ProductEvaluationResult,
  schemaVersion?: number,
  currentYear: number = new Date().getFullYear()
): {
  result: ProductEvaluationResult;
  warnings: string[];
  isLegacySchema: boolean;
  testDateExpiredNow: boolean;
} {
  const cloned: ProductEvaluationResult = JSON.parse(JSON.stringify(cached));
  const warnings: string[] = [];
  const isLegacySchema = (schemaVersion ?? 1) < CURRENT_SCHEMA_VERSION;
  let testDateExpiredNow = false;

  if (isLegacySchema) {
    warnings.push(
      'Dieser Datenbank-Eintrag stammt aus einer älteren Programmversion (Schema v1 ohne Zitat-Gegenprüfung). Ein erneuter PDF-Scan wird empfohlen.'
    );
    cloned.isProvisional = true;
  }

  const updateParamsForCurrentYear = (params: ParameterEvaluation[]) => {
    for (const p of params) {
      const isDateParam =
        p.key === 'testDate' ||
        p.parameterKey === 'testDate' ||
        p.parameterName.toLowerCase().includes('alter') ||
        p.parameterName.toLowerCase().includes('prüfbericht');
      if (!isDateParam) continue;

      const rawVal = (p.productValue || '').trim();
      if (!rawVal || rawVal.toLowerCase().includes('nicht angegeben')) continue;

      const ageCheck = evaluateTestDateAge(rawVal, currentYear);
      if (ageCheck.achievedLevel < p.achievedLevel) {
        p.achievedLevel = ageCheck.achievedLevel;
        p.status = ageCheck.status;
        p.explanation = `${ageCheck.explanation} (Automatische Altersprüfung ${currentYear})`;
        testDateExpiredNow = true;
      }
    }
  };

  if (cloned.standardsEvaluations) {
    for (const code of Object.keys(cloned.standardsEvaluations)) {
      const stdEval = cloned.standardsEvaluations[code];
      if (!stdEval?.parameters) continue;
      updateParamsForCurrentYear(stdEval.parameters);
      const recomputed = evaluateDgnbCompliance(
        stdEval.parameters,
        cloned.hasBauteilekatalog ?? true
      );
      stdEval.parameters = recomputed.evaluatedParameters;
      stdEval.overallLevelNum = recomputed.overallLevel;
      stdEval.overallRating = `QS ${recomputed.overallLevel}`;
      stdEval.isCompliant = recomputed.overallLevel >= 1 && recomputed.bottleneckParameter?.status !== 'fail';
      stdEval.bottleneckParameter = recomputed.bottleneckParameter?.parameterName;
      stdEval.bottleneckReason = recomputed.bottleneckReason;
      stdEval.userExplanation = recomputed.userExplanation;
    }
  }

  if (testDateExpiredNow) {
    warnings.push(
      'Achtung: Das Alter des gespeicherten Prüfberichts hat sich seit der ersten Speicherung erhöht und die Einstufung wurde automatisch aktualisiert.'
    );
  }

  if (warnings.length > 0) {
    const existingAssumptions = Array.isArray(cloned.assumptions) ? cloned.assumptions : [];
    const merged = [...existingAssumptions];
    for (const w of warnings) {
      if (!merged.includes(w)) merged.push(w);
    }
    cloned.assumptions = merged;
  }

  return {
    result: cloned,
    warnings,
    isLegacySchema,
    testDateExpiredNow,
  };
}

/**
 * Saves a completed product evaluation to Firestore & LocalStorage (encrypted with AES-256-GCM).
 */
export async function saveProductEvaluationToDb(
  result: ProductEvaluationResult,
  userId?: string,
  userEmail?: string,
  encryptionKey?: CryptoKey | null
): Promise<boolean> {
  const effectiveUid = auth.currentUser?.uid || userId || 'auditor-default-id';
  const effectiveEmail = auth.currentUser?.email || userEmail || 'auditor@bau-qm.org';
  const rawAuditId = result.auditMetadata?.auditId || `audit_${Date.now()}`;
  const auditId = rawAuditId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);

  const dgnbEval = result.standardsEvaluations?.['DGNB'];
  const firstStd = Object.values(result.standardsEvaluations || {})[0];
  const rawLevel = dgnbEval?.overallLevelNum ?? firstStd?.overallLevelNum ?? 1;
  const qualityLevel = Math.max(0, Math.min(4, Math.round(rawLevel)));

  const encryptedPayload = await encodeStoredPayload(result, encryptionKey);
  const criteriaRowNr = getPrimaryCriteriaRowNr(result).slice(0, 32);

  const recordPayload: StoredProductRecord = {
    id: auditId,
    userId: effectiveUid,
    userEmail: effectiveEmail,
    projectName: (result.auditMetadata?.projectName || 'Nachhaltigkeitsprüfung').slice(0, 250),
    productName: (result.productName || 'Unbekanntes Produkt').slice(0, 250),
    manufacturer: (result.manufacturer || 'Unbekannter Hersteller').slice(0, 250),
    qualityLevel,
    auditDate: result.auditMetadata?.auditDate || new Date().toISOString(),
    encryptedPayload,
    createdAt: new Date().toISOString(),
    criteriaRowNr,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    isProvisional: Boolean(result.isProvisional),
    selectedStandardCodes: (result.selectedStandardCodes || ['DGNB']).slice(0, 20),
  };

  // 1. Always save to LocalStorage (instant local cache)
  if (typeof localStorage !== 'undefined') {
    try {
      const existingRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
      const existingList: StoredProductRecord[] = existingRaw ? JSON.parse(existingRaw) : [];
      const targetKey = normalizeProductKey(result.productName, result.manufacturer);
      const filtered = existingList.filter(
        (item) =>
          item.id !== auditId &&
          !(
            normalizeProductKey(item.productName, item.manufacturer) === targetKey &&
            (item.criteriaRowNr || '1') === recordPayload.criteriaRowNr
          )
      );
      filtered.unshift(recordPayload);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered.slice(0, 50)));
    } catch (err) {
      console.warn('LocalStorage save warning:', err);
    }
  }

  // 2. Save to Firebase Firestore (requires authenticated Firebase user)
  if (!auth.currentUser) {
    return false;
  }

  try {
    const docRef = doc(db, 'audits', auditId);
    await setDoc(docRef, recordPayload, { merge: true });
    return true;
  } catch (err) {
    console.warn('Firestore save warning (fallback used):', err);
    return false;
  }
}

function matchesSearch(
  rec: StoredProductRecord,
  productName: string,
  manufacturer?: string
): boolean {
  const recName = normalizeSegment(rec.productName);
  const queryName = normalizeSegment(productName);
  if (!recName || recName !== queryName) return false;

  if (manufacturer && manufacturer.trim()) {
    const recMfr = normalizeSegment(rec.manufacturer);
    const queryMfr = normalizeSegment(manufacturer);
    if (recMfr && queryMfr && recMfr !== queryMfr) {
      return false;
    }
  }
  return true;
}

/**
 * Searches Firestore & LocalStorage for an existing evaluation of a product,
 * decrypts it with the company CryptoKey, and re-validates test report age.
 */
export async function findProductEvaluationInDb(
  productName: string,
  manufacturer?: string,
  encryptionKey?: CryptoKey | null,
  preferredCriteriaRowNr?: string
): Promise<CachedEvaluationMatch | null> {
  if (!productName || !productName.trim()) return null;

  const pickBestRecord = (candidates: StoredProductRecord[]): StoredProductRecord | undefined => {
    const matching = candidates.filter((item) => matchesSearch(item, productName, manufacturer));
    if (matching.length === 0) return undefined;
    if (preferredCriteriaRowNr) {
      const exactRow = matching.find((item) => item.criteriaRowNr === preferredCriteriaRowNr);
      if (exactRow) return exactRow;
    }
    return matching[0];
  };

  // 1. Check LocalStorage first
  if (typeof localStorage !== 'undefined') {
    try {
      const existingRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (existingRaw) {
        const existingList: StoredProductRecord[] = JSON.parse(existingRaw);
        const match = pickBestRecord(existingList);
        if (match && match.encryptedPayload) {
          const decoded = await decodeStoredPayload(match.encryptedPayload, encryptionKey);
          if (decoded) {
            const revalidated = revalidateCachedResult(decoded, match.schemaVersion);
            return {
              record: match,
              result: revalidated.result,
              source: 'local',
              warnings: revalidated.warnings,
              isLegacySchema: revalidated.isLegacySchema,
              testDateExpiredNow: revalidated.testDateExpiredNow,
            };
          }
        }
      }
    } catch (err) {
      console.warn('LocalStorage read warning:', err);
    }
  }

  // 2. Check Firestore Database
  if (!auth.currentUser) return null;

  try {
    const auditsRef = collection(db, 'audits');
    const q = query(auditsRef, limit(50));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const docs = snapshot.docs.map((d) => d.data() as StoredProductRecord);
      const match = pickBestRecord(docs);
      if (match && match.encryptedPayload) {
        const decoded = await decodeStoredPayload(match.encryptedPayload, encryptionKey);
        if (decoded) {
          const revalidated = revalidateCachedResult(decoded, match.schemaVersion);
          return {
            record: match,
            result: revalidated.result,
            source: 'firestore',
            warnings: revalidated.warnings,
            isLegacySchema: revalidated.isLegacySchema,
            testDateExpiredNow: revalidated.testDateExpiredNow,
          };
        }
      }
    }
  } catch (err) {
    console.warn('Firestore lookup warning:', err);
  }

  return null;
}

/**
 * Retrieves all stored product evaluations from LocalStorage and Firestore
 */
export async function getAllSavedEvaluationsFromDb(): Promise<StoredProductRecord[]> {
  const recordsMap = new Map<string, StoredProductRecord>();

  if (typeof localStorage !== 'undefined') {
    try {
      const existingRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (existingRaw) {
        const existingList: StoredProductRecord[] = JSON.parse(existingRaw);
        existingList.forEach((rec) => recordsMap.set(rec.id, rec));
      }
    } catch (err) {
      console.warn('LocalStorage read warning:', err);
    }
  }

  if (auth.currentUser) {
    try {
      const auditsRef = collection(db, 'audits');
      const q = query(auditsRef, limit(50));
      const snapshot = await getDocs(q);
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as StoredProductRecord;
        if (data && data.id) {
          recordsMap.set(data.id, data);
        }
      });
    } catch (err) {
      console.warn('Firestore fetch all warning:', err);
    }
  }

  return Array.from(recordsMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Deletes a stored product evaluation record and its certificate data from LocalStorage & Firestore
 */
export async function deleteProductEvaluationFromDb(
  recordId: string,
  productName?: string,
  manufacturer?: string
): Promise<boolean> {
  const searchKey = productName ? normalizeProductKey(productName, manufacturer) : null;

  if (typeof localStorage !== 'undefined') {
    try {
      const existingRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (existingRaw) {
        const existingList: StoredProductRecord[] = JSON.parse(existingRaw);
        const filtered = existingList.filter((item) => {
          if (item.id === recordId) return false;
          if (searchKey && normalizeProductKey(item.productName, item.manufacturer) === searchKey) {
            return false;
          }
          return true;
        });
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
      }
    } catch (err) {
      console.warn('LocalStorage delete warning:', err);
    }
  }

  if (!auth.currentUser) return true;

  try {
    if (recordId) {
      const docRef = doc(db, 'audits', recordId);
      await deleteDoc(docRef);
    }
    if (productName && productName.trim()) {
      const auditsRef = collection(db, 'audits');
      const q = query(auditsRef, where('productName', '==', productName.trim()));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map((docSnap) => deleteDoc(docSnap.ref));
      await Promise.all(deletePromises);
    }
    return true;
  } catch (err) {
    console.warn('Firestore delete warning:', err);
    return false;
  }
}

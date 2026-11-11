import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { ProductEvaluationResult } from '../types/dgnb';

export interface StoredProductRecord {
  id: string;
  userId: string;
  userEmail: string;
  projectName: string;
  productName: string;
  manufacturer: string;
  qualityLevel: number;
  auditDate: string;
  encryptedPayload: string; // JSON stringified ProductEvaluationResult
  createdAt: string;
}

const LOCAL_STORAGE_KEY = 'qm_sustainability_product_audits_v1';

/**
 * Normalizes product name and manufacturer for reliable lookup
 */
export function normalizeProductKey(name: string, manufacturer?: string): string {
  const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanMfr = (manufacturer || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${cleanMfr}_${cleanName}`;
}

/**
 * Saves a completed product evaluation to Firestore & LocalStorage
 */
export async function saveProductEvaluationToDb(
  result: ProductEvaluationResult,
  userId: string = 'auditor-default-id',
  userEmail: string = 'auditor@bau-qm.org'
): Promise<boolean> {
  const auditId = result.auditMetadata.auditId || `audit_${Date.now()}`;
  
  // Extract highest quality level or primary DGNB level
  const dgnbLevel = result.standardsEvaluations['DGNB']?.overallLevelNum || 1;

  const recordPayload: StoredProductRecord = {
    id: auditId,
    userId: userId || 'auditor-default-id',
    userEmail: userEmail || 'auditor@bau-qm.org',
    projectName: result.auditMetadata.projectName || 'Nachhaltigkeitsprüfung',
    productName: result.productName,
    manufacturer: result.manufacturer || 'Unbekannter Hersteller',
    qualityLevel: dgnbLevel,
    auditDate: result.auditMetadata.auditDate || new Date().toISOString(),
    encryptedPayload: JSON.stringify(result),
    createdAt: new Date().toISOString(),
  };

  // 1. Always save to LocalStorage (Instant local cache)
  try {
    const existingRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const existingList: StoredProductRecord[] = existingRaw ? JSON.parse(existingRaw) : [];
    const filtered = existingList.filter((item) => item.id !== auditId && normalizeProductKey(item.productName, item.manufacturer) !== normalizeProductKey(result.productName, result.manufacturer));
    filtered.unshift(recordPayload);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered.slice(0, 50)));
  } catch (err) {
    console.warn('LocalStorage save warning:', err);
  }

  // 2. Save to Firebase Firestore
  try {
    const docRef = doc(db, 'audits', auditId);
    await setDoc(docRef, recordPayload, { merge: true });
    return true;
  } catch (err) {
    console.warn('Firestore save warning (fallback used):', err);
    return false;
  }
}

/**
 * Searches Firestore & LocalStorage for an existing evaluation of a product.
 * Saves tokens and time by returning the pre-calculated report if found.
 */
export async function findProductEvaluationInDb(
  productName: string,
  manufacturer?: string
): Promise<{ result: ProductEvaluationResult; source: 'firestore' | 'local' } | null> {
  if (!productName || !productName.trim()) return null;

  const searchKey = normalizeProductKey(productName, manufacturer);

  // 1. Check LocalStorage first for instant hit (< 5ms)
  try {
    const existingRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (existingRaw) {
      const existingList: StoredProductRecord[] = JSON.parse(existingRaw);
      const match = existingList.find(
        (item) => normalizeProductKey(item.productName, item.manufacturer) === searchKey
      );
      if (match && match.encryptedPayload) {
        const parsed: ProductEvaluationResult = JSON.parse(match.encryptedPayload);
        return { result: parsed, source: 'local' };
      }
    }
  } catch (err) {
    console.warn('LocalStorage read warning:', err);
  }

  // 2. Check Firestore Database
  try {
    const auditsRef = collection(db, 'audits');
    const q = query(
      auditsRef,
      where('productName', '==', productName.trim()),
      limit(5)
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const docData = snapshot.docs[0].data() as StoredProductRecord;
      if (docData && docData.encryptedPayload) {
        const parsed: ProductEvaluationResult = JSON.parse(docData.encryptedPayload);
        return { result: parsed, source: 'firestore' };
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

  // 1. Read LocalStorage
  try {
    const existingRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (existingRaw) {
      const existingList: StoredProductRecord[] = JSON.parse(existingRaw);
      existingList.forEach((rec) => recordsMap.set(rec.id, rec));
    }
  } catch (err) {
    console.warn('LocalStorage read warning:', err);
  }

  // 2. Read Firestore
  try {
    const auditsRef = collection(db, 'audits');
    const q = query(auditsRef, limit(30));
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

  return Array.from(recordsMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

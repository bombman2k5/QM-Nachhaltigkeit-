import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { DEFAULT_DGNB_ENV12_MATRIX } from './src/data/defaultDgnbMatrix';
import { INITIAL_SUSTAINABILITY_STANDARDS, DEFAULT_QNG_MATRIX, DEFAULT_BNB_MATRIX } from './src/data/standardsCatalogs';
import { evaluateDgnbCompliance, evaluateTestDateAge } from './src/utils/dgnbEvaluation';
import { extractPdfPages, buildExcerpts, hasPdfMagicBytes, PDF_MAGIC_BYTES } from './src/utils/pdfText';
import { verifyQuote } from './src/utils/quoteVerification';
import {
  parseVoc,
  formatVoc,
  canonicalCertificates,
  evaluateRowLevels,
  evaluateLabelLevels,
  evaluateSvhc,
  parseDate,
} from './src/utils/parameterRules';
import {
  ConfirmedEvidence,
  CriteriaRow,
  ExtractedFieldQuote,
  ParameterEvidence,
  ParameterEvaluation,
  ProductEvaluationResult,
  SingleStandardEvaluationResult,
  SustainabilityStandard,
} from './src/types/dgnb';

dotenv.config();

const app = express();
const rawPort = process.env.PORT || '3000';
const isPipe = rawPort.startsWith('\\\\.\\pipe\\') || rawPort.startsWith('/');
const PORT = isPipe ? rawPort : parseInt(rawPort, 10) || 3000;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0723441171';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// --- F8: Security Headers & Network Hardening ---
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (process.env.NODE_ENV?.toLowerCase() === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// URL prefix normalizer to ensure requests work whether Vercel preserves or strips /api
app.use((req, _res, next) => {
  if (
    !req.url.startsWith('/api') &&
    (req.url.startsWith('/auth/') ||
      req.url.startsWith('/standards/') ||
      req.url.startsWith('/documents/') ||
      req.url.startsWith('/dgnb/'))
  ) {
    req.url = '/api' + req.url;
  }
  next();
});

// --- F8: In-Memory Rate Limiting (Zero-Dependency) ---
interface RateLimitBucket {
  count: number;
  resetAt: number;
}

function createRateLimiter(options: { windowMs: number; max: number; message: string }) {
  const store = new Map<string, RateLimitBucket>();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [ip, bucket] of store.entries()) {
      if (now > bucket.resetAt) store.delete(ip);
    }
  }, 60 * 1000);
  cleanup.unref();

  return (req: Request, res: Response, next: express.NextFunction) => {
    const rawIp =
      req.ip ||
      req.socket.remoteAddress ||
      'unknown-client';
    const now = Date.now();
    let bucket = store.get(rawIp);

    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 1, resetAt: now + options.windowMs };
      store.set(rawIp, bucket);
    } else {
      bucket.count++;
    }

    const remaining = Math.max(0, options.max - bucket.count);
    const resetSeconds = Math.ceil((bucket.resetAt - now) / 1000);

    res.setHeader('X-RateLimit-Limit', options.max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (bucket.count > options.max) {
      res.setHeader('Retry-After', resetSeconds);
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMIT_EXCEEDED',
        message: options.message,
      });
    }

    next();
  };
}

const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Zu viele Authentifizierungsanfragen. Bitte warten Sie einige Minuten.',
});

const aiRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: 'Zu viele KI-Verarbeitungsanfragen. Bitte warten Sie einige Minuten.',
});

const analysisRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 60,
  message: 'Zu viele Analyseanfragen. Bitte warten Sie einige Minuten.',
});

// Apply rate limiters to routes
app.use('/api/auth/', authRateLimiter);
app.use('/api/documents/parse-pdf', aiRateLimiter);
app.use('/api/standards/parse-guideline-pdf', aiRateLimiter);
app.use('/api/standards/analyze-product', analysisRateLimiter);

// --- F7: Error Sanitization Helper ---
function sanitizeErrorMessage(fallbackProdMsg: string, err: any): string {
  if (process.env.NODE_ENV?.toLowerCase() === 'production') {
    return fallbackProdMsg;
  }
  return `${fallbackProdMsg}: ${err?.message || String(err)}`;
}

// --- F4: Dynamic Email Whitelist Configuration ---
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmailList(raw?: string): string[] {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => EMAIL_REGEX.test(e));
}

const DEFAULT_ADMIN_EMAILS = ['brian.lackmann@kaubit.de', 'brianlackmann@gmail.com'];
const DEFAULT_ALLOWED_EMAILS = [
  'brian.lackmann@kaubit.de',
  'brianlackmann@gmail.com',
  'admin@dgnb-qm.de',
  'auditor@bau-qm.org',
];

function getAdminEmails(): Set<string> {
  const fromEnv = parseEmailList(process.env.ADMIN_EMAILS);
  const list = fromEnv.length > 0 ? fromEnv : DEFAULT_ADMIN_EMAILS;
  return new Set(list.map((e) => e.toLowerCase()));
}

function getConfiguredAllowedEmails(): Set<string> {
  const fromEnv = parseEmailList(process.env.ALLOWED_EMAILS);
  const list = fromEnv.length > 0 ? fromEnv : DEFAULT_ALLOWED_EMAILS;
  return new Set(list.map((e) => e.toLowerCase()));
}

function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return getAdminEmails().has(email.trim().toLowerCase());
}

interface CompanyVaultState {
  saltHex: string;
  verifierHex: string;
  updatedAt: string;
  updatedByEmail: string;
  authorizedEmails: string[];
}

let companyVaultState: CompanyVaultState | null = null;

function getEffectiveAuthorizedEmails(): string[] {
  const admins = Array.from(getAdminEmails());
  const configured = Array.from(getConfiguredAllowedEmails());
  const fromVault =
    companyVaultState?.authorizedEmails?.map((e) => e.trim().toLowerCase()).filter(Boolean) || [];
  return Array.from(new Set([...admins, ...configured, ...fromVault]));
}

function isAuthorizedEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (isAdminEmail(normalized)) return true;
  return getEffectiveAuthorizedEmails().includes(normalized);
}

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

// Lazy Gemini API client
let genAIClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!genAIClient) {
    genAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return genAIClient;
}

/**
 * Calls Gemini with temperature: 0 and automatic model fallback if a custom model ID is unavailable.
 */
async function generateStrictJson(
  ai: GoogleGenAI,
  params: {
    contents: any;
    systemInstruction: string;
    responseSchema: any;
  }
): Promise<{ parsed: any; modelUsed: string }> {
  const candidateModels = Array.from(new Set([GEMINI_MODEL, 'gemini-2.5-flash', 'gemini-2.0-flash']));
  let lastError: any = null;

  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: {
          temperature: 0,
          systemInstruction: params.systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: params.responseSchema,
        },
      });
      const parsed = JSON.parse(response.text || '{}');
      return { parsed, modelUsed: model };
    } catch (err: any) {
      lastError = err;
    }
  }
  throw lastError || new Error('Gemini JSON generation failed');
}

// Helper to verify Firebase ID Token (JWT) strictly against Google's JWKS
async function verifyFirebaseToken(idToken: string): Promise<{ uid: string; email: string } | null> {
  if (!idToken || typeof idToken !== 'string') return null;

  // Hermetic test token handler (strictly gated to NODE_ENV === 'test')
  if (process.env.NODE_ENV?.toLowerCase() === 'test' && idToken.startsWith('test-jwt:')) {
    const parts = idToken.split(':');
    if (parts.length >= 3) {
      return {
        email: parts[1].trim(),
        uid: parts[2].trim(),
      };
    }
  }

  try {
    const { payload } = await jwtVerify(idToken, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
    });
    const uid = (payload.sub || payload.user_id) as string;
    if (!uid) return null;
    return {
      uid,
      email: ((payload.email as string) || '').trim(),
    };
  } catch {
    return null;
  }
}

async function requireAuth(
  req: Request,
  res: Response,
  next: express.NextFunction
): Promise<void> {
  const isProduction = process.env.NODE_ENV?.toLowerCase() === 'production';

  // F3: Prevent ALLOW_UNAUTHENTICATED_API bypass in production
  if (process.env.ALLOW_UNAUTHENTICATED_API === 'true') {
    if (isProduction) {
      console.warn('[Security] WARN: ALLOW_UNAUTHENTICATED_API is active but strictly ignored in production mode.');
    } else {
      // Dev/Test environment bypass with mock user identity
      (req as any).authUser = {
        uid: 'dev-mock-uid',
        email: 'dev@kaubit.de',
        isAdmin: true,
      };
      next();
      return;
    }
  }

  const authHeader = req.headers.authorization;
  const bodyToken = req.body?.idToken;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : bodyToken;

  const decoded = token ? await verifyFirebaseToken(token) : null;
  if (!decoded || !decoded.uid) {
    res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Nicht autorisiert. Bitte melden Sie sich mit Ihrem Google-Konto an.',
    });
    return;
  }

  // F2: Verify authorization (employee / admin whitelist check)
  const userEmail = (decoded.email || '').trim().toLowerCase();
  if (!userEmail || !isAuthorizedEmail(userEmail)) {
    res.status(403).json({
      success: false,
      code: 'FORBIDDEN',
      message: 'Zugriff verweigert: Ihre E-Mail-Adresse ist nicht für dieses Unternehmens-Portal freigeschaltet.',
    });
    return;
  }

  (req as any).authUser = {
    uid: decoded.uid,
    email: userEmail,
    isAdmin: isAdminEmail(userEmail),
  };
  next();
}

// ----------------------------------------------------
// AUTHENTICATION & ADMIN EMPLOYEE VAULT ENDPOINTS
// ----------------------------------------------------

app.get('/api/auth/status', (_req: Request, res: Response) => {
  res.json({
    firebaseAuthEnabled: true,
    projectId: FIREBASE_PROJECT_ID,
  });
});

app.post('/api/auth/verify-session', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const bodyToken = req.body?.idToken;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : bodyToken;

    const decoded = token ? await verifyFirebaseToken(token) : null;
    if (!decoded || !decoded.email) {
      return res.status(401).json({
        success: false,
        isAuthorized: false,
        message: 'Keine gültige Firebase-Authentifizierung übermittelt.',
      });
    }

    const userEmail = decoded.email.trim().toLowerCase();
    const isAuthorized = isAuthorizedEmail(userEmail);
    const isAdmin = isAdminEmail(userEmail);

    // F1: Deny unauthorized Google accounts; never leak vault or whitelist
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        isAuthorized: false,
        message: 'Zugriff verweigert: Ihr Google-Konto ist nicht für dieses Unternehmens-Portal freigeschaltet.',
      });
    }

    return res.json({
      success: true,
      isAuthorized: true,
      isAdmin,
      email: userEmail,
      userId: decoded.uid,
      hasPassphraseConfigured: Boolean(companyVaultState?.saltHex && companyVaultState?.verifierHex),
      saltHex: companyVaultState?.saltHex || null,
      verifierHex: companyVaultState?.verifierHex || null,
      authorizedEmails: getEffectiveAuthorizedEmails(),
      message: 'Authentifizierung erfolgreich.',
    });
  } catch (err: any) {
    console.error('Error verifying session:', err);
    return res.status(500).json({
      success: false,
      isAuthorized: false,
      message: sanitizeErrorMessage('Serverfehler bei der Sitzungsverifikation', err),
    });
  }
});

app.post('/api/auth/save-passphrase-verifier', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const { idToken, saltHex, verifierHex, authorizedEmails } = req.body;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : idToken;

    const decoded = token ? await verifyFirebaseToken(token) : null;
    if (!decoded || !decoded.email) {
      return res.status(401).json({
        success: false,
        message: 'Nicht authentifiziert.',
      });
    }

    if (!isAdminEmail(decoded.email)) {
      return res.status(403).json({
        success: false,
        message: 'Nur der Administrator darf die Unternehmens-Passphrase oder Mitarbeiter-Konten verwalten.',
      });
    }

    const HEX_REGEX = /^[0-9a-fA-F]{16,512}$/;
    if (
      !saltHex ||
      !verifierHex ||
      typeof saltHex !== 'string' ||
      typeof verifierHex !== 'string' ||
      !HEX_REGEX.test(saltHex.trim()) ||
      !HEX_REGEX.test(verifierHex.trim())
    ) {
      return res.status(400).json({ success: false, message: 'Fehlende oder ungültige Kryptografie-Parameter (Hex-Format erforderlich).' });
    }

    const validNewEmails = Array.isArray(authorizedEmails)
      ? authorizedEmails
          .map((e: any) => String(e || '').trim().toLowerCase())
          .filter((e) => EMAIL_REGEX.test(e))
      : getEffectiveAuthorizedEmails();

    const mergedEmails = Array.from(
      new Set([
        ...Array.from(getAdminEmails()),
        ...validNewEmails,
      ])
    );

    companyVaultState = {
      saltHex: String(saltHex).trim(),
      verifierHex: String(verifierHex).trim(),
      updatedAt: new Date().toISOString(),
      updatedByEmail: decoded.email,
      authorizedEmails: mergedEmails,
    };

    return res.json({
      success: true,
      authorizedEmails: mergedEmails,
      message: 'Unternehmens-Verschlüsselungsphrase und Mitarbeiter-Freigaben erfolgreich gesichert.',
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: sanitizeErrorMessage('Fehler beim Speichern der Passphrase', err),
    });
  }
});

app.post('/api/auth/manage-employees', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const { idToken, authorizedEmails } = req.body;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : idToken;

    const decoded = token ? await verifyFirebaseToken(token) : null;
    if (!decoded || !decoded.email) {
      return res.status(401).json({
        success: false,
        message: 'Nicht authentifiziert.',
      });
    }

    if (!isAdminEmail(decoded.email)) {
      return res.status(403).json({
        success: false,
        message: 'Nur der Administrator kann Mitarbeiter-Konten anlegen oder entfernen.',
      });
    }

    const validNewEmails = Array.isArray(authorizedEmails)
      ? authorizedEmails
          .map((e: any) => String(e || '').trim().toLowerCase())
          .filter((e) => EMAIL_REGEX.test(e))
      : [];

    const mergedEmails = Array.from(
      new Set([
        ...Array.from(getAdminEmails()),
        ...validNewEmails,
      ])
    );

    if (companyVaultState) {
      companyVaultState.authorizedEmails = mergedEmails;
      companyVaultState.updatedAt = new Date().toISOString();
    } else {
      companyVaultState = {
        saltHex: '',
        verifierHex: '',
        updatedAt: new Date().toISOString(),
        updatedByEmail: decoded.email,
        authorizedEmails: mergedEmails,
      };
    }

    return res.json({
      success: true,
      authorizedEmails: mergedEmails,
      message: 'Mitarbeiter-Konten aktualisiert.',
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: sanitizeErrorMessage('Fehler bei der Mitarbeiter-Verwaltung', err),
    });
  }
});

// ====================================================
// PDF VALIDATION & SANITIZATION HELPERS (F11, F12, F13)
// ====================================================

export const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB binary limit (F12)
export const ALLOWED_DOCUMENT_TYPES = ['sdb', 'pruefbericht', 'tm', 'allgemein'] as const;
export type DocumentType = (typeof ALLOWED_DOCUMENT_TYPES)[number];

/**
 * F13: Sanitizes user-provided filename to prevent directory traversal and prompt injection.
 * - Normalizes slashes and extracts base name using path.basename
 * - Strips null bytes (\0) and control characters
 * - Strips leading dots to prevent hidden/traversal names
 * - Restricts characters to [a-zA-Z0-9._-]
 * - Truncates to max 100 characters
 * - Provides safe fallback if empty
 */
export function sanitizeFilename(rawFilename: unknown, fallback = 'Dokument.pdf'): string {
  if (typeof rawFilename !== 'string') return fallback;
  const normalized = rawFilename.replace(/\\/g, '/');
  const base = path.posix.basename(normalized);
  const noNulls = base.replace(/[\x00-\x1F\x7F]/g, '');
  const noTraversal = noNulls.replace(/^\.+/, '');
  const safeChars = noTraversal.replace(/[^a-zA-Z0-9._-]/g, '_');
  const cleaned = safeChars.replace(/_{2,}/g, '_').trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return fallback;
  }
  return cleaned.length > 100 ? cleaned.slice(0, 100) : cleaned;
}

/**
 * F13: Strictly validates documentType against ALLOWED_DOCUMENT_TYPES.
 * Returns safe DocumentType fallback on invalid input.
 */
export function resolveDocumentType(rawType: unknown, fallback: DocumentType = 'allgemein'): DocumentType {
  if (typeof rawType !== 'string') return fallback;
  const normalized = rawType.trim().toLowerCase();
  if ((ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(normalized)) {
    return normalized as DocumentType;
  }
  return fallback;
}

export type PdfValidationResult =
  | { isValid: true; buffer: Buffer; cleanBase64: string }
  | {
      isValid: false;
      statusCode: 400;
      code: 'INVALID_PDF' | 'EMPTY_FILE' | 'PAYLOAD_TOO_LARGE';
      message: string;
    };

/**
 * F11, F12, F15: Decodes base64 and verifies size, empty status, and %PDF- magic bytes.
 */
export function validateAndDecodePdf(pdfBase64: unknown): PdfValidationResult {
  if (pdfBase64 === undefined || pdfBase64 === null) {
    return {
      isValid: false,
      statusCode: 400,
      code: 'INVALID_PDF',
      message: 'Keine PDF-Datei übermittelt.',
    };
  }

  if (typeof pdfBase64 !== 'string') {
    return {
      isValid: false,
      statusCode: 400,
      code: 'INVALID_PDF',
      message: 'Ungültiges Übertragungsformat für PDF-Datei.',
    };
  }

  // Strip data URI prefix and whitespace
  const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/i, '').trim();
  if (!cleanBase64) {
    return {
      isValid: false,
      statusCode: 400,
      code: 'EMPTY_FILE',
      message: 'Die übermittelte Datei ist leer.',
    };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(cleanBase64, 'base64');
  } catch {
    return {
      isValid: false,
      statusCode: 400,
      code: 'INVALID_PDF',
      message: 'Ungültiges Base64-Format für PDF-Dokument.',
    };
  }

  if (buffer.length === 0) {
    return {
      isValid: false,
      statusCode: 400,
      code: 'EMPTY_FILE',
      message: 'Die übermittelte Datei ist leer (0 Bytes).',
    };
  }

  if (buffer.length > MAX_PDF_BYTES) {
    return {
      isValid: false,
      statusCode: 400,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Die PDF-Datei überschreitet die maximale Größe von 20 MB.',
    };
  }

  if (!hasPdfMagicBytes(buffer)) {
    return {
      isValid: false,
      statusCode: 400,
      code: 'INVALID_PDF',
      message: 'Ungültiges Dateiformat. Die Datei enthält keine gültige PDF-Signatur (%PDF-).',
    };
  }

  return {
    isValid: true,
    buffer,
    cleanBase64,
  };
}

// ----------------------------------------------------
// MULTI-STANDARD GUIDELINE & PDF SCANNER ENDPOINTS
// ----------------------------------------------------

app.get('/api/standards/defaults', (_req: Request, res: Response) => {
  res.json({
    success: true,
    standards: INITIAL_SUSTAINABILITY_STANDARDS,
  });
});

/**
 * Scans any uploaded institute guideline PDF (e.g. DGNB, QNG, BNB, LEED, BREEAM, NaWoh, etc.)
 * and extracts standard metadata along with structured criteria rows.
 * Never silently returns the DGNB matrix when scanning a user-uploaded PDF fails.
 */
app.post('/api/standards/parse-guideline-pdf', requireAuth, async (req: Request, res: Response) => {
  try {
    const { pdfBase64, filename } = req.body;
    const hasUploadedPdf = pdfBase64 !== undefined && pdfBase64 !== null;

    if (!hasUploadedPdf) {
      return res.json({
        success: true,
        standardName: 'DGNB Kriterienmatrix ENV1.2 (Neubau 2023)',
        institute: 'Deutsche Gesellschaft für Nachhaltiges Bauen (DGNB)',
        version: '2023',
        matrix: DEFAULT_DGNB_ENV12_MATRIX,
        source: 'default-catalog',
      });
    }

    // F11, F12: Validate before AI check
    const pdfCheck = validateAndDecodePdf(pdfBase64);
    if (!pdfCheck.isValid) {
      return res.status(pdfCheck.statusCode).json({
        success: false,
        code: pdfCheck.code,
        message: pdfCheck.message,
      });
    }

    // F13: Sanitize filename
    const safeFilename = sanitizeFilename(filename, 'Leitfaden.pdf');

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        success: false,
        code: 'AI_UNAVAILABLE',
        message:
          'KI-Service ist nicht verfügbar (GEMINI_API_KEY nicht konfiguriert). Das hochgeladene Leitfaden-PDF kann derzeit nicht automatisch ausgelesen werden.',
      });
    }

    const { pages, hasTextLayer } = await extractPdfPages(pdfCheck.buffer);

    const prompt = `Du bist ein Fachexperte für Bauökologie und Nachhaltigkeits-Zertifizierungssysteme im Bauwesen (DGNB, QNG, BNB, LEED, BREEAM, NaWoh).
Analysiere das beigefügte Leitfaden-/Kriteriendokument ("${safeFilename}").
WICHTIG:
- Extrahiere ausschließlich Zeilen und Werte, die tatsächlich im PDF stehen.
- Wenn ein Feld (z. B. bezugsnorm, anwendungsbereich, geltungsbereich) in einer Zeile nicht angegeben ist, gib einen leeren String "" zurück. Erfinde KEINE Platzhalter wie "DIN EN / ISO Norm".
- Übernimm Grenzwerte in qs1 bis qs4 wortgetreu aus der Tabelle des Dokuments.
Extrahiere:
1. Den genauen Namen des Standards/Kriteriums.
2. Das herausgebende Institut bzw. die Einrichtung.
3. Die Versionsnummer oder das Ausgabejahr.
4. Die vollständige Kriterienmatrix mit allen Zeilen.`;

    const { parsed, modelUsed } = await generateStrictJson(ai, {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: pdfCheck.cleanBase64,
            },
          },
          { text: prompt },
        ],
      },
      systemInstruction:
        'Du antwortest ausschließlich als valides JSON entsprechend des vorgegebenen Schemas. Erfinde niemals Zeilen oder Standardwerte, die nicht im Dokument stehen.',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          standardName: { type: Type.STRING },
          institute: { type: Type.STRING },
          version: { type: Type.STRING },
          matrix: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                nr: { type: Type.STRING },
                bauteil: { type: Type.STRING },
                kategorie: { type: Type.STRING },
                anwendungsbereich: { type: Type.STRING },
                betrachteteStoffe: { type: Type.STRING },
                bezugsnorm: { type: Type.STRING },
                qs1: { type: Type.STRING },
                qs2: { type: Type.STRING },
                qs3: { type: Type.STRING },
                qs4: { type: Type.STRING },
                artDokumentation: { type: Type.STRING },
                geltungsbereich: { type: Type.STRING },
              },
              required: ['nr', 'bauteil', 'betrachteteStoffe', 'qs1', 'qs2', 'qs3', 'qs4'],
            },
          },
        },
        required: ['standardName', 'institute', 'version', 'matrix'],
      },
    });

    if (!parsed.matrix || !Array.isArray(parsed.matrix) || parsed.matrix.length === 0) {
      return res.status(422).json({
        success: false,
        code: 'EMPTY_MATRIX',
        message: `Im hochgeladenen Dokument "${filename || 'PDF'}" konnte keine Kriterienmatrix erkannt werden.`,
      });
    }

    const warnings: string[] = [];
    if (!hasTextLayer) {
      warnings.push(
        'Das Leitfaden-PDF enthält keinen maschinenlesbaren Textlayer (Scan). Bitte prüfen Sie alle extrahierten Grenzwerte manuell.'
      );
    }
    if (parsed.matrix.length < 3) {
      warnings.push(
        `Es wurden nur ${parsed.matrix.length} Kriterienzeile(n) erkannt – bitte Vollständigkeit des Leitfadens prüfen.`
      );
    }

    let unverifiedRows = 0;
    const cleanedMatrix: CriteriaRow[] = parsed.matrix.map((row: any, i: number) => {
      const qsCombined = `${row.qs1 || ''} ${row.qs2 || ''} ${row.qs3 || ''} ${row.qs4 || ''}`.trim();
      if (hasTextLayer && qsCombined.length > 0) {
        const v = verifyQuote(qsCombined, qsCombined, pages);
        if (v.verification === 'unverified') {
          unverifiedRows++;
        }
      }
      return {
        id: row.id || `scanned-${i + 1}`,
        nr: String(row.nr || i + 1).trim(),
        bauteil: String(row.bauteil || '').trim(),
        kategorie: String(row.kategorie || '').trim() || undefined,
        anwendungsbereich: String(row.anwendungsbereich || '').trim(),
        betrachteteStoffe: String(row.betrachteteStoffe || '').trim(),
        bezugsnorm: String(row.bezugsnorm || '').trim(),
        qs1: String(row.qs1 || '').trim(),
        qs2: String(row.qs2 || '').trim(),
        qs3: String(row.qs3 || '').trim(),
        qs4: String(row.qs4 || '').trim(),
        artDokumentation: String(row.artDokumentation || '').trim(),
        geltungsbereich: String(row.geltungsbereich || '').trim(),
      };
    });

    if (unverifiedRows > 0) {
      warnings.push(
        `Bei ${unverifiedRows} von ${cleanedMatrix.length} Zeile(n) konnten Zahlenwerte aus QS 1–4 nicht eindeutig im PDF-Textlayer bestätigt werden – bitte prüfen.`
      );
    }

    return res.json({
      success: true,
      standardName: parsed.standardName || safeFilename.replace(/\.pdf$/i, '') || 'Gescannter Nachhaltigkeitsstandard',
      institute: parsed.institute || 'Nicht im Leitfaden angegeben',
      version: parsed.version || '',
      matrix: cleanedMatrix,
      warnings,
      source: modelUsed,
    });
  } catch (err: any) {
    console.error('Error scanning PDF guideline:', err);
    const isDocumentError =
      err?.status === 400 ||
      err?.message?.includes('INVALID_ARGUMENT') ||
      err?.message?.includes('Invalid PDF structure') ||
      err?.message?.includes('Failed to parse');
    if (isDocumentError) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PDF',
        message: 'Das übermittelte PDF-Dokument ist beschädigt oder kann nicht gelesen werden.',
      });
    }
    return res.status(502).json({
      success: false,
      code: 'AI_FAILED',
      message: sanitizeErrorMessage(
        'Fehler beim KI-Scan des Leitfaden-PDFs: Die Datei konnte nicht verarbeitet werden. Es wurde kein Standard überschrieben.',
        err
      ),
    });
  }
});

// Legacy backward-compatibility endpoint for Step 1
app.post('/api/dgnb/parse-guideline-pdf', (_req: Request, res: Response) => {
  return res.redirect(307, '/api/standards/parse-guideline-pdf');
});

/**
 * Scans an uploaded PDF for Safety Data Sheets (SDB) or Test Reports / Certificates
 * using Gemini multimodal capabilities AND verifies every extracted quote and value
 * deterministically against the PDF text layer via unpdf.
 */
app.post('/api/documents/parse-pdf', requireAuth, async (req: Request, res: Response) => {
  try {
    const { pdfBase64, documentType, filename } = req.body;

    // Step 1: Validate PDF payload (F11, F12, F15) BEFORE checking AI client
    const pdfCheck = validateAndDecodePdf(pdfBase64);
    if (!pdfCheck.isValid) {
      return res.status(pdfCheck.statusCode).json({
        success: false,
        code: pdfCheck.code,
        message: pdfCheck.message,
      });
    }

    // Step 2: Sanitize filename and validate documentType (F13)
    const safeFilename = sanitizeFilename(filename, 'Dokument.pdf');
    const safeDocType = resolveDocumentType(documentType, 'sdb');

    // Step 3: Text layer extraction via unpdf
    const { pages, hasTextLayer } = await extractPdfPages(pdfCheck.buffer);
    const excerpts = buildExcerpts(pages);

    // Step 4: AI Client handling or Hermetic Test Mode Fallback
    const ai = getGeminiClient();
    if (!ai) {
      // Hermetic offline fallback in test mode (NODE_ENV === 'test')
      if (process.env.NODE_ENV?.toLowerCase() === 'test') {
        const fullText = pages.join('\n');
        const vocFinding = parseVoc(fullText);
        const svhcFinding = evaluateSvhc(fullText);
        const certs = canonicalCertificates(fullText);

        return res.json({
          success: true,
          extracted: {
            documentType: safeDocType,
            filename: safeFilename,
            productName: fullText.split('\n')[0]?.slice(0, 60)?.trim() || 'Geprüftes Testprodukt',
            manufacturer: 'Hersteller laut Deklaration',
            suggestedCriteriaNr: safeDocType === 'tm' ? '8' : '2',
            suggestionReason: 'Deterministische Extraktion im Testmodus',
            vocContent: vocFinding.found ? `${vocFinding.value ?? 0} g/l` : (vocFinding.solventFree ? '0 g/l (lösemittelfrei)' : undefined),
            vocTestDate: parseDate(fullText)?.raw,
            svhcStatus: svhcFinding.status === 'none' ? 'Keine SVHC > 0,1 % w/w' : undefined,
            certificates: certs,
            hasBauteilekatalog: true,
            summarySnippet: excerpts.map(e => `[Seite ${e.page}] ${e.text}`).join('\n') || `[Dokument "${safeFilename}"] Textlayer analysiert.`,
            fieldQuotes: [],
            excerpts,
            hasTextLayer,
            warnings: [],
          },
          source: 'offline-test-extractor',
        });
      }

      return res.status(503).json({
        success: false,
        code: 'AI_UNAVAILABLE',
        message:
          'KI-Dokumentenscan nicht verfügbar (GEMINI_API_KEY ist nicht konfiguriert). Bitte tragen Sie die Produktkennwerte manuell ein.',
      });
    }

    const catalogIndex = DEFAULT_DGNB_ENV12_MATRIX.map(
      (r) => `Zeile ${r.nr}: ${r.bauteil} (${r.betrachteteStoffe})`
    ).join('\n');

    const isTm = safeDocType === 'tm';
    const prompt = isTm
      ? `Du bist ein strenger DGNB-Auditor und Fachexperte für Bauchemie und Technische Merkblätter (TM / Technisches Datenblatt / Produktdatenblatt).
Analysiere die beigefügte PDF-Datei ("${safeFilename}", Dokumententyp: Technisches Merkblatt).

STRIKTE ANTI-HALLUZINATIONS-REGELN:
1. Extrahiere NUR Angaben, die wörtlich im beigefügten Technischen Merkblatt stehen.
2. Wenn ein Wert (z. B. VOC-Gehalt, Stand/Datum, GISCODE, Umweltzeichen) NICHT im Dokument steht, gib für dieses Feld zwingend einen leeren String "" bzw. ein leeres Array [] zurück!
3. Schreibe niemals erfundene Platzhalter oder Vermutungen in die Datenfelder.
4. Kopiere für jedes gefundene Feld in "fieldQuotes" das EXAKTE wörtliche Zitat (quote) aus dem PDF-Text.

SPEZIFISCHE EXTRAKTIONSREGELN FÜR TECHNISCHE MERKBLÄTTER:
- productName: Offizieller Produkt- oder Handelsname (z. B. Deckblatt, Kopfzeile).
- manufacturer: Hersteller, Inverkehrbringer oder Vertriebsgesellschaft.
- suggestedCriteriaNr: Ermittle die passende DGNB ENV1.2 Zeilennummer primär anhand des beschriebenen „Anwendungsbereichs“ / „Verwendungszwecks“ (z. B. Verlegeklebstoff -> Zeile 8, Innenwandfarbe -> Zeile 2, Fugendichtstoff -> Zeile 11).
- suggestionReason: Kurze Begründung für die gewählte Zeilennummer anhand des Anwendungsbereichs.
- vocContent: Suche unter „Technische Daten“, „Kenndaten“, „Zusammensetzung“ oder „Ökologie“. Extrahiere den tatsächlichen VOC-Gehalt (z. B. "< 1 g/l", "0 g/l") oder wörtliche Aussagen zur Lösemittelfreiheit (z. B. "lösemittelfrei nach TRGS 610", "lösemittelfrei nach VdL-RL01", "VOC-frei"). Falls nur ein Richtlinien-Grenzwert genannt wird, gib ihn mit Zusatz an.
- vocTestDate: Extrahiere das Ausstellungs-, Revisions- oder Standdatum des Technischen Merkblatts (z. B. "Stand: 05/2023", "Ausgabe: März 2023", "15.05.2023") oder ein zitiertes Prüfberichtsdatum.
- svhcStatus: Aussagen zu SVHC, REACH-Konformität oder Ausschluss von Schadstoffen (z. B. "Frei von SVHC", "weichmacherfrei", "konservierungsmittelfrei"). Falls keine Angabe vorhanden, "" zurückgeben.
- certificates: Array aller genannten GISCODES (z. B. "GISCODE D1", "GISCODE RS10", "GISCODE BSW10"), Umweltzeichen (z. B. "EMICODE EC1 PLUS", "Blauer Engel DE-UZ 102", "natureplus") und Prüfnormen (z. B. "AgBB-geprüft", "DIN EN 16516").

Verfügbare Zeilen der DGNB ENV1.2 Kriterienmatrix für suggestedCriteriaNr:
${catalogIndex}

Extrahiere:
- documentType ("sdb", "pruefbericht", "tm" oder "allgemein")
- productName (Handelsname laut Deckblatt bzw. Kopfzeile, sonst "")
- manufacturer (Hersteller/Vertrieb, sonst "")
- suggestedCriteriaNr (Passende Zeilennummer aus obiger Liste als String)
- suggestionReason (Kurze Begründung anhand des Anwendungsbereichs)
- vocContent (Exakte VOC-Angabe oder Lösemittelfreiheitserklärung aus dem TM, sonst "")
- vocTestDate (Stand-, Revisions- oder Ausstellungsdatum des TMs, z. B. "Stand: 05/2023", sonst "")
- svhcStatus (Aussage zu SVHC/Schadstoffen, sonst "")
- certificates (Array im TM genannter GISCODEs, Umweltzeichen, Prüfnormen, sonst [])
- fieldQuotes (Für jedes nicht-leere Feld ein Objekt mit field, label, value, quote, pageOrSection, confidence)`
      : `Du bist ein strenger DGNB-Auditor und Fachexperte für Bauchemie, Sicherheitsdatenblätter (SDB nach REACH/CLP), Technische Merkblätter (TM) und Emissions-Prüfberichte.
Analysiere die beigefügte PDF-Datei ("${safeFilename}", angegebener Dokumententyp: "${safeDocType}").

STRIKTE ANTI-HALLUZINATIONS-REGELN:
1. Extrahiere NUR Angaben, die wörtlich im beigefügten PDF-Dokument stehen.
2. Wenn ein Wert (z. B. VOC-Gehalt, Prüfdatum, SVHC-Aussage, Umweltzeichen) NICHT im PDF steht, gib für dieses Feld zwingend einen leeren String "" bzw. ein leeres Array [] zurück!
3. Schreibe niemals Platzhalter wie "Kein Nachweis" oder erfundene Beispielwerte (wie "< 1 g/l" oder "EMICODE EC1 PLUS") in die Datenfelder.
4. Verwechsle in SDB Abschnitt 15 genannte gesetzliche EU-Decopaint-Grenzwerte ("Kat. A/a: 30 g/l") NICHT mit dem tatsächlichen Produkt-VOC-Gehalt. Wenn nur der gesetzliche Grenzwert genannt wird, gib ihn mit dem Zusatz "Gesetzlicher Grenzwert:" an oder lasse vocContent leer, falls kein Produktwert existiert.
5. Kopiere für jedes gefundene Feld in "fieldQuotes" das EXAKTE wörtliche Zitat (quote) aus dem PDF-Text.

Verfügbare Zeilen der DGNB ENV1.2 Kriterienmatrix für suggestedCriteriaNr:
${catalogIndex}

Extrahiere:
- documentType ("sdb", "pruefbericht", "tm" oder "allgemein")
- productName (Handelsname laut Abschnitt 1 bzw. Deckblatt, sonst "")
- manufacturer (Hersteller/Lieferant laut Abschnitt 1.3 bzw. Deckblatt, sonst "")
- suggestedCriteriaNr (Passende Zeilennummer aus obiger Liste als String, z. B. "2" für Innenwandfarben, "8" für Verlegeklebstoffe, "11" für Fugendichtstoffe Innen)
- suggestionReason (Kurze Begründung für die gewählte Zeilennummer anhand des Produkttyps)
- vocContent (Exakte VOC-Angabe des Produkts aus dem PDF, sonst "")
- vocTestDate (Prüf- oder Ausstellungsdatum des VOC-/Emissionsberichts, z. B. "15.05.2023", sonst "")
- svhcStatus (Exakte Aussage zu REACH SVHC / Kandidatenliste Abschnitt 3 oder 15, sonst "")
- certificates (Array tatsächlich im PDF genannter Umwelt-/Prüfzeichen wie "Blauer Engel DE-UZ 102", "EMICODE EC1 PLUS", "GISCODE D1", sonst [])
- fieldQuotes (Für jedes nicht-leere Feld ein Objekt mit field, label, value, quote [wörtliches Zitat aus dem PDF], pageOrSection, confidence)`;

    const { parsed, modelUsed } = await generateStrictJson(ai, {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: pdfCheck.cleanBase64,
            },
          },
          { text: prompt },
        ],
      },
      systemInstruction:
        'Du bist ein präzises Extraktionssystem ohne jegliche Halluzination. Nicht im PDF enthaltene Felder bleiben leer (""). Jedes extrahierte Feld muss durch ein wörtliches Zitat aus dem PDF belegt werden.',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          documentType: { type: Type.STRING },
          productName: { type: Type.STRING },
          manufacturer: { type: Type.STRING },
          suggestedCriteriaNr: { type: Type.STRING },
          suggestionReason: { type: Type.STRING },
          vocContent: { type: Type.STRING },
          vocTestDate: { type: Type.STRING },
          svhcStatus: { type: Type.STRING },
          certificates: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          fieldQuotes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                field: { type: Type.STRING },
                label: { type: Type.STRING },
                value: { type: Type.STRING },
                quote: { type: Type.STRING },
                pageOrSection: { type: Type.STRING },
                confidence: { type: Type.STRING },
              },
              required: ['field', 'label', 'value', 'quote'],
            },
          },
        },
        required: [
          'documentType',
          'productName',
          'manufacturer',
          'suggestedCriteriaNr',
          'vocContent',
          'vocTestDate',
          'svhcStatus',
          'certificates',
          'fieldQuotes',
        ],
      },
    });

    const rawQuotes: ExtractedFieldQuote[] = Array.isArray(parsed.fieldQuotes) ? parsed.fieldQuotes : [];

    // Ensure every non-empty extracted field is represented and verified against the PDF text layer
    const fieldDefinitions: { field: string; label: string; value: string }[] = [
      { field: 'productName', label: 'Produktname / Handelsname', value: String(parsed.productName || '').trim() },
      { field: 'manufacturer', label: 'Hersteller / Inverkehrbringer', value: String(parsed.manufacturer || '').trim() },
      { field: 'vocContent', label: 'VOC-Gehalt / Lösemittelanteil', value: String(parsed.vocContent || '').trim() },
      { field: 'vocTestDate', label: 'Datum VOC-Prüfbericht', value: String(parsed.vocTestDate || '').trim() },
      { field: 'svhcStatus', label: 'SVHC / REACH-Kandidatenliste', value: String(parsed.svhcStatus || '').trim() },
      {
        field: 'certificates',
        label: 'Umweltzeichen & Prüfnachweise',
        value: Array.isArray(parsed.certificates) ? parsed.certificates.filter(Boolean).join(', ') : '',
      },
    ];

    const verifiedQuotes: ExtractedFieldQuote[] = [];
    const warnings: string[] = [];

    if (!hasTextLayer) {
      warnings.push(
        'Das hochgeladene PDF enthält keinen maschinenlesbaren Textlayer (Scan-Dokument). Alle extrahierten Werte stammen aus der visuellen Texterkennung und müssen manuell geprüft werden.'
      );
    }

    for (const def of fieldDefinitions) {
      const existing = rawQuotes.find((q) => q.field === def.field);
      const val = def.value || String(existing?.value || '').trim();
      if (!val) continue;

      const quoteText = String(existing?.quote || val).trim();
      const vResult = verifyQuote(quoteText, val, pages);

      const pageLabel = vResult.page ? `Seite ${vResult.page}` : existing?.pageOrSection || undefined;

      verifiedQuotes.push({
        field: def.field,
        label: existing?.label || def.label,
        value: val,
        quote: quoteText,
        pageOrSection: pageLabel,
        confidence:
          vResult.verification === 'verified'
            ? 'high'
            : vResult.verification === 'partial'
            ? 'medium'
            : 'low',
        verification: vResult.verification,
        page: vResult.page,
      });

      if (vResult.verification === 'unverified') {
        warnings.push(
          `Feld „${def.label}“ (${val}): Zitat konnte im PDF-Textlayer nicht verifiziert werden – bitte im Originaldokument prüfen.`
        );
      }
    }

    // Build verbatim summarySnippet strictly from real PDF excerpts or verified quotes (never AI prose)
    let verbatimSummary = '';
    if (excerpts.length > 0) {
      verbatimSummary = excerpts.map((e) => `[Seite ${e.page}] ${e.text}`).join('\n');
    } else if (verifiedQuotes.some((q) => q.verification === 'verified' || q.verification === 'partial')) {
      verbatimSummary = verifiedQuotes
        .filter((q) => q.verification === 'verified' || q.verification === 'partial')
        .map((q) => `[${q.page ? `Seite ${q.page}` : 'PDF'}] ${q.label}: „${q.quote}“`)
        .join('\n');
    } else {
      verbatimSummary = `[Dokument "${safeFilename}"] Kein direkter Textlayer-Auszug verfügbar.`;
    }

    const validCriteriaNr = DEFAULT_DGNB_ENV12_MATRIX.some((r) => r.nr === String(parsed.suggestedCriteriaNr || '').trim())
      ? String(parsed.suggestedCriteriaNr).trim()
      : '2';

    return res.json({
      success: true,
      extracted: {
        documentType: resolveDocumentType(parsed.documentType, safeDocType),
        filename: safeFilename,
        productName: String(parsed.productName || '').trim(),
        manufacturer: String(parsed.manufacturer || '').trim(),
        suggestedCriteriaNr: validCriteriaNr,
        suggestionReason: String(parsed.suggestionReason || '').trim() || undefined,
        vocContent: String(parsed.vocContent || '').trim() || undefined,
        vocTestDate: String(parsed.vocTestDate || '').trim() || undefined,
        svhcStatus: String(parsed.svhcStatus || '').trim() || undefined,
        certificates: Array.isArray(parsed.certificates) ? parsed.certificates.filter(Boolean) : [],
        hasBauteilekatalog: true, // Supplier QNG-ready default (documented as assumption)
        summarySnippet: verbatimSummary,
        fieldQuotes: verifiedQuotes,
        excerpts,
        hasTextLayer,
        warnings,
      },
      source: modelUsed,
    });
  } catch (err: any) {
    console.error('Error parsing document PDF via Gemini:', err);
    const isDocumentError =
      err?.status === 400 ||
      err?.message?.includes('INVALID_ARGUMENT') ||
      err?.message?.includes('Invalid PDF structure') ||
      err?.message?.includes('Failed to parse');
    if (isDocumentError) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PDF',
        message: 'Das übermittelte PDF-Dokument ist beschädigt oder kann nicht gelesen werden.',
      });
    }
    return res.status(502).json({
      success: false,
      code: 'AI_FAILED',
      message: sanitizeErrorMessage(
        'KI-Dokumentenscan fehlgeschlagen: Das PDF konnte nicht analysiert werden. Bitte prüfen Sie die Datei oder geben Sie die Werte manuell ein.',
        err
      ),
    });
  }
});

// ----------------------------------------------------
// SELECTIVE MULTI-STANDARD PRODUCT EVALUATION ENDPOINT
// ----------------------------------------------------

interface StructuredInputPayload {
  vocContent?: string;
  vocTestDate?: string;
  svhcStatus?: string;
  certificates?: string[];
  evidence?: ConfirmedEvidence;
}

app.post('/api/standards/analyze-product', requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      productName,
      manufacturer,
      criteriaRowNr,
      sdbText,
      tmText,
      testReportText,
      vocTestDate,
      hasBauteilekatalog,
      projectTitle,
      userEmail,
      selectedStandardCodes = ['DGNB'],
      standards = [],
      structuredInput,
    }: {
      productName?: string;
      manufacturer?: string;
      criteriaRowNr?: string;
      sdbText?: string;
      tmText?: string;
      testReportText?: string;
      vocTestDate?: string;
      hasBauteilekatalog?: boolean;
      projectTitle?: string;
      userEmail?: string;
      selectedStandardCodes?: string[];
      standards?: SustainabilityStandard[];
      structuredInput?: StructuredInputPayload;
    } = req.body;

    const targetStandards: string[] =
      Array.isArray(selectedStandardCodes) && selectedStandardCodes.length > 0
        ? selectedStandardCodes
        : ['DGNB'];

    const identifiedProductName = productName?.trim() || 'Geprüftes Bauprodukt';
    const identifiedManufacturer = manufacturer?.trim() || 'Hersteller laut Deklaration';
    const bauteilekatalogActive = hasBauteilekatalog ?? true;

    const evaluations: Record<string, SingleStandardEvaluationResult> = {};

    // Use user-confirmed standards from Step 1 if provided, falling back to default catalogs
    const clientStandards: SustainabilityStandard[] = Array.isArray(standards) ? standards : [];
    const getMatrixForCode = (code: string, fallback: CriteriaRow[]): CriteriaRow[] => {
      const found = clientStandards.find((s) => s.code === code);
      return found && Array.isArray(found.criteriaRows) && found.criteriaRows.length > 0
        ? found.criteriaRows
        : fallback;
    };

    const dgnbMatrix = getMatrixForCode('DGNB', DEFAULT_DGNB_ENV12_MATRIX);
    const qngMatrix = getMatrixForCode('QNG', DEFAULT_QNG_MATRIX);
    const bnbMatrix = getMatrixForCode('BNB', DEFAULT_BNB_MATRIX);

    const dgnbRow: CriteriaRow =
      dgnbMatrix.find((r) => r.nr === String(criteriaRowNr)) || dgnbMatrix[0];

    // Resolve QNG and BNB rows via authoritative qngRefNr and bnbRefNr on the DGNB row
    const qngRef = dgnbRow?.qngRefNr || String(criteriaRowNr || '');
    const qngRow: CriteriaRow | null =
      qngMatrix.find((r) => r.nr === qngRef || r.nr === String(criteriaRowNr)) || null;

    const bnbRef = dgnbRow?.bnbRefNr || String(criteriaRowNr || '');
    const bnbRow: CriteriaRow | null =
      bnbMatrix.find((r) => r.nr === bnbRef || r.nr === String(criteriaRowNr)) || null;

    const combinedText = [sdbText, tmText, testReportText].filter(Boolean).join('\n').trim();
    const confirmedEvidence: ConfirmedEvidence = structuredInput?.evidence || {};

    // Consolidated inputs for deterministic rule engine
    const vocTextInput = [structuredInput?.vocContent, combinedText].filter(Boolean).join('\n');
    const certsTextInput = [
      ...(structuredInput?.certificates || []),
      structuredInput?.vocContent || '',
      combinedText,
    ]
      .filter(Boolean)
      .join('\n');
    const svhcTextInput = [structuredInput?.svhcStatus, combinedText].filter(Boolean).join('\n');

    const extractedDateFromText =
      combinedText.match(
        /(?:prüfdatum|testdatum|datum der prüfung|ausgestellt am|prüfbericht vom|stand(?:datum)?|ausgabe(?:datum)?|überarbeitet am)[^\d\n]{0,25}(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2}|\b(?:19|20)\d\d\b)/i
      )?.[1] || (tmText ? parseDate(tmText)?.raw : '') || '';
    const dateInput = (structuredInput?.vocTestDate || vocTestDate || extractedDateFromText || '').trim();

    // Parse product properties once (independent of standard)
    const vocFinding = parseVoc(vocTextInput);
    const productCerts = canonicalCertificates(certsTextInput);
    const svhcFinding = evaluateSvhc(svhcTextInput);
    const testDateEval = evaluateTestDateAge(dateInput);

    for (const code of targetStandards) {
      let stdName = code;
      let institute = 'Zertifizierungsinstitut';
      let criteriaTitle = 'Kriterienmatrix';
      let criteriaNr = '1';
      let activeRow: CriteriaRow | null = null;
      const stdNotes: string[] = [];

      if (code === 'DGNB') {
        const stdMeta = clientStandards.find((s) => s.code === 'DGNB');
        stdName = stdMeta?.name || 'DGNB ENV1.2 (Neubau 2023)';
        institute = stdMeta?.institute || 'Deutsche Gesellschaft für Nachhaltiges Bauen (DGNB)';
        activeRow = dgnbRow;
        criteriaTitle = activeRow.bauteil;
        criteriaNr = `Zeile ${activeRow.nr}`;
      } else if (code === 'QNG') {
        const stdMeta = clientStandards.find((s) => s.code === 'QNG');
        stdName = stdMeta?.name || 'QNG Anhang 313 (Siegel 2023/2024)';
        institute = stdMeta?.institute || 'BMWSB / BiRN (Bundesförderung KfW)';
        activeRow = qngRow;
        if (activeRow) {
          criteriaTitle = activeRow.bauteil;
          criteriaNr = `Pos. ${activeRow.nr}`;
        } else {
          criteriaTitle = `Keine direkte QNG-Entsprechung für DGNB Zeile ${dgnbRow.nr}`;
          criteriaNr = `Ref. ${qngRef || 'unbekannt'}`;
          stdNotes.push(
            `Für DGNB Zeile ${dgnbRow.nr} (${dgnbRow.bauteil}) wurde keine passende Zeile in der QNG-Matrix gefunden – manuelle Zuordnung erforderlich.`
          );
        }
      } else if (code === 'BNB') {
        const stdMeta = clientStandards.find((s) => s.code === 'BNB');
        stdName = stdMeta?.name || 'BNB Neubau 1.1.6 (Bundesbau)';
        institute = stdMeta?.institute || 'Bundesinstitut für Bau-, Stadt- und Raumforschung (BBSR)';
        activeRow = bnbRow;
        if (activeRow) {
          criteriaTitle = activeRow.bauteil;
          criteriaNr = `Pos. ${activeRow.nr}`;
        } else {
          criteriaTitle = `Keine direkte BNB-Entsprechung für DGNB Zeile ${dgnbRow.nr}`;
          criteriaNr = `Ref. ${bnbRef || 'unbekannt'}`;
          stdNotes.push(
            `Für DGNB Zeile ${dgnbRow.nr} (${dgnbRow.bauteil}) wurde keine passende Zeile in der BNB-Matrix gefunden – manuelle Zuordnung erforderlich.`
          );
        }
      } else {
        const customStd = clientStandards.find((s) => s.code === code);
        stdName = customStd?.name || `Individueller Standard (${code})`;
        institute = customStd?.institute || 'Herausgebendes Institut';
        activeRow =
          customStd?.criteriaRows?.find((r) => r.nr === String(criteriaRowNr)) ||
          customStd?.criteriaRows?.[0] ||
          null;
        criteriaTitle = activeRow?.bauteil || 'Individuelle Kriterienzeile';
        criteriaNr = activeRow?.nr ? `Pos. ${activeRow.nr}` : '1';
      }

      // 1. Deterministic VOC / Row evaluation against activeRow
      const vocRowEval = evaluateRowLevels(activeRow, vocFinding, productCerts);
      let vocDisplayValue: string;
      if (vocFinding.found || vocFinding.solventFree) {
        vocDisplayValue = formatVoc(vocFinding);
      } else if (vocFinding.onlyLimitValues) {
        vocDisplayValue = 'Nur gesetzlicher Grenzwert im Dokument genannt (kein Produktmesswert)';
      } else if (vocFinding.unitMismatch) {
        vocDisplayValue =
          structuredInput?.vocContent?.trim() ||
          'VOC nur in % angegeben (keine automatische Umrechnung in g/l)';
      } else if (productCerts.length > 0 && vocRowEval.achievedLevel > 1) {
        vocDisplayValue = `Nachweis über Prüfzeichen (${productCerts.join(', ')})`;
      } else {
        vocDisplayValue = 'Kein Nachweis im Dokument';
      }

      let vocSource: 'sdb' | 'tm' | 'report' | 'manual' | 'missing' = 'missing';
      if (vocFinding.found || vocFinding.solventFree) {
        const tmVoc = tmText ? parseVoc(tmText) : null;
        const sdbVoc = sdbText ? parseVoc(sdbText) : null;
        const reportVoc = testReportText ? parseVoc(testReportText) : null;

        const sdbValueMatches = Boolean(
          sdbVoc && vocFinding.found && sdbVoc.found && sdbVoc.value === vocFinding.value
        );
        const tmValueMatches = Boolean(
          tmVoc && vocFinding.found && tmVoc.found && tmVoc.value === vocFinding.value
        );
        const reportValueMatches = Boolean(
          reportVoc && vocFinding.found && reportVoc.found && reportVoc.value === vocFinding.value
        );

        if (reportValueMatches) {
          vocSource = 'report';
        } else if (sdbValueMatches && !tmValueMatches) {
          vocSource = 'sdb';
        } else if (tmValueMatches && !sdbValueMatches) {
          vocSource = 'tm';
        } else if (tmValueMatches) {
          vocSource = 'tm';
        } else if (sdbValueMatches) {
          vocSource = 'sdb';
        } else if (reportVoc?.solventFree && vocFinding.solventFree) {
          vocSource = 'report';
        } else if (tmVoc?.solventFree && vocFinding.solventFree) {
          vocSource = 'tm';
        } else if (sdbVoc?.solventFree && vocFinding.solventFree) {
          vocSource = 'sdb';
        } else if (structuredInput?.vocContent) {
          vocSource = tmText ? 'tm' : sdbText ? 'sdb' : 'manual';
        } else {
          vocSource = sdbText ? 'sdb' : 'tm';
        }
      } else if (structuredInput?.vocContent) {
        vocSource = 'manual';
      }

      const vocEvidence: ParameterEvidence = confirmedEvidence.voc
        ? {
            ...confirmedEvidence.voc,
            documentType: confirmedEvidence.voc.documentType || (vocSource === 'tm' ? 'tm' : vocSource === 'report' ? 'pruefbericht' : vocSource === 'sdb' ? 'sdb' : 'allgemein'),
          }
        : {
            source: vocSource,
            verification: vocFinding.found || vocFinding.solventFree ? 'verified' : 'unverified',
            documentType: vocSource === 'tm' ? 'tm' : vocSource === 'report' ? 'pruefbericht' : vocSource === 'sdb' ? 'sdb' : 'allgemein',
          };
      const vocNeedsReview =
        vocRowEval.needsManualReview ||
        vocFinding.onlyLimitValues ||
        vocFinding.unitMismatch ||
        vocEvidence.verification === 'unverified' ||
        vocEvidence.verification === 'partial' ||
        vocEvidence.verification === 'no-text-layer';

      const vocExplanationParts: string[] = [];
      const matchingCheck = vocRowEval.checks.find((c) => c.level === vocRowEval.achievedLevel);
      if (matchingCheck) vocExplanationParts.push(matchingCheck.reason);
      if (vocRowEval.reviewReason) vocExplanationParts.push(vocRowEval.reviewReason);
      if (vocFinding.onlyLimitValues) {
        vocExplanationParts.push(
          'Im Dokument wurde lediglich ein gesetzlicher Decopaint-Grenzwert gefunden, jedoch kein gemessener Produkt-VOC-Wert.'
        );
      }
      if (vocFinding.unitMismatch) {
        vocExplanationParts.push(
          'VOC wurde in Gewichtsprozent (%) angegeben; für den Vergleich mit g/l-Schwellen ist die Produktdichte bzw. manuelle Prüfung erforderlich.'
        );
      }

      // 2. Deterministic Test Date / Age evaluation
      let dateSource: 'report' | 'tm' | 'sdb' | 'manual' | 'missing' = 'missing';
      if (dateInput) {
        if (testReportText && parseDate(testReportText)) {
          dateSource = 'report';
        } else if (tmText && parseDate(tmText)) {
          dateSource = 'tm';
        } else if (sdbText && parseDate(sdbText)) {
          dateSource = 'sdb';
        } else if (structuredInput?.vocTestDate) {
          dateSource = 'manual';
        } else {
          dateSource = 'report';
        }
      }

      const dateEvidence: ParameterEvidence = confirmedEvidence.testDate
        ? {
            ...confirmedEvidence.testDate,
            documentType: confirmedEvidence.testDate.documentType || (dateSource === 'tm' ? 'tm' : dateSource === 'report' ? 'pruefbericht' : dateSource === 'sdb' ? 'sdb' : 'allgemein'),
          }
        : {
            source: dateSource,
            verification: dateInput ? 'verified' : 'unverified',
            documentType: dateSource === 'tm' ? 'tm' : dateSource === 'report' ? 'pruefbericht' : dateSource === 'sdb' ? 'sdb' : 'allgemein',
          };
      const dateNeedsReview =
        Boolean(testDateEval.needsManualReview) ||
        dateEvidence.verification === 'unverified' ||
        dateEvidence.verification === 'partial' ||
        dateEvidence.verification === 'no-text-layer';

      // 3. Deterministic REACH SVHC evaluation (negation-aware, never triggered by mere "REACH")
      let svhcLevel: 1 | 2 | 3 | 4 = 1;
      let svhcDisplayValue = 'Kein Nachweis im Dokument';
      let svhcExplanation = '';
      let svhcNeedsReview = false;

      if (svhcFinding.status === 'none') {
        svhcLevel = 4;
        svhcDisplayValue =
          structuredInput?.svhcStatus?.trim() || 'Keine SVHC > 0,1 % w/w (REACH-konform)';
        svhcExplanation = `Negationsbewusste Prüfung bestätigt: Keine besonders besorgniserregenden Stoffe (SVHC) > 0,1 % w/w deklariert${
          svhcFinding.evidence ? ` („${svhcFinding.evidence.slice(0, 120)}“)` : ''
        }.`;
      } else if (svhcFinding.status === 'present') {
        svhcLevel = 1;
        svhcDisplayValue =
          structuredInput?.svhcStatus?.trim() || 'SVHC > 0,1 % w/w enthalten (K.O.-Kriterium)';
        svhcExplanation = `K.O.-Kriterium: Im Dokument sind SVHC-Stoffe > 0,1 % w/w ausgewiesen${
          svhcFinding.evidence ? ` („${svhcFinding.evidence.slice(0, 120)}“)` : ''
        }.`;
      } else if (svhcFinding.status === 'unclear') {
        svhcLevel = 2;
        svhcNeedsReview = true;
        svhcDisplayValue =
          structuredInput?.svhcStatus?.trim() || 'SVHC-Aussage mehrdeutig – bitte manuell prüfen';
        svhcExplanation = `SVHC wird im Dokument erwähnt, aber ohne eindeutige Ausschluss- oder Gehaltsangabe ≤ 0,1 % w/w${
          svhcFinding.evidence ? ` („${svhcFinding.evidence.slice(0, 120)}“)` : ''
        }. Bitte Abschnitt 3/15 manuell prüfen.`;
      } else {
        svhcLevel = 1;
        svhcNeedsReview = true;
        svhcDisplayValue = 'Kein Nachweis im Dokument';
        svhcExplanation =
          'Keine explizite Aussage zur REACH-Kandidatenliste (SVHC ≤ 0,1 % w/w) im Dokument gefunden (die bloße Nennung der REACH-Verordnung genügt nicht).';
      }

      let svhcSource: 'sdb' | 'tm' | 'report' | 'manual' | 'missing' = 'missing';
      if (svhcFinding.status !== 'missing') {
        const sdbSvhc = sdbText ? evaluateSvhc(sdbText) : null;
        const tmSvhc = tmText ? evaluateSvhc(tmText) : null;
        const reportSvhc = testReportText ? evaluateSvhc(testReportText) : null;

        if (sdbSvhc && sdbSvhc.status === svhcFinding.status) {
          svhcSource = 'sdb';
        } else if (tmSvhc && tmSvhc.status === svhcFinding.status) {
          svhcSource = 'tm';
        } else if (reportSvhc && reportSvhc.status === svhcFinding.status) {
          svhcSource = 'report';
        } else if (sdbText && sdbSvhc && sdbSvhc.status !== 'missing') {
          svhcSource = 'sdb';
        } else if (tmText && tmSvhc && tmSvhc.status !== 'missing') {
          svhcSource = 'tm';
        } else if (testReportText && reportSvhc && reportSvhc.status !== 'missing') {
          svhcSource = 'report';
        } else if (structuredInput?.svhcStatus) {
          svhcSource = sdbText ? 'sdb' : tmText ? 'tm' : 'manual';
        } else {
          svhcSource = sdbText ? 'sdb' : 'tm';
        }
      } else if (structuredInput?.svhcStatus) {
        svhcSource = 'manual';
      }

      const svhcEvidence: ParameterEvidence = confirmedEvidence.svhc
        ? {
            ...confirmedEvidence.svhc,
            documentType: confirmedEvidence.svhc.documentType || (svhcSource === 'tm' ? 'tm' : svhcSource === 'report' ? 'pruefbericht' : svhcSource === 'sdb' ? 'sdb' : 'allgemein'),
          }
        : {
            source: svhcSource,
            quote: svhcFinding.evidence,
            verification: svhcFinding.status === 'missing' ? 'unverified' : 'verified',
            documentType: svhcSource === 'tm' ? 'tm' : svhcSource === 'report' ? 'pruefbericht' : svhcSource === 'sdb' ? 'sdb' : 'allgemein',
          };
      if (
        svhcEvidence.verification === 'unverified' ||
        svhcEvidence.verification === 'partial' ||
        svhcEvidence.verification === 'no-text-layer'
      ) {
        svhcNeedsReview = true;
      }

      // 4. Deterministic Certificate / Label evaluation against activeRow
      const labelRowEval = evaluateLabelLevels(activeRow, productCerts);
      const qs4Certs = activeRow ? canonicalCertificates(activeRow.qs4 || '') : [];
      let labelDisplayValue: string;
      if (productCerts.length > 0) {
        labelDisplayValue = productCerts.join(', ');
      } else if (qs4Certs.length === 0 && labelRowEval.achievedLevel === 4) {
        labelDisplayValue = 'Kein gesondertes Umweltzeichen in dieser Kriterienzeile gefordert';
      } else {
        labelDisplayValue = 'Kein anerkanntes Umweltzeichen im Dokument nachgewiesen';
      }

      let labelSource: 'sdb' | 'tm' | 'report' | 'manual' | 'missing' = 'missing';
      if (productCerts.length > 0) {
        if (tmText && canonicalCertificates(tmText).length > 0) {
          labelSource = 'tm';
        } else if (testReportText && canonicalCertificates(testReportText).length > 0) {
          labelSource = 'report';
        } else if (sdbText && canonicalCertificates(sdbText).length > 0) {
          labelSource = 'sdb';
        } else if (structuredInput?.certificates && structuredInput.certificates.length > 0) {
          labelSource = tmText ? 'tm' : 'report';
        } else {
          labelSource = 'report';
        }
      } else if (structuredInput?.certificates && structuredInput.certificates.length > 0) {
        labelSource = 'manual';
      }

      const labelEvidence: ParameterEvidence = confirmedEvidence.label
        ? {
            ...confirmedEvidence.label,
            documentType: confirmedEvidence.label.documentType || (labelSource === 'tm' ? 'tm' : labelSource === 'report' ? 'pruefbericht' : labelSource === 'sdb' ? 'sdb' : 'allgemein'),
          }
        : {
            source: labelSource,
            verification: productCerts.length > 0 ? 'verified' : 'unverified',
            documentType: labelSource === 'tm' ? 'tm' : labelSource === 'report' ? 'pruefbericht' : labelSource === 'sdb' ? 'sdb' : 'allgemein',
          };
      const labelNeedsReview =
        labelRowEval.needsManualReview ||
        (productCerts.length > 0 &&
          (labelEvidence.verification === 'unverified' ||
            labelEvidence.verification === 'partial' ||
            labelEvidence.verification === 'no-text-layer'));

      const labelCheck = labelRowEval.checks.find((c) => c.level === labelRowEval.achievedLevel);
      const labelExplanation = [labelCheck?.reason, labelRowEval.reviewReason]
        .filter(Boolean)
        .join(' ');

      const evaluatedParams: ParameterEvaluation[] = [
        {
          parameterKey: 'voc',
          parameterName: 'VOC-Gehalt / Stoffliche Zeilenanforderung',
          productValue: vocDisplayValue,
          requiredForQS4: activeRow ? activeRow.qs4 : 'Siehe Kriterienmatrix',
          achievedLevel: vocRowEval.achievedLevel,
          isBottleneck: false,
          status: 'pass',
          explanation:
            vocExplanationParts.join(' ') || `Erreichte Stufe: QS ${vocRowEval.achievedLevel}.`,
          evidence: vocEvidence,
          needsManualReview: vocNeedsReview,
        },
        {
          parameterKey: 'testDate',
          parameterName: 'Alter & Gültigkeit des VOC-Prüfberichts (DGNB / AgBB)',
          productValue: dateInput ? `Prüfdatum: ${dateInput}` : 'Kein Prüfdatum angegeben',
          requiredForQS4: 'Prüfbericht ≤ 5 Jahre alt (DGNB/AgBB-Frist)',
          achievedLevel: testDateEval.achievedLevel,
          isBottleneck: false,
          status: testDateEval.status,
          explanation: testDateEval.explanation,
          evidence: dateEvidence,
          needsManualReview: dateNeedsReview,
        },
        {
          parameterKey: 'svhc',
          parameterName: 'Besonders besorgniserregende Stoffe (REACH SVHC)',
          productValue: svhcDisplayValue,
          requiredForQS4: 'SVHC ≤ 0,1 % w/w',
          achievedLevel: svhcLevel,
          isBottleneck: false,
          status: svhcLevel >= 3 ? 'pass' : svhcLevel === 2 ? 'warning' : 'fail',
          explanation: svhcExplanation,
          evidence: svhcEvidence,
          needsManualReview: svhcNeedsReview,
        },
        {
          parameterKey: 'label',
          parameterName: 'Umweltzeichen & Emissionsprüfungen',
          productValue: labelDisplayValue,
          requiredForQS4:
            qs4Certs.length > 0
              ? qs4Certs.join(' / ')
              : activeRow
              ? activeRow.qs4
              : 'Siehe Kriterienmatrix',
          achievedLevel: labelRowEval.achievedLevel,
          isBottleneck: false,
          status: 'pass',
          explanation: labelExplanation || `Erreichte Stufe: QS ${labelRowEval.achievedLevel}.`,
          evidence: labelEvidence,
          needsManualReview: labelNeedsReview,
        },
      ];

      // Evaluate compliance using strict Schwachstellen-Prinzip & Bauteilekatalog
      const compliance = evaluateDgnbCompliance(evaluatedParams, Boolean(bauteilekatalogActive));
      if (compliance.bauteilekatalogImpactNote) {
        stdNotes.push(compliance.bauteilekatalogImpactNote);
      }

      let ratingText = `QS ${compliance.overallLevel}`;
      if (code === 'QNG') {
        ratingText =
          compliance.overallLevel === 4
            ? 'Erfüllt (QNG Plus / Premium)'
            : compliance.overallLevel >= 2
            ? 'Erfüllt (QNG Standard)'
            : 'Nicht erfüllt';
      } else if (code === 'BNB') {
        ratingText = `QN ${compliance.overallLevel}`;
      } else if (!['DGNB', 'QNG', 'BNB'].includes(code)) {
        ratingText = `Stufe ${compliance.overallLevel} (${stdName})`;
      }

      const stdIsProvisional = Boolean(compliance.isProvisional || !activeRow);
      if (stdIsProvisional) {
        ratingText = `${ratingText} (vorläufig)`;
      }

      const recommendation =
        compliance.overallLevel === 4 && !stdIsProvisional
          ? `Alle Anforderungen der Höchststufe für ${stdName} sind rechnerisch und dokumentarisch nachgewiesen.`
          : compliance.overallLevel === 4 && stdIsProvisional
          ? `Rechnerisch wird die Höchststufe für ${stdName} erreicht, jedoch sind einzelne Belege/Bedingungen als „bitte manuell prüfen“ markiert.`
          : compliance.isBauteilekatalogKO
          ? `Für das Erreichen der Stufen 3 und 4 muss der materialökologische Bauteilekatalog aktiviert bzw. projektseitig vorgelegt werden.`
          : `Für eine höhere Einstufung bei ${stdName} ist ein belastbarer Nachweis für den Engpass-Parameter „${compliance.bottleneckParameter?.parameterName || 'Pflichtparameter'}“ erforderlich.`;

      evaluations[code] = {
        standardCode: code,
        standardName: stdName,
        institute,
        matchedCriteriaRowNr: criteriaNr,
        matchedCriteriaTitle: criteriaTitle,
        overallRating: ratingText,
        overallLevelNum: compliance.overallLevel,
        isCompliant: compliance.overallLevel >= 2,
        bottleneckParameter: compliance.bottleneckParameter?.parameterName,
        bottleneckReason: compliance.bottleneckReason,
        userExplanation: compliance.userExplanation,
        parameters: compliance.evaluatedParameters,
        recommendation,
        isProvisional: stdIsProvisional,
        notes: stdNotes,
      };
    }

    // Compute genuine bestStandard and criticalStandard across all evaluated standards
    const sortedByLevelDesc = [...targetStandards].sort(
      (a, b) => (evaluations[b]?.overallLevelNum || 0) - (evaluations[a]?.overallLevelNum || 0)
    );
    const sortedByLevelAsc = [...targetStandards].sort(
      (a, b) => (evaluations[a]?.overallLevelNum || 0) - (evaluations[b]?.overallLevelNum || 0)
    );
    const bestStandard = sortedByLevelDesc[0] || targetStandards[0];
    const criticalStandard = sortedByLevelAsc[0] || targetStandards[0];

    const anyProvisional = Object.values(evaluations).some((e) => e.isProvisional);
    const allCompliant = Object.values(evaluations).every((e) => e.isCompliant);

    const assumptions: string[] = [];
    if (bauteilekatalogActive) {
      assumptions.push(
        'QNG-ready / Bauteilekatalog-Annahme aktiv: Es wird vorausgesetzt, dass der materialökologische Bauteilekatalog projektseitig geführt wird (erforderlich für DGNB QS 3/4).'
      );
    }

    const auditId = `QM-SUSTAIN-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const auditDate = new Date().toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const conclusionPrefix = !allCompliant
      ? 'Abweichungen / K.O.-Engpass festgestellt für'
      : anyProvisional
      ? 'Vorläufiges Prüfergebnis (manuelle Nachprüfung empfohlen) für'
      : 'Konformitätsprüfung abgeschlossen für';

    // F6: Enforce auditor identity integrity from verified auth token
    const verifiedUser = (req as any).authUser;
    const verifiedAuditorEmail =
      (verifiedUser?.email || '').trim().toLowerCase() || 'auditor@bau-qm.org';

    const result: ProductEvaluationResult = {
      productName: identifiedProductName,
      manufacturer: identifiedManufacturer,
      productType: dgnbRow?.kategorie || 'Bauprodukt / Baustoff',
      hasBauteilekatalog: Boolean(bauteilekatalogActive),
      selectedStandardCodes: targetStandards,
      isProvisional: anyProvisional,
      assumptions,
      auditMetadata: {
        auditId,
        auditDate,
        auditorEmail: verifiedAuditorEmail,
        projectName: projectTitle || 'Neubauvorhaben / Nachhaltigkeitsaudit',
        standardsVersionSummary: targetStandards.join(', '),
      },
      standardsEvaluations: evaluations,
      synopticSummary: {
        bestStandard,
        criticalStandard,
        overallRecommendation: `Die Prüfung erfolgte deterministisch auf Basis der übergebenen und im PDF-Textlayer abgeglichenen Unterlagen gegen ${targetStandards.length} Standard(s) (${targetStandards.join(', ')}). Das Schwachstellen-Prinzip wurde auf alle 4 Pflichtparameter angewendet.`,
      },
      customerReport: {
        title: anyProvisional
          ? 'VORLÄUFIGES KONFORMITÄTSGUTACHTEN NACHHALTIGKEIT'
          : 'KONFORMITÄTSGUTACHTEN NACHHALTIGKEIT',
        subtitle: `Prüfung gegen ${targetStandards.join(', ')}`,
        legalMandatoryNotice: anyProvisional
          ? 'Hinweis: Mindestens ein Parameter oder Beleg ist als „vorläufig / manuell zu prüfen“ gekennzeichnet. Bitte prüfen Sie die markierten Originaltextstellen vor Freigabe.'
          : 'Dieses Konformitätsdokument wurde regelbasiert auf Basis der verifizierten Angaben aus Sicherheitsdatenblatt, Technischem Merkblatt (TM) und Prüfberichten erstellt.',
        executiveSummary: `Das Produkt "${identifiedProductName}" (${identifiedManufacturer}) wurde gegen die spezifischen Kriterienzeilen von ${targetStandards.join(', ')} geprüft. Die detaillierten Einzelgutachten, Textbelege und K.O.-Begründungen sind nachstehend aufgeführt.`,
        conclusion: `${conclusionPrefix}: ${targetStandards.map((c) => `${c} (${evaluations[c]?.overallRating})`).join(' · ')}`,
      },
    };

    res.json({
      success: true,
      result,
    });
  } catch (err: any) {
    console.error('Error analyzing product across standards:', err);
    res.status(500).json({
      success: false,
      message: sanitizeErrorMessage('Fehler bei der Multi-Standard-Analyse', err),
    });
  }
});

// Legacy backward-compatibility endpoint for Step 2
app.post('/api/dgnb/analyze-product', (_req: Request, res: Response) => {
  return res.redirect(307, '/api/standards/analyze-product');
});

// ----------------------------------------------------
// GLOBAL ERROR HANDLING & PROCESS UNCAUGHT TRAPS (F7)
// ----------------------------------------------------

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Process] Uncaught Exception:', error);
});

app.use((err: any, req: Request, res: Response, _next: express.NextFunction) => {
  console.error(`[Express Unhandled Error] ${req.method} ${req.originalUrl}:`, err);

  const isProd = process.env.NODE_ENV?.toLowerCase() === 'production';

  // Handle body-parser malformed JSON SyntaxError
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      code: 'BAD_REQUEST',
      message: 'Ungültiges JSON-Format im Anfrage-Body.',
    });
  }

  // Handle body-parser entity too large (413)
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      success: false,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Die übermittelte Datei überschreitet das zulässige Größenlimit.',
    });
  }

  const statusCode = typeof err.status === 'number' ? err.status : 500;
  const errorCode = err.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR');
  const message = isProd
    ? 'Ein interner Serverfehler ist aufgetreten. Bitte versuchen Sie es später erneut.'
    : err?.message || 'Interner Serverfehler';

  return res.status(statusCode).json({
    success: false,
    code: errorCode,
    message,
    ...(isProd ? {} : { stack: err.stack }),
  });
});

// ----------------------------------------------------
// VITE DEV SERVER OR STATIC PRODUCTION
// ----------------------------------------------------

async function startServer() {
  const isDev = process.env.NODE_ENV?.toLowerCase() !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const server = isPipe
    ? app.listen(PORT, () => {
        console.log(`[QM-Tool Nachhaltigkeit Server] Running on pipe ${PORT} in ${isDev ? 'development' : 'production'} mode`);
      })
    : app.listen(PORT as number, '0.0.0.0', () => {
        console.log(`[QM-Tool Nachhaltigkeit Server] Running at http://localhost:${PORT} in ${isDev ? 'development' : 'production'} mode`);
      });

  // F9: Graceful shutdown traps
  let isShuttingDown = false;
  const handleShutdown = (signal: string) => {
    if (isShuttingDown) {
      console.log(`[Server] ${signal} received again, forcing exit immediately.`);
      process.exit(1);
    }
    isShuttingDown = true;
    console.log(`[Server] Received ${signal}. Starting graceful shutdown...`);

    server.close((err) => {
      if (err) {
        console.error('[Server] Error during server close:', err);
        process.exit(1);
      }
      console.log('[Server] All active HTTP requests finished. Process exiting cleanly.');
      process.exit(0);
    });

    const forceExitTimeout = setTimeout(() => {
      console.error('[Server] Graceful shutdown timeout exceeded (10s). Forcing termination.');
      process.exit(1);
    }, 10000);
    forceExitTimeout.unref();
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

// Only launch standalone HTTP listener if not running in serverless or test environment
if (process.env.VERCEL !== '1' && !process.env.AWS_LAMBDA_FUNCTION_NAME && process.env.NODE_ENV?.toLowerCase() !== 'test') {
  startServer();
}

export default app;
export { app };

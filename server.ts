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
import { extractPdfPages, buildExcerpts } from './src/utils/pdfText';
import { verifyQuote } from './src/utils/quoteVerification';
import {
  parseVoc,
  formatVoc,
  canonicalCertificates,
  evaluateRowLevels,
  evaluateLabelLevels,
  evaluateSvhc,
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
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

let defaultAppletConfig: { projectId?: string; firestoreDatabaseId?: string } = {};
try {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    defaultAppletConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  }
} catch {}

const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || defaultAppletConfig.projectId || 'gen-lang-client-0723441171';
const rawEnvDbId = (process.env.FIREBASE_FIRESTORE_DATABASE_ID || '')
  .replace(/^['"]+|['"]+$/g, '')
  .trim();
const fallbackDbId =
  defaultAppletConfig.firestoreDatabaseId ||
  'ai-studio-dgnbenv12qmprfto-9665ebc6-a4b9-418d-9d5d-967112a73de4';

const FIRESTORE_DATABASE_ID = !rawEnvDbId
  ? fallbackDbId
  : !rawEnvDbId.startsWith('ai-studio-') && fallbackDbId.endsWith(rawEnvDbId)
  ? fallbackDbId
  : rawEnvDbId.startsWith('dgnbenv12qmprfto-')
  ? `ai-studio-${rawEnvDbId}`
  : rawEnvDbId;
const GEMINI_MODEL = 'gemini-3.8-flash';

app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

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

const ADMIN_EMAILS = new Set(['brian.lackmann@kaubit.de', 'brianlackmann@gmail.com']);

function isAdminEmail(email?: string | null): boolean {
  return Boolean(email && ADMIN_EMAILS.has(email.trim().toLowerCase()));
}

interface CompanyVaultState {
  saltHex: string;
  verifierHex: string;
  updatedAt: string;
  updatedByEmail: string;
  authorizedEmails: string[];
}

const VAULT_DISK_PATH = path.resolve(process.cwd(), '.data', 'company-vault.json');

function loadVaultFromDisk(): CompanyVaultState | null {
  try {
    if (fs.existsSync(VAULT_DISK_PATH)) {
      const raw = fs.readFileSync(VAULT_DISK_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          saltHex: typeof parsed.saltHex === 'string' ? parsed.saltHex : '',
          verifierHex: typeof parsed.verifierHex === 'string' ? parsed.verifierHex : '',
          updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
          updatedByEmail: typeof parsed.updatedByEmail === 'string' ? parsed.updatedByEmail : '',
          authorizedEmails: Array.isArray(parsed.authorizedEmails) ? parsed.authorizedEmails : Array.from(ADMIN_EMAILS),
        };
      }
    }
  } catch {}
  return null;
}

function saveVaultToDisk(state: CompanyVaultState): void {
  try {
    const dir = path.dirname(VAULT_DISK_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(VAULT_DISK_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch {}
}

let companyVaultState: CompanyVaultState | null = loadVaultFromDisk();

function getEffectiveAuthorizedEmails(): string[] {
  const base = Array.from(ADMIN_EMAILS);
  if (!companyVaultState?.authorizedEmails) return base;
  return Array.from(
    new Set([
      ...base,
      ...companyVaultState.authorizedEmails.map((e) => e.trim().toLowerCase()).filter(Boolean),
    ])
  );
}

const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents`;

async function fetchVaultFromFirestoreRest(idToken: string): Promise<CompanyVaultState | null> {
  if (!idToken) return null;
  try {
    const res = await fetch(`${FIRESTORE_REST_BASE}/vault/company`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });
    if (!res.ok) return null;
    const docJson: any = await res.json();
    const fields = docJson?.fields;
    if (!fields) return null;

    const saltHex = fields.saltHex?.stringValue || '';
    const verifierHex = fields.verifierHex?.stringValue || '';
    const updatedAt = fields.updatedAt?.stringValue || new Date().toISOString();
    const updatedByEmail = fields.updatedByEmail?.stringValue || '';
    const rawEmails: string[] =
      fields.authorizedEmails?.arrayValue?.values
        ?.map((v: any) => v?.stringValue)
        .filter(Boolean) || [];

    const mergedEmails = Array.from(
      new Set([
        ...Array.from(ADMIN_EMAILS),
        ...rawEmails.map((e) => e.trim().toLowerCase()).filter(Boolean),
      ])
    );

    const loaded: CompanyVaultState = {
      saltHex,
      verifierHex,
      updatedAt,
      updatedByEmail,
      authorizedEmails: mergedEmails,
    };
    companyVaultState = loaded;
    saveVaultToDisk(loaded);
    return loaded;
  } catch {
    return null;
  }
}

async function writeVaultToFirestoreRest(
  idToken: string,
  state: CompanyVaultState,
  uid?: string
): Promise<boolean> {
  if (!idToken) return false;
  try {
    const fields: Record<string, any> = {
      updatedAt: { stringValue: state.updatedAt },
      updatedByEmail: { stringValue: state.updatedByEmail || '' },
      authorizedEmails: {
        arrayValue: {
          values: state.authorizedEmails.map((email) => ({ stringValue: email })),
        },
      },
    };
    if (uid) {
      fields.updatedByUid = { stringValue: uid };
    }
    if (state.saltHex && state.saltHex.length >= 16 && state.verifierHex && state.verifierHex.length >= 16) {
      fields.saltHex = { stringValue: state.saltHex };
      fields.verifierHex = { stringValue: state.verifierHex };
    }

    const res = await fetch(`${FIRESTORE_REST_BASE}/vault/company`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ fields }),
    });

    // Also upsert each employee email in /employees/{docId} via REST API
    for (const email of state.authorizedEmails) {
      const docId = email
        .trim()
        .toLowerCase()
        .replace(/@/g, '_at_')
        .replace(/[^a-z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 120);
      if (!docId) continue;
      await fetch(`${FIRESTORE_REST_BASE}/employees/${docId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          fields: {
            email: { stringValue: email },
            role: { stringValue: isAdminEmail(email) ? 'admin' : 'employee' },
            updatedAt: { stringValue: state.updatedAt },
            addedByEmail: { stringValue: state.updatedByEmail || '' },
            ...(uid ? { addedByUid: { stringValue: uid } } : {}),
          },
        }),
      }).catch(() => {});
    }

    return res.ok;
  } catch {
    return false;
  }
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
 * Calls Gemini (gemini-3.8-flash) with structured JSON schema output.
 */
async function generateStrictJson(
  ai: GoogleGenAI,
  params: {
    contents: any;
    systemInstruction: string;
    responseSchema: any;
  }
): Promise<{ parsed: any; modelUsed: string }> {
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: params.contents,
    config: {
      systemInstruction: params.systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: params.responseSchema,
    },
  });
  const parsed = JSON.parse(response.text || '{}');
  return { parsed, modelUsed: GEMINI_MODEL };
}

// Helper to verify Firebase ID Token (JWT) strictly against Google's JWKS
async function verifyFirebaseToken(idToken: string): Promise<{ uid: string; email: string } | null> {
  if (!idToken || typeof idToken !== 'string') return null;

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
  if (process.env.ALLOW_UNAUTHENTICATED_API === 'true') {
    next();
    return;
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

  (req as any).authUser = decoded;
  next();
}

// ----------------------------------------------------
// AUTHENTICATION & ADMIN EMPLOYEE VAULT ENDPOINTS
// ----------------------------------------------------

app.get('/api/auth/status', (_req: Request, res: Response) => {
  res.json({
    firebaseAuthEnabled: true,
    projectId: FIREBASE_PROJECT_ID,
    firestoreDatabaseId: FIRESTORE_DATABASE_ID,
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

    // Attempt to pull latest state from Firestore REST API using caller's token
    if (token) {
      await fetchVaultFromFirestoreRest(token);
    }

    const userEmail = decoded.email.trim();
    const isAdmin = isAdminEmail(userEmail);

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
      updatedAt: companyVaultState?.updatedAt || null,
      message: 'Authentifizierung erfolgreich.',
    });
  } catch (err: any) {
    console.error('Error verifying session:', err);
    return res.status(500).json({
      success: false,
      isAuthorized: false,
      message: 'Serverfehler bei der Sitzungsverifikation: ' + (err.message || String(err)),
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

    const effectiveSalt = String(saltHex || companyVaultState?.saltHex || '').trim();
    const effectiveVerifier = String(verifierHex || companyVaultState?.verifierHex || '').trim();

    const mergedEmails = Array.from(
      new Set([
        ...Array.from(ADMIN_EMAILS),
        ...(Array.isArray(authorizedEmails)
          ? authorizedEmails.map((e: any) => String(e || '').trim().toLowerCase()).filter(Boolean)
          : getEffectiveAuthorizedEmails()),
      ])
    );

    companyVaultState = {
      saltHex: effectiveSalt,
      verifierHex: effectiveVerifier,
      updatedAt: new Date().toISOString(),
      updatedByEmail: decoded.email,
      authorizedEmails: mergedEmails,
    };
    saveVaultToDisk(companyVaultState);

    const persistedToFirestore = token
      ? await writeVaultToFirestoreRest(token, companyVaultState, decoded.uid)
      : false;

    return res.json({
      success: true,
      authorizedEmails: mergedEmails,
      persistedToFirestore,
      message: 'Unternehmens-Verschlüsselungsphrase und Mitarbeiter-Freigaben erfolgreich gesichert.',
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: 'Fehler beim Speichern der Passphrase: ' + (err.message || String(err)),
    });
  }
});

app.post('/api/auth/manage-employees', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const { idToken, saltHex, verifierHex, authorizedEmails } = req.body;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : idToken;

    const decoded = token ? await verifyFirebaseToken(token) : null;
    if (!decoded || !isAdminEmail(decoded.email)) {
      return res.status(403).json({
        success: false,
        message: 'Nur der Administrator kann Mitarbeiter-Konten anlegen oder entfernen.',
      });
    }

    const mergedEmails = Array.from(
      new Set([
        ...Array.from(ADMIN_EMAILS),
        ...(Array.isArray(authorizedEmails)
          ? authorizedEmails.map((e: any) => String(e || '').trim().toLowerCase()).filter(Boolean)
          : []),
      ])
    );

    companyVaultState = {
      saltHex: String(saltHex || companyVaultState?.saltHex || '').trim(),
      verifierHex: String(verifierHex || companyVaultState?.verifierHex || '').trim(),
      updatedAt: new Date().toISOString(),
      updatedByEmail: decoded.email,
      authorizedEmails: mergedEmails,
    };
    saveVaultToDisk(companyVaultState);

    const persistedToFirestore = token
      ? await writeVaultToFirestoreRest(token, companyVaultState, decoded.uid)
      : false;

    return res.json({
      success: true,
      authorizedEmails: mergedEmails,
      persistedToFirestore,
      message: 'Mitarbeiter-Konten aktualisiert.',
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: 'Fehler bei der Mitarbeiter-Verwaltung: ' + (err.message || String(err)),
    });
  }
});

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
    const hasUploadedPdf = Boolean(pdfBase64 && typeof pdfBase64 === 'string');

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

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        success: false,
        code: 'AI_UNAVAILABLE',
        message:
          'KI-Service ist nicht verfügbar (GEMINI_API_KEY nicht konfiguriert). Das hochgeladene Leitfaden-PDF kann derzeit nicht automatisch ausgelesen werden.',
      });
    }

    const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '').trim();
    const { pages, hasTextLayer } = await extractPdfPages(cleanBase64);

    const prompt = `Du bist ein Fachexperte für Bauökologie und Nachhaltigkeits-Zertifizierungssysteme im Bauwesen (DGNB, QNG, BNB, LEED, BREEAM, NaWoh).
Analysiere das beigefügte Leitfaden-/Kriteriendokument ("${filename || 'Dokument'}").
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
              data: cleanBase64,
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
      standardName: parsed.standardName || filename?.replace(/\.pdf$/i, '') || 'Gescannter Nachhaltigkeitsstandard',
      institute: parsed.institute || 'Nicht im Leitfaden angegeben',
      version: parsed.version || '',
      matrix: cleanedMatrix,
      warnings,
      source: modelUsed,
    });
  } catch (err: any) {
    console.error('Error scanning PDF guideline:', err);
    return res.status(502).json({
      success: false,
      code: 'AI_FAILED',
      message:
        'Fehler beim KI-Scan des Leitfaden-PDFs: ' +
        (err?.message || 'Die Datei konnte nicht verarbeitet werden. Es wurde kein Standard überschrieben.'),
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
    const { pdfBase64, documentType = 'sdb', filename = 'Dokument.pdf' } = req.body;
    const ai = getGeminiClient();

    if (!pdfBase64 || typeof pdfBase64 !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PDF',
        message: 'Keine gültige PDF-Datei übermittelt.',
      });
    }

    if (!ai) {
      return res.status(503).json({
        success: false,
        code: 'AI_UNAVAILABLE',
        message:
          'KI-Dokumentenscan nicht verfügbar (GEMINI_API_KEY ist nicht konfiguriert). Bitte tragen Sie die Produktkennwerte manuell ein.',
      });
    }

    const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '').trim();
    const { pages, hasTextLayer } = await extractPdfPages(cleanBase64);
    const excerpts = buildExcerpts(pages);

    const catalogIndex = DEFAULT_DGNB_ENV12_MATRIX.map(
      (r) => `Zeile ${r.nr}: ${r.bauteil} (${r.betrachteteStoffe})`
    ).join('\n');

    const prompt = `Du bist ein strenger DGNB-Auditor und Fachexperte für Bauchemie, Sicherheitsdatenblätter (SDB nach REACH/CLP) und Emissions-Prüfberichte.
Analysiere die beigefügte PDF-Datei ("${filename}", angegebener Dokumententyp: "${documentType}").

STRIKTE ANTI-HALLUZINATIONS-REGELN:
1. Extrahiere NUR Angaben, die wörtlich im beigefügten PDF-Dokument stehen.
2. Wenn ein Wert (z. B. VOC-Gehalt, Prüfdatum, SVHC-Aussage, Umweltzeichen) NICHT im PDF steht, gib für dieses Feld zwingend einen leeren String "" bzw. ein leeres Array [] zurück!
3. Schreibe niemals Platzhalter wie "Kein Nachweis" oder erfundene Beispielwerte (wie "< 1 g/l" oder "EMICODE EC1 PLUS") in die Datenfelder.
4. Verwechsle in SDB Abschnitt 15 genannte gesetzliche EU-Decopaint-Grenzwerte ("Kat. A/a: 30 g/l") NICHT mit dem tatsächlichen Produkt-VOC-Gehalt. Wenn nur der gesetzliche Grenzwert genannt wird, gib ihn mit dem Zusatz "Gesetzlicher Grenzwert:" an oder lasse vocContent leer, falls kein Produktwert existiert.
5. Kopiere für jedes gefundene Feld in "fieldQuotes" das EXAKTE wörtliche Zitat (quote) aus dem PDF-Text.

Verfügbare Zeilen der DGNB ENV1.2 Kriterienmatrix für suggestedCriteriaNr:
${catalogIndex}

Extrahiere:
- documentType ("sdb", "pruefbericht" oder "allgemein")
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
              data: cleanBase64,
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
      verbatimSummary = `[Dokument "${filename}"] Kein direkter Textlayer-Auszug verfügbar.`;
    }

    const validCriteriaNr = DEFAULT_DGNB_ENV12_MATRIX.some((r) => r.nr === String(parsed.suggestedCriteriaNr || '').trim())
      ? String(parsed.suggestedCriteriaNr).trim()
      : '2';

    return res.json({
      success: true,
      extracted: {
        documentType:
          parsed.documentType === 'sdb' || parsed.documentType === 'pruefbericht'
            ? parsed.documentType
            : documentType,
        filename,
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
    return res.status(502).json({
      success: false,
      code: 'AI_FAILED',
      message:
        'KI-Dokumentenscan fehlgeschlagen: ' +
        (err?.message || 'Das PDF konnte nicht analysiert werden. Bitte prüfen Sie die Datei oder geben Sie die Werte manuell ein.'),
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

    const combinedText = `${sdbText || ''}\n${testReportText || ''}`.trim();
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
        /(?:prüfdatum|testdatum|datum der prüfung|ausgestellt am|prüfbericht vom)[^\d\n]{0,25}(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2}|\b(?:19|20)\d\d\b)/i
      )?.[1] || '';
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

      const vocEvidence: ParameterEvidence = confirmedEvidence.voc || {
        source: vocFinding.found || vocFinding.solventFree ? 'sdb' : 'missing',
        verification: vocFinding.found || vocFinding.solventFree ? 'verified' : 'unverified',
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
      const dateEvidence: ParameterEvidence = confirmedEvidence.testDate || {
        source: dateInput ? 'report' : 'missing',
        verification: dateInput ? 'verified' : 'unverified',
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

      const svhcEvidence: ParameterEvidence = confirmedEvidence.svhc || {
        source: svhcFinding.status === 'missing' ? 'missing' : 'sdb',
        quote: svhcFinding.evidence,
        verification: svhcFinding.status === 'missing' ? 'unverified' : 'verified',
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

      const labelEvidence: ParameterEvidence = confirmedEvidence.label || {
        source: productCerts.length > 0 ? 'report' : 'missing',
        verification: productCerts.length > 0 ? 'verified' : 'unverified',
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
        auditorEmail: userEmail || 'auditor@bau-qm.org',
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
          : 'Dieses Konformitätsdokument wurde regelbasiert auf Basis der verifizierten Angaben aus Sicherheitsdatenblatt und Prüfberichten erstellt.',
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
      message: 'Fehler bei der Multi-Standard-Analyse: ' + (err.message || String(err)),
    });
  }
});

// Legacy backward-compatibility endpoint for Step 2
app.post('/api/dgnb/analyze-product', (_req: Request, res: Response) => {
  return res.redirect(307, '/api/standards/analyze-product');
});

// ----------------------------------------------------
// VITE DEV SERVER OR STATIC PRODUCTION
// ----------------------------------------------------

async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[QM-Tool Nachhaltigkeit Server] Running at http://localhost:${PORT} in ${isDev ? 'development' : 'production'} mode`);
  });
}

// Only launch standalone HTTP listener if not running in a serverless environment (e.g. Vercel)
if (process.env.VERCEL !== '1' && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  startServer();
}

export default app;
export { app };

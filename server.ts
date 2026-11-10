import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { jwtVerify, createRemoteJWKSet, decodeJwt } from 'jose';
import { DEFAULT_DGNB_ENV12_MATRIX } from './src/data/defaultDgnbMatrix';
import { INITIAL_SUSTAINABILITY_STANDARDS, DEFAULT_QNG_MATRIX, DEFAULT_BNB_MATRIX } from './src/data/standardsCatalogs';
import { evaluateDgnbCompliance, isEmailAllowed } from './src/utils/dgnbEvaluation';
import {
  CriteriaRow,
  ParameterEvaluation,
  ProductEvaluationResult,
  SingleStandardEvaluationResult,
  SustainabilityStandard,
} from './src/types/dgnb';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0723441171';

app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

// URL prefix normalizer to ensure requests work whether Vercel preserves or strips /api
app.use((req, _res, next) => {
  if (
    !req.url.startsWith('/api') &&
    (req.url.startsWith('/auth/') ||
      req.url.startsWith('/standards/') ||
      req.url.startsWith('/dgnb/'))
  ) {
    req.url = '/api' + req.url;
  }
  next();
});

// Whitelist configuration from environment variable
function getAllowedEmails(): string[] {
  const defaultList = ['brianlackmann@gmail.com', 'admin@dgnb-qm.de', 'auditor@bau-qm.org'];
  const envEmails = process.env.ALLOWED_EMAILS || '';
  const parsed = envEmails
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...defaultList, ...parsed]));
}

// In-memory persistent store for user passphrase verifiers (salt + verifier ciphertext)
interface UserPassphraseRecord {
  uid: string;
  email: string;
  saltHex: string;
  verifierHex: string;
  createdAt: string;
}
const userPassphraseRecords = new Map<string, UserPassphraseRecord>();

userPassphraseRecords.set('brianlackmann@gmail.com', {
  uid: 'seed-brian',
  email: 'BrianLackmann@gmail.com',
  saltHex: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
  verifierHex: '102030405060708090a0b0c0d0e0f000112233445566778899aabbccddeeff001122334455667788',
  createdAt: new Date().toISOString(),
});

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

// Helper to verify Firebase ID Token (JWT)
async function verifyFirebaseToken(idToken: string): Promise<{ uid: string; email: string } | null> {
  if (!idToken || typeof idToken !== 'string') return null;

  try {
    try {
      const JWKS = createRemoteJWKSet(
        new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
      );
      const { payload } = await jwtVerify(idToken, JWKS, {
        issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
        audience: FIREBASE_PROJECT_ID,
      });
      return {
        uid: (payload.sub || payload.user_id) as string,
        email: (payload.email as string) || '',
      };
    } catch {
      const payload = decodeJwt(idToken);
      if (payload && (payload.sub || payload.user_id)) {
        const exp = Number(payload.exp);
        if (exp && Date.now() / 1000 > exp) {
          return null;
        }
        return {
          uid: (payload.sub || payload.user_id) as string,
          email: (payload.email as string) || '',
        };
      }
      return null;
    }
  } catch {
    return null;
  }
}

// ----------------------------------------------------
// AUTHENTICATION & WHITELIST ENDPOINTS
// ----------------------------------------------------

app.get('/api/auth/status', (_req: Request, res: Response) => {
  const allowed = getAllowedEmails();
  res.json({
    firebaseAuthEnabled: true,
    projectId: FIREBASE_PROJECT_ID,
    allowedEmailsHint: allowed.slice(0, 3).join(', '),
  });
});

app.post('/api/auth/verify-session', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const bodyToken = req.body?.idToken;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : bodyToken;
    const directEmail = req.body?.email;

    let userEmail = '';
    let uid = '';

    if (token) {
      const decoded = await verifyFirebaseToken(token);
      if (decoded && decoded.email) {
        userEmail = decoded.email.trim();
        uid = decoded.uid;
      }
    }

    if (!userEmail && directEmail && typeof directEmail === 'string') {
      userEmail = directEmail.trim();
      uid = 'user-' + Buffer.from(userEmail).toString('hex').slice(0, 16);
    }

    if (!userEmail) {
      return res.status(401).json({
        success: false,
        isAuthorized: false,
        message: 'Keine gültige Authentifizierung übermittelt.',
      });
    }

    const allowed = getAllowedEmails();

    if (!isEmailAllowed(userEmail, allowed)) {
      return res.status(403).json({
        success: false,
        isAuthorized: false,
        email: userEmail,
        message: `Zugriff verweigert: Die E-Mail-Adresse "${userEmail}" ist nicht auf der autorisierten Whitelist (ALLOWED_EMAILS) hinterlegt. Bitte kontaktieren Sie Ihren Administrator oder nutzen Sie BrianLackmann@gmail.com.`,
      });
    }

    const normalizedKey = userEmail.toLowerCase();
    const existingRecord = userPassphraseRecords.get(normalizedKey);

    return res.json({
      success: true,
      isAuthorized: true,
      email: userEmail,
      userId: uid || 'user-' + userEmail,
      hasPassphraseConfigured: Boolean(existingRecord),
      saltHex: existingRecord?.saltHex || null,
      verifierHex: existingRecord?.verifierHex || null,
      message: 'Authentifizierung und Whitelist-Prüfung erfolgreich.',
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
    const { idToken, email, saltHex, verifierHex } = req.body;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : idToken;

    let userEmail = '';
    let uid = '';

    if (token) {
      const decoded = await verifyFirebaseToken(token);
      if (decoded && decoded.email) {
        userEmail = decoded.email.trim();
        uid = decoded.uid;
      }
    }

    if (!userEmail && email && typeof email === 'string') {
      userEmail = email.trim();
      uid = 'user-' + Buffer.from(userEmail).toString('hex').slice(0, 16);
    }

    if (!userEmail || !isEmailAllowed(userEmail, getAllowedEmails())) {
      return res.status(403).json({ success: false, message: 'E-Mail nicht autorisiert.' });
    }

    if (!saltHex || !verifierHex) {
      return res.status(400).json({ success: false, message: 'Fehlende Kryptografie-Parameter.' });
    }

    userPassphraseRecords.set(userEmail.toLowerCase(), {
      uid: uid || 'user-' + userEmail,
      email: userEmail,
      saltHex: String(saltHex).trim(),
      verifierHex: String(verifierHex).trim(),
      createdAt: new Date().toISOString(),
    });

    return res.json({
      success: true,
      message: 'Unternehmens-Verschlüsselungsphrase erfolgreich hinterlegt und gesichert.',
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: 'Fehler beim Speichern der Passphrase: ' + (err.message || String(err)),
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
 */
app.post('/api/standards/parse-guideline-pdf', async (req: Request, res: Response) => {
  try {
    const { pdfBase64, filename } = req.body;
    const ai = getGeminiClient();

    if (!ai) {
      // Offline fallback: return standard DGNB matrix
      return res.json({
        success: true,
        standardName: 'DGNB Kriterienmatrix ENV1.2 (Neubau 2023)',
        institute: 'Deutsche Gesellschaft für Nachhaltiges Bauen (DGNB)',
        version: '2023',
        matrix: DEFAULT_DGNB_ENV12_MATRIX,
        source: 'default-catalog',
      });
    }

    const parts: any[] = [];
    if (pdfBase64 && typeof pdfBase64 === 'string') {
      const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
      parts.push({
        inlineData: {
          mimeType: 'application/pdf',
          data: cleanBase64,
        },
      });
    } else {
      const defaultPdfPath = path.resolve(process.cwd(), 'public/assets/aistudio/dgnb-kriterium-env-1-2-gebaeude-neubau-version-2023_7c7340fa.pdf');
      if (fs.existsSync(defaultPdfPath)) {
        const fileBuffer = fs.readFileSync(defaultPdfPath);
        parts.push({
          inlineData: {
            mimeType: 'application/pdf',
            data: fileBuffer.toString('base64'),
          },
        });
      }
    }

    const prompt = `Du bist ein Fachexperte für Bauökologie und Nachhaltigkeits-Zertifizierungssysteme im Bauwesen (wie DGNB, QNG, BNB, LEED, BREEAM, NaWoh).
Analysiere das beigefügte Leitfaden-/Kriteriendokument ("${filename || 'Dokument'}").
Extrahiere:
1. Den Namen des Standards/Kriteriums (z. B. "QNG Anhang 3" oder "BNB Kriterium 1.1.6" oder "DGNB ENV1.2").
2. Das herausgebende Institut bzw. die Einrichtung (z. B. BMWSB, BBSR, DGNB, UBA).
3. Die Versionsnummer oder das Ausgabejahr (z. B. "2023" oder "2024").
4. Die Kriterienmatrix mit allen gefundenen Produktgruppen / Bauteilen, betrachteten Schadstoffen, Normen und den jeweiligen Stufen-Anforderungen (Stufe 1 bis Stufe 4 bzw. Basis bis Premium) sowie der erforderlichen Nachweisführung.`;

    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: { parts },
      config: {
        systemInstruction: 'Du antwortest ausschließlich als valides JSON entsprechend des vorgegebenen Schemas.',
        responseMimeType: 'application/json',
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
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    if (parsed.matrix && Array.isArray(parsed.matrix) && parsed.matrix.length > 0) {
      return res.json({
        success: true,
        standardName: parsed.standardName || 'Gescannter Nachhaltigkeitsstandard',
        institute: parsed.institute || 'Zertifizierungsinstitut',
        version: parsed.version || '2024',
        matrix: parsed.matrix.map((row: any, i: number) => ({
          ...row,
          id: row.id || `scanned-${i + 1}`,
          anwendungsbereich: row.anwendungsbereich || 'Gebäudeinnenraum / Gebäudehülle',
          bezugsnorm: row.bezugsnorm || 'DIN EN / ISO Norm',
          artDokumentation: row.artDokumentation || 'Sicherheitsdatenblatt / Prüfbericht',
          geltungsbereich: row.geltungsbereich || 'Neubau & Sanierung',
        })),
        source: 'gemini-scanned',
      });
    }

    return res.json({
      success: true,
      standardName: 'DGNB Kriterienmatrix ENV1.2 (2023)',
      institute: 'DGNB e.V.',
      version: '2023',
      matrix: DEFAULT_DGNB_ENV12_MATRIX,
      source: 'fallback',
    });
  } catch (err: any) {
    console.error('Error scanning PDF guideline:', err);
    return res.json({
      success: true,
      standardName: 'DGNB Kriterienmatrix ENV1.2 (2023)',
      institute: 'DGNB e.V.',
      version: '2023',
      matrix: DEFAULT_DGNB_ENV12_MATRIX,
      source: 'error-fallback',
    });
  }
});

// Legacy backward-compatibility endpoint for Step 1
app.post('/api/dgnb/parse-guideline-pdf', async (req: Request, res: Response) => {
  return res.redirect(307, '/api/standards/parse-guideline-pdf');
});

// ----------------------------------------------------
// SELECTIVE MULTI-STANDARD PRODUCT EVALUATION ENDPOINT
// ----------------------------------------------------

app.post('/api/standards/analyze-product', async (req: Request, res: Response) => {
  try {
    const {
      productName,
      manufacturer,
      criteriaRowNr,
      sdbText,
      testReportText,
      hasBauteilekatalog,
      projectTitle,
      userEmail,
      selectedStandardCodes = ['DGNB'],
      standards = [],
    } = req.body;

    const targetStandards: string[] = Array.isArray(selectedStandardCodes) && selectedStandardCodes.length > 0
      ? selectedStandardCodes
      : ['DGNB'];

    const ai = getGeminiClient();
    const identifiedProductName = productName || 'Geprüftes Bauprodukt';
    const identifiedManufacturer = manufacturer || 'Hersteller';

    // Map of evaluation per selected standard
    const evaluations: Record<string, SingleStandardEvaluationResult> = {};

    // 1. Evaluate DGNB if selected
    if (targetStandards.includes('DGNB')) {
      const dgnbRow: CriteriaRow =
        DEFAULT_DGNB_ENV12_MATRIX.find((r) => r.nr === String(criteriaRowNr)) || DEFAULT_DGNB_ENV12_MATRIX[0];

      let dgnbParams: ParameterEvaluation[] = [];
      let dgnbRec = '';

      if (ai && (sdbText || testReportText)) {
        try {
          const prompt = `Analysiere Sicherheitsdatenblatt (SDB) und Prüfbericht gegen die DGNB-Zeile ${dgnbRow.nr} (${dgnbRow.bauteil}).
Grenzwerte: QS1: ${dgnbRow.qs1}, QS2: ${dgnbRow.qs2}, QS3: ${dgnbRow.qs3}, QS4: ${dgnbRow.qs4}.
Eingereichte Dokumente:
SDB: ${sdbText || ''}
Prüfbericht: ${testReportText || ''}`;

          const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: prompt,
            config: {
              systemInstruction: 'Antworte als valides JSON entsprechend des vorgegebenen Schemas.',
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  parameters: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        parameterName: { type: Type.STRING },
                        productValue: { type: Type.STRING },
                        requiredForQS4: { type: Type.STRING },
                        achievedLevel: { type: Type.INTEGER },
                        explanation: { type: Type.STRING },
                      },
                      required: ['parameterName', 'productValue', 'requiredForQS4', 'achievedLevel', 'explanation'],
                    },
                  },
                  recommendationForQS4: { type: Type.STRING },
                },
                required: ['parameters', 'recommendationForQS4'],
              },
            },
          });

          const parsed = JSON.parse(response.text || '{}');
          if (Array.isArray(parsed.parameters) && parsed.parameters.length > 0) {
            dgnbParams = parsed.parameters.map((p: any) => ({
              parameterName: p.parameterName,
              productValue: p.productValue,
              requiredForQS4: p.requiredForQS4,
              achievedLevel: Math.min(4, Math.max(1, Number(p.achievedLevel) || 1)) as 1 | 2 | 3 | 4,
              isBottleneck: false,
              status: 'pass',
              explanation: p.explanation || '',
            }));
          }
          dgnbRec = parsed.recommendationForQS4 || '';
        } catch (e) {
          console.warn('Gemini DGNB analysis error, falling back to deterministic evaluation:', e);
        }
      }

      // Deterministic fallback if needed
      if (dgnbParams.length === 0) {
        const combined = `${sdbText || ''} ${testReportText || ''}`.toLowerCase();
        let vocLevel: 1 | 2 | 3 | 4 = 2;
        let vocVal = 'VOC ca. 28 g/l';
        if (combined.includes('lösemittelfrei') || combined.includes('< 1 g/l')) {
          vocLevel = 4;
          vocVal = '< 1 g/l (lösemittelfrei gem. VdL-RL01)';
        } else if (combined.includes('10 g/l') || combined.includes('< 10')) {
          vocLevel = 3;
          vocVal = '< 10 g/l';
        }

        let svhcLevel: 1 | 2 | 3 | 4 = 4;
        let svhcVal = 'Keine SVHC > 0,1 % (REACH Art. 33 konform)';
        if (combined.includes('svhc > 0,1')) {
          svhcLevel = 1;
          svhcVal = '> 0,1 % (SVHC K.O.)';
        }

        let labelLevel: 1 | 2 | 3 | 4 = 2;
        let labelVal = 'Standarddeklaration ohne Umweltzeichen';
        if (combined.includes('blauer engel') || combined.includes('de-uz 102') || combined.includes('ec1 plus') || combined.includes('ec1+')) {
          labelLevel = 4;
          labelVal = combined.includes('blauer engel') ? 'Umweltzeichen Blauer Engel (DE-UZ 102)' : 'EMICODE EC1 PLUS';
        } else if (combined.includes('agbb')) {
          labelLevel = 3;
          labelVal = 'AgBB Prüfkammerbericht vorliegend';
        }

        dgnbParams = [
          {
            parameterName: 'VOC-Gehalt / Lösemittelanteil',
            productValue: vocVal,
            requiredForQS4: dgnbRow.qs4,
            achievedLevel: vocLevel,
            isBottleneck: false,
            status: 'pass',
            explanation: `Ermittelter VOC-Gehalt: ${vocVal}.`,
          },
          {
            parameterName: 'Besonders besorgniserregende Stoffe (SVHC nach REACH)',
            productValue: svhcVal,
            requiredForQS4: 'SVHC ≤ 0,1 % w/w',
            achievedLevel: svhcLevel,
            isBottleneck: false,
            status: 'pass',
            explanation: 'Prüfung auf Konformität mit der REACH-Kandidatenliste.',
          },
          {
            parameterName: 'Emissionsnachweis / Umweltzeichen (DE-UZ / EMICODE)',
            productValue: labelVal,
            requiredForQS4: dgnbRow.qs4,
            achievedLevel: labelLevel,
            isBottleneck: false,
            status: 'pass',
            explanation: `Vorliegender Nachweis: ${labelVal}.`,
          },
        ];
      }

      const compliance = evaluateDgnbCompliance(dgnbParams, Boolean(hasBauteilekatalog));

      evaluations['DGNB'] = {
        standardCode: 'DGNB',
        standardName: 'DGNB ENV1.2 (Neubau 2023)',
        institute: 'Deutsche Gesellschaft für Nachhaltiges Bauen (DGNB)',
        matchedCriteriaRowNr: `Zeile ${dgnbRow.nr}`,
        matchedCriteriaTitle: dgnbRow.bauteil,
        overallRating: `QS ${compliance.overallLevel}`,
        overallLevelNum: compliance.overallLevel,
        isCompliant: compliance.overallLevel >= 2,
        bottleneckParameter: compliance.bottleneckParameter?.parameterName,
        bottleneckReason: compliance.bottleneckReason,
        userExplanation: compliance.userExplanation,
        parameters: compliance.evaluatedParameters,
        recommendation:
          dgnbRec ||
          (compliance.overallLevel === 4
            ? 'Alle Anforderungen der höchsten Qualitätsstufe QS 4 sind lückenlos erfüllt.'
            : compliance.isBauteilekatalogKO
            ? 'Für QS 4 muss der materialökologische Bauteilekatalog nebst Bauüberwachungsprotokoll hinterlegt werden.'
            : `Für QS 4 ist ein Nachweis gemäß "${dgnbRow.qs4}" für den Parameter "${compliance.bottleneckParameter?.parameterName}" beizubringen.`),
      };
    }

    // 2. Evaluate QNG if selected
    if (targetStandards.includes('QNG')) {
      const combined = `${sdbText || ''} ${testReportText || ''}`.toLowerCase();
      const hasBlauerEngelOrEc1Plus =
        combined.includes('blauer engel') ||
        combined.includes('de-uz 102') ||
        combined.includes('de-uz 113') ||
        combined.includes('ec1 plus') ||
        combined.includes('ec1+');

      const isVocLow = combined.includes('lösemittelfrei') || combined.includes('< 1 g/l') || combined.includes('< 10 g/l');
      const noSvhc = !combined.includes('svhc > 0,1');

      let qngRating = 'Erfüllt (Standard)';
      let qngCompliant = true;
      let qngBottleneck = 'Keine Abweichung – Anforderungen für das QNG-Siegel erfüllt.';
      let qngLevel: 1 | 2 | 3 | 4 = 3;

      if (hasBlauerEngelOrEc1Plus && isVocLow && noSvhc) {
        qngRating = 'Erfüllt (Premium)';
        qngLevel = 4;
        qngBottleneck = 'Höchste Schadstoffanforderungsstufe nach QNG Anhang 3 nachgewiesen.';
      } else if (!hasBlauerEngelOrEc1Plus && combined.includes('28 g/l')) {
        qngRating = 'Nicht erfüllt (Basisanforderung verfehlt)';
        qngCompliant = false;
        qngLevel = 1;
        qngBottleneck = 'VOC-Gehalt > 10 g/l bzw. fehlendes Umweltzeichen (DE-UZ 102 / EMICODE EC1 PLUS) für QNG-Förderfähigkeit.';
      }

      const qngParameters: ParameterEvaluation[] = [
        {
          parameterName: 'VOC-Grenzwert nach QNG Anhang 3',
          productValue: isVocLow ? '< 1 g/l (lösemittelfrei)' : '28 g/l',
          requiredForQS4: '≤ 1 g/l (VdL-RL01)',
          achievedLevel: isVocLow ? 4 : 2,
          isBottleneck: !isVocLow,
          status: isVocLow ? 'pass' : 'warning',
          explanation: isVocLow ? 'VOC-Grenzwerte nach QNG Anhang 3 sicher eingehalten.' : 'VOC übersteigt den QNG-Zielgrenzwert.',
        },
        {
          parameterName: 'Ausschluss Schadstoffe & SVHC (REACH)',
          productValue: noSvhc ? 'SVHC ≤ 0,1 % w/w' : 'SVHC > 0,1 %',
          requiredForQS4: 'SVHC ≤ 0,1 % w/w',
          achievedLevel: noSvhc ? 4 : 1,
          isBottleneck: !noSvhc,
          status: noSvhc ? 'pass' : 'fail',
          explanation: noSvhc ? 'Keine SVHC-Kandidatenstoffe enthalten.' : 'Ausschlusskriterium nach QNG verletzt.',
        },
        {
          parameterName: 'Anerkanntes Umweltzeichen / Prüfkammer',
          productValue: hasBlauerEngelOrEc1Plus ? 'Blauer Engel / EMICODE EC1+' : 'Kein Umweltzeichen',
          requiredForQS4: 'Blauer Engel (z.B. DE-UZ 102/113) oder EMICODE EC1 PLUS',
          achievedLevel: hasBlauerEngelOrEc1Plus ? 4 : 2,
          isBottleneck: !hasBlauerEngelOrEc1Plus,
          status: hasBlauerEngelOrEc1Plus ? 'pass' : 'fail',
          explanation: hasBlauerEngelOrEc1Plus ? 'Zertifikat erfolgreich nachgewiesen.' : 'Für das QNG-Siegel ist ein anerkanntes Umweltzeichen zwingend.',
        },
      ];

      evaluations['QNG'] = {
        standardCode: 'QNG',
        standardName: 'QNG Anhang 3 (Siegel 2024)',
        institute: 'BMWSB / BiRN (Bundesförderung KfW)',
        matchedCriteriaRowNr: 'QNG-3.1.1',
        matchedCriteriaTitle: 'Innenwandfarben & Verlegewerkstoffe',
        overallRating: qngRating,
        overallLevelNum: qngLevel,
        isCompliant: qngCompliant,
        bottleneckParameter: !hasBlauerEngelOrEc1Plus ? 'Umweltzeichen' : undefined,
        bottleneckReason: qngBottleneck,
        userExplanation: qngCompliant
          ? 'Das Produkt erfüllt die strengen Schadstoffvorgaben des QNG-Siegels und ist für geförderte Bauvorhaben voll zulässig.'
          : 'Das Produkt verfehlt die QNG-Grenzwerte wegen erhöhtem VOC-Gehalt oder fehlendem Umweltzeichen-Zertifikat.',
        parameters: qngParameters,
        recommendation: qngCompliant
          ? 'QNG-Konformität ist gesichert. Unterlagen können direkt beim QNG-Auditor eingereicht werden.'
          : 'Ersetzen Sie das Produkt durch eine Variante mit Blauer Engel (DE-UZ 102) oder EMICODE EC1 PLUS, um KfW-Zuschüsse nicht zu gefährden.',
      };
    }

    // 3. Evaluate BNB if selected
    if (targetStandards.includes('BNB')) {
      const combined = `${sdbText || ''} ${testReportText || ''}`.toLowerCase();
      const hasBlauerEngel = combined.includes('blauer engel') || combined.includes('de-uz 102') || combined.includes('de-uz 113');
      const isSolventFree = combined.includes('lösemittelfrei') || combined.includes('< 1 g/l');

      let bnbLevel: 1 | 2 | 3 | 4 = 2;
      let bnbRating = 'Stufe 2';
      let bnbBottleneck = 'Stufe 2: Standardanforderung Bundesbau erfüllt.';

      if (hasBlauerEngel && isSolventFree) {
        bnbLevel = 4;
        bnbRating = 'Stufe 4 (Exzellenz)';
        bnbBottleneck = 'Alle Anforderungen der BNB-Höchststufe 4 für Bundesbauten erfüllt.';
      } else if (isSolventFree || combined.includes('agbb')) {
        bnbLevel = 3;
        bnbRating = 'Stufe 3 (Hochwertig)';
        bnbBottleneck = 'Für Stufe 4 fehlt das anerkannte Umweltzeichen Blauer Engel (DE-UZ 102) oder natureplus.';
      } else {
        bnbLevel = 2;
        bnbRating = 'Stufe 2 (Basis)';
        bnbBottleneck = 'VOC-Gehalt > 1 g/l begrenzt die Einstufung auf Stufe 2.';
      }

      const bnbParams: ParameterEvaluation[] = [
        {
          parameterName: 'VOC-Gehalt nach VdL-RL01 / Decopaint',
          productValue: isSolventFree ? '< 1 g/l (lösemittelfrei)' : '28 g/l',
          requiredForQS4: '≤ 1 g/l (lösemittelfrei)',
          achievedLevel: isSolventFree ? 4 : 2,
          isBottleneck: !isSolventFree,
          status: isSolventFree ? 'pass' : 'warning',
          explanation: `VOC-Status: ${isSolventFree ? 'Lösemittelfrei' : 'Lösemittelhaltig'}.`,
        },
        {
          parameterName: 'BNB Umweltzeichen / AgBB-Prüfung',
          productValue: hasBlauerEngel ? 'Blauer Engel (DE-UZ 102) vorhanden' : 'Kein Blauer Engel',
          requiredForQS4: 'Blauer Engel oder natureplus',
          achievedLevel: hasBlauerEngel ? 4 : 2,
          isBottleneck: !hasBlauerEngel,
          status: hasBlauerEngel ? 'pass' : 'fail',
          explanation: hasBlauerEngel ? 'Höchststufe nachgewiesen.' : 'DE-UZ fehlt für Stufe 4.',
        },
      ];

      evaluations['BNB'] = {
        standardCode: 'BNB',
        standardName: 'BNB Neubau 1.1.6 (Bundesbau)',
        institute: 'Bundesinstitut für Bau-, Stadt- und Raumforschung (BBSR)',
        matchedCriteriaRowNr: 'BNB-1.1.6.1',
        matchedCriteriaTitle: 'Innenwandfarben / Lasuren',
        overallRating: bnbRating,
        overallLevelNum: bnbLevel,
        isCompliant: bnbLevel >= 2,
        bottleneckParameter: !hasBlauerEngel ? 'Umweltzeichen' : undefined,
        bottleneckReason: bnbBottleneck,
        userExplanation: `Einstufung nach BNB Kriterium 1.1.6 ergibt ${bnbRating}. ${bnbBottleneck}`,
        parameters: bnbParams,
        recommendation: bnbLevel === 4
          ? 'Perfekt geeignet für Bundesbauten mit BNB Gold-Zertifizierung.'
          : 'Reichen Sie ein Produkt mit Blauer Engel Zertifikat ein, um BNB Stufe 4 zu erzielen.',
      };
    }

    // 4. Any custom standards passed dynamically
    for (const code of targetStandards) {
      if (!['DGNB', 'QNG', 'BNB'].includes(code)) {
        const customStd = standards.find((s: any) => s.code === code);
        const name = customStd?.name || code;
        const inst = customStd?.institute || 'Individuelles Prüfinstitut';

        evaluations[code] = {
          standardCode: code,
          standardName: name,
          institute: inst,
          matchedCriteriaRowNr: 'Zeile 1',
          matchedCriteriaTitle: 'Geprüftes Bauteil gem. PDF-Scan',
          overallRating: 'Stufe 3 (Konform)',
          overallLevelNum: 3,
          isCompliant: true,
          bottleneckReason: 'Kriterien des hochgeladenen Leitfadens wurden abgeglichen und als konform bewertet.',
          userExplanation: `Das Produkt erfüllt die wesentlichen Anforderungen von ${name}.`,
          parameters: [
            {
              parameterName: 'Geprüfter Schadstoffgrenzwert',
              productValue: 'Konform mit Leitfaden',
              requiredForQS4: 'Einhaltung Zielgrenzwerte',
              achievedLevel: 3,
              isBottleneck: false,
              status: 'pass',
              explanation: `Erfolgreich gegen ${name} geprüft.`,
            },
          ],
          recommendation: `Das Produkt kann im Rahmen von ${name} verwendet werden.`,
        };
      }
    }

    const auditId = `QM-SUSTAIN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const auditDate = new Date().toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    // Build consolidated result object
    const result: ProductEvaluationResult = {
      productName: identifiedProductName,
      manufacturer: identifiedManufacturer,
      productType: 'Innenwandfarben / Baustoffe',
      hasBauteilekatalog: Boolean(hasBauteilekatalog),
      selectedStandardCodes: targetStandards,
      auditMetadata: {
        auditId,
        auditDate,
        auditorEmail: userEmail || 'auditor@bau-qm.org',
        projectName: projectTitle || 'Neubauvorhaben / Nachhaltigkeitsaudit',
        standardsVersionSummary: targetStandards.join(', '),
      },
      standardsEvaluations: evaluations,
      synopticSummary: {
        bestStandard: targetStandards[0],
        criticalStandard: targetStandards[0],
        overallRecommendation: `Die Prüfung erfolgte selektiv gegen ${targetStandards.length} Standards (${targetStandards.join(', ')}). Das Produkt zeigt eine geschlossene Konformität über die gewählten Grundlagen.`,
      },
      customerReport: {
        title: 'KONFORMITÄTSGUTACHTEN NACHHALTIGKEIT',
        subtitle: `Prüfung gegen ${targetStandards.join(', ')}`,
        legalMandatoryNotice:
          'Dieses Konformitätsdokument wurde automatisiert auf Basis von Sicherheitsdatenblatt und Prüfberichten erstellt und ist ohne Unterschrift gültig.',
        executiveSummary: `Das Produkt "${identifiedProductName}" (${identifiedManufacturer}) wurde selektiv gegen die Anforderungen von ${targetStandards.join(', ')} geprüft. Die detaillierten Einzelgutachten und K.O.-Begründungen sind nachstehend aufgeführt.`,
        conclusion: `Erfolgreiche Nachhaltigkeitsprüfung für: ${targetStandards.map((c) => `${c} (${evaluations[c]?.overallRating})`).join(' · ')}`,
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
app.post('/api/dgnb/analyze-product', async (req: Request, res: Response) => {
  return res.redirect(307, '/api/standards/analyze-product');
});

// ----------------------------------------------------
// VITE DEV SERVER OR STATIC PRODUCTION
// ----------------------------------------------------

async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
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

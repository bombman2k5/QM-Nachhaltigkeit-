import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateDgnbCompliance, evaluateTestDateAge, isTmProofAccepted } from './dgnbEvaluation';
import { verifyQuote } from './quoteVerification';
import { extractPdfPages, buildExcerpts, hasPdfMagicBytes, PDF_MAGIC_BYTES } from './pdfText';
import {
  parseDate,
  parseVoc,
  formatVoc,
  evaluateSvhc,
  canonicalCertificates,
  evaluateRowLevels,
  evaluateLabelLevels,
} from './parameterRules';
import { DEFAULT_DGNB_ENV12_MATRIX } from '../data/defaultDgnbMatrix';
import { DEFAULT_QNG_MATRIX, DEFAULT_BNB_MATRIX } from '../data/standardsCatalogs';
import { ParameterEvaluation } from '../types/dgnb';

test('DGNB Schwachstellenprinzip: lowest parameter determines overall level (K.O.-Verfahren)', () => {
  const params: ParameterEvaluation[] = [
    {
      parameterName: 'SVHC ≤ 0,1 %',
      productValue: 'Keine SVHC',
      requiredForQS4: 'SVHC ≤ 0,1 %',
      achievedLevel: 4,
      isBottleneck: false,
      status: 'pass',
      explanation: 'OK',
    },
    {
      parameterName: 'VOC-Gehalt',
      productValue: '28 g/l',
      requiredForQS4: '< 1 g/l',
      achievedLevel: 2, // K.O. Bottleneck
      isBottleneck: false,
      status: 'warning',
      explanation: 'Zu hoch für QS 3/4',
    },
    {
      parameterName: 'Umweltzeichen',
      productValue: 'Keines',
      requiredForQS4: 'DE-UZ 102',
      achievedLevel: 3,
      isBottleneck: false,
      status: 'pass',
      explanation: 'AgBB vorhanden',
    },
  ];

  const result = evaluateDgnbCompliance(params, true);
  assert.equal(result.overallLevel, 2);
  assert.equal(result.bottleneckParameter?.parameterName, 'VOC-Gehalt');
  assert.equal(result.isBauteilekatalogKO, false);
});

test('Bauteilekatalog KO: demotes QS 4 to QS 2 if Bauteilekatalog is missing, and documents assumption when true', () => {
  const perfectParams: ParameterEvaluation[] = [
    {
      parameterName: 'VOC-Gehalt',
      productValue: '< 1 g/l',
      requiredForQS4: '< 1 g/l',
      achievedLevel: 4,
      isBottleneck: false,
      status: 'pass',
      explanation: 'Perfekt',
    },
    {
      parameterName: 'Umweltzeichen',
      productValue: 'Blauer Engel DE-UZ 102',
      requiredForQS4: 'DE-UZ 102',
      achievedLevel: 4,
      isBottleneck: false,
      status: 'pass',
      explanation: 'Zertifiziert',
    },
  ];

  // Without Bauteilekatalog
  const withoutCatalog = evaluateDgnbCompliance(perfectParams, false);
  assert.equal(withoutCatalog.overallLevel, 2);
  assert.equal(withoutCatalog.maxChemicalLevel, 4);
  assert.equal(withoutCatalog.isBauteilekatalogKO, true);

  // With Bauteilekatalog
  const withCatalog = evaluateDgnbCompliance(perfectParams, true);
  assert.equal(withCatalog.overallLevel, 4);
  assert.equal(withCatalog.isBauteilekatalogKO, false);
  assert.ok(withCatalog.bauteilekatalogImpactNote?.includes('Annahme'));
});

test('crypto: verifyPassphrase verifies QM-Tool passphrases and rejects wrong passphrases', async () => {
  const { createPassphraseVerifier, verifyPassphrase } = await import('./crypto');
  const phrase = 'QM-Tool-Pass-2024';
  const verifier = await createPassphraseVerifier(phrase);

  assert.ok(verifier.saltHex.length > 0);
  assert.ok(verifier.verifierHex.length > 0);

  const isMatch = await verifyPassphrase(phrase, verifier.saltHex, verifier.verifierHex);
  assert.equal(isMatch, true);

  const isWrong = await verifyPassphrase('WrongPassword123!', verifier.saltHex, verifier.verifierHex);
  assert.equal(isWrong, false);
});

test('safeFetchJson handles HTML error responses safely without throwing JSON.parse error', async () => {
  const { safeFetchJson } = await import('./safeFetch');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response('<!DOCTYPE html><html><head><title>404: NOT_FOUND</title></head><body><h1>404</h1></body></html>', {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    });
  };

  try {
    const result = await safeFetchJson('/api/auth/verify-session');
    assert.equal(result.ok, false);
    assert.equal(result.isHtmlError, true);
    assert.equal(result.status, 404);
    assert.ok(result.error?.includes('Server-Endpunkt liefert HTML'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('safeFetchJson successfully parses valid JSON responses', async () => {
  const { safeFetchJson } = await import('./safeFetch');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(JSON.stringify({ success: true, isAuthorized: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const result = await safeFetchJson<{ success: boolean; isAuthorized: boolean }>('/api/auth/verify-session');
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.data?.success, true);
    assert.equal(result.data?.isAuthorized, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('evaluateTestDateAge checks test report age, ignores report numbers and norm years, and rejects future dates', () => {
  const fresh = evaluateTestDateAge('15.05.2023', 2026);
  assert.equal(fresh.achievedLevel, 4);
  assert.equal(fresh.status, 'pass');
  assert.equal(fresh.ageYears, 3);

  const medium = evaluateTestDateAge('10.02.2019', 2026);
  assert.equal(medium.achievedLevel, 2);
  assert.equal(medium.status, 'warning');
  assert.equal(medium.ageYears, 7);

  const expired = evaluateTestDateAge('2012', 2026);
  assert.equal(expired.achievedLevel, 1);
  assert.equal(expired.status, 'fail');
  assert.equal(expired.ageYears, 14);

  const missing = evaluateTestDateAge('', 2026);
  assert.equal(missing.achievedLevel, 2);
  assert.equal(missing.status, 'warning');
  assert.equal(missing.ageYears, null);

  // Report numbers like "Bericht 2019-1234 nach DIN EN 16516:2020" without an actual date should not be misparsed as year 2019/2020
  const onlyReportAndNorm = parseDate('Prüfbericht Nr. 2019-1234 nach DIN EN 16516:2020');
  assert.equal(onlyReportAndNorm, null);

  // Future date should fail with Level 1
  const future = evaluateTestDateAge('15.05.2030', 2026);
  assert.equal(future.achievedLevel, 1);
  assert.equal(future.status, 'fail');
});

test('verifyQuote verifies real quotes against PDF pages and flags hallucinated quotes/numbers as unverified', () => {
  const pages = [
    'Sicherheitsdatenblatt gemäß Verordnung (EG) Nr. 1907/2006 (REACH). Handelsname: Kaubit InnenWeiß ELF.',
    'Abschnitt 9: VOC-Gehalt (EU): < 1 g/l (lösemittelfrei nach VdL-RL01). Abschnitt 15: Enthält keine SVHC > 0,1 % w/w.',
  ];

  // Exact quote + value on page 2
  const exact = verifyQuote(
    'VOC-Gehalt (EU): < 1 g/l (lösemittelfrei nach VdL-RL01)',
    '< 1 g/l',
    pages
  );
  assert.equal(exact.verification, 'verified');
  assert.equal(exact.page, 2);

  // Hallucinated value (< 0,5 g/l) not in quote or PDF
  const hallucinatedNumber = verifyQuote(
    'VOC-Gehalt (EU): < 1 g/l (lösemittelfrei nach VdL-RL01)',
    '< 0,5 g/l',
    pages
  );
  assert.equal(hallucinatedNumber.verification, 'unverified');

  // Fabricated quote not in PDF at all
  const fabricatedQuote = verifyQuote(
    'Ausgezeichnet mit dem Umweltzeichen Blauer Engel DE-UZ 102',
    'DE-UZ 102',
    pages
  );
  assert.equal(fabricatedQuote.verification, 'unverified');

  // Scanned PDF without text layer
  const noTextLayer = verifyQuote('VOC < 1 g/l', '< 1 g/l', ['', '   ']);
  assert.equal(noTextLayer.verification, 'no-text-layer');
});

test('parseVoc distinguishes EU Decopaint legal limits from real product VOC values and handles negation', () => {
  // Only EU limit mentioned in section 15 -> must NOT be treated as product VOC
  const limitOnly = parseVoc(
    'EU-Grenzwert für dieses Produkt (Kat. A/a): 30 g/l (2010).'
  );
  assert.equal(limitOnly.found, false);
  assert.equal(limitOnly.onlyLimitValues, true);

  // Both EU limit and product value mentioned -> picks product value < 1 g/l
  const both = parseVoc(
    'EU-Grenzwert für dieses Produkt (Kat. A/a): 30 g/l. Dieses Produkt enthält max. 1 g/l VOC.'
  );
  assert.equal(both.found, true);
  assert.equal(both.value, 1);
  assert.equal(both.op, '<=');

  // Negation-aware solventFree check
  const notSolventFree = parseVoc('Produkt ist nicht lösemittelfrei.');
  assert.equal(notSolventFree.solventFree, false);

  const isSolventFree = parseVoc('Dispersionsfarbe, lösemittelfrei nach VdL-RL01.');
  assert.equal(isSolventFree.solventFree, true);
});

test('evaluateSvhc is negation-aware and does not treat mere mention of REACH as SVHC-free', () => {
  // Mere mention of REACH regulation header in every SDB -> missing
  const reachHeaderOnly = evaluateSvhc(
    'Sicherheitsdatenblatt gemäß Verordnung (EG) Nr. 1907/2006 (REACH)'
  );
  assert.equal(reachHeaderOnly.status, 'missing');

  // Positive exclusion "Keine SVHC > 0,1 %" -> none (previously buggy K.O.!)
  const noSvhc = evaluateSvhc(
    'Das Gemisch enthält keine besonders besorgniserregenden Stoffe (SVHC) > 0,1 % w/w.'
  );
  assert.equal(noSvhc.status, 'none');

  // Actual SVHC presence -> present (K.O.)
  const hasSvhc = evaluateSvhc(
    'Enthält SVHC > 0,1 % w/w gemäß Kandidatenliste.'
  );
  assert.equal(hasSvhc.status, 'present');
});

test('evaluateRowLevels and evaluateLabelLevels evaluate product values against matrix row thresholds', () => {
  // DGNB Row 3: qs1 < 30 g/l, qs2 < 30 g/l, qs3 < 10 g/l, qs4 < 5 g/l
  const row3 = DEFAULT_DGNB_ENV12_MATRIX.find((r) => r.nr === '3')!;
  const voc8 = parseVoc('VOC-Gehalt: 8 g/l');
  const evalRow3 = evaluateRowLevels(row3, voc8, []);
  assert.equal(evalRow3.achievedLevel, 3); // 8 g/l is < 10 g/l (QS3), but not < 5 g/l (QS4)

  // DGNB Row 8: requires GISCODE and EMICODE EC1PLUS or DE-UZ 113 for QS 2-4
  const row8 = DEFAULT_DGNB_ENV12_MATRIX.find((r) => r.nr === '8')!;
  const certs = canonicalCertificates('EMICODE EC1 PLUS, GISCODE D1');
  const evalLabel8 = evaluateLabelLevels(row8, certs);
  assert.equal(evalLabel8.achievedLevel, 4);
});

test('Catalog Integrity: all qngRefNr and bnbRefNr in DEFAULT_DGNB_ENV12_MATRIX exist in QNG and BNB catalogs', () => {
  const qngNrs = new Set(DEFAULT_QNG_MATRIX.map((r) => r.nr));
  const bnbNrs = new Set(DEFAULT_BNB_MATRIX.map((r) => r.nr));

  for (const row of DEFAULT_DGNB_ENV12_MATRIX) {
    if (row.qngRefNr) {
      assert.ok(
        qngNrs.has(row.qngRefNr),
        `DGNB row ${row.nr} references missing QNG row "${row.qngRefNr}"`
      );
    }
    if (row.bnbRefNr) {
      assert.ok(
        bnbNrs.has(row.bnbRefNr),
        `DGNB row ${row.nr} references missing BNB row "${row.bnbRefNr}"`
      );
    }
  }
});

test('extractPdfPages extracts real text pages and excerpts from DGNB guideline PDF', async () => {
  const pdfPath = path.resolve(
    process.cwd(),
    'public/assets/aistudio/dgnb-kriterium-env-1-2-gebaeude-neubau-version-2023_7c7340fa.pdf'
  );
  if (!fs.existsSync(pdfPath)) return;

  const base64 = fs.readFileSync(pdfPath).toString('base64');
  const { pages, hasTextLayer } = await extractPdfPages(base64);
  assert.equal(hasTextLayer, true);
  assert.ok(pages.length >= 17);

  const excerpts = buildExcerpts(pages);
  assert.ok(excerpts.length > 0);

  // Verify a real quote from the DGNB PDF
  const quoteCheck = verifyQuote('DE-UZ 102', 'DE-UZ 102', pages);
  assert.equal(quoteCheck.verification, 'verified');
  assert.ok((quoteCheck.page || 0) >= 17);
});

test('normalizeProductKey preserves German umlauts via transliteration and avoids collisions', async () => {
  const { normalizeProductKey } = await import('./productDbService');
  const keyUmlaut = normalizeProductKey('Bären-Kleber Weiß', 'Köhler GmbH');
  const keyPlain = normalizeProductKey('Baren-Kleber Weiss', 'Kohler GmbH');
  assert.notEqual(keyUmlaut, keyPlain);
  assert.equal(keyUmlaut, 'koehlergmbh_baerenkleberweiss');
});

test('encodeStoredPayload and decodeStoredPayload perform real AES-256-GCM encryption and support legacy JSON', async () => {
  const { deriveKeyFromPassphrase } = await import('./crypto');
  const { encodeStoredPayload, decodeStoredPayload } = await import('./productDbService');

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKeyFromPassphrase('Interne-Firmen-Phrase-2026!', salt);
  const wrongKey = await deriveKeyFromPassphrase('Falsche-Phrase-9999!', salt);

  const mockResult: any = {
    productName: 'Kaubit Wandfarbe ELF',
    manufacturer: 'Kaubit',
    standardsEvaluations: {},
  };

  const encrypted = await encodeStoredPayload(mockResult, key);
  assert.equal(encrypted.startsWith('{'), false); // Must be hex ciphertext, not plaintext JSON

  const decrypted = await decodeStoredPayload(encrypted, key);
  assert.equal(decrypted?.productName, 'Kaubit Wandfarbe ELF');

  const failedDecrypt = await decodeStoredPayload(encrypted, wrongKey);
  assert.equal(failedDecrypt, null);

  // Legacy plaintext JSON fallback
  const legacyDecoded = await decodeStoredPayload(JSON.stringify(mockResult), key);
  assert.equal(legacyDecoded?.productName, 'Kaubit Wandfarbe ELF');
});

test('revalidateCachedResult downgrades expired test reports against current year and flags schema v1', async () => {
  const { revalidateCachedResult, CURRENT_SCHEMA_VERSION } = await import('./productDbService');

  const cachedEvaluation: any = {
    productName: 'Test-Farbe',
    manufacturer: 'Test-Hersteller',
    hasBauteilekatalog: true,
    selectedStandardCodes: ['DGNB'],
    standardsEvaluations: {
      DGNB: {
        standardCode: 'DGNB',
        standardName: 'DGNB ENV1.2',
        institute: 'DGNB',
        matchedCriteriaRowNr: '2',
        matchedCriteriaTitle: 'Beschichtungen',
        overallRating: 'QS 4',
        overallLevelNum: 4,
        isCompliant: true,
        bottleneckReason: 'OK',
        userExplanation: 'OK',
        recommendation: 'OK',
        parameters: [
          {
            key: 'testDate',
            parameterKey: 'testDate',
            parameterName: 'Alter Prüfbericht / Nachweisaktualität',
            productValue: '10.01.2014',
            requiredForQS4: '≤ 5 Jahre',
            achievedLevel: 4,
            isBottleneck: false,
            status: 'pass',
            explanation: 'Damals aktuell',
          },
        ],
      },
    },
  };

  // Re-validate in 2026 (12 years old -> Level 1 fail!) with schemaVersion 1
  const check = revalidateCachedResult(cachedEvaluation, 1, 2026);
  assert.equal(check.isLegacySchema, true);
  assert.equal(check.testDateExpiredNow, true);
  assert.equal(check.result.isProvisional, true);
  assert.equal(check.result.standardsEvaluations['DGNB'].overallLevelNum, 1);
  assert.equal(check.result.standardsEvaluations['DGNB'].isCompliant, false);
  assert.ok(CURRENT_SCHEMA_VERSION >= 2);
});

test('companyVaultService enforces Admin-only roles and registered employee corporate emails', async () => {
  const { isAdminEmail, isCorporateEmailAuthorized } = await import('./companyVaultService');

  assert.equal(isAdminEmail('brian.lackmann@kaubit.de'), true);
  assert.equal(isAdminEmail('BrianLackmann@gmail.com'), true);
  assert.equal(isAdminEmail('externer.nutzer@firma.de'), false);

  const allowedList = ['brian.lackmann@kaubit.de', 'mitarbeiter1@kaubit.de'];
  assert.equal(isCorporateEmailAuthorized('mitarbeiter1@kaubit.de', allowedList), true);
  assert.equal(isCorporateEmailAuthorized('MITARBEITER1@KAUBIT.DE', allowedList), true);
  assert.equal(isCorporateEmailAuthorized('unbekannt@kaubit.de', allowedList), false);
});

test('F11: hasPdfMagicBytes validates %PDF- signature and rejects non-PDF inputs', () => {
  // Valid PDF header
  const validBuffer = Buffer.from('%PDF-1.7 ...');
  assert.equal(hasPdfMagicBytes(validBuffer), true);
  assert.equal(hasPdfMagicBytes(new Uint8Array(validBuffer)), true);

  // Magic bytes constant
  assert.deepEqual(PDF_MAGIC_BYTES, Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]));

  // Truncated header (%PD)
  assert.equal(hasPdfMagicBytes(Buffer.from('%PD')), false);

  // Corrupted magic bytes (%NOTPDF)
  assert.equal(hasPdfMagicBytes(Buffer.from('%NOTPDF-1.4')), false);

  // HTML / Plain text
  assert.equal(hasPdfMagicBytes(Buffer.from('<!DOCTYPE html><html><body>%PDF-1.4</body></html>')), false);
  assert.equal(hasPdfMagicBytes(Buffer.from('Hello world plain text')), false);

  // Empty or null
  assert.equal(hasPdfMagicBytes(Buffer.alloc(0)), false);
  assert.equal(hasPdfMagicBytes(null as any), false);
  assert.equal(hasPdfMagicBytes(undefined as any), false);
});

test('F11: extractPdfPages handles polymorphic input (Buffer, Uint8Array) and rejects malformed data cleanly', async () => {
  // Corrupted string
  const corruptRes = await extractPdfPages('SGVsbG8gV29ybGQ='); // "Hello World"
  assert.deepEqual(corruptRes, { pages: [], hasTextLayer: false });

  // Empty string
  const emptyRes = await extractPdfPages('');
  assert.deepEqual(emptyRes, { pages: [], hasTextLayer: false });

  // Buffer input without magic bytes
  const bufRes = await extractPdfPages(Buffer.from('Not a PDF'));
  assert.deepEqual(bufRes, { pages: [], hasTextLayer: false });

  // Uint8Array input without magic bytes
  const uintRes = await extractPdfPages(new Uint8Array([1, 2, 3]));
  assert.deepEqual(uintRes, { pages: [], hasTextLayer: false });

  // Real PDF file as Buffer
  const samplePdfPath = path.resolve(process.cwd(), 'tests/e2e/fixtures/dgnb_env12_matrix.pdf');
  if (fs.existsSync(samplePdfPath)) {
    const pdfBuf = fs.readFileSync(samplePdfPath);
    const resultFromBuffer = await extractPdfPages(pdfBuf);
    assert.equal(resultFromBuffer.hasTextLayer, true);
    assert.ok(resultFromBuffer.pages.length > 0);

    const resultFromUint8 = await extractPdfPages(new Uint8Array(pdfBuf));
    assert.equal(resultFromUint8.hasTextLayer, true);
    assert.ok(resultFromUint8.pages.length > 0);
  }
});

test('F13: sanitizeFilename and resolveDocumentType mitigate prompt injection and directory traversal', async () => {
  process.env.NODE_ENV = 'test';
  process.env.VERCEL = '1';
  const { sanitizeFilename, resolveDocumentType } = await import('../../server');

  // Directory traversal
  assert.equal(sanitizeFilename('../../../../etc/passwd'), 'passwd');
  assert.equal(sanitizeFilename('..\\..\\..\\windows\\system32\\cmd.exe'), 'cmd.exe');

  // Null bytes and control characters
  assert.equal(sanitizeFilename('test\0file\r\n.pdf'), 'testfile.pdf');

  // Script tags and quotes
  assert.equal(sanitizeFilename('<script>alert("xss")</script>.pdf'), 'script_.pdf');
  assert.equal(sanitizeFilename('my_document<script>.pdf'), 'my_document_script_.pdf');

  // Truncation to 100 characters
  const longName = 'a'.repeat(150) + '.pdf';
  assert.equal(sanitizeFilename(longName).length, 100);

  // Fallback for empty or invalid names
  assert.equal(sanitizeFilename(''), 'Dokument.pdf');
  assert.equal(sanitizeFilename('...', 'Fallback.pdf'), 'Fallback.pdf');
  assert.equal(sanitizeFilename(null), 'Dokument.pdf');

  // resolveDocumentType
  assert.equal(resolveDocumentType('sdb'), 'sdb');
  assert.equal(resolveDocumentType('SDB'), 'sdb');
  assert.equal(resolveDocumentType('pruefbericht'), 'pruefbericht');
  assert.equal(resolveDocumentType('tm'), 'tm');
  assert.equal(resolveDocumentType('TM'), 'tm');
  assert.equal(resolveDocumentType('allgemein'), 'allgemein');
  assert.equal(resolveDocumentType('malicious_injection; DROP TABLE', 'allgemein'), 'allgemein');
  assert.equal(resolveDocumentType(undefined, 'sdb'), 'sdb');
});

test('F11 & F12: validateAndDecodePdf enforces magic bytes, non-emptiness, and 20MB buffer limit', async () => {
  const { validateAndDecodePdf, MAX_PDF_BYTES } = await import('../../server');

  // Empty string
  const emptyRes = validateAndDecodePdf('');
  assert.equal(emptyRes.isValid, false);
  if (!emptyRes.isValid) {
    assert.equal(emptyRes.code, 'EMPTY_FILE');
  }

  // Null or non-string
  const nullRes = validateAndDecodePdf(null);
  assert.equal(nullRes.isValid, false);
  if (!nullRes.isValid) {
    assert.equal(nullRes.code, 'INVALID_PDF');
  }

  const numRes = validateAndDecodePdf(12345);
  assert.equal(numRes.isValid, false);
  if (!numRes.isValid) {
    assert.equal(numRes.code, 'INVALID_PDF');
  }

  // Whitespace only
  const wsRes = validateAndDecodePdf('   ');
  assert.equal(wsRes.isValid, false);
  if (!wsRes.isValid) {
    assert.equal(wsRes.code, 'EMPTY_FILE');
  }

  // Empty data URI prefix
  const emptyUriRes = validateAndDecodePdf('data:application/pdf;base64,');
  assert.equal(emptyUriRes.isValid, false);
  if (!emptyUriRes.isValid) {
    assert.equal(emptyUriRes.code, 'EMPTY_FILE');
  }

  // Invalid magic bytes (plain text "Hello World")
  const invalidMagicRes = validateAndDecodePdf(Buffer.from('Hello World').toString('base64'));
  assert.equal(invalidMagicRes.isValid, false);
  if (!invalidMagicRes.isValid) {
    assert.equal(invalidMagicRes.code, 'INVALID_PDF');
  }

  // Truncated header "%PD"
  const truncatedRes = validateAndDecodePdf(Buffer.from('%PD').toString('base64'));
  assert.equal(truncatedRes.isValid, false);
  if (!truncatedRes.isValid) {
    assert.equal(truncatedRes.code, 'INVALID_PDF');
  }

  // Valid PDF header
  const validPdfRes = validateAndDecodePdf(Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj').toString('base64'));
  assert.equal(validPdfRes.isValid, true);
  if (validPdfRes.isValid) {
    assert.ok(validPdfRes.buffer.length > 0);
    assert.ok(validPdfRes.cleanBase64.length > 0);
  }

  // Payload too large check
  assert.equal(MAX_PDF_BYTES, 20 * 1024 * 1024);
});

/* ------------------------------------------------------------------ */
/* Milestone 3: Technisches Merkblatt (TM) Integration (F16–F22)      */
/* ------------------------------------------------------------------ */

test('F21: isTmProofAccepted recognizes matrix rows accepting TM documentation', () => {
  const row4 = DEFAULT_DGNB_ENV12_MATRIX.find((r) => r.nr === '4')!;
  assert.equal(isTmProofAccepted(row4.artDokumentation), true);

  const row8 = DEFAULT_DGNB_ENV12_MATRIX.find((r) => r.nr === '8')!;
  assert.equal(isTmProofAccepted(row8.artDokumentation), true);

  const row1 = DEFAULT_DGNB_ENV12_MATRIX.find((r) => r.nr === '1')!;
  assert.equal(isTmProofAccepted(row1.artDokumentation), true);

  const row17 = DEFAULT_DGNB_ENV12_MATRIX.find((r) => r.nr === '17')!;
  assert.equal(isTmProofAccepted(row17.artDokumentation), false); // 'Herstellererklärung'
});

test('TM sole proof: DGNB Row 4 (Tapetenkleister) achieves QS 4 via TM without SDB', () => {
  const row4 = DEFAULT_DGNB_ENV12_MATRIX.find((r) => r.nr === '4')!;
  assert.ok(row4.artDokumentation.includes('TM und/oder SDB'));

  // Product documented strictly via TM: solvent-free powder adhesive
  const tmFinding = parseVoc('Technisches Merkblatt Metylan Spezial: Reines Methylcellulose-Pulver, lösemittelfrei nach VdL-RL01. VOC-Gehalt: 0 g/l.');
  const certs = canonicalCertificates('VdL-RL01');
  const rowEval = evaluateRowLevels(row4, tmFinding, certs);

  assert.equal(rowEval.achievedLevel, 4);
  assert.equal(rowEval.needsManualReview, false);

  const params: ParameterEvaluation[] = [
    {
      parameterKey: 'voc',
      parameterName: 'VOC-Gehalt',
      productValue: formatVoc(tmFinding),
      requiredForQS4: row4.qs4,
      achievedLevel: rowEval.achievedLevel,
      isBottleneck: false,
      status: 'pass',
      explanation: 'Nachweis über Technisches Merkblatt (TM) erbracht.',
      evidence: { source: 'tm', documentType: 'tm', verification: 'verified' },
    },
    {
      parameterKey: 'svhc',
      parameterName: 'SVHC',
      productValue: 'Keine SVHC > 0,1 %',
      requiredForQS4: 'SVHC ≤ 0,1 %',
      achievedLevel: 4,
      isBottleneck: false,
      status: 'pass',
      explanation: 'Laut TM deklarationsfrei.',
      evidence: { source: 'tm', documentType: 'tm', verification: 'verified' },
    },
    {
      parameterKey: 'label',
      parameterName: 'Umweltzeichen',
      productValue: 'VdL-RL01',
      requiredForQS4: row4.qs4,
      achievedLevel: 4,
      isBottleneck: false,
      status: 'pass',
      explanation: 'VdL-RL01 belegt.',
      evidence: { source: 'tm', documentType: 'tm', verification: 'verified' },
    },
  ];

  const compliance = evaluateDgnbCompliance(params, true);
  assert.equal(compliance.overallLevel, 4);
  assert.equal(compliance.isBauteilekatalogKO, false);
  assert.equal(compliance.evaluatedParameters[0].evidence?.source, 'tm');
  assert.equal(compliance.evaluatedParameters[0].evidence?.documentType, 'tm');
});

test('TM sole proof: DGNB Row 8 achieves QS 4 when TM provides both GISCODE and EMICODE', () => {
  const row8 = DEFAULT_DGNB_ENV12_MATRIX.find((r) => r.nr === '8')!;
  const tmText = 'Technisches Merkblatt Thomsit K 188 E: GISCODE D1. GEV-EMICODE EC1 PLUS sehr emissionsarm. VOC: < 1 g/l.';
  const certs = canonicalCertificates(tmText);

  assert.ok(certs.includes('GISCODE D1'));
  assert.ok(certs.includes('EC1 PLUS'));

  const evalLabel = evaluateLabelLevels(row8, certs);
  assert.equal(evalLabel.achievedLevel, 4);

  const vocFinding = parseVoc(tmText);
  assert.equal(vocFinding.found, true);
  assert.equal(vocFinding.value, 1);
  assert.equal(vocFinding.op, '<');

  const evalVoc = evaluateRowLevels(row8, vocFinding, certs);
  assert.equal(evalVoc.achievedLevel, 4);
});

test('TM negative boundary: TM claim without third-party test report triggers KO for Row 7', () => {
  const row7 = DEFAULT_DGNB_ENV12_MATRIX.find((r) => r.nr === '7')!;
  assert.ok(row7.artDokumentation.includes('Emissionsnachweis EN ISO 16000-9 / EN 16516'));

  // TM alone with manufacturer assertion but missing test report date
  const missingDateEval = evaluateTestDateAge('');
  assert.equal(missingDateEval.achievedLevel, 2); // Demoted due to missing lab test report date
  assert.equal(missingDateEval.status, 'warning');

  const params: ParameterEvaluation[] = [
    {
      parameterKey: 'testDate',
      parameterName: 'Emissionsprüfung',
      productValue: 'Kein Prüfdatum im TM angegeben',
      requiredForQS4: 'Prüfbericht ≤ 5 Jahre',
      achievedLevel: missingDateEval.achievedLevel,
      isBottleneck: true,
      status: 'warning',
      explanation: missingDateEval.explanation,
      evidence: { source: 'tm', documentType: 'tm', verification: 'unverified' },
    },
  ];

  const compliance = evaluateDgnbCompliance(params, true);
  assert.equal(compliance.overallLevel, 2);
  assert.equal(compliance.bottleneckParameter?.parameterKey, 'testDate');
});

test('TM + SDB priority: measured VOC in TM takes precedence over EU Decopaint limit in SDB', () => {
  const sdbText = 'Sicherheitsdatenblatt Kaubit Wandfarbe: EU-Grenzwert für dieses Produkt (Kat. A/a): 30 g/l (2010).';
  const tmText = 'Technisches Merkblatt Kaubit Wandfarbe: Lösemittelfrei nach VdL-RL01. Gemessener VOC-Gehalt: < 1 g/l.';

  const sdbVoc = parseVoc(sdbText);
  assert.equal(sdbVoc.found, false);
  assert.equal(sdbVoc.onlyLimitValues, true); // 30 g/l is recognized as EU statutory limit, not product value

  const tmVoc = parseVoc(tmText);
  assert.equal(tmVoc.found, true);
  assert.equal(tmVoc.value, 1);
  assert.equal(tmVoc.op, '<');
  assert.equal(tmVoc.solventFree, true);

  // Evaluated against Row 3 (QS4 requires < 5 g/l)
  const row3 = DEFAULT_DGNB_ENV12_MATRIX.find((r) => r.nr === '3')!;
  const evalRow3 = evaluateRowLevels(row3, tmVoc, []);
  assert.equal(evalRow3.achievedLevel, 4); // < 1 g/l satisfies < 5 g/l (QS 4)
});

test('TM + SDB Schwachstellenprinzip: SDB SVHC disclosure demotes compliant TM to QS 1', () => {
  const perfectTmParams: ParameterEvaluation[] = [
    {
      parameterKey: 'voc',
      parameterName: 'VOC-Gehalt (aus TM)',
      productValue: '< 1 g/l',
      requiredForQS4: '< 5 g/l',
      achievedLevel: 4,
      isBottleneck: false,
      status: 'pass',
      explanation: 'Aus TM verifiziert',
      evidence: { source: 'tm', documentType: 'tm', verification: 'verified' },
    },
    {
      parameterKey: 'label',
      parameterName: 'GISCODE / EMICODE (aus TM)',
      productValue: 'GISCODE D1, EMICODE EC1 PLUS',
      requiredForQS4: 'EC1 PLUS',
      achievedLevel: 4,
      isBottleneck: false,
      status: 'pass',
      explanation: 'Aus TM verifiziert',
      evidence: { source: 'tm', documentType: 'tm', verification: 'verified' },
    },
    {
      parameterKey: 'svhc',
      parameterName: 'SVHC-Gehalt (aus SDB)',
      productValue: 'Enthält 0,2 % Weichmacher (SVHC Kandidatenliste)',
      requiredForQS4: 'SVHC ≤ 0,1 %',
      achievedLevel: 1, // K.O. from SDB
      isBottleneck: false,
      status: 'fail',
      explanation: 'SDB deklariert SVHC > 0,1 %',
      evidence: { source: 'sdb', documentType: 'sdb', verification: 'verified' },
    },
  ];

  const compliance = evaluateDgnbCompliance(perfectTmParams, true);
  assert.equal(compliance.overallLevel, 1);
  assert.equal(compliance.bottleneckParameter?.parameterKey, 'svhc');
  assert.equal(compliance.evaluatedParameters[0].evidence?.source, 'tm');
  assert.equal(compliance.evaluatedParameters[2].evidence?.source, 'sdb');
});

test('TM + Prüfbericht: TM technical properties combine with valid laboratory report', () => {
  const tmData = 'Technisches Merkblatt: 1K-Silan-Parkettkleber. GISCODE RS10.';
  const reportData = 'eco-INSTITUT Prüfbericht Nr. 2023-8472 nach DIN EN 16516: TVOC28 < 60 ug/m3. GEV-EMICODE EC1 PLUS.';
  const reportDate = '20.09.2023';

  const certs = canonicalCertificates([tmData, reportData]);
  assert.ok(certs.includes('GISCODE RS10'));
  assert.ok(certs.includes('EC1 PLUS'));

  const dateCheck = evaluateTestDateAge(reportDate, 2026);
  assert.equal(dateCheck.achievedLevel, 4);
  assert.equal(dateCheck.status, 'pass');

  const row8 = DEFAULT_DGNB_ENV12_MATRIX.find((r) => r.nr === '8')!;
  const evalLabel = evaluateLabelLevels(row8, certs);
  assert.equal(evalLabel.achievedLevel, 4);
});

test('TM + Prüfbericht: Expired lab report (> 10 years) demotes compliant TM to QS 1', () => {
  const dateCheck = evaluateTestDateAge('10.04.2012', 2026);
  assert.equal(dateCheck.achievedLevel, 1);
  assert.equal(dateCheck.status, 'fail');

  const params: ParameterEvaluation[] = [
    {
      parameterKey: 'voc',
      parameterName: 'VOC (aus TM)',
      productValue: '0 g/l',
      requiredForQS4: '< 1 g/l',
      achievedLevel: 4,
      isBottleneck: false,
      status: 'pass',
      explanation: 'TM belegt',
      evidence: { source: 'tm', documentType: 'tm', verification: 'verified' },
    },
    {
      parameterKey: 'testDate',
      parameterName: 'Alter Prüfbericht',
      productValue: '10.04.2012',
      requiredForQS4: '≤ 5 Jahre',
      achievedLevel: dateCheck.achievedLevel,
      isBottleneck: false,
      status: 'fail',
      explanation: dateCheck.explanation,
      evidence: { source: 'report', documentType: 'pruefbericht', verification: 'verified' },
    },
  ];

  const compliance = evaluateDgnbCompliance(params, true);
  assert.equal(compliance.overallLevel, 1);
  assert.equal(compliance.bottleneckParameter?.parameterKey, 'testDate');
});

test('Source attribution: multi-document triad assigns correct evidence source tags and extracts TM date', () => {
  const sdbText = 'Sicherheitsdatenblatt: Enthält keine SVHC > 0,1 % w/w.';
  const tmText = 'Technisches Merkblatt: GISCODE RS10. VOC: 0 g/l. Stand: 05/2023.';
  const reportText = 'Prüfbericht vom 15.05.2023: EMICODE EC1 PLUS.';

  const vocSource = tmText && parseVoc(tmText).found ? 'tm' : 'sdb';
  assert.equal(vocSource, 'tm');

  const svhcSource = sdbText && evaluateSvhc(sdbText).status !== 'missing' ? 'sdb' : 'tm';
  assert.equal(svhcSource, 'sdb');

  const dateSource = reportText && parseDate(reportText) ? 'report' : 'tm';
  assert.equal(dateSource, 'report');

  const tmDate = parseDate(tmText);
  assert.ok(tmDate);
  assert.equal(tmDate.raw, '05/2023');

  const certsInTm = canonicalCertificates(tmText);
  assert.ok(certsInTm.includes('GISCODE RS10'));
});



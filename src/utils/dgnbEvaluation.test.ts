import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateDgnbCompliance, evaluateTestDateAge } from './dgnbEvaluation';
import { verifyQuote } from './quoteVerification';
import { extractPdfPages, buildExcerpts } from './pdfText';
import {
  parseDate,
  parseVoc,
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
  const {
    isAdminEmail,
    isCorporateEmailAuthorized,
    emailToEmployeeDocId,
    normalizeEmailList,
    verifyVaultPersistenceWithoutLocalCache,
    LOCAL_VAULT_KEY,
  } = await import('./companyVaultService');

  assert.equal(isAdminEmail('brian.lackmann@kaubit.de'), true);
  assert.equal(isAdminEmail('BrianLackmann@gmail.com'), true);
  assert.equal(isAdminEmail('externer.nutzer@firma.de'), false);

  const allowedList = ['brian.lackmann@kaubit.de', 'mitarbeiter1@kaubit.de'];
  assert.equal(isCorporateEmailAuthorized('mitarbeiter1@kaubit.de', allowedList), true);
  assert.equal(isCorporateEmailAuthorized('MITARBEITER1@KAUBIT.DE', allowedList), true);
  assert.equal(isCorporateEmailAuthorized('unbekannt@kaubit.de', allowedList), false);

  // Verify Firestore employee document ID generation matches Firestore rule regex ^[a-zA-Z0-9_\-]+$
  const docId = emailToEmployeeDocId('Max.Mustermann+Test@Kaubit.de');
  assert.equal(docId, 'max_mustermann_test_at_kaubit_de');
  assert.ok(/^[a-zA-Z0-9_-]+$/.test(docId));
  assert.ok(docId.length <= 128);

  // Verify normalizeEmailList always preserves both admins and deduplicates employee emails
  const normalized = normalizeEmailList([
    '  ProjektLeitung@Kaubit.de ',
    'projektleitung@kaubit.de',
    'invalid-email',
  ]);
  assert.ok(normalized.includes('brian.lackmann@kaubit.de'));
  assert.ok(normalized.includes('brianlackmann@gmail.com'));
  assert.ok(normalized.includes('projektleitung@kaubit.de'));
  assert.equal(normalized.filter((e) => e === 'projektleitung@kaubit.de').length, 1);
  assert.equal(normalized.includes('invalid-email'), false);

  // Verify verifyVaultPersistenceWithoutLocalCache wipes localStorage and does not read stale localStorage
  const mockStore: Record<string, string> = {
    [LOCAL_VAULT_KEY]: JSON.stringify({
      saltHex: '11223344556677889900aabbccddeeff',
      verifierHex: '11223344556677889900aabbccddeeff',
      authorizedEmails: ['brian.lackmann@kaubit.de', 'nur-lokal@kaubit.de'],
      syncedToFirestore: false,
    }),
  };
  (globalThis as any).localStorage = {
    getItem: (k: string) => mockStore[k] ?? null,
    setItem: (k: string, v: string) => {
      mockStore[k] = v;
    },
    removeItem: (k: string) => {
      delete mockStore[k];
    },
  };

  const reloaded = await verifyVaultPersistenceWithoutLocalCache(null, '');
  assert.equal(mockStore[LOCAL_VAULT_KEY], undefined);
  assert.equal(reloaded.authorizedEmails.includes('nur-lokal@kaubit.de'), false);
  delete (globalThis as any).localStorage;

  // Verify normalizeFirestoreDatabaseId fixes missing 'ai-studio-' prefix from env vars
  const { normalizeFirestoreDatabaseId } = await import('../firebase/config');
  assert.equal(
    normalizeFirestoreDatabaseId(
      'dgnbenv12qmprfto-9665ebc6-a4b9-418d-9d5d-967112a73de4',
      'ai-studio-dgnbenv12qmprfto-9665ebc6-a4b9-418d-9d5d-967112a73de4'
    ),
    'ai-studio-dgnbenv12qmprfto-9665ebc6-a4b9-418d-9d5d-967112a73de4'
  );
});

test('KAUBIT_LETTERHEAD contains complete extracted header and footer from Vorlage_wpz_neu_9a344953.pdf', async () => {
  const { KAUBIT_LETTERHEAD, DEMO_KAUBIT_EVALUATION_RESULT } = await import(
    '../data/kaubitLetterhead'
  );

  // Header verification
  assert.equal(KAUBIT_LETTERHEAD.header.brandName, 'KAUBIT');
  assert.equal(KAUBIT_LETTERHEAD.header.tagline, 'Systemabdichtungsbaustoffe');
  assert.equal(
    KAUBIT_LETTERHEAD.header.postalHeaderLine,
    'KAUBIT Aktiengesellschaft · Postfach 11 48 · DE-49407 Dinklage'
  );
  assert.ok(
    fs.existsSync(path.resolve(process.cwd(), 'public/assets/aistudio/kaubit-logo.png')),
    'Extracted KAUBIT logo PNG must exist in public/assets/aistudio/kaubit-logo.png'
  );

  // Footer Column 1 & 2 verification
  assert.equal(KAUBIT_LETTERHEAD.footer.companyColumn.companyName, 'Kaubit Aktiengesellschaft');
  assert.equal(KAUBIT_LETTERHEAD.footer.companyColumn.street, 'Industriestraße 1');
  assert.equal(KAUBIT_LETTERHEAD.footer.companyColumn.city, 'DE-49413 Dinklage');
  assert.equal(KAUBIT_LETTERHEAD.footer.registryColumn.registerNumber, 'Abt. B Nr. 111274');
  assert.equal(KAUBIT_LETTERHEAD.footer.registryColumn.vatId, 'USt-IdNr. DE812447898');
  assert.equal(KAUBIT_LETTERHEAD.footer.registryColumn.taxNumber, 'Steuer-Nr. 68/203/71814');

  // Footer Column 3 & 4 (7 bank accounts with BIC & IBAN)
  assert.equal(KAUBIT_LETTERHEAD.footer.bankAccounts.length, 7);
  assert.equal(KAUBIT_LETTERHEAD.footer.bankAccounts[0].bic, 'OLBODEH2XXX');
  assert.equal(KAUBIT_LETTERHEAD.footer.bankAccounts[6].bic, 'NOLADE21BEB');

  // Executive board line
  assert.ok(KAUBIT_LETTERHEAD.footer.boardLine.includes('Sylvia Selting'));
  assert.ok(KAUBIT_LETTERHEAD.footer.boardLine.includes('Rüdiger Selting'));
  assert.ok(KAUBIT_LETTERHEAD.footer.boardLine.includes('Bernhard Taute'));

  // Demo evaluation result for Step 4
  assert.equal(DEMO_KAUBIT_EVALUATION_RESULT.standardsEvaluations['DGNB'].overallLevelNum, 4);
});

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startInProcessServer,
  InProcessServerInstance,
  createValidSdbPdf,
  createValidTmPdf,
  createValidPruefberichtPdf,
  createPlainTextMasqueradingAsPdf,
  createHtmlMasqueradingAsPdf,
  createZeroBytePdf,
  createOversizedPdf,
  getAdminToken,
  getEmployeeToken,
  getUnauthorizedToken,
  getAuthHeaders,
  ADMIN_EMAIL,
  EMPLOYEE_EMAIL,
  assertSecurityHeaders,
  assertDgnbEvaluationStructure,
  assertTmEvidenceAttribution,
} from './harness';

describe('Tier 1: Feature Coverage (R1, R2, R3, R4)', () => {
  let serverInstance: InProcessServerInstance;

  before(async () => {
    serverInstance = await startInProcessServer({
      envOverrides: {
        ALLOW_UNAUTHENTICATED_API: 'false',
        NODE_ENV: 'test',
      },
    });
  });

  after(async () => {
    await serverInstance?.stop();
  });

  // --------------------------------------------------------------------------
  // Requirement R1: Sicherheitsüberprüfung und -härtung (Security & Auth)
  // --------------------------------------------------------------------------
  describe('Requirement R1: Security & Endpoint Hardening', () => {
    before(() => {
      process.env.ALLOW_UNAUTHENTICATED_API = 'false';
      process.env.NODE_ENV = 'test';
    });

    test('TC-T1-R1-01: Public status endpoint returns auth metadata and security headers', async () => {
      const res = await serverInstance.client.get('/api/auth/status');
      assert.equal(res.status, 200);
      assert.equal(res.body.firebaseAuthEnabled, true);
      assert.ok(typeof res.body.projectId === 'string');
      assertSecurityHeaders(res.headers);
    });

    test('TC-T1-R1-02: Session verification rejects missing/empty token with HTTP 401', async () => {
      const res = await serverInstance.client.post('/api/auth/verify-session', {});
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.isAuthorized, false);
      assert.equal(res.body.saltHex, undefined);
      assert.equal(res.body.verifierHex, undefined);
      assert.equal(res.body.authorizedEmails, undefined);
      assertSecurityHeaders(res.headers);
    });

    test('TC-T1-R1-03: Session verification rejects malformed bearer token with HTTP 401', async () => {
      const res = await serverInstance.client.post(
        '/api/auth/verify-session',
        {},
        { Authorization: 'Bearer not.a.valid.jwt.string' }
      );
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.isAuthorized, false);
      assert.equal(res.body.saltHex, undefined);
    });

    test('TC-T1-R1-04: requireAuth protects /api/documents/parse-pdf against unauthenticated calls', async () => {
      process.env.ALLOW_UNAUTHENTICATED_API = 'false';
      const pdf = createValidSdbPdf();
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: pdf.base64,
        filename: 'test.pdf',
        documentType: 'sdb',
      });
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'UNAUTHORIZED');
      assertSecurityHeaders(res.headers);
    });

    test('TC-T1-R1-05: requireAuth protects /api/standards/analyze-product against unauthenticated calls', async () => {
      process.env.ALLOW_UNAUTHENTICATED_API = 'false';
      const res = await serverInstance.client.post('/api/standards/analyze-product', {
        productName: 'Protected Product',
        criteriaRowNr: '2',
      });
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'UNAUTHORIZED');
    });

    test('TC-T1-R1-06: Security headers are enforced across endpoints (no x-powered-by, nosniff, frameguard)', async () => {
      const res = await serverInstance.client.get('/api/standards/defaults');
      assert.equal(res.status, 200);
      assertSecurityHeaders(res.headers);
    });

    test('TC-T1-R1-07: Production mode lockout prevents ALLOW_UNAUTHENTICATED_API bypass in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_UNAUTHENTICATED_API = 'true';
      try {
        const res = await serverInstance.client.post('/api/standards/analyze-product', {
          productName: 'Production Guarded Product',
        });
        assert.equal(res.status, 401);
        assert.equal(res.body.code, 'UNAUTHORIZED');
      } finally {
        process.env.NODE_ENV = 'test';
        process.env.ALLOW_UNAUTHENTICATED_API = 'true';
      }
    });

    test('TC-T1-R1-08: Admin token is accepted with HTTP 200, isAuthorized: true, isAdmin: true', async () => {
      const adminToken = getAdminToken();
      const res = await serverInstance.client.post(
        '/api/auth/verify-session',
        {},
        getAuthHeaders(adminToken)
      );
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.isAuthorized, true);
      assert.equal(res.body.isAdmin, true);
      assert.equal(res.body.email, ADMIN_EMAIL);
      assert.equal(res.body.userId, 'admin-uid-100');
      assert.ok(Array.isArray(res.body.authorizedEmails));
      assert.ok(res.body.authorizedEmails.includes(ADMIN_EMAIL));
    });

    test('TC-T1-R1-09: Employee token is accepted with HTTP 200, isAuthorized: true, isAdmin: false', async () => {
      const empToken = getEmployeeToken();
      const res = await serverInstance.client.post(
        '/api/auth/verify-session',
        {},
        getAuthHeaders(empToken)
      );
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.isAuthorized, true);
      assert.equal(res.body.isAdmin, false);
      assert.equal(res.body.email, EMPLOYEE_EMAIL);
      assert.equal(res.body.userId, 'employee-uid-200');
      assert.ok(Array.isArray(res.body.authorizedEmails));
    });

    test('TC-T1-R1-10: Unauthorized valid Google account token is rejected with HTTP 403 Forbidden', async () => {
      const unauthToken = getUnauthorizedToken();
      const res = await serverInstance.client.post(
        '/api/auth/verify-session',
        {},
        getAuthHeaders(unauthToken)
      );
      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.equal(res.body.isAuthorized, false);
      assert.strictEqual(res.body.saltHex, undefined);
      assert.strictEqual(res.body.verifierHex, undefined);
      assert.strictEqual(res.body.authorizedEmails, undefined);
    });
  });

  // --------------------------------------------------------------------------
  // Requirement R2: Absicherung und Härtung der Dokumentenverarbeitung
  // --------------------------------------------------------------------------
  describe('Requirement R2: Document Processing & Validation Hardening', () => {
    before(() => {
      process.env.ALLOW_UNAUTHENTICATED_API = 'true';
      process.env.NODE_ENV = 'test';
    });

    test('TC-T1-R2-01: Valid SDB PDF base64 is accepted by document parsing endpoint', async () => {
      const sdb = createValidSdbPdf();
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: sdb.base64,
        filename: 'SDB_Bona_Quantum_T.pdf',
        documentType: 'sdb',
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.extracted.filename, 'SDB_Bona_Quantum_T.pdf');
      assert.equal(res.body.extracted.documentType, 'sdb');
      assert.equal(res.body.extracted.hasTextLayer, true);
    });

    test('TC-T1-R2-02: Valid Prüfbericht PDF base64 is accepted by document parsing endpoint', async () => {
      const pb = createValidPruefberichtPdf();
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: pb.base64,
        filename: 'Pruefbericht_EC1Plus.pdf',
        documentType: 'pruefbericht',
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.extracted.documentType, 'pruefbericht');
    });

    test('TC-T1-R2-03: Plain text file with .pdf extension is rejected', async () => {
      const fake = createPlainTextMasqueradingAsPdf();
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: fake.base64,
        filename: 'fake_document.pdf',
        documentType: 'sdb',
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'INVALID_PDF');
    });

    test('TC-T1-R2-04: HTML file with .pdf extension is rejected', async () => {
      const html = createHtmlMasqueradingAsPdf();
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: html.base64,
        filename: 'malicious.pdf',
        documentType: 'pruefbericht',
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'INVALID_PDF');
    });

    test('TC-T1-R2-05: Empty zero-byte base64 is rejected with HTTP 400', async () => {
      const empty = createZeroBytePdf();
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: empty.base64,
        filename: 'empty.pdf',
        documentType: 'sdb',
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'EMPTY_FILE');
    });

    test('TC-T1-R2-06: Data URI prefix is parsed without failure', async () => {
      const tm = createValidTmPdf();
      const prefixedBase64 = `data:application/pdf;base64,${tm.base64}`;
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: prefixedBase64,
        filename: 'prefixed_TM.pdf',
        documentType: 'tm',
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
    });

    test('TC-T1-R2-07: Oversized PDF binary buffer > 20MB is rejected with HTTP 400 PAYLOAD_TOO_LARGE', async () => {
      const oversized = createOversizedPdf(21);
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: oversized.base64,
        filename: 'oversized.pdf',
        documentType: 'sdb',
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'PAYLOAD_TOO_LARGE');
    });
  });

  // --------------------------------------------------------------------------
  // Requirement R3: Upload-Bereich für Technische Merkblätter (TM) & Matrizen
  // --------------------------------------------------------------------------
  describe('Requirement R3: Technical Data Sheet (TM) Integration & Proof Recognition', () => {
    before(() => {
      process.env.ALLOW_UNAUTHENTICATED_API = 'true';
      process.env.NODE_ENV = 'test';
    });

    test('TC-T1-R3-01: Document parser accepts documentType = "tm"', async () => {
      const tm = createValidTmPdf();
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: tm.base64,
        filename: 'TM_Parkettkleber.pdf',
        documentType: 'tm',
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.extracted.documentType, 'tm');
    });

    test('TC-T1-R3-02: DGNB Row 4 (Tapetenkleber) recognizes TM proof for QS 4', async () => {
      const res = await serverInstance.client.post('/api/standards/analyze-product', {
        productName: 'Metylan Spezial Tapetenkleister',
        manufacturer: 'Henkel AG',
        criteriaRowNr: '4',
        sdbText: 'Technisches Merkblatt & SDB: Metylan Spezial. Reines Methylcellulose-Pulver. Lösemittelfrei nach TRGS 610. VdL-RL01 konform. VOC-Gehalt: 0 g/l. Keine besonders besorgniserregenden Stoffe (SVHC) > 0,1 % w/w.',
        vocTestDate: '15.05.2023',
        structuredInput: {
          vocContent: '0 g/l (lösemittelfrei)',
          certificates: ['VDL-RL01'],
          svhcStatus: 'Keine besonders besorgniserregenden Stoffe (SVHC) > 0,1 % w/w',
          vocTestDate: '15.05.2023',
          evidence: {
            voc: { source: 'tm', quote: 'Lösemittelfrei nach TRGS 610. VOC-Gehalt: 0 g/l', verification: 'verified' },
            svhc: { source: 'tm', quote: 'Keine besonders besorgniserregenden Stoffe > 0,1 %', verification: 'verified' },
          },
        },
        hasBauteilekatalog: true,
        selectedStandardCodes: ['DGNB'],
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assertDgnbEvaluationStructure(res.body.result);

      const dgnb = res.body.result.standardsEvaluations['DGNB'];
      assert.equal(dgnb.overallLevelNum, 4);
      assert.equal(dgnb.isCompliant, true);
    });

    test('TC-T1-R3-03: DGNB Row 8 (Verlegewerkstoffe) recognizes TM GISCODE and EMICODE for QS 4', async () => {
      const res = await serverInstance.client.post('/api/standards/analyze-product', {
        productName: 'Thomsit K 188 E',
        manufacturer: 'PCI Augsburg GmbH',
        criteriaRowNr: '8',
        sdbText: 'Technisches Merkblatt Thomsit K 188 E Spezial-Dispersionsklebstoff. GISCODE D1. GEV-EMICODE EC1 PLUS sehr emissionsarm. VOC: < 1 g/l. Keine besonders besorgniserregenden Stoffe (SVHC) > 0,1 % w/w.',
        vocTestDate: '20.09.2023',
        structuredInput: {
          vocContent: '< 1 g/l',
          certificates: ['GISCODE D1', 'EMICODE EC1 PLUS'],
          svhcStatus: 'Keine SVHC > 0,1 % w/w',
          vocTestDate: '20.09.2023',
          evidence: {
            voc: { source: 'tm', quote: 'VOC: < 1 g/l', verification: 'verified' },
            label: { source: 'tm', quote: 'GISCODE D1. GEV-EMICODE EC1 PLUS', verification: 'verified' },
          },
        },
        hasBauteilekatalog: true,
        selectedStandardCodes: ['DGNB'],
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      const dgnb = res.body.result.standardsEvaluations['DGNB'];
      assert.equal(dgnb.overallLevelNum, 4);
      const labelParam = dgnb.parameters.find((p: any) => p.parameterKey === 'label');
      assert.ok(labelParam);
      assert.equal(labelParam.achievedLevel, 4);
    });

    test('TC-T1-R3-04: Structured TM evidence preserves source = "tm" in evaluation output', async () => {
      const res = await serverInstance.client.post('/api/standards/analyze-product', {
        productName: 'Kaubit Elastikdicht Pro',
        manufacturer: 'Kaubit Chemie GmbH',
        criteriaRowNr: '11',
        vocTestDate: '10.02.2023',
        structuredInput: {
          vocContent: '2 g/l',
          certificates: ['GISCODE RS10', 'EMICODE EC1 PLUS'],
          vocTestDate: '10.02.2023',
          evidence: {
            voc: {
              source: 'tm',
              quote: 'Gemessener VOC-Gehalt: 2 g/l',
              verification: 'verified',
            },
            label: {
              source: 'tm',
              quote: 'GISCODE RS10. EMICODE EC1 PLUS',
              verification: 'verified',
            },
          },
        },
        hasBauteilekatalog: true,
        selectedStandardCodes: ['DGNB'],
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      const dgnb = res.body.result.standardsEvaluations['DGNB'];
      const vocParam = dgnb.parameters.find((p: any) => p.parameterKey === 'voc');
      assert.ok(vocParam);
      assertTmEvidenceAttribution(vocParam);
    });

    test('TC-T1-R3-05: Multi-standard analysis evaluates concurrently across DGNB, QNG, and BNB', async () => {
      const res = await serverInstance.client.post('/api/standards/analyze-product', {
        productName: 'StoColor Rapid Ultramatt',
        manufacturer: 'Sto SE & Co. KGaA',
        criteriaRowNr: '2',
        sdbText: 'Technisches Merkblatt StoColor Rapid. Dispersions-Innenfarbe. Lösemittelfrei und weichmacherfrei nach VdL-RL01. VOC-Gehalt: < 1 g/l. Blauer Engel DE-UZ 102. Keine besonders besorgniserregenden Stoffe (SVHC) > 0,1 % w/w.',
        vocTestDate: '15.05.2023',
        structuredInput: {
          vocContent: '< 1 g/l',
          certificates: ['Blauer Engel DE-UZ 102', 'VDL-RL01'],
          svhcStatus: 'Keine SVHC > 0,1 % w/w',
          vocTestDate: '15.05.2023',
        },
        hasBauteilekatalog: true,
        selectedStandardCodes: ['DGNB', 'QNG', 'BNB'],
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      const evals = res.body.result.standardsEvaluations;
      assert.ok(evals['DGNB'], 'DGNB evaluation missing');
      assert.ok(evals['QNG'], 'QNG evaluation missing');
      assert.ok(evals['BNB'], 'BNB evaluation missing');
      assert.equal(evals['DGNB'].overallLevelNum, 4);
      assert.equal(evals['QNG'].isCompliant, true);
    });

    test('TC-T1-R3-06: Customer audit report generated with official title and compliance summary', async () => {
      const res = await serverInstance.client.post('/api/standards/analyze-product', {
        productName: 'Caparol CapaTrend',
        manufacturer: 'DAW SE',
        criteriaRowNr: '2',
        sdbText: 'Sicherheitsdatenblatt CapaTrend. VOC: < 1 g/l. Keine SVHC > 0,1 %.',
        hasBauteilekatalog: true,
        selectedStandardCodes: ['DGNB'],
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.result.customerReport);
      assert.ok(res.body.result.customerReport.title.includes('KONFORMITÄTSGUTACHTEN'));
      assert.ok(typeof res.body.result.customerReport.executiveSummary === 'string');
    });
  });

  // --------------------------------------------------------------------------
  // Requirement R4: Fehlerbehebung und Erreichen von Rollout-Niveau
  // --------------------------------------------------------------------------
  describe('Requirement R4: Robustness & Rollout Readiness', () => {
    before(() => {
      process.env.ALLOW_UNAUTHENTICATED_API = 'true';
      process.env.NODE_ENV = 'test';
    });

    test('TC-T1-R4-01: Standards catalog defaults endpoint returns DGNB, QNG, and BNB catalogs', async () => {
      const res = await serverInstance.client.get('/api/standards/defaults');
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.standards));
      assert.ok(res.body.standards.length >= 3);
      const codes = res.body.standards.map((s: any) => s.code);
      assert.ok(codes.includes('DGNB'));
      assert.ok(codes.includes('QNG'));
      assert.ok(codes.includes('BNB'));
    });

    test('TC-T1-R4-02: Standards analysis handles empty payload {} gracefully with safe defaults', async () => {
      const res = await serverInstance.client.post('/api/standards/analyze-product', {});
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.result.productName);
      assert.ok(res.body.result.manufacturer);
      assertDgnbEvaluationStructure(res.body.result);
    });

    test('TC-T1-R4-03: Legacy redirect /api/dgnb/analyze-product returns HTTP 307 redirect', async () => {
      const res = await serverInstance.client.post('/api/dgnb/analyze-product', {});
      assert.equal(res.status, 307);
      assert.equal(res.headers.location, '/api/standards/analyze-product');
    });

    test('TC-T1-R4-04: Legacy redirect /api/dgnb/parse-guideline-pdf returns HTTP 307 redirect', async () => {
      const res = await serverInstance.client.post('/api/dgnb/parse-guideline-pdf', {});
      assert.equal(res.status, 307);
      assert.equal(res.headers.location, '/api/standards/parse-guideline-pdf');
    });

    test('TC-T1-R4-05: Analysis evaluates custom standard definitions without errors', async () => {
      const customStandard = {
        code: 'CUSTOM_TEST',
        name: 'Unternehmensstandard Nachhaltigkeit',
        institute: 'Bau-QM Prüfstelle',
        version: '2026',
        scopeDescription: 'Testumgebung',
        isDefault: false,
        criteriaRows: [
          {
            nr: '1',
            bauteil: 'Innenfarben',
            betrachteteStoffe: 'VOC',
            qs1: '< 50 g/l',
            qs2: '< 30 g/l',
            qs3: '< 10 g/l',
            qs4: '< 1 g/l',
            kategorie: 'Farben',
          },
        ],
      };

      const res = await serverInstance.client.post('/api/standards/analyze-product', {
        productName: 'Custom Standard Test Product',
        criteriaRowNr: '1',
        sdbText: 'VOC: < 1 g/l. Keine besonders besorgniserregenden Stoffe (SVHC) > 0,1 % w/w. Prüfdatum: 15.05.2023.',
        vocTestDate: '15.05.2023',
        structuredInput: {
          vocContent: '< 1 g/l',
          svhcStatus: 'Keine SVHC > 0,1 %',
          vocTestDate: '15.05.2023',
        },
        standards: [customStandard],
        selectedStandardCodes: ['CUSTOM_TEST'],
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.result.standardsEvaluations['CUSTOM_TEST']);
      assert.equal(res.body.result.standardsEvaluations['CUSTOM_TEST'].overallLevelNum, 4);
    });

    test('TC-T1-R4-06: Missing Bauteilekatalog automatically enforces Schwachstellen-Prinzip demotion to QS 2', async () => {
      const res = await serverInstance.client.post('/api/standards/analyze-product', {
        productName: 'StoColor Sil In',
        criteriaRowNr: '2',
        sdbText: 'Lösemittelfrei, VOC < 1 g/l. VdL-RL01. Keine besonders besorgniserregenden Stoffe (SVHC) > 0,1 % w/w. Prüfdatum: 15.05.2023.',
        vocTestDate: '15.05.2023',
        structuredInput: {
          vocContent: '< 1 g/l',
          certificates: ['VDL-RL01'],
          svhcStatus: 'Keine SVHC > 0,1 %',
          vocTestDate: '15.05.2023',
        },
        hasBauteilekatalog: false, // Inactive / missing
        selectedStandardCodes: ['DGNB'],
      });
      assert.equal(res.status, 200);
      const dgnb = res.body.result.standardsEvaluations['DGNB'];
      assert.equal(dgnb.overallLevelNum, 2, 'Should be demoted to QS 2 when Bauteilekatalog is false');
      assert.ok(
        (Array.isArray(dgnb.notes) && dgnb.notes.some((n: string) => n.includes('Bauteilekatalog'))) ||
          dgnb.recommendation.includes('Bauteilekatalog'),
        'Evaluation notes or recommendation must explain Bauteilekatalog impact'
      );
    });
  });
});

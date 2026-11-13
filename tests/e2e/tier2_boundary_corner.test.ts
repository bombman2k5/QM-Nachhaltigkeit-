import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startInProcessServer,
  InProcessServerInstance,
  createValidSdbPdf,
  createValidTmPdf,
  createScannedPdf,
  createCorruptedMagicBytesPdf,
  createCorruptedStreamPdf,
  createCorruptedXrefPdf,
  createTruncatedHeaderPdf,
  createHtmlMasqueradingAsPdf,
  createZeroBytePdf,
  createOversizedPdf,
  getExpiredToken,
  getNonBearerHeaders,
  getUnauthorizedToken,
  assertSecurityHeaders,
  assertSanitizedError,
  assertDgnbEvaluationStructure,
  assertTmEvidenceAttribution,
} from './harness';

describe('Tier 2: Boundary & Corner Cases (R1, R2, R3, R4)', () => {
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
  // Requirement R1: Security & Auth Hardening (Boundaries)
  // --------------------------------------------------------------------------
  describe('Requirement R1: Security & Auth Boundaries', () => {
    test('TC-T2-R1-01: Session verification with expired JWT timestamp returns HTTP 401', async () => {
      const expiredToken = getExpiredToken();
      const res = await serverInstance.client.post(
        '/api/auth/verify-session',
        {},
        { Authorization: `Bearer ${expiredToken}` }
      );
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.isAuthorized, false);
      assertSecurityHeaders(res.headers);
    });

    test('TC-T2-R1-02: Session verification with non-Bearer auth scheme (e.g. Basic) returns HTTP 401', async () => {
      const res = await serverInstance.client.post(
        '/api/auth/verify-session',
        {},
        getNonBearerHeaders()
      );
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.isAuthorized, false);
      assert.equal(res.body.saltHex, undefined);
    });

    test('TC-T2-R1-03: Session verification with unauthorized token strictly omits vault secrets', async () => {
      const unauthToken = getUnauthorizedToken();
      const res = await serverInstance.client.post(
        '/api/auth/verify-session',
        {},
        { Authorization: `Bearer ${unauthToken}` }
      );
      // Strict assertion: must be 403 (Forbidden), not 401
      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.equal(res.body.isAuthorized, false);
      assert.strictEqual(res.body.saltHex, undefined);
      assert.strictEqual(res.body.verifierHex, undefined);
      assert.strictEqual(res.body.authorizedEmails, undefined);
    });

    test('TC-T2-R1-04: Production bypass lockout prevents access across all protected endpoints', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_UNAUTHENTICATED_API = 'true';
      try {
        const endpoints = [
          { method: 'POST', path: '/api/documents/parse-pdf', body: { pdfBase64: 'dGVzdA==' } },
          { method: 'POST', path: '/api/standards/analyze-product', body: { productName: 'Test' } },
          { method: 'POST', path: '/api/auth/save-passphrase-verifier', body: { saltHex: '123' } },
        ];

        for (const ep of endpoints) {
          const res = await serverInstance.client.post(ep.path, ep.body);
          assert.equal(
            res.status,
            401,
            `Endpoint ${ep.path} failed to enforce production lockout: got status ${res.status}`
          );
          assert.equal(res.body.success, false);
        }
      } finally {
        process.env.NODE_ENV = 'test';
        process.env.ALLOW_UNAUTHENTICATED_API = 'true';
      }
    });

    test('TC-T2-R1-05: Auditor identity integrity ignores client-supplied spoofed userEmail in body', async () => {
      process.env.ALLOW_UNAUTHENTICATED_API = 'true';
      process.env.NODE_ENV = 'test';

      const res = await serverInstance.client.post('/api/standards/analyze-product', {
        productName: 'Auditor Integrity Test Product',
        userEmail: 'attacker.unauthorized@evil.com', // Spoofed client input
        criteriaRowNr: '2',
        sdbText: 'VOC: < 1 g/l. VdL-RL01. Keine SVHC.',
        structuredInput: {
          vocContent: '< 1 g/l',
          certificates: ['VDL-RL01'],
        },
      });

      assert.equal(res.status, 200);
      assert.ok(res.body.result?.auditMetadata);
      // Verified auditor email must NOT be the client-injected attacker email
      assert.notEqual(
        res.body.result.auditMetadata.auditorEmail,
        'attacker.unauthorized@evil.com',
        'Security violation: client was able to spoof auditorEmail'
      );
      assert.ok(
        res.body.result.auditMetadata.auditorEmail.includes('@'),
        'Auditor email must be a valid authenticated address'
      );
    });

    test('TC-T2-R1-06: Production error sanitization suppresses internal paths and stack traces', async () => {
      process.env.NODE_ENV = 'production';
      try {
        // Trigger error handler with malformed payload
        const res = await serverInstance.client.post(
          '/api/auth/verify-session',
          { idToken: null }
        );
        assert.ok(res.status >= 400);
        assertSanitizedError(res.body);
      } finally {
        process.env.NODE_ENV = 'test';
      }
    });

    test('TC-T2-R1-07: Rate limit headers are present and properly formatted on analysis endpoint', async () => {
      const res = await serverInstance.client.post('/api/standards/analyze-product', {
        productName: 'Rate Limit Header Probe',
      });
      assert.ok(res.headers['x-ratelimit-limit'], 'x-ratelimit-limit header missing');
      assert.ok(res.headers['x-ratelimit-remaining'], 'x-ratelimit-remaining header missing');
      assert.ok(res.headers['x-ratelimit-reset'], 'x-ratelimit-reset header missing');
    });
  });

  // --------------------------------------------------------------------------
  // Requirement R2: Document Processing Hardening (Boundaries)
  // --------------------------------------------------------------------------
  describe('Requirement R2: Document Processing Boundaries & Malformed Files', () => {
    before(() => {
      process.env.ALLOW_UNAUTHENTICATED_API = 'true';
      process.env.NODE_ENV = 'test';
    });

    test('TC-T2-R2-01: Corrupted magic bytes (%NOTPDF-1.0) rejected safely without process crash', async () => {
      const corrupted = createCorruptedMagicBytesPdf();
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: corrupted.base64,
        filename: 'corrupted_magic.pdf',
        documentType: 'sdb',
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'INVALID_PDF');
      assertSecurityHeaders(res.headers);
    });

    test('TC-T2-R2-02: Embedded magic bytes inside HTML body is rejected with error status', async () => {
      const htmlTrick = createHtmlMasqueradingAsPdf();
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: htmlTrick.base64,
        filename: 'embedded_magic.pdf',
        documentType: 'tm',
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'INVALID_PDF');
    });

    test('TC-T2-R2-03: Corrupted stream object PDF handled gracefully without server exception', async () => {
      const corruptedStream = createCorruptedStreamPdf();
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: corruptedStream.base64,
        filename: 'corrupted_stream.pdf',
        documentType: 'sdb',
      });
      assert.ok(res.status === 200 || res.status === 400 || res.status === 502 || res.status === 503);
      if (res.status !== 200) {
        assert.equal(res.body.success, false);
      }
    });

    test('TC-T2-R2-04: Corrupted xref table PDF handled gracefully without unhandled rejection', async () => {
      const corruptedXref = createCorruptedXrefPdf();
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: corruptedXref.base64,
        filename: 'corrupted_xref.pdf',
        documentType: 'pruefbericht',
      });
      assert.ok(res.status === 200 || res.status === 400 || res.status === 502 || res.status === 503);
    });

    test('TC-T2-R2-05: Truncated header (%PD) is rejected as invalid PDF', async () => {
      const truncated = createTruncatedHeaderPdf();
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: truncated.base64,
        filename: 'truncated_header.pdf',
        documentType: 'sdb',
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'INVALID_PDF');
    });

    test('TC-T2-R2-06: Zero-byte PDF payload returns HTTP 400 with clean error code', async () => {
      const zeroByte = createZeroBytePdf();
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: zeroByte.base64,
        filename: 'zero_byte.pdf',
        documentType: 'sdb',
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'EMPTY_FILE');
    });

    test('TC-T2-R2-07: Filename directory traversal and null byte injections sanitized safely', async () => {
      const validTm = createValidTmPdf();
      const maliciousFilename = '../../../../etc/passwd\0<script>alert("xss")</script>.pdf';
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: validTm.base64,
        filename: maliciousFilename,
        documentType: 'tm',
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(!res.body.extracted.filename.includes('../'));
      assert.ok(!res.body.extracted.filename.includes('\0'));
    });

    test('TC-T2-R2-08: Scanned PDF with zero text characters handled safely (hasTextLayer = false)', async () => {
      const scanned = createScannedPdf();
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: scanned.base64,
        filename: 'scanned_datasheet.pdf',
        documentType: 'tm',
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.extracted.hasTextLayer, false);
    });

    test('TC-T2-R2-09: Oversized PDF binary buffer > 20MB at boundary is rejected with HTTP 400 PAYLOAD_TOO_LARGE', async () => {
      const oversized = createOversizedPdf(21);
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: oversized.base64,
        filename: 'boundary_oversized.pdf',
        documentType: 'tm',
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'PAYLOAD_TOO_LARGE');
    });
  });

  // --------------------------------------------------------------------------
  // Requirement R3: TM Support & DGNB Matrix Boundary Cases
  // --------------------------------------------------------------------------
  describe('Requirement R3: TM Integration & Matrix Boundaries', () => {
    before(() => {
      process.env.ALLOW_UNAUTHENTICATED_API = 'true';
      process.env.NODE_ENV = 'test';
    });

    test('TC-T2-R3-01: Unsupported documentType value falls back cleanly to default document type', async () => {
      const tm = createValidTmPdf();
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: tm.base64,
        filename: 'unsupported_type.pdf',
        documentType: 'malicious_type_injection; DROP TABLE audits; --',
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(['sdb', 'pruefbericht', 'tm', 'allgemein'].includes(res.body.extracted.documentType));
    });

    test('TC-T2-R3-02: Non-existent criteriaRowNr ("99", "-1", "invalid") falls back to valid default row', async () => {
      const boundaryRows = ['99', '-1', 'invalid_row', '0'];
      for (const rowNr of boundaryRows) {
        const res = await serverInstance.client.post('/api/standards/analyze-product', {
          productName: `Boundary Row Test ${rowNr}`,
          criteriaRowNr: rowNr,
          sdbText: 'VOC: < 1 g/l. VdL-RL01. Keine SVHC > 0,1 %.',
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.success, true);
        assertDgnbEvaluationStructure(res.body.result);
      }
    });

    test('TC-T2-R3-03: Zero VOC value (0 g/l, 0.00 g/l, lösemittelfrei) recognized correctly for QS 4', async () => {
      const zeroValues = ['0 g/l', '0.00 g/l', '0 g/l (lösemittelfrei nach TRGS 610)'];
      for (const vocVal of zeroValues) {
        const res = await serverInstance.client.post('/api/standards/analyze-product', {
          productName: 'Zero VOC Kleber',
          criteriaRowNr: '4',
          sdbText: `Technisches Merkblatt. Methylcellulose-Kleister. VOC-Gehalt: ${vocVal}. Lösemittelfrei nach TRGS 610. VdL-RL01 konform. Keine besonders besorgniserregenden Stoffe (SVHC) > 0,1 % w/w.`,
          vocTestDate: '10.10.2023',
          structuredInput: {
            vocContent: vocVal,
            certificates: ['VDL-RL01'],
            svhcStatus: 'Keine SVHC > 0,1 %',
            vocTestDate: '10.10.2023',
            evidence: {
              voc: { source: 'tm', quote: `VOC-Gehalt: ${vocVal}`, verification: 'verified' },
            },
          },
          hasBauteilekatalog: true,
          selectedStandardCodes: ['DGNB'],
        });
        assert.equal(res.status, 200);
        const dgnb = res.body.result.standardsEvaluations['DGNB'];
        assert.equal(dgnb.overallLevelNum, 4, `Expected QS 4 for zero VOC value '${vocVal}'`);
      }
    });

    test('TC-T2-R3-04: Large payload text in tmText (50,000 characters) executes without ReDoS timeout', async () => {
      const largeText = 'Technisches Merkblatt: '.padEnd(50000, 'Wandfarbe mit sehr geringen Emissionen. ') + 'VOC: < 1 g/l. VdL-RL01. Keine SVHC > 0,1 %.';
      const start = Date.now();
      const res = await serverInstance.client.post('/api/standards/analyze-product', {
        productName: 'Large Text Test Product',
        criteriaRowNr: '2',
        sdbText: largeText,
        vocTestDate: '15.05.2023',
        structuredInput: {
          vocContent: '< 1 g/l',
          certificates: ['VDL-RL01'],
          svhcStatus: 'Keine SVHC > 0,1 %',
          vocTestDate: '15.05.2023',
        },
        hasBauteilekatalog: true,
      });
      const duration = Date.now() - start;
      assert.equal(res.status, 200);
      assert.ok(duration < 5000, `Large text parsing took ${duration}ms, potential ReDoS detected`);
    });

    test('TC-T2-R3-05: Unverified evidence quote flags parameter and marks result as provisional', async () => {
      const res = await serverInstance.client.post('/api/standards/analyze-product', {
        productName: 'Unverified Quote Product',
        criteriaRowNr: '8',
        structuredInput: {
          vocContent: '< 1 g/l',
          certificates: ['GISCODE D1', 'EMICODE EC1 PLUS'],
          evidence: {
            voc: {
              source: 'tm',
              quote: 'Hallucinated non-existent quote in document',
              verification: 'unverified', // Unverified status
            },
          },
        },
        hasBauteilekatalog: true,
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.result.isProvisional, true, 'Result with unverified quote must be marked isProvisional');
      const dgnb = res.body.result.standardsEvaluations['DGNB'];
      const vocParam = dgnb.parameters.find((p: any) => p.parameterKey === 'voc');
      assert.ok(vocParam);
      assert.equal(vocParam.needsManualReview, true);
    });

    test('TC-T2-R3-06: TM evidence attribution is preserved across multi-standard evaluations', async () => {
      const res = await serverInstance.client.post('/api/standards/analyze-product', {
        productName: 'Multi-Standard TM Attributed Product',
        criteriaRowNr: '8',
        vocTestDate: '15.05.2023',
        structuredInput: {
          vocContent: '< 1 g/l',
          certificates: ['GISCODE D1', 'EMICODE EC1 PLUS'],
          svhcStatus: 'Keine SVHC > 0,1 %',
          vocTestDate: '15.05.2023',
          evidence: {
            voc: { source: 'tm', quote: 'TM Messwert: < 1 g/l', verification: 'verified' },
          },
        },
        hasBauteilekatalog: true,
        selectedStandardCodes: ['DGNB', 'QNG', 'BNB'],
      });
      assert.equal(res.status, 200);
      for (const code of ['DGNB', 'QNG', 'BNB']) {
        const stdEval = res.body.result.standardsEvaluations[code];
        assert.ok(stdEval, `Evaluation for standard ${code} missing`);
        const vocParam = stdEval.parameters.find((p: any) => p.parameterKey === 'voc');
        assert.ok(vocParam);
        assertTmEvidenceAttribution(vocParam);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Requirement R4: Rollout Robustness & Boundary Dates
  // --------------------------------------------------------------------------
  describe('Requirement R4: Rollout Robustness & Date Edge Cases', () => {
    before(() => {
      process.env.ALLOW_UNAUTHENTICATED_API = 'true';
      process.env.NODE_ENV = 'test';
    });

    test('TC-T2-R4-01: Expired VOC test report date (> 10 years old) triggers KO demotion to Level 1', async () => {
      const res = await serverInstance.client.post('/api/standards/analyze-product', {
        productName: 'Expired Report Product',
        criteriaRowNr: '11',
        vocTestDate: '01.01.2010', // > 10 years old relative to 2026
        structuredInput: {
          vocContent: '10 g/l',
          vocTestDate: '01.01.2010',
          certificates: ['EMICODE EC1 PLUS'],
          svhcStatus: 'Keine SVHC > 0,1 %',
        },
        hasBauteilekatalog: true,
        selectedStandardCodes: ['DGNB'],
      });
      assert.equal(res.status, 200);
      const dgnb = res.body.result.standardsEvaluations['DGNB'];
      const dateParam = dgnb.parameters.find((p: any) => p.parameterKey === 'testDate');
      assert.ok(dateParam);
      assert.equal(dateParam.achievedLevel, 1);
      assert.equal(dateParam.status, 'fail');
      // Due to Schwachstellen-Prinzip, overall level must be 1
      assert.equal(dgnb.overallLevelNum, 1);
      assert.equal(dgnb.isCompliant, false);
    });

    test('TC-T2-R4-02: Warning VOC test report date (5-10 years old) triggers warning level 2', async () => {
      const res = await serverInstance.client.post('/api/standards/analyze-product', {
        productName: 'Warning Date Product',
        criteriaRowNr: '11',
        vocTestDate: '01.01.2018', // ~8 years old relative to 2026
        structuredInput: {
          vocContent: '10 g/l',
          vocTestDate: '01.01.2018',
          certificates: ['EMICODE EC1 PLUS'],
          svhcStatus: 'Keine SVHC > 0,1 %',
        },
        hasBauteilekatalog: true,
        selectedStandardCodes: ['DGNB'],
      });
      assert.equal(res.status, 200);
      const dgnb = res.body.result.standardsEvaluations['DGNB'];
      const dateParam = dgnb.parameters.find((p: any) => p.parameterKey === 'testDate');
      assert.ok(dateParam);
      assert.equal(dateParam.achievedLevel, 2);
      assert.equal(dateParam.status, 'warning');
    });

    test('TC-T2-R4-03: Future VOC test report date is rejected as invalid with KO level 1', async () => {
      const res = await serverInstance.client.post('/api/standards/analyze-product', {
        productName: 'Future Date Product',
        criteriaRowNr: '11',
        vocTestDate: '01.01.2099', // Future date
        structuredInput: {
          vocContent: '10 g/l',
          vocTestDate: '01.01.2099',
          certificates: ['EMICODE EC1 PLUS'],
          svhcStatus: 'Keine SVHC > 0,1 %',
        },
        hasBauteilekatalog: true,
        selectedStandardCodes: ['DGNB'],
      });
      assert.equal(res.status, 200);
      const dgnb = res.body.result.standardsEvaluations['DGNB'];
      const dateParam = dgnb.parameters.find((p: any) => p.parameterKey === 'testDate');
      assert.ok(dateParam);
      assert.equal(dateParam.achievedLevel, 1);
      assert.equal(dateParam.status, 'fail');
      assert.equal(dgnb.overallLevelNum, 1);
    });

    test('TC-T2-R4-04: Non-date strings in vocTestDate do not trigger false positive date parsing', async () => {
      const nonDates = ['DIN EN 16516', 'Bericht-Nr 2023-999', 'ISO 16000-9', 'Kein Datum'];
      for (const nonDate of nonDates) {
        const res = await serverInstance.client.post('/api/standards/analyze-product', {
          productName: 'Non-Date Product',
          criteriaRowNr: '2',
          vocTestDate: nonDate,
          structuredInput: {
            vocTestDate: nonDate,
          },
        });
        assert.equal(res.status, 200);
        const dgnb = res.body.result.standardsEvaluations['DGNB'];
        const dateParam = dgnb.parameters.find((p: any) => p.parameterKey === 'testDate');
        assert.ok(dateParam);
        assert.ok(dateParam.needsManualReview, `Expected needsManualReview for non-date '${nonDate}'`);
      }
    });

    test('TC-T2-R4-05: Empty selectedStandardCodes array defaults to DGNB standard', async () => {
      const res = await serverInstance.client.post('/api/standards/analyze-product', {
        productName: 'Empty Standard Codes Product',
        selectedStandardCodes: [],
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.result.standardsEvaluations['DGNB']);
    });

    test('TC-T2-R4-06: Unknown standard code in selectedStandardCodes handled without server crash', async () => {
      const res = await serverInstance.client.post('/api/standards/analyze-product', {
        productName: 'Unknown Standard Product',
        selectedStandardCodes: ['NON_EXISTENT_STANDARD_CODE'],
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.result.standardsEvaluations['NON_EXISTENT_STANDARD_CODE']);
    });
  });
});

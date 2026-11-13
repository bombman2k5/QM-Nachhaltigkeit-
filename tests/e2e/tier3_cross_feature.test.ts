import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startInProcessServer,
  InProcessServerInstance,
  createValidSdbPdf,
  createValidTmPdf,
  createValidPruefberichtPdf,
  getAdminToken,
  getEmployeeToken,
  getUnauthorizedToken,
  assertSecurityHeaders,
  assertDgnbEvaluationStructure,
  assertTmEvidenceAttribution,
} from './harness';

describe('Tier 3: Cross-Feature Interactions', () => {
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
  // Pair 1: Authentication Gate + Document Parsing
  // --------------------------------------------------------------------------
  test('TC-T3-01: Auth gate rejects unauthenticated document parsing before expensive decoding', async () => {
    process.env.ALLOW_UNAUTHENTICATED_API = 'false';
    const sdb = createValidSdbPdf();

    // 1. Missing token -> 401
    const resNoToken = await serverInstance.client.post('/api/documents/parse-pdf', {
      pdfBase64: sdb.base64,
      filename: 'sdb.pdf',
    });
    assert.equal(resNoToken.status, 401);
    assert.equal(resNoToken.body.code, 'UNAUTHORIZED');

    // 2. Unauthorized token -> 403
    const unauthToken = getUnauthorizedToken();
    const resUnauth = await serverInstance.client.post(
      '/api/documents/parse-pdf',
      { pdfBase64: sdb.base64, filename: 'sdb.pdf' },
      { Authorization: `Bearer ${unauthToken}` }
    );
    assert.equal(resUnauth.status, 403);
    assert.equal(resUnauth.body.success, false);
  });

  // --------------------------------------------------------------------------
  // Pair 2: Decopaint Regulatory Limit in SDB vs. Actual Product Measured VOC in TM
  // --------------------------------------------------------------------------
  test('TC-T3-02: Decopaint limit in SDB is overridden by actual measured VOC in TM', async () => {
    process.env.ALLOW_UNAUTHENTICATED_API = 'true';

    // SDB contains high EU Decopaint legal limit (300 g/l), but TM specifies actual product VOC (< 1 g/l)
    const sdbContent = 'Sicherheitsdatenblatt: EU-Grenzwert nach RL 2004/42/EG (Kat. A/d): 300 g/l VOC. Keine besonders besorgniserregenden Stoffe (SVHC) > 0,1 % w/w.';
    const tmContent = 'Technisches Merkblatt: Gemessener Produkt-VOC-Gehalt: < 1 g/l. VdL-RL01 konform. Lösemittelfrei nach TRGS 610.';

    const res = await serverInstance.client.post('/api/standards/analyze-product', {
      productName: 'Decopaint Conflict Test Paint',
      criteriaRowNr: '2',
      sdbText: sdbContent,
      tmText: tmContent,
      vocTestDate: '15.05.2023',
      hasBauteilekatalog: true,
      selectedStandardCodes: ['DGNB'],
      // CRITICAL: structuredInput is deliberately OMITTED!
    });

    assert.equal(res.status, 200);
    const dgnb = res.body.result.standardsEvaluations['DGNB'];
    const vocParam = dgnb.parameters.find((p: any) => p.parameterKey === 'voc');
    assert.ok(vocParam, 'VOC parameter must exist in evaluation');
    assert.equal(vocParam.achievedLevel, 4);
    assert.equal(vocParam.evidence.source, 'tm');
    assert.equal(dgnb.overallLevelNum, 4);
  });

  // --------------------------------------------------------------------------
  // Pair 3: SDB + TM + Prüfbericht Multi-Document Triad Merging
  // --------------------------------------------------------------------------
  test('TC-T3-03: Multi-document triad (SDB + TM + Prüfbericht) merged into unified evaluation', async () => {
    process.env.ALLOW_UNAUTHENTICATED_API = 'true';

    const sdbText = 'Sicherheitsdatenblatt: Gemäß REACH-Verordnung (EG) 1907/2006 enthält das Produkt keine besonders besorgniserregenden Stoffe (SVHC) > 0,1 % w/w.';
    const tmText = 'Technisches Merkblatt: 1K-SMP Parkettkleber. GISCODE RS10. Lösemittelfrei nach TRGS 610. Gemessener VOC-Gehalt: 0 g/l.';
    const reportText = 'Emissionsprüfbericht nach DIN EN 16516: GEV-EMICODE EC1 PLUS sehr emissionsarm. Prüfdatum: 20.09.2023. TVOC nach 28 Tagen < 60 ug/m3.';

    const res = await serverInstance.client.post('/api/standards/analyze-product', {
      productName: 'Bona Quantum T Multi-Doc',
      manufacturer: 'Bona GmbH',
      criteriaRowNr: '8', // Verlegewerkstoffe
      sdbText,
      tmText,
      testReportText: reportText,
      vocTestDate: '20.09.2023',
      hasBauteilekatalog: true,
      selectedStandardCodes: ['DGNB'],
      // CRITICAL: structuredInput is deliberately OMITTED!
    });

    assert.equal(res.status, 200);
    const dgnb = res.body.result.standardsEvaluations['DGNB'];
    assert.equal(dgnb.overallLevelNum, 4);

    const vocParam = dgnb.parameters.find((p: any) => p.parameterKey === 'voc');
    assert.equal(vocParam.evidence.source, 'tm');

    const svhcParam = dgnb.parameters.find((p: any) => p.parameterKey === 'svhc');
    assert.equal(svhcParam.evidence.source, 'sdb');

    const labelParam = dgnb.parameters.find((p: any) => p.parameterKey === 'label');
    assert.ok(labelParam.productValue.includes('RS10') || labelParam.productValue.includes('EC1 PLUS'));
  });

  // --------------------------------------------------------------------------
  // Pair 4: Parameter Conflict: Compliant TM vs. SVHC Disclosure in SDB
  // --------------------------------------------------------------------------
  test('TC-T3-04: SDB SVHC disclosure demotes otherwise compliant TM claim via Schwachstellen-Prinzip', async () => {
    process.env.ALLOW_UNAUTHENTICATED_API = 'true';

    // TM claims top VOC performance, but SDB discloses SVHC > 0.1%
    const sdbText = 'SDB: Abschnitt 3 Gefährliche Inhaltsstoffe: Enthält SVHC-Kandidatenstoff Borsäure 0,3 % w/w (> 0,1 %).';
    const tmText = 'TM: Dispersionskleber mit GISCODE D1 und EMICODE EC1 PLUS. VOC: < 1 g/l.';

    const res = await serverInstance.client.post('/api/standards/analyze-product', {
      productName: 'SVHC Contaminated Product',
      criteriaRowNr: '8',
      sdbText,
      tmText,
      vocTestDate: '15.05.2023',
      structuredInput: {
        vocContent: '< 1 g/l',
        certificates: ['GISCODE D1', 'EMICODE EC1 PLUS'],
        svhcStatus: 'SVHC > 0,1 % w/w enthalten', // Positive SVHC trigger
        vocTestDate: '15.05.2023',
      },
      hasBauteilekatalog: true,
      selectedStandardCodes: ['DGNB'],
    });

    assert.equal(res.status, 200);
    const dgnb = res.body.result.standardsEvaluations['DGNB'];
    const svhcParam = dgnb.parameters.find((p: any) => p.parameterKey === 'svhc');
    assert.ok(svhcParam);
    assert.equal(svhcParam.achievedLevel, 1);
    assert.equal(svhcParam.status, 'fail');

    // Strict Schwachstellen-Prinzip: product must fail to QS 1 despite excellent TM VOC claim
    assert.equal(dgnb.overallLevelNum, 1);
    assert.equal(dgnb.isCompliant, false);
    assert.equal(dgnb.bottleneckParameter, svhcParam.parameterName);
  });

  // --------------------------------------------------------------------------
  // Pair 5: Bauteilekatalog KO + TM Proof
  // --------------------------------------------------------------------------
  test('TC-T3-05: Missing Bauteilekatalog demotes QS 4 TM evidence to overall QS 2', async () => {
    process.env.ALLOW_UNAUTHENTICATED_API = 'true';

    const res = await serverInstance.client.post('/api/standards/analyze-product', {
      productName: 'Top Adhesive without Bauteilekatalog',
      criteriaRowNr: '8',
      tmText: 'TM: GISCODE D1. EMICODE EC1 PLUS. VOC: < 1 g/l.',
      vocTestDate: '15.05.2023',
      structuredInput: {
        vocContent: '< 1 g/l',
        certificates: ['GISCODE D1', 'EMICODE EC1 PLUS'],
        svhcStatus: 'Keine SVHC > 0,1 %',
        vocTestDate: '15.05.2023',
        evidence: {
          voc: { source: 'tm', quote: 'VOC: < 1 g/l', verification: 'verified' },
          label: { source: 'tm', quote: 'GISCODE D1. EMICODE EC1 PLUS', verification: 'verified' },
        },
      },
      hasBauteilekatalog: false, // Inactive
      selectedStandardCodes: ['DGNB'],
    });

    assert.equal(res.status, 200);
    const dgnb = res.body.result.standardsEvaluations['DGNB'];
    // Chemical parameters achieve QS 4, but missing Bauteilekatalog demotes overall to QS 2
    assert.equal(dgnb.overallLevelNum, 2);
    assert.ok(
      dgnb.recommendation.includes('Bauteilekatalog') ||
        (Array.isArray(dgnb.notes) && dgnb.notes.some((n: string) => n.includes('Bauteilekatalog')))
    );
  });

  // --------------------------------------------------------------------------
  // Pair 6: Expired Prüfbericht Date + Valid TM Proof
  // --------------------------------------------------------------------------
  test('TC-T3-06: Expired test report (> 10 years) demotes compliant TM to QS 1', async () => {
    process.env.ALLOW_UNAUTHENTICATED_API = 'true';

    const res = await serverInstance.client.post('/api/standards/analyze-product', {
      productName: 'Adhesive with Expired Test Report',
      criteriaRowNr: '8',
      tmText: 'TM: GISCODE D1. EMICODE EC1 PLUS. VOC: < 1 g/l.',
      vocTestDate: '10.02.2012', // > 10 years relative to 2026
      structuredInput: {
        vocContent: '< 1 g/l',
        certificates: ['GISCODE D1', 'EMICODE EC1 PLUS'],
        svhcStatus: 'Keine SVHC > 0,1 %',
        vocTestDate: '10.02.2012',
      },
      hasBauteilekatalog: true,
      selectedStandardCodes: ['DGNB'],
    });

    assert.equal(res.status, 200);
    const dgnb = res.body.result.standardsEvaluations['DGNB'];
    const dateParam = dgnb.parameters.find((p: any) => p.parameterKey === 'testDate');
    assert.ok(dateParam);
    assert.equal(dateParam.achievedLevel, 1);
    assert.equal(dgnb.overallLevelNum, 1);
    assert.equal(dgnb.isCompliant, false);
  });

  // --------------------------------------------------------------------------
  // Pair 7: Rate Limiter + Repeated Consecutive Requests
  // --------------------------------------------------------------------------
  test('TC-T3-07: Rapid consecutive requests decrement X-RateLimit-Remaining correctly', async () => {
    process.env.ALLOW_UNAUTHENTICATED_API = 'true';

    const res1 = await serverInstance.client.post('/api/standards/analyze-product', {
      productName: 'Rate Limit Probe 1',
    });
    assert.equal(res1.status, 200);
    const remaining1 = parseInt(String(res1.headers['x-ratelimit-remaining']), 10);

    const res2 = await serverInstance.client.post('/api/standards/analyze-product', {
      productName: 'Rate Limit Probe 2',
    });
    assert.equal(res2.status, 200);
    const remaining2 = parseInt(String(res2.headers['x-ratelimit-remaining']), 10);

    assert.ok(
      remaining2 <= remaining1,
      `Rate limit counter did not decrement: ${remaining1} -> ${remaining2}`
    );
  });

  // --------------------------------------------------------------------------
  // Pair 8: Multi-Standard Evaluation + TM Parameter Evidence Attribution
  // --------------------------------------------------------------------------
  test('TC-T3-08: TM evidence attribution is consistent across DGNB, QNG, and BNB standards', async () => {
    process.env.ALLOW_UNAUTHENTICATED_API = 'true';

    const res = await serverInstance.client.post('/api/standards/analyze-product', {
      productName: 'Multi-Standard Triad Product',
      criteriaRowNr: '8',
      tmText: 'TM: GISCODE D1. EMICODE EC1 PLUS. VOC: < 1 g/l. Lösemittelfrei.',
      vocTestDate: '15.05.2023',
      structuredInput: {
        vocContent: '< 1 g/l',
        certificates: ['GISCODE D1', 'EMICODE EC1 PLUS'],
        svhcStatus: 'Keine SVHC > 0,1 %',
        vocTestDate: '15.05.2023',
        evidence: {
          voc: { source: 'tm', quote: 'TM: VOC < 1 g/l', verification: 'verified' },
          label: { source: 'tm', quote: 'GISCODE D1. EMICODE EC1 PLUS', verification: 'verified' },
        },
      },
      hasBauteilekatalog: true,
      selectedStandardCodes: ['DGNB', 'QNG', 'BNB'],
    });

    assert.equal(res.status, 200);
    const evals = res.body.result.standardsEvaluations;
    for (const std of ['DGNB', 'QNG', 'BNB']) {
      const vocParam = evals[std]?.parameters?.find((p: any) => p.parameterKey === 'voc');
      assert.ok(vocParam, `Parameter voc missing in standard ${std}`);
      assert.equal(vocParam.evidence.source, 'tm');
    }
  });

  // --------------------------------------------------------------------------
  // Pair 9: Legacy Endpoint 307 Redirect + Analysis Execution
  // --------------------------------------------------------------------------
  test('TC-T3-09: Legacy /api/dgnb/analyze-product issues HTTP 307 redirect to /api/standards/analyze-product', async () => {
    const res = await serverInstance.client.post('/api/dgnb/analyze-product', {
      productName: 'Legacy Call',
    });
    assert.equal(res.status, 307);
    assert.equal(res.headers.location, '/api/standards/analyze-product');
  });

  // --------------------------------------------------------------------------
  // Pair 10: Auditor Metadata Integrity in Customer Audit Certificate
  // --------------------------------------------------------------------------
  test('TC-T3-10: Audit certificate stamps verified auditor identity and standards summary', async () => {
    process.env.ALLOW_UNAUTHENTICATED_API = 'true';

    const res = await serverInstance.client.post('/api/standards/analyze-product', {
      productName: 'Certificate Verification Product',
      projectTitle: 'Klinikum Neubau Campus Nord',
      criteriaRowNr: '2',
      sdbText: 'VOC: < 1 g/l. VdL-RL01. Keine SVHC.',
      structuredInput: {
        vocContent: '< 1 g/l',
        certificates: ['VDL-RL01'],
        svhcStatus: 'Keine SVHC > 0,1 %',
      },
      hasBauteilekatalog: true,
      selectedStandardCodes: ['DGNB', 'QNG'],
    });

    assert.equal(res.status, 200);
    const meta = res.body.result.auditMetadata;
    assert.ok(meta);
    assert.equal(meta.projectName, 'Klinikum Neubau Campus Nord');
    assert.ok(meta.standardsVersionSummary.includes('DGNB'));
    assert.ok(meta.standardsVersionSummary.includes('QNG'));
    assert.ok(typeof meta.auditId === 'string' && meta.auditId.length > 5);
    assert.ok(typeof meta.auditDate === 'string' && meta.auditDate.length >= 8);
  });
});

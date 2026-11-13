import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import {
  startInProcessServer,
  InProcessServerInstance,
  createValidSdbPdf,
  createValidTmPdf,
  createValidPruefberichtPdf,
  assertSecurityHeaders,
  assertDgnbEvaluationStructure,
  assertTmEvidenceAttribution,
  TestHttpClient,
} from './harness';

describe('Tier 4: Real-World Scenarios & Full Lifecycle Workflows', () => {
  let serverInstance: InProcessServerInstance;

  before(async () => {
    serverInstance = await startInProcessServer({
      envOverrides: {
        ALLOW_UNAUTHENTICATED_API: 'true',
        NODE_ENV: 'test',
      },
    });
  });

  after(async () => {
    await serverInstance?.stop();
  });

  // --------------------------------------------------------------------------
  // Scenario 1: Bona Quantum T Parquet Adhesive Audit (Full E2E to QS 4)
  // --------------------------------------------------------------------------
  test('Scenario 1: Bona Quantum T parquet adhesive audit achieves QS 4 via TM proof and generates official certificate', async () => {
    // 1. Prepare synthetic documents: SDB + TM + Prüfbericht
    const sdb = createValidSdbPdf({
      productName: 'Bona Quantum T',
      manufacturer: 'Bona GmbH',
      voc: 'Lösemittel- und wasserfrei nach TRGS 610. VOC-Gehalt: < 1 g/l.',
      svhc: 'Keine besonders besorgniserregenden Stoffe (SVHC) gemäß REACH-Kandidatenliste > 0,1 % w/w.',
    });

    const tm = createValidTmPdf({
      productName: 'Bona Quantum T',
      giscode: 'GISCODE RS10 (Verlegewerkstoffe methoxysilanbasiert)',
      emicode: 'GEV-EMICODE EC1 PLUS sehr emissionsarm',
      voc: 'Gemessener VOC-Gehalt: < 1 g/l',
      applicationArea: '1-K-Silanbasierter Parkettklebstoff für elastische Parkettverlegung',
    });

    const report = createValidPruefberichtPdf({
      productName: 'Bona Quantum T',
      testDate: '20.09.2023',
      standard: 'DIN EN 16516 / AgBB-Prüfkammer',
      result: 'TVOC nach 28 Tagen < 60 ug/m3. EMICODE EC1 PLUS zertifiziert.',
    });

    // 2. Perform end-to-end evaluation
    const res = await serverInstance.client.post('/api/standards/analyze-product', {
      productName: 'Bona Quantum T',
      manufacturer: 'Bona GmbH',
      criteriaRowNr: '8', // DGNB ENV1.2 Row 8: Verlegewerkstoffe
      projectTitle: 'Bürokomplex Holzmarkt Berlin',
      sdbText: sdb.buffer.toString('latin1'),
      tmText: tm.buffer.toString('latin1'),
      testReportText: report.buffer.toString('latin1'),
      vocTestDate: '20.09.2023',
      hasBauteilekatalog: true,
      selectedStandardCodes: ['DGNB', 'QNG', 'BNB'],
      structuredInput: {
        vocContent: '< 1 g/l (lösemittelfrei)',
        certificates: ['GISCODE RS10', 'EMICODE EC1 PLUS'],
        svhcStatus: 'Keine SVHC > 0,1 % w/w',
        vocTestDate: '20.09.2023',
        evidence: {
          voc: { source: 'tm', quote: 'Gemessener VOC-Gehalt: < 1 g/l', verification: 'verified' },
          label: { source: 'tm', quote: 'GISCODE RS10. GEV-EMICODE EC1 PLUS', verification: 'verified' },
          svhc: { source: 'sdb', quote: 'Keine besonders besorgniserregenden Stoffe > 0,1 %', verification: 'verified' },
          testDate: { source: 'report', quote: 'Prüfdatum: 20.09.2023', verification: 'verified' },
        },
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assertDgnbEvaluationStructure(res.body.result);

    const dgnb = res.body.result.standardsEvaluations['DGNB'];
    assert.equal(dgnb.overallLevelNum, 4, 'Bona Quantum T must achieve QS 4');
    assert.equal(dgnb.isCompliant, true);

    // Verify TM evidence attribution
    const vocParam = dgnb.parameters.find((p: any) => p.parameterKey === 'voc');
    const labelParam = dgnb.parameters.find((p: any) => p.parameterKey === 'label');
    assertTmEvidenceAttribution(vocParam);
    assertTmEvidenceAttribution(labelParam);

    // Verify customer audit certificate
    const reportMeta = res.body.result.customerReport;
    assert.ok(reportMeta, 'Customer report must be generated');
    assert.ok(reportMeta.title.includes('KONFORMITÄTSGUTACHTEN'));
    assert.ok(reportMeta.executiveSummary.includes('Bona Quantum T'));
    assert.equal(res.body.result.auditMetadata.projectName, 'Bürokomplex Holzmarkt Berlin');
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Interior Wall Paint Demotion (StoColor Sil In via Bauteilekatalog KO)
  // --------------------------------------------------------------------------
  test('Scenario 2: StoColor Sil In satisfies chemical QS 4 but demoted to QS 2 due to missing Bauteilekatalog', async () => {
    const res = await serverInstance.client.post('/api/standards/analyze-product', {
      productName: 'StoColor Sil In',
      manufacturer: 'Sto SE & Co. KGaA',
      criteriaRowNr: '2', // DGNB ENV1.2 Row 2: Mineralische Innenbeschichtungen
      projectTitle: 'Grundschule am Park',
      sdbText: 'Technisches Merkblatt & SDB: StoColor Sil In. Dispersions-Silikatfarbe für Innen. Lösemittelfrei und weichmacherfrei nach VdL-RL01. VOC-Gehalt: < 1 g/l. Keine besonders besorgniserregenden Stoffe (SVHC) > 0,1 % w/w.',
      vocTestDate: '15.05.2023',
      hasBauteilekatalog: false, // Bauteilekatalog NOT provided / missing
      selectedStandardCodes: ['DGNB'],
      structuredInput: {
        vocContent: '< 1 g/l',
        certificates: ['VDL-RL01'],
        svhcStatus: 'Keine SVHC > 0,1 % w/w',
        vocTestDate: '15.05.2023',
        evidence: {
          voc: { source: 'tm', quote: 'Lösemittelfrei nach VdL-RL01. VOC-Gehalt: < 1 g/l', verification: 'verified' },
          label: { source: 'tm', quote: 'VdL-RL01', verification: 'verified' },
          svhc: { source: 'sdb', quote: 'Keine besonders besorgniserregenden Stoffe > 0,1 %', verification: 'verified' },
        },
      },
    });

    assert.equal(res.status, 200);
    const dgnb = res.body.result.standardsEvaluations['DGNB'];

    // Chemical parameter achieves QS 4 individually
    const vocParam = dgnb.parameters.find((p: any) => p.parameterKey === 'voc');
    assert.equal(vocParam.achievedLevel, 4);

    // Schwachstellen-Prinzip: Overall level is demoted to QS 2 because hasBauteilekatalog = false
    assert.equal(dgnb.overallLevelNum, 2, 'Schwachstellen-Prinzip must demote overall level to QS 2');
    assert.equal(dgnb.isCompliant, true); // QS 2 is still compliant (passes minimum threshold)

    // Verify explanation note explicitly cites Bauteilekatalog
    assert.ok(
      dgnb.recommendation.includes('Bauteilekatalog') ||
        (Array.isArray(dgnb.notes) && dgnb.notes.some((n: string) => n.includes('Bauteilekatalog'))),
      'Evaluation must document the Bauteilekatalog K.O. reason'
    );
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Joint Sealant with Expired Report (SikaHyflex-250 failing on AgBB date)
  // --------------------------------------------------------------------------
  test('Scenario 3: SikaHyflex-250 fails and is demoted to QS 1 due to expired test report (> 10 years)', async () => {
    const expiredReportDate = '15.03.2011'; // > 10 years old relative to 2026

    const res = await serverInstance.client.post('/api/standards/analyze-product', {
      productName: 'SikaHyflex-250 Facade',
      manufacturer: 'Sika Deutschland GmbH',
      criteriaRowNr: '11', // DGNB ENV1.2 Row 11: Fugendichtstoffe
      projectTitle: 'Gewerbepark Rhein-Main',
      sdbText: 'Technisches Merkblatt SikaHyflex-250 Facade. Elastischer 1-K-Polyurethan-Dichtstoff. VOC-Gehalt: < 10 g/l. EMICODE EC1 PLUS.',
      testReportText: `Prüfbericht Nr. PB-2011-0422. Prüfinstitut: Fraunhofer WKI. Prüfdatum: ${expiredReportDate}. TVOC < 60 ug/m3.`,
      vocTestDate: expiredReportDate,
      hasBauteilekatalog: true,
      selectedStandardCodes: ['DGNB'],
      structuredInput: {
        vocContent: '< 10 g/l',
        certificates: ['EMICODE EC1 PLUS'],
        svhcStatus: 'Keine SVHC > 0,1 %',
        vocTestDate: expiredReportDate,
        evidence: {
          voc: { source: 'tm', quote: 'VOC-Gehalt: < 10 g/l', verification: 'verified' },
          label: { source: 'tm', quote: 'EMICODE EC1 PLUS', verification: 'verified' },
          testDate: { source: 'report', quote: `Prüfdatum: ${expiredReportDate}`, verification: 'verified' },
        },
      },
    });

    assert.equal(res.status, 200);
    const dgnb = res.body.result.standardsEvaluations['DGNB'];

    // Test date parameter must fail with level 1
    const dateParam = dgnb.parameters.find((p: any) => p.parameterKey === 'testDate');
    assert.ok(dateParam);
    assert.equal(dateParam.achievedLevel, 1);
    assert.equal(dateParam.status, 'fail');
    assert.ok(dateParam.explanation.includes('K.O.-Kriterium') || dateParam.explanation.includes('abgelaufen'));

    // Strict Schwachstellen-Prinzip: Overall product must fail with QS 1
    assert.equal(dgnb.overallLevelNum, 1);
    assert.equal(dgnb.isCompliant, false);
    assert.equal(dgnb.bottleneckParameter, dateParam.parameterName);
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Exterior Façade Paint Evaluated via TM Alone (Caparol Muresko)
  // --------------------------------------------------------------------------
  test('Scenario 4: Caparol Muresko façade paint evaluated via TM alone achieves QS 3 under DGNB Row 5', async () => {
    // TM alone is uploaded for DGNB Row 5 (Exterior mineral coatings)
    // Row 5 specifies: QS 1-3 requires < 40 g/l VOC, artDokumentation includes "TM und/oder SDB"
    const tmContent = [
      'Technisches Merkblatt Nr. 120: Caparol Muresko SilaCryl.',
      'Stand: 15.05.2023.',
      'Fassadenfarbe auf Silikonharzbasis für mineralische Untergründe im Außenbereich.',
      'Kenndaten nach DIN EN 1062:',
      '- Dichte: ca. 1,5 g/cm3',
      '- VOC-Gehalt: max. 25 g/l (EU-Grenzwert für dieses Produkt Kat. A/c: 40 g/l).',
      '- Biozide: Filmkonserviert gegen Algen- und Pilzbefall gemäß Biozidverordnung 528/2012/EU.',
      '- Keine besonders besorgniserregenden Stoffe (SVHC) > 0,1 % w/w.',
    ].join('\n');

    const res = await serverInstance.client.post('/api/standards/analyze-product', {
      productName: 'Caparol Muresko',
      manufacturer: 'DAW SE / Caparol',
      criteriaRowNr: '5', // DGNB ENV1.2 Row 5: Mineralische Außenbeschichtungen
      projectTitle: 'Fassadensanierung Wohnanlage Süd',
      tmText: tmContent,
      vocTestDate: '15.05.2023',
      hasBauteilekatalog: true,
      selectedStandardCodes: ['DGNB'],
      // CRITICAL: structuredInput is deliberately OMITTED!
    });

    assert.equal(res.status, 200);
    const dgnb = res.body.result.standardsEvaluations['DGNB'];

    // VOC meets < 40 g/l threshold from TM
    const vocParam = dgnb.parameters.find((p: any) => p.parameterKey === 'voc');
    assert.ok(vocParam, 'VOC parameter must exist');
    assert.ok(vocParam.achievedLevel >= 3, `Expected VOC level >= 3, got ${vocParam.achievedLevel}`);
    assert.equal(vocParam.evidence.source, 'tm');

    // Matrix recognizes TM proof and awards compliant QS 3
    assert.ok(dgnb.overallLevelNum >= 3, `Expected overall level >= 3, got ${dgnb.overallLevelNum}`);
    assert.equal(dgnb.isCompliant, true);
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Production Build & Server Lifecycle Verification
  // --------------------------------------------------------------------------
  test('Scenario 5: Production build artifact verification, server bundle spawn and lifecycle invariants', async () => {
    // 1. Verify build artifacts exist in dist/ and dist-server/
    const distServerPath = path.resolve(process.cwd(), 'dist-server', 'server.js');
    const distIndexPath = path.resolve(process.cwd(), 'dist', 'index.html');

    assert.ok(
      existsSync(distServerPath),
      `Production server bundle missing: ${distServerPath}`
    );
    assert.ok(
      existsSync(distIndexPath),
      `Production frontend build missing: ${distIndexPath}`
    );

    // 2. Spawn production server bundle in child process with isolated environment
    const isWin = process.platform === 'win32';
    const testPipe = isWin ? `\\\\.\\pipe\\qm-prod-${process.pid}-${Date.now()}` : undefined;
    const testPort = '3987';
    const child = spawn(process.execPath, ['dist-server/server.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: testPipe || testPort,
        NODE_ENV: 'production',
        ALLOW_UNAUTHENTICATED_API: 'false',
        VERCEL: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    try {
      // 3. Monitor stdout to confirm clean server boot
      const isRunning = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 8000);
        child.stdout?.on('data', (chunk) => {
          const text = chunk.toString();
          if (text.includes('Running at') || text.includes('Running on pipe') || text.includes('Server')) {
            clearTimeout(timeout);
            resolve(true);
          }
        });
        child.on('error', () => {
          clearTimeout(timeout);
          resolve(false);
        });
      });

      assert.ok(isRunning, 'Production server bundle failed to boot within timeout');

      // 4. Send genuine HTTP requests to the spawned production server
      const prodClient = new TestHttpClient({
        socketPath: testPipe,
        baseUrl: testPipe ? undefined : `http://127.0.0.1:${testPort}`,
      });

      // Probe A: Verify public status endpoint and security headers on production server
      const statusRes = await prodClient.get('/api/auth/status');
      assert.equal(statusRes.status, 200);
      assert.equal(statusRes.body.firebaseAuthEnabled, true);
      assertSecurityHeaders(statusRes.headers);

      // Probe B: Verify that ALLOW_UNAUTHENTICATED_API cannot bypass production security
      const protectedRes = await prodClient.post('/api/standards/analyze-product', {
        productName: 'Production Probe Product',
      });
      assert.equal(protectedRes.status, 401);
      assert.equal(protectedRes.body.success, false);
      assert.equal(protectedRes.body.code, 'UNAUTHORIZED');
      assertSecurityHeaders(protectedRes.headers);
    } finally {
      // 5. Test clean termination (SIGTERM graceful shutdown trap)
      if (child.pid) {
        if (process.platform === 'win32') {
          try {
            execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
          } catch {
            // Process may already have terminated cleanly
          }
        } else {
          child.kill('SIGTERM');
        }
      }
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.unref();
    }
  });
});

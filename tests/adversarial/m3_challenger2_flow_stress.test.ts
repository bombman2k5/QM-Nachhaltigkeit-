import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  startInProcessServer,
  InProcessServerInstance,
  getAdminToken,
  getAuthHeaders,
} from '../e2e/harness';

/**
 * Challenger 2 Empirical Stress Test Suite: Milestone 3
 * Focus: Multi-Document & Upload Flow Verification
 * - 3 equal columns UX symmetry (SDB, TM, Prüfbericht)
 * - Evaluation activation logic (single document, pairs, triad, empty guard)
 * - ConfirmExtractedDataModal TM badge and parameter source assignment ('tm')
 * - Step3 & Step4 TM verifiziert pill and legal disclaimer verification
 * - End-to-end API standards evaluation across multi-document combinations
 */
describe('Adversarial Stress Test Suite: Milestone 3 Multi-Document & Upload Flow Verification', () => {
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

  // ==========================================================================
  // Suite 1: Structural UX Symmetry in Step2ProductUpload.tsx
  // ==========================================================================
  describe('Suite 1: Step2ProductUpload.tsx 3-Column Layout & UX Symmetry', () => {
    const step2Path = path.resolve(process.cwd(), 'src/components/Step2ProductUpload.tsx');
    const step2Code = fs.readFileSync(step2Path, 'utf-8');

    test('ST2-01: Grid layout defines 3 equal columns (md:grid-cols-3) for upload cards and textareas', () => {
      const gridMatches = step2Code.match(/grid-cols-1\s+md:grid-cols-3\s+gap-6/g);
      assert.ok(gridMatches, 'Expected 3-column responsive grid classes in Step2');
      assert.ok(gridMatches.length >= 2, 'Expected at least 2 3-column grids: upload zones and textareas');
    });

    test('ST2-02: All 3 upload zones (SDB, TM, Prüfbericht) have identical drag & drop handlers', () => {
      // Drag state checks
      assert.ok(step2Code.includes('isDraggingSdb'), 'Missing isDraggingSdb');
      assert.ok(step2Code.includes('isDraggingTm'), 'Missing isDraggingTm');
      assert.ok(step2Code.includes('isDraggingReport'), 'Missing isDraggingReport');

      // Drag event handlers
      assert.ok(step2Code.includes('setIsDraggingSdb(true)'), 'Missing SDB dragover');
      assert.ok(step2Code.includes('setIsDraggingTm(true)'), 'Missing TM dragover');
      assert.ok(step2Code.includes('setIsDraggingReport(true)'), 'Missing Report dragover');

      // Drop handlers invoke scan with correct documentType
      assert.ok(step2Code.includes("handleDocumentScan(file, 'sdb')"), 'Missing SDB drop handler');
      assert.ok(step2Code.includes("handleDocumentScan(file, 'tm')"), 'Missing TM drop handler');
      assert.ok(step2Code.includes("handleDocumentScan(file, 'pruefbericht')"), 'Missing Report drop handler');
    });

    test('ST2-03: All 3 upload zones provide file pill with "Ersetzen" and "Löschen" (replace & delete)', () => {
      // Zone 1: SDB
      assert.ok(step2Code.includes('sdbFile.name'), 'Missing SDB file pill filename');
      assert.ok(step2Code.includes('sdbInputRef.current?.click()'), 'Missing SDB replace button trigger');
      assert.ok(step2Code.includes("setSdbFile(null)"), 'Missing SDB clear');
      assert.ok(step2Code.includes("setSdbText('')"), 'Missing SDB text clear on delete');

      // Zone 2: TM
      assert.ok(step2Code.includes('tmFile.name'), 'Missing TM file pill filename');
      assert.ok(step2Code.includes('tmInputRef.current?.click()'), 'Missing TM replace button trigger');
      assert.ok(step2Code.includes("setTmFile(null)"), 'Missing TM clear');
      assert.ok(step2Code.includes("setTmText('')"), 'Missing TM text clear on delete');

      // Zone 3: Prüfbericht
      assert.ok(step2Code.includes('testReportFile.name'), 'Missing Report file pill filename');
      assert.ok(step2Code.includes('testReportInputRef.current?.click()'), 'Missing Report replace button trigger');
      assert.ok(step2Code.includes("setTestReportFile(null)"), 'Missing Report clear');
      assert.ok(step2Code.includes("setTestReportText('')"), 'Missing Report text clear on delete');
    });

    test('ST2-04: Symmetrical 3-column textareas exist for sdbText, tmText, and testReportText', () => {
      assert.ok(step2Code.includes('value={sdbText}'), 'Missing sdbText textarea');
      assert.ok(step2Code.includes('value={tmText}'), 'Missing tmText textarea');
      assert.ok(step2Code.includes('value={testReportText}'), 'Missing testReportText textarea');
    });
  });

  // ==========================================================================
  // Suite 2: Evaluation Activation Criteria Logic
  // ==========================================================================
  describe('Suite 2: Evaluation Activation Criteria Truth Table', () => {
    /**
     * Exact activation condition from Step2ProductUpload.tsx:486:
     * if (!sdbText.trim() && !tmText.trim() && !testReportText.trim()) { ... error ... }
     */
    function isEvaluationPermitted(sdbText: string, tmText: string, testReportText: string): boolean {
      const isBlocked = !sdbText.trim() && !tmText.trim() && !testReportText.trim();
      return !isBlocked;
    }

    test('EVAL-01: TM alone permits evaluation', () => {
      const allowed = isEvaluationPermitted('', 'Technisches Merkblatt: GISCODE D1, VOC 0.5 g/l', '');
      assert.equal(allowed, true, 'TM alone must permit evaluation');
    });

    test('EVAL-02: SDB alone permits evaluation', () => {
      const allowed = isEvaluationPermitted('Sicherheitsdatenblatt: VOC < 10 g/l', '', '');
      assert.equal(allowed, true, 'SDB alone must permit evaluation');
    });

    test('EVAL-03: Prüfbericht alone permits evaluation', () => {
      const allowed = isEvaluationPermitted('', '', 'Prüfbericht: EMICODE EC1 PLUS');
      assert.equal(allowed, true, 'Prüfbericht alone must permit evaluation');
    });

    test('EVAL-04: Combination TM + SDB permits evaluation', () => {
      const allowed = isEvaluationPermitted('SDB Content', 'TM Content', '');
      assert.equal(allowed, true, 'TM + SDB must permit evaluation');
    });

    test('EVAL-05: Combination TM + Prüfbericht permits evaluation', () => {
      const allowed = isEvaluationPermitted('', 'TM Content', 'Prüfbericht Content');
      assert.equal(allowed, true, 'TM + Prüfbericht must permit evaluation');
    });

    test('EVAL-06: Triad TM + SDB + Prüfbericht permits evaluation', () => {
      const allowed = isEvaluationPermitted('SDB Content', 'TM Content', 'Prüfbericht Content');
      assert.equal(allowed, true, 'TM + SDB + Prüfbericht must permit evaluation');
    });

    test('EVAL-07: All three empty or whitespace is rejected', () => {
      assert.equal(isEvaluationPermitted('', '', ''), false, 'Empty strings must be rejected');
      assert.equal(isEvaluationPermitted('   ', '  \t  ', '\n\r'), false, 'Whitespace-only strings must be rejected');
    });
  });

  // ==========================================================================
  // Suite 3: ConfirmExtractedDataModal Badge & Evidence Source Assignment
  // ==========================================================================
  describe('Suite 3: ConfirmExtractedDataModal TM Badge & Evidence Source Logic', () => {
    const modalPath = path.resolve(process.cwd(), 'src/components/ConfirmExtractedDataModal.tsx');
    const modalCode = fs.readFileSync(modalPath, 'utf-8');

    test('MODAL-01: Modal renders "Technisches Merkblatt (TM)" badge for documentType === "tm"', () => {
      assert.ok(
        modalCode.includes("data.documentType === 'tm'"),
        'Modal must have branch for data.documentType === "tm"'
      );
      assert.ok(
        modalCode.includes("'Technisches Merkblatt (TM)'"),
        'Modal must render "Technisches Merkblatt (TM)" badge'
      );
    });

    test('MODAL-02: Modal assigns defaultSource = "tm" when documentType === "tm"', () => {
      function resolveDefaultSource(docType: string): string {
        return docType === 'pruefbericht' ? 'report' : docType === 'tm' ? 'tm' : 'sdb';
      }

      assert.equal(resolveDefaultSource('tm'), 'tm');
      assert.equal(resolveDefaultSource('sdb'), 'sdb');
      assert.equal(resolveDefaultSource('pruefbericht'), 'report');
      assert.equal(resolveDefaultSource('allgemein'), 'sdb');
    });

    test('MODAL-03: Parameter evidence retains documentType attribution', () => {
      assert.ok(
        modalCode.includes('documentType: data.documentType'),
        'buildFieldEvidence must preserve documentType on returned evidence'
      );
    });
  });

  // ==========================================================================
  // Suite 4: Step3Evaluation & Step4CustomerDocument TM Rendering & Disclaimers
  // ==========================================================================
  describe('Suite 4: Step3Evaluation & Step4CustomerDocument Verification Pills and Legal Notices', () => {
    const step3Path = path.resolve(process.cwd(), 'src/components/Step3Evaluation.tsx');
    const step3Code = fs.readFileSync(step3Path, 'utf-8');
    const step4Path = path.resolve(process.cwd(), 'src/components/Step4CustomerDocument.tsx');
    const step4Code = fs.readFileSync(step4Path, 'utf-8');
    const serverPath = path.resolve(process.cwd(), 'server.ts');
    const serverCode = fs.readFileSync(serverPath, 'utf-8');

    test('DISP-01: Step3 table header explicitly includes TM ("Ermittelter Wert (SDB / TM / Labor)")', () => {
      assert.ok(
        step3Code.includes('Ermittelter Wert (SDB / TM / Labor)'),
        'Step3 table header must reference TM'
      );
    });

    test('DISP-02: Step3 renders "TM verifiziert" and "TM teilweise belegt" pills', () => {
      assert.ok(
        step3Code.includes("'TM verifiziert'"),
        'Step3 must render "TM verifiziert" pill'
      );
      assert.ok(
        step3Code.includes("'TM teilweise belegt'"),
        'Step3 must render "TM teilweise belegt" pill'
      );
    });

    test('DISP-03: Step4 renders "TM verifiziert" and "TM teilweise belegt" in certificate table', () => {
      assert.ok(
        step4Code.includes("'TM verifiziert'"),
        'Step4 certificate must render "TM verifiziert"'
      );
      assert.ok(
        step4Code.includes("'TM teilweise belegt'"),
        'Step4 certificate must render "TM teilweise belegt"'
      );
    });

    test('DISP-04: Legal mandatory notice includes Technischem Merkblatt (TM)', () => {
      assert.ok(
        serverCode.includes('Sicherheitsdatenblatt, Technischem Merkblatt (TM) und Prüfberichten'),
        'Server legalMandatoryNotice must explicitly cite Technischem Merkblatt (TM)'
      );
    });
  });

  // ==========================================================================
  // Suite 5: End-to-End API Multi-Document Ingestion & Proof Recognition
  // ==========================================================================
  describe('Suite 5: End-to-End Standards API Ingestion Combinations', () => {
    const adminToken = getAdminToken();

    test('API-M3-01: TM text alone enables successful evaluation with source = "tm"', async () => {
      const res = await serverInstance.client.post(
        '/api/standards/analyze-product',
        {
          productName: 'Caparol Muresko Fassadenfarbe',
          manufacturer: 'Caparol',
          criteriaRowNr: '5',
          vocTestDate: '15.05.2023',
          tmText: `
Technisches Merkblatt Nr. 120: Caparol Muresko
Stand: 15.05.2023
Fassadenfarbe auf Silikonharzbasis
VOC-Gehalt: max. 15 g/l
SVHC: Enthält keine Stoffe der SVHC-Kandidatenliste (> 0,1 %).
Anwendungsbereich: Fassadenbeschichtung für Außenwände
          `.trim(),
          hasBauteilekatalog: true,
          selectedStandardCodes: ['DGNB'],
        },
        getAuthHeaders(adminToken)
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.result);
      const evalResult = res.body.result;
      assert.equal(evalResult.productName, 'Caparol Muresko Fassadenfarbe');

      const dgnbEval = evalResult.standardsEvaluations?.DGNB;
      assert.ok(dgnbEval, 'DGNB evaluation missing');
      assert.equal(dgnbEval.isCompliant, true);

      // Verify that parameter evidence carries source = 'tm'
      const vocParam = dgnbEval.parameters.find((p: any) => p.parameterKey === 'voc');
      assert.ok(vocParam, 'VOC parameter must exist');
      assert.equal(vocParam.evidence.source, 'tm');
      assert.equal(vocParam.evidence.documentType, 'tm');

      // Verify DGNB evaluation result
      assert.ok(dgnbEval.overallLevelNum >= 1);
    });

    test('API-M3-02: SDB text alone enables successful evaluation with source = "sdb"', async () => {
      const res = await serverInstance.client.post(
        '/api/standards/analyze-product',
        {
          productName: 'StoColor Sil In',
          manufacturer: 'Sto SE',
          criteriaRowNr: '2',
          vocTestDate: '10.04.2023',
          sdbText: `
SICHERHEITSDATENBLATT gemäß Verordnung (EG) Nr. 1907/2006
StoColor Sil In
Abschnitt 3: Keine gefährlichen Inhaltsstoffe
Abschnitt 9: VOC-Gehalt < 1 g/l
Abschnitt 15: REACH SVHC: Keine Stoffe enthalten
Datum: 10.04.2023
          `.trim(),
          hasBauteilekatalog: true,
          selectedStandardCodes: ['DGNB'],
        },
        getAuthHeaders(adminToken)
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      const dgnbEval = res.body.result.standardsEvaluations?.DGNB;
      assert.ok(dgnbEval);
      const vocParam = dgnbEval.parameters.find((p: any) => p.parameterKey === 'voc');
      assert.ok(vocParam);
      assert.equal(vocParam.evidence.source, 'sdb');
      assert.equal(vocParam.evidence.documentType, 'sdb');
    });

    test('API-M3-03: Prüfbericht alone enables successful evaluation with source = "report"', async () => {
      const res = await serverInstance.client.post(
        '/api/standards/analyze-product',
        {
          productName: 'EcoFloor Klebstoff',
          manufacturer: 'EcoBau GmbH',
          criteriaRowNr: '8',
          vocTestDate: '12.06.2023',
          testReportText: `
LABOR-PRÜFBERICHT nach AgBB-Bewertungsschema
EcoFloor Klebstoff
Prüfbericht Nr. PB-2023-8891
Datum der Prüfung: 12.06.2023
Zertifiziert nach EMICODE EC1 PLUS
Sehr emissionsarm
VOC-Messung: TVOC nach 28 Tagen < 60 µg/m³
          `.trim(),
          hasBauteilekatalog: true,
          selectedStandardCodes: ['DGNB'],
        },
        getAuthHeaders(adminToken)
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      const dgnbEval = res.body.result.standardsEvaluations?.DGNB;
      assert.ok(dgnbEval);
      const labelParam = dgnbEval.parameters.find((p: any) => p.parameterKey === 'label');
      assert.ok(labelParam);
      assert.equal(labelParam.evidence.source, 'report');
      assert.equal(labelParam.evidence.documentType, 'pruefbericht');
    });

    test('API-M3-04: Triad (TM + SDB + Prüfbericht) merges texts and prioritizes specific sources correctly', async () => {
      const res = await serverInstance.client.post(
        '/api/standards/analyze-product',
        {
          productName: 'Bona Quantum T Parkettklebstoff',
          manufacturer: 'Bona GmbH',
          criteriaRowNr: '8',
          vocTestDate: '15.05.2023',
          sdbText: `
SICHERHEITSDATENBLATT
Abschnitt 15: REACH SVHC: Das Produkt enthält keine Stoffe der SVHC-Kandidatenliste.
          `.trim(),
          tmText: `
TECHNISCHES MERKBLATT
Bona Quantum T
Silanbasierter Parkettklebstoff
GISCODE: RS10
Lösemittelfrei gemäß TRGS 610
Stand: 01.06.2023
          `.trim(),
          testReportText: `
PRÜFBERICHT GEV-EMICODE
Zertifikatsnummer: 11025/01.06.20
Einstufung: EMICODE EC1 PLUS (sehr emissionsarm)
Prüfdatum: 15.05.2023
          `.trim(),
          hasBauteilekatalog: true,
          selectedStandardCodes: ['DGNB', 'QNG', 'BNB'],
        },
        getAuthHeaders(adminToken)
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      const result = res.body.result;

      // DGNB verification
      const dgnb = result.standardsEvaluations?.DGNB;
      assert.ok(dgnb);
      assert.equal(dgnb.overallLevelNum, 4);
      assert.ok(dgnb.overallRating.includes('4'));

      // Evidence check:
      // - svhc evidence comes from SDB -> source = 'sdb'
      const svhcParam = dgnb.parameters.find((p: any) => p.parameterKey === 'svhc');
      assert.ok(svhcParam);
      assert.equal(svhcParam.evidence.source, 'sdb');

      // - label evidence comes from report -> source = 'report'
      const labelParam = dgnb.parameters.find((p: any) => p.parameterKey === 'label');
      assert.ok(labelParam);
      assert.equal(labelParam.evidence.source, 'report');

      // - date evidence recognized
      assert.ok(result.auditMetadata);

      // - legalMandatoryNotice explicitly cites Technischem Merkblatt (TM)
      assert.ok(
        result.customerReport.legalMandatoryNotice.includes('Technischem Merkblatt (TM)'),
        'Legal notice must cite Technischem Merkblatt'
      );
    });

    test('API-M3-05: Missing all document texts falls back gracefully to default evaluation', async () => {
      const res = await serverInstance.client.post(
        '/api/standards/analyze-product',
        {
          productName: 'Generisches Bauprodukt',
          manufacturer: 'Test Mfr',
          criteriaRowNr: '2',
          hasBauteilekatalog: true,
          selectedStandardCodes: ['DGNB'],
        },
        getAuthHeaders(adminToken)
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      const result = res.body.result;
      assert.ok(result.standardsEvaluations?.DGNB);
    });
  });
});

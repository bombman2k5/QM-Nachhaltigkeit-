process.env.VERCEL = '1';
process.env.NODE_ENV = 'test';

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startInProcessServer,
  InProcessServerInstance,
  createSyntheticPdf,
  createValidTmPdf,
  createValidSdbPdf,
  createValidPruefberichtPdf,
  getEmployeeToken,
} from '../e2e/harness';
import { DEFAULT_DGNB_ENV12_MATRIX } from '../../src/data/defaultDgnbMatrix';
import { DEFAULT_QNG_MATRIX, DEFAULT_BNB_MATRIX } from '../../src/data/standardsCatalogs';
import {
  isTmProofAccepted,
  evaluateTestDateAge,
  evaluateDgnbCompliance,
} from '../../src/utils/dgnbEvaluation';
import {
  parseDate,
  parseVoc,
  formatVoc,
  evaluateSvhc,
  canonicalCertificates,
  evaluateRowLevels,
  evaluateLabelLevels,
} from '../../src/utils/parameterRules';
import { ParameterEvaluation } from '../../src/types/dgnb';

describe('Adversarial Stress & Empirical Challenge Suite: Milestone 3 (Challenger 1)', () => {
  let serverInstance: InProcessServerInstance;
  let authHeaders: Record<string, string>;

  before(async () => {
    serverInstance = await startInProcessServer({
      envOverrides: {
        ALLOW_UNAUTHENTICATED_API: 'true',
        NODE_ENV: 'test',
      },
    });
    authHeaders = {
      Authorization: `Bearer ${getEmployeeToken()}`,
    };
  });

  after(async () => {
    await serverInstance?.stop();
    setTimeout(() => process.exit(0), 100).unref();
  });

  // ==========================================================================
  // DIMENSION 1: DGNB MATRIX RULES & isTmProofAccepted STRESS TESTING
  // ==========================================================================
  describe('Dimension 1: DGNB Matrix Proof Rules (isTmProofAccepted) & Catalog Audit', () => {
    test('1.1: Complete catalog audit - every row with "TM" in artDokumentation is accepted', () => {
      let acceptedCount = 0;
      let rejectedCount = 0;

      for (const row of DEFAULT_DGNB_ENV12_MATRIX) {
        const accepted = isTmProofAccepted(row.artDokumentation);
        if (accepted) {
          acceptedCount++;
          // Must contain TM, Technisches Merkblatt, or Produktdatenblatt, or be empty/custom
          const doc = (row.artDokumentation || '').toLowerCase();
          const hasTmKeyword = /\b(tm|technisches\s*merkblatt|produktdatenblatt|pdb)\b/i.test(doc);
          const isBlank = !row.artDokumentation || !row.artDokumentation.trim();
          assert.ok(
            hasTmKeyword || isBlank,
            `Row ${row.nr} accepted without valid documentation keyword: "${row.artDokumentation}"`
          );
        } else {
          rejectedCount++;
          // Rows rejecting TM must strictly not have TM keywords
          assert.equal(
            /\b(tm|technisches\s*merkblatt|produktdatenblatt|pdb)\b/i.test(row.artDokumentation || ''),
            false,
            `Row ${row.nr} falsely rejected despite containing TM keyword: "${row.artDokumentation}"`
          );
        }
      }

      // Verify known distribution in DGNB ENV1.2
      assert.ok(acceptedCount >= 20, `Expected at least 20 rows accepting TM, got ${acceptedCount}`);
      assert.ok(rejectedCount >= 3, `Expected at least 3 rows rejecting TM (lab report only), got ${rejectedCount}`);
    });

    test('1.2: Strict rejection of declaration-only and test-norm-only matrix rows', () => {
      // Row 5b: Concrete roof tiles biozide - requires manufacturer declaration
      const row5b = DEFAULT_DGNB_ENV12_MATRIX.find((r) => r.nr === '5b')!;
      assert.equal(isTmProofAccepted(row5b.artDokumentation), false);

      // Row 16: Formwork release agents - requires manufacturer declaration
      const row16 = DEFAULT_DGNB_ENV12_MATRIX.find((r) => r.nr === '16')!;
      assert.equal(isTmProofAccepted(row16.artDokumentation), false);

      // Row 17: Bituminous coatings - requires manufacturer declaration
      const row17 = DEFAULT_DGNB_ENV12_MATRIX.find((r) => r.nr === '17')!;
      assert.equal(isTmProofAccepted(row17.artDokumentation), false);

      // Row 18: Heavy corrosion protection > C3 - requires manufacturer declaration
      const row18 = DEFAULT_DGNB_ENV12_MATRIX.find((r) => r.nr === '18')!;
      assert.equal(isTmProofAccepted(row18.artDokumentation), false);

      // Row 34: Oil/wax coatings - requires SDB and/or manufacturer declaration
      const row34 = DEFAULT_DGNB_ENV12_MATRIX.find((r) => r.nr === '34')!;
      assert.equal(isTmProofAccepted(row34.artDokumentation), false);

      // Row 47: Wood materials - requires EN 717-1 or EN 16516 test report
      const row47 = DEFAULT_DGNB_ENV12_MATRIX.find((r) => r.nr === '47')!;
      assert.equal(isTmProofAccepted(row47.artDokumentation), false);
    });

    test('1.3: Acceptance of key coating and adhesive rows via TM', () => {
      const tmRows = ['1', '2', '3', '4', '5', '8', '9', '10', '11', '13', '14', '15', '19', '20', '24'];
      for (const nr of tmRows) {
        const row = DEFAULT_DGNB_ENV12_MATRIX.find((r) => r.nr === nr);
        assert.ok(row, `Row ${nr} must exist in matrix`);
        assert.equal(
          isTmProofAccepted(row.artDokumentation),
          true,
          `Row ${nr} (${row.bauteil}) must accept TM as documentation`
        );
      }
    });

    test('1.4: Robustness against casing, whitespace, punctuation, and synonyms', () => {
      // Casing variations
      assert.equal(isTmProofAccepted('tm und/oder sdb'), true);
      assert.equal(isTmProofAccepted('TM UND/ODER SDB'), true);
      assert.equal(isTmProofAccepted('Technisches Merkblatt'), true);
      assert.equal(isTmProofAccepted('TECHNISCHES MERKBLATT'), true);
      assert.equal(isTmProofAccepted('Produktdatenblatt (PDB)'), true);
      assert.equal(isTmProofAccepted('Technisches Datenblatt'), false); // strictly checks TM/PDB keywords

      // Whitespace and special punctuation
      assert.equal(isTmProofAccepted('   TM   '), true);
      assert.equal(isTmProofAccepted('\n\tTM; SDB; Prüfbericht\n'), true);
      assert.equal(isTmProofAccepted('Hersteller-TM oder Prüfbericht'), true);

      // Negative strings (must not match substrings accidentally)
      assert.equal(isTmProofAccepted('Emissionsprüfung'), false);
      assert.equal(isTmProofAccepted('Prüfbericht EN ISO 16000-9'), false);
      assert.equal(isTmProofAccepted('Herstellererklärung'), false);
      assert.equal(isTmProofAccepted('SDB'), false); // SDB alone without TM is not TM-accepted
      assert.equal(isTmProofAccepted('Atmosphäre'), false); // contains 'tm' inside word!
      assert.equal(isTmProofAccepted('Postmodern'), false); // contains 'tm' inside word!
      assert.equal(isTmProofAccepted('Rhythmus'), false);

      // Fallback for custom / unconstrained user rows
      assert.equal(isTmProofAccepted(''), true);
      assert.equal(isTmProofAccepted('   '), true);
      assert.equal(isTmProofAccepted(undefined), true);
    });
  });

  // ==========================================================================
  // DIMENSION 2: CORNER CASES: TM AS SOLE PROOF (ROWS 4, 8, 19)
  // ==========================================================================
  describe('Dimension 2: TM as Sole Proof Corner Cases (Rows 4, 8, 19)', () => {
    test('2.1: Row 4 (Tapetenkleister) - TM sole proof achieves QS 4 via API without false KO', async () => {
      const tmContent = [
        'Technisches Merkblatt: Metylan Spezial Tapetenkleister',
        'Hersteller: Henkel AG & Co. KGaA',
        'Anwendungsbereich: Klebstoff für schwere Wandbekleidungen und Raufaser',
        'Eigenschaften:',
        '- Reines Methylcellulose-Pulver mit Kunstharzverstärkung',
        '- Lösemittelfrei nach VdL-RL01 und TRGS 610',
        '- VOC-Gehalt: 0 g/l',
        '- Keine besonders besorgniserregenden Stoffe (SVHC) gemäß REACH Kandidatenliste (> 0,1 % w/w)',
        'Stand: 05/2023',
      ].join('\n');

      const res = await serverInstance.client.post(
        '/api/standards/analyze-product',
        {
          productName: 'Metylan Spezial',
          manufacturer: 'Henkel AG',
          criteriaRowNr: '4',
          tmText: tmContent,
          hasBauteilekatalog: true,
          selectedStandardCodes: ['DGNB'],
        },
        authHeaders
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      const dgnb = res.body.result.standardsEvaluations.DGNB;
      assert.ok(dgnb);
      assert.equal(dgnb.matchedCriteriaRowNr, 'Zeile 4');
      assert.equal(dgnb.overallLevelNum, 4);
      assert.equal(dgnb.isCompliant, true);
      assert.equal(dgnb.overallRating.includes('QS 4'), true);

      // Verify parameter evidence tagging
      const vocParam = dgnb.parameters.find((p: ParameterEvaluation) => p.parameterKey === 'voc');
      assert.ok(vocParam);
      assert.equal(vocParam.achievedLevel, 4);
      assert.equal(vocParam.evidence?.source, 'tm');
      assert.equal(vocParam.evidence?.documentType, 'tm');

      const svhcParam = dgnb.parameters.find((p: ParameterEvaluation) => p.parameterKey === 'svhc');
      assert.ok(svhcParam);
      assert.equal(svhcParam.achievedLevel, 4);
      assert.equal(svhcParam.evidence?.source, 'tm');
      assert.equal(svhcParam.evidence?.documentType, 'tm');

      const dateParam = dgnb.parameters.find((p: ParameterEvaluation) => p.parameterKey === 'testDate');
      assert.ok(dateParam);
      assert.equal(dateParam.achievedLevel, 4);
      assert.equal(dateParam.evidence?.source, 'tm');
      assert.equal(dateParam.evidence?.documentType, 'tm');
    });

    test('2.2: Row 8 (Bodenbelagsklebstoffe) - TM sole proof with GISCODE & EMICODE achieves QS 4', async () => {
      const tmContent = [
        'Technisches Merkblatt: Thomsit K 188 E Spezial-Dispersionsklebstoff',
        'Hersteller: Thomsit / PCI Augsburg GmbH',
        'Anwendungsbereich: Nassklebstoff für PVC- und Kautschukbeläge',
        'Spezifikationen:',
        '- GISCODE D1 (Lösemittelfreie Dispersions-Verlegewerkstoffe)',
        '- GEV-EMICODE EC1 PLUS (sehr emissionsarm)',
        '- VOC-Gehalt: < 1 g/l',
        '- Frei von SVHC-Stoffen gemäß REACH Verordnung',
        'Stand: März 2024',
      ].join('\n');

      const res = await serverInstance.client.post(
        '/api/standards/analyze-product',
        {
          productName: 'Thomsit K 188 E',
          manufacturer: 'PCI Augsburg GmbH',
          criteriaRowNr: '8',
          tmText: tmContent,
          hasBauteilekatalog: true,
          selectedStandardCodes: ['DGNB'],
        },
        authHeaders
      );

      assert.equal(res.status, 200);
      const dgnb = res.body.result.standardsEvaluations.DGNB;
      assert.equal(dgnb.overallLevelNum, 4);
      assert.equal(dgnb.isCompliant, true);

      // Verify label/cert parameter evidence
      const labelParam = dgnb.parameters.find((p: ParameterEvaluation) => p.parameterKey === 'label');
      assert.ok(labelParam);
      assert.equal(labelParam.achievedLevel, 4);
      assert.equal(labelParam.evidence?.source, 'tm');
      assert.equal(labelParam.evidence?.documentType, 'tm');
      assert.ok(labelParam.productValue.includes('EC1 PLUS') || labelParam.productValue.includes('GISCODE D1'));
    });

    test('2.3: Row 19 (Nicht tragende Metallbauteile) - TM sole proof for water-dilutable coating achieves QS 4', async () => {
      // Row 19: QS 4 requires "Wasserverdünnbare Produkte < 140 g/l"
      const tmContent = [
        'Technisches Merkblatt: Capalac Aqua Metallschutz',
        'Hersteller: DAW SE',
        'Anwendungsbereich: Korrosionsschutzbeschichtung für Geländer, Zargen und Stahltüren',
        'Produktmerkmale:',
        '- Wasserverdünnbarer 1K-Acryllack für Metalluntergründe',
        '- VOC-Gehalt: gemessen 85 g/l (EU-Grenzwert Kat. A/i: 140 g/l)',
        '- Keine besonders besorgniserregenden Stoffe nach REACH (SVHC < 0,1 % w/w)',
        'Stand: 10/2023',
      ].join('\n');

      const res = await serverInstance.client.post(
        '/api/standards/analyze-product',
        {
          productName: 'Capalac Aqua Metallschutz',
          manufacturer: 'DAW SE',
          criteriaRowNr: '19',
          tmText: tmContent,
          hasBauteilekatalog: true,
          selectedStandardCodes: ['DGNB'],
        },
        authHeaders
      );

      assert.equal(res.status, 200);
      const dgnb = res.body.result.standardsEvaluations.DGNB;
      assert.equal(dgnb.matchedCriteriaRowNr, 'Zeile 19');
      assert.equal(dgnb.overallLevelNum, 4);

      const vocParam = dgnb.parameters.find((p: ParameterEvaluation) => p.parameterKey === 'voc');
      assert.ok(vocParam);
      assert.equal(vocParam.achievedLevel, 4);
      assert.equal(vocParam.evidence?.source, 'tm');
      assert.equal(vocParam.evidence?.documentType, 'tm');
    });

    test('2.4: Negative boundary - TM sole proof on Row 7 triggers warning/demotion (no false QS 4)', async () => {
      // Row 7 requires an EN 16516 chamber test report
      const tmContent = [
        'Technisches Merkblatt: Exklusiv Teppichboden Tuft',
        'Hersteller: Fabrikant GmbH',
        'Eigenschaften: Extrem emissionsarm, lösemittelfrei, Blauer Engel zertifiziert.',
      ].join('\n');

      const res = await serverInstance.client.post(
        '/api/standards/analyze-product',
        {
          productName: 'Exklusiv Teppich',
          criteriaRowNr: '7',
          tmText: tmContent,
          hasBauteilekatalog: true,
          selectedStandardCodes: ['DGNB'],
        },
        authHeaders
      );

      assert.equal(res.status, 200);
      const dgnb = res.body.result.standardsEvaluations.DGNB;
      // Missing test report date must prevent QS 4
      assert.ok(dgnb.overallLevelNum <= 2, `Expected QS <= 2 for missing lab report, got ${dgnb.overallLevelNum}`);
      const dateParam = dgnb.parameters.find((p: ParameterEvaluation) => p.parameterKey === 'testDate');
      assert.ok(dateParam);
      assert.equal(dateParam.achievedLevel, 2);
      assert.equal(dateParam.status, 'warning');
    });
  });

  // ==========================================================================
  // DIMENSION 3: TM + SDB CONFLICTING & COMPLEMENTARY COMBINATIONS
  // ==========================================================================
  describe('Dimension 3: TM + SDB Interactions (Priority & Schwachstellenprinzip)', () => {
    test('3.1: Priority override - TM measured VOC (< 1 g/l) overrides SDB statutory limit (30 g/l)', async () => {
      const sdbContent = [
        'Sicherheitsdatenblatt Kaubit Wandfarbe Matt',
        'Abschnitt 15: Rechtsvorschriften',
        'EU-Grenzwert für dieses Produkt (Kat. A/a): 30 g/l (2010).',
        'Abschnitt 3: Keine gefährlichen Inhaltsstoffe, SVHC < 0,1 % w/w.',
      ].join('\n');

      const tmContent = [
        'Technisches Merkblatt Kaubit Wandfarbe Matt',
        'Lösemittelfreie Innenwandfarbe nach VdL-RL01.',
        'Gemessener VOC-Gehalt: < 1 g/l (lösemittelfrei)',
        'Stand: 01/2024',
      ].join('\n');

      const res = await serverInstance.client.post(
        '/api/standards/analyze-product',
        {
          productName: 'Kaubit Wandfarbe',
          criteriaRowNr: '3', // QS4 requires < 10 g/l (or < 5 g/l)
          sdbText: sdbContent,
          tmText: tmContent,
          hasBauteilekatalog: true,
          selectedStandardCodes: ['DGNB'],
        },
        authHeaders
      );

      assert.equal(res.status, 200);
      const dgnb = res.body.result.standardsEvaluations.DGNB;
      assert.equal(dgnb.overallLevelNum, 4);

      const vocParam = dgnb.parameters.find((p: ParameterEvaluation) => p.parameterKey === 'voc');
      assert.ok(vocParam);
      assert.equal(vocParam.achievedLevel, 4);
      assert.equal(vocParam.evidence?.source, 'tm');
      assert.equal(vocParam.evidence?.documentType, 'tm');
      assert.ok(vocParam.productValue.includes('< 1 g/l') || vocParam.productValue.includes('lösemittelfrei'));
    });

    test('3.2: Schwachstellenprinzip - SDB SVHC disclosure demotes compliant TM to QS 1 (anti-greenwashing)', async () => {
      const tmContent = [
        'Technisches Merkblatt: PerfectEco Parkettkleber',
        'GISCODE D1, EMICODE EC1 PLUS sehr emissionsarm.',
        'VOC: 0 g/l (lösemittelfrei).',
        'Stand: 05/2023',
      ].join('\n');

      const sdbContent = [
        'Sicherheitsdatenblatt PerfectEco Parkettkleber',
        'Abschnitt 3: Zusammensetzung / Angaben zu Bestandteilen',
        'Gefährliche Inhaltsstoffe:',
        '- Enthält besonders besorgniserregende Stoffe (SVHC) > 0,1 % w/w: 1,2-Dimethoxyethan (CAS 110-71-4) mit 0,4 % w/w.',
      ].join('\n');

      const res = await serverInstance.client.post(
        '/api/standards/analyze-product',
        {
          productName: 'PerfectEco Parkettkleber',
          criteriaRowNr: '8',
          tmText: tmContent,
          sdbText: sdbContent,
          hasBauteilekatalog: true,
          selectedStandardCodes: ['DGNB'],
        },
        authHeaders
      );

      assert.equal(res.status, 200);
      const dgnb = res.body.result.standardsEvaluations.DGNB;
      // Schwachstellenprinzip must trigger: SVHC presence demotes overall level to 1
      assert.equal(dgnb.overallLevelNum, 1);
      assert.equal(dgnb.isCompliant, false);
      assert.equal(dgnb.bottleneckParameter, 'Besonders besorgniserregende Stoffe (REACH SVHC)');

      const svhcParam = dgnb.parameters.find((p: ParameterEvaluation) => p.parameterKey === 'svhc');
      assert.ok(svhcParam);
      assert.equal(svhcParam.achievedLevel, 1);
      assert.equal(svhcParam.evidence?.source, 'sdb');
      assert.equal(svhcParam.evidence?.documentType, 'sdb');
    });

    test('3.3: Complementary triad - SDB (SVHC) + TM (GISCODE, VOC, date) + Prüfbericht (EC1 PLUS) merge smoothly', async () => {
      const sdb = 'Sicherheitsdatenblatt: Enthält keine SVHC-Kandidatenstoffe > 0,1 % w/w.';
      const tm = 'Technisches Merkblatt: GISCODE RS10. VOC: < 1 g/l. Stand: 04/2023.';
      const report = 'eco-INSTITUT Prüfbericht vom 12.04.2023: EMICODE EC1 PLUS bestätigt.';

      const res = await serverInstance.client.post(
        '/api/standards/analyze-product',
        {
          productName: 'Hybrid Parkettkleber',
          criteriaRowNr: '8',
          sdbText: sdb,
          tmText: tm,
          testReportText: report,
          hasBauteilekatalog: true,
          selectedStandardCodes: ['DGNB'],
        },
        authHeaders
      );

      assert.equal(res.status, 200);
      const dgnb = res.body.result.standardsEvaluations.DGNB;
      assert.equal(dgnb.overallLevelNum, 4);

      // Verify source attribution per parameter
      const svhc = dgnb.parameters.find((p: ParameterEvaluation) => p.parameterKey === 'svhc');
      assert.equal(svhc?.evidence?.source, 'sdb');
      assert.equal(svhc?.evidence?.documentType, 'sdb');

      const voc = dgnb.parameters.find((p: ParameterEvaluation) => p.parameterKey === 'voc');
      assert.equal(voc?.evidence?.source, 'tm');
      assert.equal(voc?.evidence?.documentType, 'tm');

      const date = dgnb.parameters.find((p: ParameterEvaluation) => p.parameterKey === 'testDate');
      assert.equal(date?.evidence?.source, 'report');
      assert.equal(date?.evidence?.documentType, 'pruefbericht');
    });
  });

  // ==========================================================================
  // DIMENSION 4: DATE BOUNDARY HANDLING & EXPIRATION PROBES
  // ==========================================================================
  describe('Dimension 4: TM Date Boundary & Expiration Handling', () => {
    test('4.1: Date within 5 years (<= 5 years) achieves Quality Level 4 (pass)', () => {
      // Relative to reference year 2026
      const d2024 = evaluateTestDateAge('15.05.2024', 2026);
      assert.equal(d2024.achievedLevel, 4);
      assert.equal(d2024.status, 'pass');
      assert.equal(d2024.ageYears, 2);

      const d2021 = evaluateTestDateAge('Stand: 01/2021', 2026);
      assert.equal(d2021.achievedLevel, 4);
      assert.equal(d2021.status, 'pass');
      assert.equal(d2021.ageYears, 5);
    });

    test('4.2: Date between 5 and 10 years triggers Quality Level 2 (warning)', () => {
      // 2026 - 2018 = 8 years
      const d2018 = evaluateTestDateAge('Stand: 05/2018', 2026);
      assert.equal(d2018.achievedLevel, 2);
      assert.equal(d2018.status, 'warning');
      assert.ok(d2018.ageYears! > 5 && d2018.ageYears! <= 10);
      assert.ok(d2018.explanation.includes('Herstellererklärung'));
    });

    test('4.3: Date > 10 years triggers Quality Level 1 (K.O. fail)', () => {
      // 2026 - 2012 = 14 years
      const d2012 = evaluateTestDateAge('Stand: 10/2012', 2026);
      assert.equal(d2012.achievedLevel, 1);
      assert.equal(d2012.status, 'fail');
      assert.ok(d2012.ageYears! > 10);
      assert.ok(d2012.explanation.includes('K.O.-Kriterium'));
    });

    test('4.4: Future date triggers Quality Level 1 (fail)', () => {
      const dFuture = evaluateTestDateAge('Stand: 01/2030', 2026);
      assert.equal(dFuture.achievedLevel, 1);
      assert.equal(dFuture.status, 'fail');
      assert.ok(dFuture.explanation.includes('liegt in der Zukunft'));
    });

    test('4.5: Expired TM date (> 10 years) demotes evaluation via API to QS 1', async () => {
      const tmContent = [
        'Technisches Merkblatt: Antik-Kleber',
        'GISCODE D1, EMICODE EC1 PLUS.',
        'VOC: 0 g/l (lösemittelfrei).',
        'Keine SVHC > 0,1 % w/w.',
        'Stand: 04/2011', // 15 years old!
      ].join('\n');

      const res = await serverInstance.client.post(
        '/api/standards/analyze-product',
        {
          productName: 'Antik-Kleber',
          criteriaRowNr: '8',
          tmText: tmContent,
          hasBauteilekatalog: true,
          selectedStandardCodes: ['DGNB'],
        },
        authHeaders
      );

      assert.equal(res.status, 200);
      const dgnb = res.body.result.standardsEvaluations.DGNB;
      assert.equal(dgnb.overallLevelNum, 1);
      assert.equal(dgnb.isCompliant, false);

      const dateParam = dgnb.parameters.find((p: ParameterEvaluation) => p.parameterKey === 'testDate');
      assert.ok(dateParam);
      assert.equal(dateParam.achievedLevel, 1);
      assert.equal(dateParam.status, 'fail');
    });

    test('4.6: Robust extraction of diverse TM Stand date representations', () => {
      assert.equal(parseDate('Stand: 05/2023')?.raw, '05/2023');
      assert.equal(parseDate('Stand: 15.04.2024')?.raw, '15.04.2024');
      assert.equal(parseDate('Ausgabe: Mai 2022')?.raw, 'Mai 2022');
      assert.equal(parseDate('Überarbeitet am 2023-08-11')?.raw, '2023-08-11');
      assert.equal(parseDate('Revisionsdatum: 09/2022')?.raw, '09/2022');

      // Distinguish dates from norm references and product codes
      const mixed = 'Technisches Merkblatt gemäß DIN EN 13300:2001. Prüfbericht-Nr. 2023-994. Stand: 03/2024.';
      const parsed = parseDate(mixed);
      assert.ok(parsed);
      assert.equal(parsed.raw, '03/2024');
    });
  });

  // ==========================================================================
  // DIMENSION 5: EVIDENCE PROVENANCE & BACKEND DOCUMENT PARSER
  // ==========================================================================
  describe('Dimension 5: Evidence Provenance & Document Parser (/api/documents/parse-pdf)', () => {
    test('5.1: Backend PDF parser accepts documentType = "tm" and tags response', async () => {
      const tmPdf = createValidTmPdf({
        productName: 'Adversarial Test Primer TM',
        giscode: 'GISCODE D1',
        emicode: 'GEV-EMICODE EC1 PLUS',
        voc: 'VOC-Gehalt: < 1 g/l',
      });

      const res = await serverInstance.client.post(
        '/api/documents/parse-pdf',
        {
          pdfBase64: tmPdf.base64,
          filename: 'Test_Merkblatt_2024.pdf',
          documentType: 'tm',
        },
        authHeaders
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.extracted.documentType, 'tm');
      assert.ok(res.body.extracted.productName);
      assert.ok(res.body.extracted.certificates.includes('GISCODE D1') || res.body.extracted.certificates.includes('EC1 PLUS'));
    });

    test('5.2: Multi-norm evaluation maintains consistent TM evidence tagging across DGNB, QNG, and BNB', async () => {
      const tmText = [
        'Technisches Merkblatt: Universal-Spachtel',
        'GISCODE D1.',
        'GEV-EMICODE EC1 PLUS sehr emissionsarm.',
        'VOC: 0 g/l (lösemittelfrei).',
        'SVHC: Keine SVHC > 0,1 % w/w deklariert.',
        'Stand: 05/2024',
      ].join('\n');

      const res = await serverInstance.client.post(
        '/api/standards/analyze-product',
        {
          productName: 'Universal-Spachtel',
          criteriaRowNr: '8',
          tmText,
          hasBauteilekatalog: true,
          selectedStandardCodes: ['DGNB', 'QNG', 'BNB'],
        },
        authHeaders
      );

      assert.equal(res.status, 200);
      const { DGNB, QNG, BNB } = res.body.result.standardsEvaluations;

      for (const [code, evaluation] of Object.entries({ DGNB, QNG, BNB })) {
        assert.ok(evaluation, `Evaluation for ${code} must exist`);
        assert.equal(evaluation.overallLevelNum, 4, `${code} should achieve level 4`);

        const voc = evaluation.parameters.find((p: ParameterEvaluation) => p.parameterKey === 'voc');
        assert.equal(voc?.evidence?.source, 'tm', `${code} VOC evidence source must be 'tm'`);
        assert.equal(voc?.evidence?.documentType, 'tm', `${code} VOC documentType must be 'tm'`);

        const svhc = evaluation.parameters.find((p: ParameterEvaluation) => p.parameterKey === 'svhc');
        assert.equal(svhc?.evidence?.source, 'tm', `${code} SVHC evidence source must be 'tm'`);
        assert.equal(svhc?.evidence?.documentType, 'tm', `${code} SVHC documentType must be 'tm'`);
      }
    });

    test('5.3: Pre-confirmed evidence from frontend preserves user confirmation while filling TM documentType', async () => {
      const res = await serverInstance.client.post(
        '/api/standards/analyze-product',
        {
          productName: 'Confirmed TM Product',
          criteriaRowNr: '4',
          tmText: 'Technisches Merkblatt: VOC 0 g/l. Stand: 2024.',
          structuredInput: {
            vocContent: '0 g/l (lösemittelfrei)',
            evidence: {
              voc: {
                source: 'tm',
                quote: 'VOC 0 g/l lösemittelfrei',
                verification: 'verified',
              },
            },
          },
          hasBauteilekatalog: true,
          selectedStandardCodes: ['DGNB'],
        },
        authHeaders
      );

      assert.equal(res.status, 200);
      const dgnb = res.body.result.standardsEvaluations.DGNB;
      const voc = dgnb.parameters.find((p: ParameterEvaluation) => p.parameterKey === 'voc');
      assert.ok(voc);
      assert.equal(voc.evidence?.source, 'tm');
      assert.equal(voc.evidence?.documentType, 'tm');
      assert.equal(voc.evidence?.quote, 'VOC 0 g/l lösemittelfrei');
      assert.equal(voc.evidence?.verification, 'verified');
    });
  });
});

process.env.VERCEL = '1';
process.env.NODE_ENV = 'test';

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startInProcessServer,
  InProcessServerInstance,
  getEmployeeToken,
} from './harness';
import {
  evaluateDgnbCompliance,
  evaluateTestDateAge,
  isTmProofAccepted,
} from '../../src/utils/dgnbEvaluation';
import {
  parseDate,
  parseVoc,
  formatVoc,
  evaluateSvhc,
  canonicalCertificates,
  evaluateRowLevels,
  evaluateLabelLevels,
  parseRequirement,
} from '../../src/utils/parameterRules';
import {
  normalizeForMatch,
  verifyQuote,
  valueSupportedByQuote,
} from '../../src/utils/quoteVerification';
import { DEFAULT_DGNB_ENV12_MATRIX } from '../../src/data/defaultDgnbMatrix';
import { DEFAULT_QNG_MATRIX, DEFAULT_BNB_MATRIX } from '../../src/data/standardsCatalogs';
import { ParameterEvaluation, CriteriaRow } from '../../src/types/dgnb';

describe('Tier 5 (Part B): Adversarial Hardening — DGNB/QNG/BNB & TM Proof Engine', () => {
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
      'Content-Type': 'application/json',
    };
  });

  after(async () => {
    await serverInstance?.stop();
  });

  // =========================================================================
  // FOCUS AREA 1: Technical Data Sheet (TM) Proof Rules & DGNB Matrix Ambiguity
  // =========================================================================
  describe('Area 1: TM Proof Rules & Matrix Acceptance', () => {
    test('TC-T5-TM-01: Audit all DGNB Matrix rows for isTmProofAccepted consistency and keyword matching', () => {
      let acceptedCount = 0;
      let rejectedCount = 0;
      const cumulativeRows: string[] = [];

      for (const row of DEFAULT_DGNB_ENV12_MATRIX) {
        const doc = row.artDokumentation || '';
        const accepted = isTmProofAccepted(doc);
        if (accepted) {
          acceptedCount++;
        } else {
          rejectedCount++;
        }
        if ((/\s\+\s/.test(doc) || /\bund\s+sdb\b/i.test(doc)) && !/und\/oder/i.test(doc)) {
          cumulativeRows.push(row.nr);
        }
      }

      assert.equal(DEFAULT_DGNB_ENV12_MATRIX.length, 51);
      assert.equal(acceptedCount, 36);
      assert.equal(rejectedCount, 15);
      // Row 46 requires "TM + SDB" (cumulative requirement)
      assert.ok(cumulativeRows.includes('46'));
    });

    test('TC-T5-TM-02: isTmProofAccepted recognizes "Technisches Datenblatt" and "TDB"', () => {
      // In the DACH region, major manufacturers (PCI, Sika, Remmers) use "Technisches Datenblatt"
      // isTmProofAccepted matches "technisches merkblatt", "technisches datenblatt", and "tdb"
      assert.equal(isTmProofAccepted('Technisches Merkblatt'), true);
      assert.equal(isTmProofAccepted('Technisches Datenblatt'), true); // Hardened: recognized
      assert.equal(isTmProofAccepted('Produktdatenblatt (PDB)'), true);
      assert.equal(isTmProofAccepted('TDB'), true); // Hardened: TDB acronym recognized
    });

    test('TC-T5-TM-03: Row 7 lab test report requirement bypassed by TM-only upload with publication date', async () => {
      // Row 7 artDokumentation strictly requires external emissions lab report:
      // "TM und/oder Herstellererklärung und Emissionsnachweis EN ISO 16000-9 / EN 16516 / DE-UZ 120"
      // Server currently accepts TM alone and treats TM publication date as valid lab test date
      const payload = {
        productName: 'Elastic Flooring Adhesive',
        manufacturer: 'AdhesiveCorp',
        criteriaRowNr: '7',
        tmText: 'Technisches Merkblatt: Klebstoff für elastische Bodenbeläge. Blauer Engel DE-UZ 120. VOC: < 1 g/l. Keine SVHC > 0,1 %. Stand: 05/2023.',
        hasBauteilekatalog: true,
        selectedStandardCodes: ['DGNB'],
      };

      const res = await serverInstance.client.post('/api/standards/analyze-product', payload, {
        headers: authHeaders,
      });

      assert.equal(res.status, 200);
      const json = res.body.result;
      const dgnbEval = json.standardsEvaluations.DGNB;

      // Demonstrates gap: Product receives QS 4 with ONLY a TM and NO test report!
      assert.equal(dgnbEval.overallLevelNum, 4);
      assert.ok(dgnbEval.overallRating.includes('QS 4'));
      assert.equal(dgnbEval.parameters.find((p: any) => p.parameterKey === 'testDate')?.evidence?.source, 'tm');
    });

    test('TC-T5-TM-04: Future publication date in TM (Stand 12/2029) triggers Level 1 KO on whole product', async () => {
      const payload = {
        productName: 'Future Proof Sealant',
        criteriaRowNr: '4',
        tmText: 'Technisches Merkblatt: Dispersionsklebstoff, lösemittelfrei nach VdL-RL01. VOC: 0 g/l. Stand: 12/2029.',
        hasBauteilekatalog: true,
        selectedStandardCodes: ['DGNB'],
      };

      const res = await serverInstance.client.post('/api/standards/analyze-product', payload, {
        headers: authHeaders,
      });

      assert.equal(res.status, 200);
      const json = res.body.result;
      const dgnbEval = json.standardsEvaluations.DGNB;
      const dateParam = dgnbEval.parameters.find((p: any) => p.parameterKey === 'testDate');

      assert.equal(dateParam?.achievedLevel, 1);
      assert.equal(dgnbEval.overallLevelNum, 1);
      assert.ok(dgnbEval.overallRating.includes('QS 1'));
    });
  });

  // =========================================================================
  // FOCUS AREA 2: Multi-Document Evidence Triad & Collision Resolution
  // =========================================================================
  describe('Area 2: Multi-Document Evidence Triad & Collision Resolution', () => {
    test('TC-T5-TRIAD-01: Collision when SDB (25 g/l) and TM (0 g/l) compete: SDB value chosen and source correctly attributed as SDB', async () => {
      const payload = {
        productName: 'Dual Document Coating',
        criteriaRowNr: '3',
        sdbText: 'Abschnitt 9: Physikalische Eigenschaften. VOC-Gehalt: 25 g/l. Enthält keine SVHC.',
        tmText: 'Technisches Merkblatt: Lösemittelfrei nach VdL-RL01. Gemessener VOC-Gehalt: 0 g/l. Stand: 2023.',
        hasBauteilekatalog: true,
        selectedStandardCodes: ['DGNB'],
      };

      const res = await serverInstance.client.post('/api/standards/analyze-product', payload, {
        headers: authHeaders,
      });

      assert.equal(res.status, 200);
      const json = res.body.result;
      const dgnbEval = json.standardsEvaluations.DGNB;
      const vocParam = dgnbEval.parameters.find((p: any) => p.parameterKey === 'voc');

      // Due to combinedText order [sdbText, tmText], 25 g/l is chosen as best.value
      assert.ok(vocParam?.productValue.includes('25 g/l'));
      assert.equal(vocParam?.achievedLevel, 2);
      // Hardened: source attribution correctly identifies SDB as the source of 25 g/l
      assert.equal(vocParam?.evidence?.source, 'sdb');
      assert.equal(vocParam?.needsManualReview, true);
    });

    test('TC-T5-TRIAD-02: SVHC contradiction: SDB discloses 0.2 % SVHC, TM claims SVHC-free -> triggers KO (Level 1, non-compliant)', async () => {
      const payload = {
        productName: 'Plasticized Polymer',
        criteriaRowNr: '1',
        sdbText: 'Abschnitt 3: Gefährliche Bestandteile. Enthält 0,2 % Dibutylphthalat (SVHC Kandidatenliste). VOC: 50 g/l.',
        tmText: 'Technisches Merkblatt: Frei von SVHC-Stoffen gemäß REACH. VOC: 50 g/l. Stand: 2023.',
        hasBauteilekatalog: true,
        selectedStandardCodes: ['DGNB'],
      };

      const res = await serverInstance.client.post('/api/standards/analyze-product', payload, {
        headers: authHeaders,
      });

      assert.equal(res.status, 200);
      const json = res.body.result;
      const dgnbEval = json.standardsEvaluations.DGNB;
      const svhcParam = dgnbEval.parameters.find((p: any) => p.parameterKey === 'svhc');

      // Hardened: Toxic SVHC > 0.1% declared in legally binding SDB takes precedence over TM marketing
      assert.equal(svhcParam?.achievedLevel, 1);
      assert.equal(svhcParam?.status, 'fail');
      assert.equal(dgnbEval.isCompliant, false);
      assert.ok(dgnbEval.overallRating.includes('QS 1'));
    });

    test('TC-T5-TRIAD-03: SDB Decopaint limit (30 g/l) vs TM actual measured VOC (1 g/l)', () => {
      const sdbText = 'Abschnitt 15: EU-Grenzwert für das Produkt (Kat. A/d): 300 g/l (2010).';
      const tmText = 'Technisches Merkblatt: Lösemittelfrei nach VdL-RL01. VOC-Gehalt: < 1 g/l.';

      const combinedText = [sdbText, tmText].join('\n');
      const vocFinding = parseVoc(combinedText);

      // Decopaint limit in SDB is identified as legal limit, so TM actual product value wins cleanly
      assert.equal(vocFinding.found, true);
      assert.equal(vocFinding.value, 1);
      assert.equal(vocFinding.op, '<');
      assert.equal(vocFinding.ambiguous, false);
    });
  });

  // =========================================================================
  // FOCUS AREA 3: Schwachstellen-Prinzip & Bauteilekatalog KO
  // =========================================================================
  describe('Area 3: Schwachstellen-Prinzip & Bauteilekatalog KO Capping', () => {
    test('TC-T5-KO-01: Secondary parameter KO in SDB cannot be masked by QS 4 in TM', () => {
      const params: ParameterEvaluation[] = [
        {
          parameterKey: 'voc',
          parameterName: 'VOC (aus TM)',
          productValue: '0 g/l',
          requiredForQS4: '< 1 g/l',
          achievedLevel: 4,
          isBottleneck: false,
          status: 'pass',
          explanation: 'Perfekt laut TM',
          evidence: { source: 'tm', documentType: 'tm', verification: 'verified' },
        },
        {
          parameterKey: 'label',
          parameterName: 'Umweltzeichen (aus TM)',
          productValue: 'EMICODE EC1 PLUS',
          requiredForQS4: 'EC1 PLUS',
          achievedLevel: 4,
          isBottleneck: false,
          status: 'pass',
          explanation: 'EC1 PLUS laut TM',
          evidence: { source: 'tm', documentType: 'tm', verification: 'verified' },
        },
        {
          parameterKey: 'svhc',
          parameterName: 'SVHC-Gehalt (aus SDB)',
          productValue: 'Enthält SVHC > 0,1 %',
          requiredForQS4: '≤ 0,1 %',
          achievedLevel: 1, // K.O.
          isBottleneck: false,
          status: 'fail',
          explanation: 'K.O. durch SDB',
          evidence: { source: 'sdb', documentType: 'sdb', verification: 'verified' },
        },
      ];

      const compliance = evaluateDgnbCompliance(params, true);
      assert.equal(compliance.overallLevel, 1);
      assert.equal(compliance.bottleneckParameter?.parameterKey, 'svhc');
      assert.equal(compliance.isBauteilekatalogKO, false);
    });

    test('TC-T5-KO-02: Missing Bauteilekatalog caps QS 4 and QS 3 at QS 2 across DGNB, QNG, and BNB', async () => {
      const payload = {
        productName: 'All-Standard Tapetenkleister',
        criteriaRowNr: '4',
        tmText: 'Technisches Merkblatt: Metylan Spezial Tapetenkleister. GISCODE D1. Lösemittelfrei nach VdL-RL01. VOC: 0 g/l. Keine SVHC. Stand: 2024.',
        hasBauteilekatalog: false, // NO BAUTEILEKATALOG
        selectedStandardCodes: ['DGNB', 'QNG', 'BNB'],
      };

      const res = await serverInstance.client.post('/api/standards/analyze-product', payload, {
        headers: authHeaders,
      });

      assert.equal(res.status, 200);
      const json = res.body.result;

      const dgnb = json.standardsEvaluations.DGNB;
      const qng = json.standardsEvaluations.QNG;
      const bnb = json.standardsEvaluations.BNB;

      // DGNB capped at QS 2
      assert.equal(dgnb.overallLevelNum, 2);
      assert.ok(dgnb.overallRating.includes('QS 2'));

      // QNG capped at level 2 ('Erfüllt (QNG Standard)', NOT 'Erfüllt (QNG Plus / Premium)')
      assert.equal(qng.overallLevelNum, 2);
      assert.ok(qng.overallRating.includes('QNG Standard'));

      // BNB capped at QN 2
      assert.equal(bnb.overallLevelNum, 2);
      assert.ok(bnb.overallRating.includes('QN 2'));
    });

    test('TC-T5-KO-03: QNG Row 5.3 conditional "Kunstharzestriche: Einhaltung AgBB" causes false KO for primers', () => {
      const qngRow53 = DEFAULT_QNG_MATRIX.find((r) => r.nr === '5.3')!;
      // Row 5.3 is for mineral coatings & primers, but text includes "Kunstharzestriche: Einhaltung AgBB-Schema"
      const req = parseRequirement(qngRow53.qs4);
      // Demonstrates gap: parseRequirement extracts 'AGBB' as an unconditional certificate requirement!
      assert.ok(req.certs.includes('AGBB'));

      // A primer with only VdL-RL01 (no AgBB) gets level 1!
      const labelEval = evaluateLabelLevels(qngRow53, ['VDL-RL01']);
      assert.equal(labelEval.achievedLevel, 1);
    });
  });

  // =========================================================================
  // FOCUS AREA 4: Expired / Boundary Test Report Dates
  // =========================================================================
  describe('Area 4: Test Date Age Boundary Testing (5y, 10y, 11y, leap years)', () => {
    test('TC-T5-DATE-01: Exact boundary testing with reference year 2026', () => {
      const refYear = 2026;

      // 0 to 5 years -> QS 4 (pass)
      assert.equal(evaluateTestDateAge('2026', refYear).achievedLevel, 4);
      assert.equal(evaluateTestDateAge('2021', refYear).achievedLevel, 4); // 2026 - 2021 = 5

      // 6 to 10 years -> QS 2 (warning)
      assert.equal(evaluateTestDateAge('2020', refYear).achievedLevel, 2); // 2026 - 2020 = 6
      assert.equal(evaluateTestDateAge('2016', refYear).achievedLevel, 2); // 2026 - 2016 = 10

      // 11+ years -> QS 1 (fail)
      assert.equal(evaluateTestDateAge('2015', refYear).achievedLevel, 1); // 2026 - 2015 = 11
      assert.equal(evaluateTestDateAge('2010', refYear).achievedLevel, 1); // 2026 - 2010 = 16

      // Future year -> QS 1 (fail)
      assert.equal(evaluateTestDateAge('2027', refYear).achievedLevel, 1);
    });

    test('TC-T5-DATE-02: Day-precision boundary testing with Date reference (2026-11-13)', () => {
      const refDate = new Date(Date.UTC(2026, 10, 13));

      // 5.0 years: 13.11.2021 -> QS 4
      assert.equal(evaluateTestDateAge('13.11.2021', refDate).achievedLevel, 4);

      // 5.2 years: 13.09.2021 -> QS 2 (demoted to warning)
      assert.equal(evaluateTestDateAge('13.09.2021', refDate).achievedLevel, 2);

      // 10.0 years: 13.11.2016 -> QS 2
      assert.equal(evaluateTestDateAge('13.11.2016', refDate).achievedLevel, 2);

      // 10.2 years: 13.09.2016 -> QS 1 (expired KO)
      assert.equal(evaluateTestDateAge('13.09.2016', refDate).achievedLevel, 1);
    });

    test('TC-T5-DATE-03: Invalid calendar dates (29.02.2023 / 31.02.2023) do not fall back to month precision', () => {
      // 2023 is not a leap year: 29.02.2023 is an impossible calendar date
      const nonLeapFeb29 = parseDate('29.02.2023');
      // Hardened: Step 2 detects date mismatch and does NOT fall back to month "02.2023"
      assert.equal(nonLeapFeb29, null);

      // Valid leap year date: 29.02.2024
      const leapFeb29 = parseDate('29.02.2024');
      assert.ok(leapFeb29);
      assert.equal(leapFeb29.precision, 'day');
      assert.equal(leapFeb29.raw, '29.02.2024');
    });

    test('TC-T5-DATE-04: Document with multiple dates matches the first date in text', () => {
      const multiDateText = 'Prüfbericht Nr. 1234 vom 10.05.2012. Nachprüfung durchgeführt am 15.06.2023.';
      const parsed = parseDate(multiDateText);
      // Matches the first date (2012) instead of the latest renewal date (2023)
      assert.equal(parsed?.raw, '10.05.2012');
    });
  });

  // =========================================================================
  // FOCUS AREA 5: Quote Verification & Regex Normalization Edge Cases
  // =========================================================================
  describe('Area 5: Quote Verification & Normalization Edge Cases', () => {
    test('TC-T5-QUOTE-01: German umlauts, ligatures, soft hyphens, and dashes normalization', () => {
      assert.equal(normalizeForMatch('ÄÖÜäöüß'), 'äöüäöüß');
      assert.equal(normalizeForMatch('Lö\u00adse\u00admit\u00adtel'), 'lösemittel');
      assert.equal(normalizeForMatch('VOC\u2014Gehalt'), 'vocgehalt');
      assert.equal(normalizeForMatch('ﬁnished'), 'finished'); // ligature fi
      assert.equal(normalizeForMatch('ﬂüssig'), 'flüssig');   // ligature fl
    });

    test('TC-T5-QUOTE-02: Thousand separators vs decimal dots in German texts', () => {
      // "1.000 mg/m³" keeps the dot between digits, and NFKC normalizes superscript ³ to 3 -> "1.000 mg/m3"
      const normalized = normalizeForMatch('1.000 mg/m³');
      assert.equal(normalized, '1.000 mg/m3');
    });

    test('TC-T5-QUOTE-03: valueSupportedByQuote blocks negated claim ("Der blaue Engel fehlt")', () => {
      // Hardened: negation guard blocks positive label attribution when negated
      const negSupport = valueSupportedByQuote('Blauer Engel', 'Der blaue Engel fehlt beim Produkt');
      assert.equal(negSupport, false);
    });

    test('TC-T5-QUOTE-04: verifyQuote handles line-break hyphenation ("Lösemittel-\\nfreies")', () => {
      // Hardened: normalizeForMatch handles line-break hyphenation before collapsing whitespace
      const pages = [
        'Deckblatt Sicherheitsdatenblatt',
        'Abschnitt 9:\nLösemittel-\nfreies Produkt nach VdL-RL01.\nVOC-Gehalt: < 1 g/l.\nKeine SVHC > 0,1 % enthalten.',
      ];

      const res = verifyQuote('Lösemittelfreies Produkt nach VdL-RL01', 'lösemittelfrei', pages);
      assert.equal(res.verification, 'verified');
    });
  });
});

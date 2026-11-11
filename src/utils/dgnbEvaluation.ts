import { ParameterEvaluation, ComplianceEvaluation, QualityLevel } from '../types/dgnb';
import { parseDate } from './parameterRules';

/**
 * Evaluates the age of a VOC test report / certificate against institute requirements (DGNB, AgBB, EMICODE, QNG, BNB).
 * Standard Institute Rules:
 * - <= 5 years old: Fully valid (Quality Level 4 / Pass)
 * - 5 to 10 years old: Warning / Demoted (Requires written manufacturer confirmation of unchanged formulation)
 * - > 10 years old or invalid / future date: Expired KO (Quality Level 1 / Fail)
 * - Missing date: Warning / Demoted (Quality Level 2)
 */
export function evaluateTestDateAge(
  dateStr?: string,
  referenceDate: number | Date = new Date()
): {
  ageYears: number | null;
  achievedLevel: QualityLevel;
  status: 'pass' | 'warning' | 'fail';
  explanation: string;
  needsManualReview?: boolean;
} {
  if (!dateStr || !dateStr.trim() || /\b(kein|keine|fehlt|unbekannt|nicht angegeben)\b/i.test(dateStr)) {
    return {
      ageYears: null,
      achievedLevel: 2,
      status: 'warning',
      explanation:
        'Kein Prüfberichtsdatum für die VOC-Emissionsmessung angegeben. Gemäß Institutsvorgaben (DGNB/AgBB) dürfen Prüfberichte maximal 5 Jahre alt sein (bzw. max. 10 Jahre mit Rezepturbestätigung).',
      needsManualReview: true,
    };
  }

  const parsed = parseDate(dateStr);
  if (!parsed) {
    return {
      ageYears: null,
      achievedLevel: 2,
      status: 'warning',
      explanation: `Das übergebene Prüfdatum "${dateStr}" konnte keinem gültigen Datum zugeordnet werden (Berichtsnummern und Normjahre werden ignoriert). DGNB/AgBB fordern einen gültigen Nachweis ≤ 5 Jahre.`,
      needsManualReview: true,
    };
  }

  const refDate =
    typeof referenceDate === 'number'
      ? new Date(Date.UTC(referenceDate, 11, 31))
      : referenceDate;
  const refYear = typeof referenceDate === 'number' ? referenceDate : referenceDate.getUTCFullYear();
  const testYear = parsed.date.getUTCFullYear();

  // Future date check
  if (
    testYear > refYear ||
    (typeof referenceDate !== 'number' && parsed.precision !== 'year' && parsed.date.getTime() > refDate.getTime() + 86400000)
  ) {
    return {
      ageYears: null,
      achievedLevel: 1,
      status: 'fail',
      explanation: `Ungültiges Prüfdatum "${dateStr}": Das Datum liegt in der Zukunft und kann nicht als gültiger Nachweis gewertet werden.`,
      needsManualReview: true,
    };
  }

  let ageYears: number;
  if (typeof referenceDate === 'number' || parsed.precision === 'year') {
    ageYears = Math.max(0, refYear - testYear);
  } else {
    const diffMs = refDate.getTime() - parsed.date.getTime();
    ageYears = Math.max(0, Math.round((diffMs / (365.25 * 24 * 3600 * 1000)) * 10) / 10);
  }

  const ambiguityHint = parsed.ambiguous
    ? ' Hinweis: Im Text wurden mehrere Jahreszahlen gefunden – bitte Prüfdatum manuell verifizieren.'
    : '';

  if (ageYears <= 5) {
    return {
      ageYears,
      achievedLevel: 4,
      status: parsed.ambiguous ? 'warning' : 'pass',
      explanation: `Gültiger Prüfbericht: Datum "${parsed.raw}" (Alter ca. ${ageYears} Jahr(e)). Erfüllt die DGNB/AgBB/EMICODE 5-Jahres-Frist ohne Einschränkung.${ambiguityHint}`,
      needsManualReview: Boolean(parsed.ambiguous),
    };
  } else if (ageYears <= 10) {
    return {
      ageYears,
      achievedLevel: 2,
      status: 'warning',
      explanation: `Warnung (Prüfbericht > 5 Jahre): Datum "${parsed.raw}" (Alter ca. ${ageYears} Jahre). Laut DGNB/AgBB ist eine schriftliche Herstellererklärung zur unveränderten Rezeptur erforderlich.${ambiguityHint}`,
      needsManualReview: true,
    };
  } else {
    return {
      ageYears,
      achievedLevel: 1,
      status: 'fail',
      explanation: `K.O.-Kriterium (Prüfbericht abgelaufen): Datum "${parsed.raw}" (Alter ca. ${ageYears} Jahre). Prüfberichte älter als 10 Jahre werden von den Instituten als veraltet und ungültig eingestuft.${ambiguityHint}`,
      needsManualReview: Boolean(parsed.ambiguous),
    };
  }
}

/**
 * Evaluates product compliance based on the DGNB Schwachstellen-Prinzip (K.O.-Verfahren)
 * and the mandatory Bauteilekatalog requirement for Quality Levels 3 and 4.
 *
 * Rules applied strictly:
 * 1. The overall quality level is governed by the single parameter that receives the lowest rating.
 * 2. If any parameter misses the requirement for a higher level, it is automatically demoted.
 * 3. For QS 3 and QS 4, a material ecological Bauteilekatalog is strictly required. Without it, max achievable level is QS 2.
 */
export function evaluateDgnbCompliance(
  parameters: ParameterEvaluation[],
  hasBauteilekatalog: boolean
): ComplianceEvaluation {
  if (!parameters || parameters.length === 0) {
    return {
      overallLevel: 1,
      maxChemicalLevel: 1,
      isBauteilekatalogKO: false,
      bottleneckParameter: null,
      bottleneckReason: 'Keine messbaren Prüfparameter übergeben.',
      userExplanation: 'Es konnten keine stofflichen Kennwerte aus den Dokumenten ermittelt werden.',
      evaluatedParameters: [],
      isProvisional: true,
    };
  }

  // Find lowest level among all parameters (Schwachstellen-Prinzip)
  let lowestParamLevel: QualityLevel = 4;
  for (const p of parameters) {
    if (p.achievedLevel < lowestParamLevel) {
      lowestParamLevel = p.achievedLevel;
    }
  }

  // Mark bottleneck parameters and compute honest status
  const evaluatedParameters: ParameterEvaluation[] = parameters.map((p) => {
    const isBottleneck = p.achievedLevel === lowestParamLevel && lowestParamLevel < 4;
    let status: 'pass' | 'warning' | 'fail';
    if (p.achievedLevel >= 3) {
      status = p.needsManualReview ? 'warning' : 'pass';
    } else if (p.achievedLevel === 2) {
      status = 'warning';
    } else {
      status = 'fail';
    }
    return {
      ...p,
      isBottleneck,
      status,
    };
  });

  const isProvisional = evaluatedParameters.some(
    (p) => p.needsManualReview || p.evidence?.verification === 'unverified'
  );

  const bottleneckParam = evaluatedParameters.find((p) => p.achievedLevel === lowestParamLevel) || null;
  const maxChemicalLevel = lowestParamLevel;

  // Check Bauteilekatalog requirement for QS 3 and QS 4
  let overallLevel: QualityLevel = lowestParamLevel;
  let isBauteilekatalogKO = false;
  let bauteilekatalogImpactNote = '';

  if (lowestParamLevel >= 3 && !hasBauteilekatalog) {
    overallLevel = 2; // Demoted to QS 2
    isBauteilekatalogKO = true;
    bauteilekatalogImpactNote =
      'Herabstufung auf Qualitätsstufe 2: Stofflich erfüllt das Produkt zwar Stufe ' +
      lowestParamLevel +
      ', jedoch fehlt der gemäß DGNB ENV1.2 für Stufe 3 und 4 zwingend erforderliche materialökologische Bauteilekatalog nebst Baustellenkontroll-Nachweis.';
  } else if (lowestParamLevel >= 3 && hasBauteilekatalog) {
    bauteilekatalogImpactNote =
      'Annahme für QS 3/4: Materialökologischer Bauteilekatalog bzw. QNG-ready-Nachweisführung wird vorausgesetzt (Standardeinstellung aktiv).';
  }

  // Generate simple, clear German user explanation
  let bottleneckReason = '';
  let userExplanation = '';

  if (overallLevel === 4) {
    bottleneckReason = isProvisional
      ? 'Vorläufig QS 4 – mindestens ein Parameter erfordert noch eine manuelle Prüfung.'
      : 'Kein Engpass – Alle Anforderungen für QS 4 lückenlos erfüllt.';
    userExplanation = isProvisional
      ? 'Vorläufiges Ergebnis: Rechnerisch werden die Anforderungen für Qualitätsstufe 4 erreicht, jedoch sind einzelne Belege oder Zusatzanforderungen als „bitte manuell prüfen“ markiert.'
      : 'Exzellentes Ergebnis: Das Produkt erfüllt in allen geprüften Parametern (VOC, SVHC, Umweltzeichen/Emissionsprüfung) sowie in der Nachweisführung die strengste DGNB-Qualitätsstufe 4. Es darf ohne Einschränkungen für Höchstbewertungen eingesetzt werden.';
  } else if (isBauteilekatalogKO) {
    bottleneckReason = 'Fehlender materialökologischer Bauteilekatalog (K.O.-Kriterium für QS 3 und QS 4)';
    userExplanation =
      'Die chemischen und emissionsbezogenen Grenzwerte erfüllen isoliert die Qualitätsstufe ' +
      maxChemicalLevel +
      '. Gemäß offiziellem DGNB-Regelwerk dürfen die Qualitätsstufen 3 und 4 jedoch ausschließlich dann vergeben werden, wenn ein vollständiger materialökologischer Bauteilekatalog vorliegt. Da dieser Nachweis fehlt, greift die automatische Herabstufung auf Qualitätsstufe 2.';
  } else {
    const paramName = bottleneckParam?.parameterName || 'Ein stofflicher Parameter';
    const paramVal = bottleneckParam?.productValue || 'Gemessener Wert';
    bottleneckReason = `Schwachstelle: "${paramName}" erreicht nur QS ${lowestParamLevel} (${paramVal}).`;
    userExplanation =
      `Das DGNB-Schwachstellenprinzip (K.O.-Verfahren) besagt: Ein Produkt ist immer nur so gut wie sein schwächster Einzelwert. ` +
      `Hier verhindert der Parameter "${paramName}" mit dem Wert "${paramVal}" eine Einstufung in eine höhere Qualitätsstufe. ` +
      `Sobald für diesen Parameter ein Nachweis für die nächsthöhere Stufe erbracht wird, steigt die Gesamtnote.`;
  }

  return {
    overallLevel,
    maxChemicalLevel,
    isBauteilekatalogKO,
    bottleneckParameter: isBauteilekatalogKO ? null : bottleneckParam,
    bottleneckReason,
    userExplanation,
    bauteilekatalogImpactNote,
    evaluatedParameters,
    isProvisional,
  };
}

import { ParameterEvaluation, ComplianceEvaluation, QualityLevel } from '../types/dgnb';

/**
 * Default core authorized auditors always permitted to access the application.
 */
export const CORE_ALLOWED_EMAILS = [
  'brian.lackmann@kaubit.de',
  'brianlackmann@gmail.com',
  'admin@dgnb-qm.de',
  'auditor@bau-qm.org',
  'auditor@kaubit.de',
];

/**
 * Checks whether an email address is authorized according to the whitelist or corporate domain.
 */
export function isEmailAllowed(email: string, allowedEmails: string[] = []): boolean {
  if (!email || typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) return false;

  // Always authorize core auditor accounts
  if (CORE_ALLOWED_EMAILS.some((core) => core.toLowerCase() === normalized)) {
    return true;
  }

  // Authorize Kaubit corporate domain
  if (normalized.endsWith('@kaubit.de')) {
    return true;
  }

  // Check dynamically provided whitelist (from config or ALLOWED_EMAILS)
  return allowedEmails.some((allowed) => {
    if (!allowed || typeof allowed !== 'string') return false;
    const normAllowed = allowed.trim().toLowerCase();
    if (!normAllowed) return false;
    
    // Domain wildcard check (e.g. "@kaubit.de" or "*@kaubit.de")
    if (normAllowed.startsWith('@') || normAllowed.startsWith('*@')) {
      const domain = normAllowed.replace(/^\*?@/, '');
      return normalized.endsWith(`@${domain}`);
    }

    return normAllowed === normalized;
  });
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
    };
  }

  // Find lowest level among all parameters (Schwachstellen-Prinzip)
  let lowestParamLevel: QualityLevel = 4;
  for (const p of parameters) {
    if (p.achievedLevel < lowestParamLevel) {
      lowestParamLevel = p.achievedLevel;
    }
  }

  // Mark bottleneck parameters
  const evaluatedParameters: ParameterEvaluation[] = parameters.map((p) => {
    const isBottleneck = p.achievedLevel === lowestParamLevel && lowestParamLevel < 4;
    return {
      ...p,
      isBottleneck,
      status: p.achievedLevel >= 3 ? 'pass' : p.achievedLevel === 2 ? 'warning' : 'fail',
    };
  });

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
  }

  // Generate simple, clear German user explanation
  let bottleneckReason = '';
  let userExplanation = '';

  if (overallLevel === 4) {
    bottleneckReason = 'Kein Engpass – Alle Anforderungen für QS 4 lückenlos erfüllt.';
    userExplanation =
      'Exzellentes Ergebnis: Das Produkt erfüllt in allen geprüften Parametern (VOC, SVHC, Umweltzeichen/Emissionsprüfung) sowie in der Nachweisführung die strengste DGNB-Qualitätsstufe 4. Es darf ohne Einschränkungen für Höchstbewertungen eingesetzt werden.';
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
  };
}

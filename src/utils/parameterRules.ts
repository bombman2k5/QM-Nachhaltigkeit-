import type { CriteriaRow, QualityLevel } from '../types/dgnb';

/* ------------------------------------------------------------------ */
/* Datum                                                               */
/* ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  januar: 0, jan: 0, january: 0,
  februar: 1, feb: 1, february: 1,
  märz: 2, maerz: 2, mär: 2, mrz: 2, march: 2,
  april: 3, apr: 3,
  mai: 4, may: 4,
  juni: 5, jun: 5, june: 5,
  juli: 6, jul: 6, july: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  oktober: 9, okt: 9, october: 9, oct: 9,
  november: 10, nov: 10,
  dezember: 11, dez: 11, december: 11, dec: 11,
};

export interface ParsedDate {
  date: Date;
  precision: 'day' | 'month' | 'year';
  raw: string;
  /** mehrere unterschiedliche (Jahres-)Angaben im Text gefunden */
  ambiguous?: boolean;
}

function mkDate(y: number, m: number, d: number): Date | null {
  const date = new Date(Date.UTC(y, m, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m || date.getUTCDate() !== d) return null;
  return date;
}

function expandYear(y: number): number {
  if (y >= 100) return y;
  return 2000 + y;
}

/**
 * Parst ein Prüfdatum tagesgenau (DD.MM.YYYY, YYYY-MM-DD, "15. Mai 2023", "Mai 2023", "05/2023")
 * und fällt nur auf ein reines Jahr zurück, wenn nichts Genaueres vorhanden ist.
 * Berichtsnummern ("2019-1234") und Normjahre ("EN 16516:2020") werden dabei ignoriert.
 */
export function parseDate(input: string | undefined | null): ParsedDate | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;

  let hadInvalidDay = false;

  // 1. ISO
  let m = s.match(/\b(19\d\d|20\d\d)-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/);
  if (m) {
    const d = mkDate(+m[1], +m[2] - 1, +m[3]);
    if (d) return { date: d, precision: 'day', raw: m[0] };
    hadInvalidDay = true;
  }

  // 2. DD.MM.YYYY / DD/MM/YYYY / DD.MM.YY
  m = s.match(/\b(0?[1-9]|[12]\d|3[01])[./](0?[1-9]|1[0-2])[./](19\d\d|20\d\d|\d\d)\b/);
  if (m) {
    const d = mkDate(expandYear(+m[3]), +m[2] - 1, +m[1]);
    if (d) return { date: d, precision: 'day', raw: m[0] };
    hadInvalidDay = true;
  }

  // 3. "15. Mai 2023"
  const dm = s.matchAll(/\b(\d{1,2})\.?\s*([A-Za-zäöüÄÖÜ]{3,9})\.?\s*(19\d\d|20\d\d)\b/g);
  for (const x of dm) {
    const mon = MONTHS[x[2].toLowerCase()];
    if (mon !== undefined) {
      const d = mkDate(+x[3], mon, +x[1]);
      if (d) return { date: d, precision: 'day', raw: x[0] };
      hadInvalidDay = true;
    }
  }

  // Do not fall back to month-only matching if a day was specified but failed calendar validation (e.g. 29.02.2023)
  if (hadInvalidDay) {
    return null;
  }

  // 4. "Mai 2023"
  const my = s.matchAll(/\b([A-Za-zäöüÄÖÜ]{3,9})\.?\s+(19\d\d|20\d\d)\b/g);
  for (const x of my) {
    const mon = MONTHS[x[1].toLowerCase()];
    if (mon !== undefined) {
      const d = mkDate(+x[2], mon, 1);
      if (d) return { date: d, precision: 'month', raw: x[0] };
    }
  }

  // 5. "05/2023" oder "05.2023"
  m = s.match(/\b(0?[1-9]|1[0-2])[./](19\d\d|20\d\d)\b/);
  if (m) {
    const d = mkDate(+m[2], +m[1] - 1, 1);
    if (d) return { date: d, precision: 'month', raw: m[0] };
  }

  // 6. nur Jahr – Berichtsnummern und Normjahre vorher entfernen
  const cleaned = s
    .replace(/\b(19|20)\d\d\s*[-/_]\s*\d{2,}\b/g, ' ')
    .replace(/\b\d{2,}\s*[-/_]\s*(19|20)\d\d\b/g, ' ')
    .replace(/[:]\s*(19|20)\d\d\b/g, ' ');
  const years = Array.from(cleaned.matchAll(/\b(19\d\d|20\d\d)\b/g)).map((x) => +x[1]);
  if (years.length > 0) {
    // Konservativ: 1. Januar des Jahres (ältester möglicher Zeitpunkt)
    const d = mkDate(years[0], 0, 1);
    if (d) {
      return { date: d, precision: 'year', raw: String(years[0]), ambiguous: new Set(years).size > 1 };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Zertifikate                                                         */
/* ------------------------------------------------------------------ */

/**
 * Erkennt bekannte Umweltzeichen/Prüfzeichen und liefert kanonische Schlüssel, z. B.
 * "DE-UZ 102", "BLAUER ENGEL", "EC1 PLUS", "EC1", "AGBB", "VDL-RL01", "NATUREPLUS".
 */
export function canonicalCertificates(input: string | string[]): string[] {
  const text = Array.isArray(input) ? input.join(' \n ') : input || '';
  const found = new Set<string>();

  for (const m of text.matchAll(/\bde[\s-]*uz[\s-]*(\d{1,3}[a-z]?)\b/gi)) {
    found.add(`DE-UZ ${m[1].toUpperCase()}`);
  }
  if (/blaue[rnm]?\s+engel/i.test(text)) found.add('BLAUER ENGEL');
  if (/\bec\s?1\s*(plus|\+)/i.test(text)) found.add('EC1 PLUS');
  if (/\bec\s?1(?!\d)(?!\s*(?:plus|\+))/i.test(text)) found.add('EC1');
  if (/\bagbb\b/i.test(text)) found.add('AGBB');
  if (/\bvdl[\s-]*rl[\s-]*0?1\b/i.test(text)) found.add('VDL-RL01');
  if (/\bnatureplus\b/i.test(text)) found.add('NATUREPLUS');
  if (/\beu[\s-]*ecolabel\b/i.test(text)) found.add('EU ECOLABEL');
  for (const m of text.matchAll(/\bgiscode\s+([a-z]{1,3}[\s-]?[a-z0-9]{1,4})\b/gi)) {
    found.add(`GISCODE ${m[1].toUpperCase().replace(/\s+/g, '')}`);
  }
  return Array.from(found).sort();
}

export type CertMatch = 'met' | 'partial' | 'none';

/** OR-Logik: Eines der geforderten Zeichen genügt. "partial" = nur generischer Hinweis (z. B. "Blauer Engel" ohne DE-UZ-Nr.). */
export function matchCertRequirement(required: string[], product: string[]): CertMatch {
  let partial = false;
  for (const r of required) {
    if (r.startsWith('DE-UZ')) {
      if (product.includes(r)) return 'met';
      if (product.includes('BLAUER ENGEL')) partial = true;
    } else if (r === 'BLAUER ENGEL') {
      if (product.some((p) => p === 'BLAUER ENGEL' || p.startsWith('DE-UZ'))) return 'met';
    } else if (r === 'EC1') {
      if (product.includes('EC1') || product.includes('EC1 PLUS')) return 'met';
    } else if (product.includes(r)) {
      return 'met';
    }
  }
  return partial ? 'partial' : 'none';
}

/* ------------------------------------------------------------------ */
/* VOC                                                                 */
/* ------------------------------------------------------------------ */

export type BoundOp = '<' | '<=' | '=';

export interface VocCandidate {
  value: number;
  op: BoundOp;
  raw: string;
  score: number;
}

export interface VocFinding {
  found: boolean;
  value?: number;
  op?: BoundOp;
  raw?: string;
  /** "lösemittelfrei" / "VOC-frei" (negationsbewusst) */
  solventFree: boolean;
  /** mehrere unterschiedliche Kandidaten mit gleicher Relevanz */
  ambiguous: boolean;
  candidates: VocCandidate[];
  /** nur Grenzwerte (Richtlinie) gefunden, kein Produktwert */
  onlyLimitValues: boolean;
  /** VOC nur in anderer Einheit (z. B. %) gefunden – keine automatische Umrechnung */
  unitMismatch: boolean;
}

const VOC_NUM = /(<=|<|≤|≈|ca\.?|max\.?|maximal|bis\s+zu|unter)?\s*(\d+(?:[.,]\d+)?)\s*(g\s*\/\s*l|g\s+pro\s+liter|gramm\s+pro\s+liter)(?![a-zäöü])/gi;
const LIMIT_CONTEXT =
  /(grenzwert|grenzwerte|limit|höchstgehalt|kat(?:egorie|\.)?\s*[a-z]\b|decopaint|2004\/42|anhang\s+ii|gefordert|anforderung|zulässig|vorgabe)/i;

function toOp(prefix: string | undefined): BoundOp {
  const p = (prefix || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (p === '<' || p === 'unter') return '<';
  if (p === '<=' || p === '≤' || p.startsWith('max') || p === 'bis zu') return '<=';
  return '=';
}

/** VOC-Gehalt in g/l aus Freitext/Labelzeilen lesen – Grenzwerte der Richtlinie werden ausgeschlossen. */
export function parseVoc(textInput: string): VocFinding {
  const text = (textInput || '').replace(/(\d)\s*,\s*(\d)/g, '$1.$2');
  const candidates: VocCandidate[] = [];
  const limitCandidates: VocCandidate[] = [];

  let prevEnd = 0;
  for (const m of text.matchAll(VOC_NUM)) {
    const start = m.index ?? 0;
    const ctxStart = Math.max(prevEnd, start - 100);
    const context = text.slice(ctxStart, start);
    const after = text.slice(start + m[0].length, start + m[0].length + 40);
    const value = parseFloat(m[2]);
    prevEnd = start + m[0].length;
    if (!isFinite(value)) continue;

    const lineStart = text.lastIndexOf('\n', start) + 1;
    const linePrefix = text.slice(lineStart, start);

    let score = 0;
    if (/voc|flüchtig|lösemittel|lösungsmittel/i.test(context)) score += 2;
    if (/voc/i.test(after)) score += 1;
    if (/enth[aä]lt|gehalt|beträgt|ermittelt|gemessen/i.test(context)) score += 1;
    if (/^\s*(voc|tvoc)/i.test(linePrefix)) score += 3;

    const cand: VocCandidate = { value, op: toOp(m[1]), raw: m[0].trim(), score };
    if (LIMIT_CONTEXT.test(context)) {
      limitCandidates.push(cand);
    } else {
      candidates.push(cand);
    }
  }

  const lower = text.toLowerCase();
  const solventFree =
    /(?<!nicht\s)(?<!un)(?<!kein\s)(?:lösemittel|lösungsmittel)frei/.test(lower) ||
    /(?<!nicht\s)voc[\s-]?frei/.test(lower) ||
    /(?<!nicht\s)frei\s+von\s+(?:lösemittel|lösungsmittel)/.test(lower);

  let found = false;
  let best: VocCandidate | undefined;
  let ambiguous = false;
  if (candidates.length > 0) {
    const sorted = [...candidates].sort((a, b) => b.score - a.score);
    best = sorted[0];
    found = true;
    const top = sorted.filter((c) => c.score === best!.score);
    ambiguous = top.some((c) => c.value !== best!.value || c.op !== best!.op);
  }

  const unitMismatch =
    !found && /voc[^.\n]{0,60}\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*%[^.\n]{0,40}(?:voc|lösemittel|lösungsmittel)/i.test(text);

  return {
    found,
    value: best?.value,
    op: best?.op,
    raw: best?.raw,
    solventFree,
    ambiguous,
    candidates,
    onlyLimitValues: !found && limitCandidates.length > 0,
    unitMismatch,
  };
}

export function formatVoc(f: VocFinding): string {
  if (f.found && f.value !== undefined) {
    const sym = f.op === '<' ? '< ' : f.op === '<=' ? '≤ ' : '';
    const v = `${sym}${String(f.value).replace('.', ',')} g/l`;
    return f.solventFree ? `${v} (lösemittelfrei)` : v;
  }
  if (f.solventFree) return 'lösemittelfrei';
  return 'Kein Nachweis im Dokument';
}

/* ------------------------------------------------------------------ */
/* Anforderungen aus der Matrixzeile                                   */
/* ------------------------------------------------------------------ */

export interface ParsedRequirement {
  raw: string;
  numeric?: { op: '<' | '<='; value: number };
  /** Zahlenwert, der nur unter einer Bedingung gilt (z. B. "bei werkseitiger Beschichtung alternativ") */
  conditionalNumeric?: { op: '<' | '<='; value: number };
  needsSolventFree: boolean;
  /** weitere Anforderungen, die nicht automatisch prüfbar sind (weichmacher-/konservierungsmittelfrei) */
  hasUncheckableExtras: boolean;
  certs: string[];
  otherUnits: boolean;
  parsable: boolean;
}

const REQ_NUM = /(<=|<|≤|max\.?|bis)?\s*(\d+(?:[.,]\d+)?)\s*g\s*\/\s*l(?![a-zäöü])/i;

function reqNumeric(text: string): { op: '<' | '<='; value: number } | undefined {
  const m = text.match(REQ_NUM);
  if (!m) return undefined;
  const value = parseFloat(m[2].replace(',', '.'));
  if (!isFinite(value)) return undefined;
  return { op: m[1] === '<' ? '<' : '<=', value };
}

export function parseRequirement(textInput: string): ParsedRequirement {
  const raw = textInput || '';
  const condMatch = raw.match(/\(([^)]*(?:alternativ|werkseitig)[^)]*)\)/i);
  const main = condMatch ? raw.replace(condMatch[0], ' ') : raw;

  const numeric = reqNumeric(main);
  const conditionalNumeric = condMatch ? reqNumeric(condMatch[1]) : undefined;
  const needsSolventFree = /(lösemittel|lösungsmittel)frei/i.test(main);
  const hasUncheckableExtras = /weichmacherfrei|konservierungs(?:mittel)?frei|biozid/i.test(main);
  const certs = canonicalCertificates(main);
  const otherUnits = /µg\s*\/\s*m³|mg\s*\/\s*m³|mg\s*\/\s*kg|\bppm\b|%/i.test(main);

  return {
    raw,
    numeric,
    conditionalNumeric,
    needsSolventFree,
    hasUncheckableExtras,
    certs,
    otherUnits,
    parsable: Boolean(numeric || needsSolventFree || certs.length > 0),
  };
}

export type LevelStatus = 'met' | 'not-met' | 'unknown';

export interface LevelCheck {
  level: QualityLevel;
  status: LevelStatus;
  reason: string;
  requirement: string;
}

export interface RowEvaluation {
  achievedLevel: QualityLevel;
  checks: LevelCheck[];
  needsManualReview: boolean;
  reviewReason?: string;
}

function numericMet(voc: VocFinding, req: { op: '<' | '<='; value: number }): boolean {
  const u = voc.value as number;
  const strict = req.op === '<';
  if (voc.op === '<') return u <= req.value; // tatsächlicher Wert < u <= T
  return strict ? u < req.value : u <= req.value;
}

function checkOneLevel(level: QualityLevel, reqText: string, voc: VocFinding, productCerts: string[]): LevelCheck {
  const req = parseRequirement(reqText);
  const base = { level, requirement: reqText };

  if (!req.parsable) {
    return { ...base, status: 'unknown', reason: `Anforderung für QS ${level} nicht automatisch auswertbar („${reqText.slice(0, 80)}“).` };
  }
  if (req.otherUnits && !req.numeric && req.certs.length === 0 && !req.needsSolventFree) {
    return { ...base, status: 'unknown', reason: `Anforderung für QS ${level} betrifft eine andere Messgröße als VOC in g/l.` };
  }

  // Alternativen (ODER): Zahlenwert, lösemittelfrei, Zertifikat
  let metBy: 'numeric' | 'solventFree' | 'cert' | null = null;
  let partialCert = false;

  if (req.numeric && voc.found && voc.value !== undefined && numericMet(voc, req.numeric)) metBy = 'numeric';
  if (!metBy && req.certs.length > 0) {
    const cm = matchCertRequirement(req.certs, productCerts);
    if (cm === 'met') metBy = 'cert';
    else if (cm === 'partial') partialCert = true;
  }
  if (!metBy && req.needsSolventFree && voc.solventFree) metBy = 'solventFree';

  if (metBy === 'solventFree' && req.hasUncheckableExtras && req.certs.length > 0) {
    return {
      ...base,
      status: 'unknown',
      reason: `QS ${level}: „lösemittelfrei“ belegt, Zusatzanforderungen (weichmacher-/konservierungsmittelfrei) bzw. Zeichen ${req.certs.join(' / ')} nicht belegt.`,
    };
  }
  if (metBy) {
    const via = metBy === 'numeric' ? `Wert ${formatVoc(voc)}` : metBy === 'cert' ? 'Zertifikat' : 'lösemittelfrei';
    return { ...base, status: 'met', reason: `QS ${level} erfüllt (${via}).` };
  }
  if (partialCert) {
    return { ...base, status: 'unknown', reason: `QS ${level}: Umweltzeichen genannt, aber ohne eindeutige Nummer (${req.certs.join(' / ')} gefordert).` };
  }
  if (req.conditionalNumeric && voc.found && voc.value !== undefined && numericMet(voc, req.conditionalNumeric)) {
    return { ...base, status: 'unknown', reason: `QS ${level}: Alternativwert gilt nur unter Bedingung (z. B. werkseitige Beschichtung) – bitte prüfen.` };
  }
  if (!voc.found && !voc.solventFree && productCerts.length === 0) {
    return { ...base, status: 'not-met', reason: `QS ${level} nicht belegt: kein VOC-Wert und kein Zeichen im Dokument.` };
  }
  return { ...base, status: 'not-met', reason: `QS ${level} nicht erfüllt (Anforderung: ${reqText.slice(0, 80)}).` };
}

/** Bewertet VOC-bezogene Anforderungen der Matrixzeile für QS 1–4 deterministisch. */
export function evaluateRowLevels(row: CriteriaRow | null, voc: VocFinding, productCerts: string[]): RowEvaluation {
  if (!row) {
    return {
      achievedLevel: 1,
      checks: [],
      needsManualReview: true,
      reviewReason: 'Dem gewählten Standard ist keine Kriterienzeile zugeordnet – bitte manuell prüfen.',
    };
  }
  const levels: [QualityLevel, string][] = [
    [4, row.qs4],
    [3, row.qs3],
    [2, row.qs2],
    [1, row.qs1],
  ];
  const checks = levels.map(([l, t]) => checkOneLevel(l, t || '', voc, productCerts));
  const met = checks.find((c) => c.status === 'met');
  const achievedLevel = (met ? met.level : 1) as QualityLevel;
  const unknownAbove = checks.find((c) => c.status === 'unknown' && c.level > achievedLevel);
  let needsManualReview = Boolean(unknownAbove);
  let reviewReason = unknownAbove?.reason;
  if (voc.ambiguous) {
    needsManualReview = true;
    reviewReason = 'Mehrere unterschiedliche VOC-Werte im Dokument – bitte den maßgeblichen Wert prüfen.';
  }
  return { achievedLevel, checks, needsManualReview, reviewReason };
}

/** Zertifikatsbezogene Anforderungen der Zeile (Stufen ohne Zeichenforderung gelten als erfüllt). */
export function evaluateLabelLevels(row: CriteriaRow | null, productCerts: string[]): RowEvaluation {
  if (!row) {
    return {
      achievedLevel: 1,
      checks: [],
      needsManualReview: true,
      reviewReason: 'Dem gewählten Standard ist keine Kriterienzeile zugeordnet – bitte manuell prüfen.',
    };
  }
  const levels: [QualityLevel, string][] = [
    [4, row.qs4],
    [3, row.qs3],
    [2, row.qs2],
    [1, row.qs1],
  ];
  const checks: LevelCheck[] = levels.map(([l, t]) => {
    const req = parseRequirement(t || '');
    if (req.certs.length === 0) {
      return { level: l, status: 'met', reason: `QS ${l}: kein Zeichen gefordert.`, requirement: t || '' };
    }
    const cm = matchCertRequirement(req.certs, productCerts);
    if (cm === 'met') return { level: l, status: 'met', reason: `QS ${l}: Zeichen nachgewiesen.`, requirement: t || '' };
    if (cm === 'partial') {
      return { level: l, status: 'unknown', reason: `QS ${l}: Zeichen ohne eindeutige Nummer genannt (${req.certs.join(' / ')} gefordert).`, requirement: t || '' };
    }
    return { level: l, status: 'not-met', reason: `QS ${l}: gefordertes Zeichen (${req.certs.join(' / ')}) nicht nachgewiesen.`, requirement: t || '' };
  });
  const met = checks.find((c) => c.status === 'met');
  const achievedLevel = (met ? met.level : 1) as QualityLevel;
  const unknownAbove = checks.find((c) => c.status === 'unknown' && c.level > achievedLevel);
  return {
    achievedLevel,
    checks,
    needsManualReview: Boolean(unknownAbove),
    reviewReason: unknownAbove?.reason,
  };
}

/* ------------------------------------------------------------------ */
/* SVHC                                                                */
/* ------------------------------------------------------------------ */

export type SvhcStatus = 'none' | 'present' | 'unclear' | 'missing';

const SVHC_TERMS = /svhc|besonders\s+besorgniserregend|kandidatenliste|candidate\s+list|very\s+high\s+concern/i;
const SVHC_NEG =
  /\b(keine|kein|keinen|keiner|keines|nicht|ohne|frei\s+von)\b|(?:<=|<|≤|unter|bis)\s*0\.1\b|0\.1\s*%?\s*(?:w\/w)?\s*(?:oder\s+weniger|nicht\s+überschritten)/i;
const SVHC_POS = />\s*0\.1|≥\s*0\.1|mehr\s+als\s+0\.1|über\s+0\.1|oberhalb|enth[aä]lt|enthalten|beinhaltet|vorhanden|gelistet/i;

/**
 * Bewertet die SVHC-Aussage negationsbewusst („keine SVHC > 0,1 %“ ist positiv,
 * „enthält SVHC > 0,1 %“ negativ). Das bloße Wort „REACH“ zählt nicht als Nachweis.
 */
export function evaluateSvhc(textInput: string): { status: SvhcStatus; evidence?: string } {
  const text = (textInput || '').replace(/(\d)\s*,\s*(\d)/g, '$1.$2').replace(/(\d)\.(\d)/g, '$1§$2');
  const clauses = text
    .split(/[.;\n]+/)
    .map((c) => c.replace(/§/g, '.').trim())
    .filter(Boolean);

  const none: string[] = [];
  const present: string[] = [];
  const unclear: string[] = [];

  for (const c of clauses) {
    if (!SVHC_TERMS.test(c)) continue;
    if (SVHC_NEG.test(c)) none.push(c);
    else if (SVHC_POS.test(c)) present.push(c);
    else unclear.push(c);
  }

  // When SDB/text explicitly declares SVHC > 0.1 %, it takes precedence over marketing claims of "SVHC-frei"
  if (present.length > 0) return { status: 'present', evidence: present[0] };
  if (none.length > 0) return { status: 'none', evidence: none[0] };
  if (unclear.length > 0) return { status: 'unclear', evidence: unclear[0] };
  return { status: 'missing' };
}

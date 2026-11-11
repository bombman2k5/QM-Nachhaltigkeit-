import type { Verification } from '../types/dgnb';

/**
 * Normalisiert Text für den robusten Vergleich zwischen KI-Zitat und PDF-Textlayer:
 * Groß-/Kleinschreibung, Silbentrennung/Bindestriche, Anführungszeichen, Dezimalkomma, Satzzeichen, Leerraum.
 */
export function normalizeForMatch(input: string): string {
  return (input || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\u00ad/g, '') // weiches Trennzeichen
    .replace(/[-\u2010-\u2015\u2212]/g, '') // Bindestriche/Gedankenstriche/Silbentrennung
    .replace(/[\u2018\u2019\u201a\u201b\u201c\u201d\u201e"'`´]/g, '')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/(\d),(\d)/g, '$1.$2') // Dezimalkomma
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ') // Punkte nur zwischen Ziffern behalten
    .replace(/[^\p{L}\p{N}<>=.%/ ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function numberTokens(s: string): string[] {
  const m = normalizeForMatch(s).match(/\d+(?:\.\d+)?/g) || [];
  return m.map((d) => String(parseFloat(d)));
}

/** Prüft, ob der extrahierte Wert durch das Zitat gestützt wird. */
export function valueSupportedByQuote(value: string, quote: string): boolean {
  const v = normalizeForMatch(value);
  const q = normalizeForMatch(quote);
  if (!v) return false;
  if (!q) return false;
  if (q.includes(v)) return true;

  const vNums = numberTokens(value);
  if (vNums.length > 0) {
    const qNums = new Set(numberTokens(quote));
    return vNums.every((n) => qNums.has(n));
  }

  // Textwert: mindestens die Hälfte der signifikanten Wörter muss im Zitat vorkommen
  const words = v.split(' ').filter((w) => w.length >= 4);
  if (words.length === 0) return q.includes(v);
  const hits = words.filter((w) => q.includes(w)).length;
  return hits / words.length >= 0.5;
}

function bestFuzzyWindow(quoteTokens: string[], pageTokens: string[]): number {
  const L = quoteTokens.length;
  if (L === 0 || pageTokens.length === 0) return 0;
  const set = new Set(quoteTokens);
  const member = pageTokens.map((t) => (set.has(t) ? 1 : 0));
  const win = Math.min(L, pageTokens.length);
  let sum = 0;
  for (let i = 0; i < win; i++) sum += member[i];
  let best = sum;
  for (let i = win; i < member.length; i++) {
    sum += member[i] - member[i - win];
    if (sum > best) best = sum;
  }
  return best / L;
}

export interface QuoteVerificationResult {
  verification: Verification;
  /** Seite (1-basiert), auf der das Zitat gefunden wurde */
  page?: number;
  reason?: string;
}

/**
 * Prüft serverseitig, ob ein von der KI geliefertes Zitat wirklich im PDF-Textlayer steht
 * und den extrahierten Wert stützt. Die Seitenzahl wird hier bestimmt – nicht vom Modell.
 */
export function verifyQuote(
  quote: string | undefined,
  value: string | undefined,
  pages: string[]
): QuoteVerificationResult {
  const normPages = (pages || []).map(normalizeForMatch);
  if (normPages.length === 0 || normPages.every((p) => p.length === 0)) {
    return { verification: 'no-text-layer', reason: 'PDF enthält keinen auslesbaren Text.' };
  }
  const nq = normalizeForMatch(quote || '');
  if (nq.length < 3) {
    return { verification: 'unverified', reason: 'Kein Zitat geliefert.' };
  }

  const hasNumbersInValue = value ? numberTokens(value).length > 0 : false;

  // 1. exakter Treffer
  for (let i = 0; i < normPages.length; i++) {
    if (normPages[i].includes(nq)) {
      if (value && !valueSupportedByQuote(value, quote || '')) {
        if (hasNumbersInValue) {
          return {
            verification: 'unverified',
            page: i + 1,
            reason: 'Zahlenwert im Feld stimmt nicht mit dem gefundenen PDF-Zitat überein.',
          };
        }
        return {
          verification: 'partial',
          page: i + 1,
          reason: 'Zitat gefunden, stützt den Wert aber nicht vollständig.',
        };
      }
      return { verification: 'verified', page: i + 1 };
    }
  }

  // 2. unscharfer Treffer (Zeilenumbrüche, kleine Abweichungen)
  const qTokens = nq.split(' ').filter(Boolean);
  if (qTokens.length >= 3) {
    let bestRatio = 0;
    let bestPage = -1;
    for (let i = 0; i < normPages.length; i++) {
      const ratio = bestFuzzyWindow(qTokens, normPages[i].split(' ').filter(Boolean));
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestPage = i;
      }
    }
    if (bestRatio >= 0.85 && bestPage >= 0) {
      const supported = !value || valueSupportedByQuote(value, quote || '');
      if (!supported && hasNumbersInValue) {
        return {
          verification: 'unverified',
          page: bestPage + 1,
          reason: 'Zahlenwert im Feld stimmt nicht mit dem PDF-Zitat überein.',
        };
      }
      return {
        verification: 'partial',
        page: bestPage + 1,
        reason: supported
          ? 'Zitat nur sinngemäß im PDF gefunden.'
          : 'Zitat nur sinngemäß gefunden, stützt den Wert nicht vollständig.',
      };
    }
  }

  return { verification: 'unverified', reason: 'Zitat nicht im PDF-Text gefunden.' };
}

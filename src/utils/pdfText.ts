import { extractText, getDocumentProxy } from 'unpdf';

export interface PdfTextResult {
  pages: string[];
  hasTextLayer: boolean;
}

/**
 * Liest den Textlayer eines PDFs seitenweise aus (nur serverseitig verwenden).
 * Liefert hasTextLayer=false für reine Scans/Bild-PDFs oder bei Lesefehlern – dann ist keine
 * automatische Quellenprüfung möglich.
 */
export async function extractPdfPages(base64: string): Promise<PdfTextResult> {
  try {
    const clean = base64.replace(/^data:application\/pdf;base64,/, '').trim();
    const bytes = new Uint8Array(Buffer.from(clean, 'base64'));
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(text) ? text : [String(text)];
    const totalChars = pages.join('').replace(/\s/g, '').length;
    return { pages, hasTextLayer: totalChars >= 50 };
  } catch (err) {
    console.warn('PDF-Textextraktion fehlgeschlagen:', (err as any)?.message || err);
    return { pages: [], hasTextLayer: false };
  }
}

const EXCERPT_KEYWORDS =
  /(voc\b|flüchtige organische|lösemittel|lösungsmittel|g\/l|svhc|kandidatenliste|besonders besorgniserregend|prüfdatum|prüfbericht|datum der prüfung|ausgestellt|emicode|ec1|blauer engel|de-uz|agbb|giscode|natureplus)/i;

/**
 * Wörtliche Textauszüge aus dem PDF (keine Modellzusammenfassung), damit Dokumentation
 * und Gutachten nur echten Dokumenttext enthalten.
 */
export function buildExcerpts(pages: string[], maxExcerpts = 8, maxLen = 400): { page: number; text: string }[] {
  const out: { page: number; text: string }[] = [];
  const seen = new Set<string>();
  for (let p = 0; p < pages.length && out.length < maxExcerpts; p++) {
    const flat = pages[p].replace(/\s+/g, ' ');
    const sentences = flat.split(/(?<=[.;:])\s+/);
    for (const s of sentences) {
      if (out.length >= maxExcerpts) break;
      if (s.length < 15 || !EXCERPT_KEYWORDS.test(s)) continue;
      const text = s.length > maxLen ? s.slice(0, maxLen) + ' …' : s;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ page: p + 1, text });
    }
  }
  return out;
}

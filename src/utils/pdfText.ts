import { extractText, getDocumentProxy } from 'unpdf';

export interface PdfTextResult {
  pages: string[];
  hasTextLayer: boolean;
}

/**
 * Standard PDF 1.x magic bytes "%PDF-" (0x25 0x50 0x44 0x46 0x2D)
 */
export const PDF_MAGIC_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);

/**
 * Checks whether the buffer begins with the PDF magic bytes "%PDF-" (0x25 0x50 0x44 0x46 0x2D).
 */
export function hasPdfMagicBytes(buffer: Uint8Array | Buffer): boolean {
  if (!buffer || buffer.length < 5) return false;
  return (
    buffer[0] === 0x25 && // %
    buffer[1] === 0x50 && // P
    buffer[2] === 0x44 && // D
    buffer[3] === 0x46 && // F
    buffer[4] === 0x2d    // -
  );
}

/**
 * Safely converts an input (base64 string, Buffer, or Uint8Array) to a Uint8Array.
 * Returns null if the input is empty or invalid base64.
 */
export function toPdfBytes(input: string | Buffer | Uint8Array): Uint8Array | null {
  if (!input) return null;
  if (typeof input === 'string') {
    const clean = input.replace(/^data:application\/pdf;base64,/i, '').trim();
    if (!clean) return null;
    try {
      const buf = Buffer.from(clean, 'base64');
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch {
      return null;
    }
  }
  if (Buffer.isBuffer(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  if (input instanceof Uint8Array) {
    return input;
  }
  return null;
}

/**
 * Liest den Textlayer eines PDFs seitenweise aus (nur serverseitig verwenden).
 * Liefert hasTextLayer=false für reine Scans/Bild-PDFs, ungültige/beschädigte Dateien oder bei Lesefehlern – dann ist keine
 * automatische Quellenprüfung möglich.
 */
export async function extractPdfPages(input: string | Buffer | Uint8Array): Promise<PdfTextResult> {
  try {
    const bytes = toPdfBytes(input);
    if (!bytes || bytes.length < 5 || !hasPdfMagicBytes(bytes)) {
      return { pages: [], hasTextLayer: false };
    }
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

/**
 * Convenience function to extract all text as a single string.
 */
export async function extractPdfText(input: string | Buffer | Uint8Array): Promise<string> {
  const { pages } = await extractPdfPages(input);
  return pages.join('\n');
}

export const extractPages = extractPdfPages;

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

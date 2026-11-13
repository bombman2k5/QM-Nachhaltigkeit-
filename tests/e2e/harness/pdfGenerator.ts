/**
 * Pure-buffer in-memory PDF 1.4 generator for E2E tests
 * Zero external dependencies; generates standard-compliant PDFs and adversarial variations.
 */

export interface SyntheticPdfOptions {
  lines?: string[];
  magicBytes?: string;
  corruptStream?: boolean;
  corruptTrailer?: boolean;
  corruptXref?: boolean;
  emptyTextLayer?: boolean;
  paddingBytes?: number;
}

export interface SyntheticPdfResult {
  buffer: Buffer;
  base64: string;
}

export function createSyntheticPdf(options: SyntheticPdfOptions = {}): SyntheticPdfResult {
  const magic = options.magicBytes ?? '%PDF-1.4';

  if (options.emptyTextLayer) {
    // Valid PDF structure with 0 text characters (simulates a scanned document)
    const emptyPdf =
      `${magic}\n` +
      `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n` +
      `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n` +
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n` +
      `xref\n0 4\n` +
      `0000000000 65535 f \r\n` +
      `0000000009 00000 n \r\n` +
      `0000000058 00000 n \r\n` +
      `0000000115 00000 n \r\n` +
      `trailer\n<< /Size 4 /Root 1 0 R >>\n` +
      `startxref\n200\n%%EOF\n`;
    const buf = Buffer.from(emptyPdf, 'latin1');
    return { buffer: buf, base64: buf.toString('base64') };
  }

  const lines = options.lines && options.lines.length > 0
    ? options.lines
    : ['Standard Test Dokument fuer QM-Nachhaltigkeit', 'Keine Gefahrstoffe nach GHS'];

  const contentStream = options.corruptStream
    ? 'BT /F1 12 Tf 50 750 Td (CORRUPTED_STREAM_WITHOUT_TERMINATION'
    : [
        'BT',
        '/F1 12 Tf',
        '50 750 Td',
        '16 TL',
        ...lines.map(
          (l) => `(${l.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')}) '`
        ),
        'ET',
      ].join('\n');

  const streamLen = Buffer.byteLength(contentStream, 'latin1');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj',
    `4 0 obj\n<< /Length ${streamLen} >>\nstream\n${contentStream}\nendstream\nendobj`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj',
  ];

  let offset = magic.length + 1;
  const xrefEntries = ['0000000000 65535 f \r\n'];
  let body = magic + '\n';
  for (const obj of objects) {
    const pad = options.corruptXref ? '9999999999' : String(offset).padStart(10, '0');
    xrefEntries.push(`${pad} 00000 n \r\n`);
    body += obj + '\n';
    offset += Buffer.byteLength(obj, 'latin1') + 1;
  }

  const startxref = offset;
  const trailer = options.corruptTrailer
    ? 'trailer\n<< /InvalidTrailerWithoutRoot >>\nstartxref\n10\n%%EOF\n'
    : `trailer\n<< /Size ${xrefEntries.length} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  let fullPdf = body + `xref\n0 ${xrefEntries.length}\n${xrefEntries.join('')}` + trailer;

  if (options.paddingBytes && options.paddingBytes > 0) {
    const padding = '\n% ' + 'A'.repeat(options.paddingBytes - 4) + '\n';
    fullPdf += padding;
  }

  const buf = Buffer.from(fullPdf, 'latin1');
  return { buffer: buf, base64: buf.toString('base64') };
}

export function createValidSdbPdf(overrides?: {
  productName?: string;
  manufacturer?: string;
  voc?: string;
  svhc?: string;
}): SyntheticPdfResult {
  const prod = overrides?.productName || 'Bona Quantum T';
  const mfr = overrides?.manufacturer || 'Bona GmbH';
  const voc = overrides?.voc || 'VOC-Gehalt: 0 g/l (loesemittelfrei nach TRGS 610)';
  const svhc = overrides?.svhc || 'Keine besonders besorgniserregenden Stoffe (SVHC) gemaess REACH-Kandidatenliste > 0,1 % w/w.';

  return createSyntheticPdf({
    lines: [
      `Sicherheitsdatenblatt gemaess Verordnung (EG) Nr. 1907/2006 (REACH)`,
      `Abschnitt 1: Bezeichnung des Stoffs bzw. Gemischs`,
      `Handelsname: ${prod}`,
      `Hersteller / Lieferant: ${mfr}`,
      `Abschnitt 2: Moegliche Gefahren`,
      `Einstufung gemaess Verordnung (EG) Nr. 1272/2008 (CLP): Nicht als gefaehrlich eingestuft.`,
      `Abschnitt 3: Zusammensetzung / Angaben zu Bestandteilen`,
      `Gefaehrliche Inhaltsstoffe: Keine. ${svhc}`,
      `Abschnitt 9: Physikalische und chemische Eigenschaften`,
      `Loesemittelgehalt: 0 %`,
      `${voc}`,
      `Abschnitt 15: Rechtsvorschriften`,
      `Wassergefaehrdungsklasse: WGK 1`,
    ],
  });
}

export function createValidTmPdf(overrides?: {
  productName?: string;
  giscode?: string;
  emicode?: string;
  voc?: string;
  applicationArea?: string;
}): SyntheticPdfResult {
  const prod = overrides?.productName || 'Bona Quantum T';
  const gis = overrides?.giscode || 'GISCODE RS10 (Verlegewerkstoffe methoxysilanbasiert)';
  const emi = overrides?.emicode || 'GEV-EMICODE EC1 PLUS sehr emissionsarm';
  const voc = overrides?.voc || 'Gemessener VOC-Gehalt: < 1 g/l';
  const app = overrides?.applicationArea || 'Anwendungsbereich: 1-K-Silan-Parkettklebstoff unter Parkett- und Holzfussboeden.';

  return createSyntheticPdf({
    lines: [
      `Technisches Merkblatt (TM) / Technisches Datenblatt`,
      `Produkt: ${prod}`,
      `${app}`,
      `Technische Eigenschaften:`,
      `- Kennzeichnung nach GefStoffV: Kennzeichnungsfrei`,
      `- ${gis}`,
      `- ${emi}`,
      `- ${voc}`,
      `- Loesemittelfrei und wasserfrei gemaess TRGS 610`,
      `- Enthalt keine SVHC-Stoffe nach REACH Kandidatenliste`,
      `Verarbeitungshinweise: Gebrauchsfertig, mit Zahnspachtel auftragen.`,
    ],
  });
}

export function createValidPruefberichtPdf(overrides?: {
  productName?: string;
  testDate?: string;
  standard?: string;
  result?: string;
}): SyntheticPdfResult {
  const prod = overrides?.productName || 'Bona Quantum T';
  const date = overrides?.testDate || '20.09.2023';
  const std = overrides?.standard || 'DIN EN 16516 / AgBB-Bewertungsschema';
  const res = overrides?.result || 'TVOC nach 28 Tagen < 60 ug/m3. Erfuellt EMICODE EC1 PLUS.';

  return createSyntheticPdf({
    lines: [
      `Emissionspruefbericht gemaess ${std}`,
      `Pruefbericht-Nr.: EP-2023-8472`,
      `Pruefinstitut: eco-INSTITUT Koeln GmbH`,
      `Pruefdatum: ${date}`,
      `Pruefgegenstand: ${prod}`,
      `Pruefergebnisse nach 28 Tagen Kammermessung:`,
      `- ${res}`,
      `- Karzinogene K1A und K1B nach 28 Tagen nicht nachweisbar (< 1 ug/m3)`,
      `- VOC-Emissionsklasse: A+`,
    ],
  });
}

export function createScannedPdf(): SyntheticPdfResult {
  return createSyntheticPdf({ emptyTextLayer: true });
}

export function createCorruptedMagicBytesPdf(): SyntheticPdfResult {
  return createSyntheticPdf({ magicBytes: '%NOTPDF-1.0' });
}

export function createHtmlMasqueradingAsPdf(): SyntheticPdfResult {
  const html = '<!DOCTYPE html><html><head><title>Fake PDF</title></head><body>%PDF-1.4 inside body</body></html>';
  const buf = Buffer.from(html, 'utf-8');
  return { buffer: buf, base64: buf.toString('base64') };
}

export function createPlainTextMasqueradingAsPdf(): SyntheticPdfResult {
  const text = 'This is a plain UTF-8 text file pretending to have a .pdf extension.';
  const buf = Buffer.from(text, 'utf-8');
  return { buffer: buf, base64: buf.toString('base64') };
}

export function createTruncatedHeaderPdf(): SyntheticPdfResult {
  return createSyntheticPdf({ magicBytes: '%PD' });
}

export function createCorruptedStreamPdf(): SyntheticPdfResult {
  return createSyntheticPdf({ corruptStream: true });
}

export function createCorruptedXrefPdf(): SyntheticPdfResult {
  return createSyntheticPdf({ corruptXref: true });
}

export function createOversizedPdf(sizeMb = 21): SyntheticPdfResult {
  // 1MB = 1024 * 1024 bytes
  const targetBytes = Math.ceil(sizeMb * 1024 * 1024);
  const basePdf = createSyntheticPdf({ lines: ['Oversized PDF Test'] });
  const neededPadding = Math.max(0, targetBytes - basePdf.buffer.length);
  return createSyntheticPdf({
    lines: ['Oversized PDF Test Payload'],
    paddingBytes: neededPadding,
  });
}

export function createZeroBytePdf(): SyntheticPdfResult {
  const buf = Buffer.alloc(0);
  return { buffer: buf, base64: '' };
}

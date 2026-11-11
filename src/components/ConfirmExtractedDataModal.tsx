import React, { useState } from 'react';
import { CriteriaRow, ExtractedDocumentData } from '../types/dgnb';
import { evaluateTestDateAge } from '../utils/dgnbEvaluation';
import {
  ShieldCheck,
  FileText,
  AlertCircle,
  Quote,
  Check,
  X,
  ExternalLink,
  Layers,
  Sparkles,
  Calendar,
  Clock,
} from 'lucide-react';

interface ConfirmExtractedDataModalProps {
  isOpen: boolean;
  data: ExtractedDocumentData | null;
  criteriaRows: CriteriaRow[];
  onConfirm: (confirmedData: {
    productName: string;
    manufacturer: string;
    criteriaRowNr: string;
    vocContent: string;
    vocTestDate: string;
    svhcStatus: string;
    certificates: string[];
    hasBauteilekatalog: boolean;
    summarySnippet: string;
    documentType: 'sdb' | 'pruefbericht' | 'allgemein';
  }) => void;
  onCancel: () => void;
}

export const ConfirmExtractedDataModal: React.FC<ConfirmExtractedDataModalProps> = ({
  isOpen,
  data,
  criteriaRows,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen || !data) return null;

  const [productName, setProductName] = useState(data.productName || '');
  const [manufacturer, setManufacturer] = useState(data.manufacturer || '');
  const [criteriaRowNr, setCriteriaRowNr] = useState(data.suggestedCriteriaNr || '1');
  const [vocContent, setVocContent] = useState(data.vocContent || '');
  const [vocTestDate, setVocTestDate] = useState(data.vocTestDate || '');
  const [svhcStatus, setSvhcStatus] = useState(data.svhcStatus || '');
  const [certificates, setCertificates] = useState<string[]>(data.certificates || []);
  const [certificateInput, setCertificateInput] = useState('');
  const [hasBauteilekatalog, setHasBauteilekatalog] = useState<boolean>(
    data.hasBauteilekatalog ?? true
  );
  const [summarySnippet, setSummarySnippet] = useState(data.summarySnippet || '');

  const handleAddCertificate = () => {
    if (certificateInput.trim()) {
      setCertificates([...certificates, certificateInput.trim()]);
      setCertificateInput('');
    }
  };

  const handleRemoveCertificate = (index: number) => {
    setCertificates(certificates.filter((_, i) => i !== index));
  };

  const handleApply = () => {
    onConfirm({
      productName: productName.trim(),
      manufacturer: manufacturer.trim(),
      criteriaRowNr,
      vocContent: vocContent.trim(),
      vocTestDate: vocTestDate.trim(),
      svhcStatus: svhcStatus.trim(),
      certificates,
      hasBauteilekatalog,
      summarySnippet: summarySnippet.trim(),
      documentType: data.documentType,
    });
  };

  const testAgeEval = evaluateTestDateAge(vocTestDate);

  const getQuoteForField = (fieldName: string) => {
    return data.fieldQuotes?.find((q) => q.field === fieldName);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-emerald-700 text-white p-5 flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/60 flex items-center justify-center border border-emerald-400/40">
              <Sparkles className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-800 text-emerald-200 border border-emerald-500/30">
                  {data.documentType === 'sdb'
                    ? 'Sicherheitsdatenblatt (SDB)'
                    : data.documentType === 'pruefbericht'
                    ? 'Labor-Prüfbericht / Zertifikat'
                    : 'Dokumenten-Scan'}
                </span>
                <span className="text-xs text-emerald-200 truncate max-w-xs font-mono">
                  {data.filename}
                </span>
              </div>
              <h2 className="text-lg font-bold text-white mt-1">
                KI-ausgelesene Daten prüfen & bestätigen
              </h2>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-emerald-800/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info Banner */}
        <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-3 flex items-center space-x-2.5 text-xs text-emerald-900">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            <strong>Revisionssichere Übernahme:</strong> Bitte kontrollieren Sie die extrahierten Kennwerte anhand der Fundstellen aus dem PDF, bevor Sie diese in das Prüfformular übernehmen.
          </span>
        </div>

        {/* Modal Content / Form */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* Grid: Product & Manufacturer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  Erkannter Produktname
                </label>
                {getQuoteForField('productName') && (
                  <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-100/70 px-1.5 py-0.5 rounded">
                    Im PDF gefunden
                  </span>
                )}
              </div>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Produktbezeichnung..."
              />
              {getQuoteForField('productName')?.quote && (
                <div className="flex items-start space-x-1.5 text-[11px] text-slate-500 pt-1 italic">
                  <Quote className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                  <span>„{getQuoteForField('productName')?.quote}“</span>
                </div>
              )}
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  Erkannter Hersteller / Lieferant
                </label>
                {getQuoteForField('manufacturer') && (
                  <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-100/70 px-1.5 py-0.5 rounded">
                    Im PDF gefunden
                  </span>
                )}
              </div>
              <input
                type="text"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Herstellername..."
              />
              {getQuoteForField('manufacturer')?.quote && (
                <div className="flex items-start space-x-1.5 text-[11px] text-slate-500 pt-1 italic">
                  <Quote className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                  <span>„{getQuoteForField('manufacturer')?.quote}“</span>
                </div>
              )}
            </div>
          </div>

          {/* Suggested DGNB Matrix Row */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                Zugeordnete DGNB ENV1.2 Bauteilgruppe
              </label>
              <span className="text-[11px] text-slate-500">
                Empfehlung basierend auf dem Verwendungszweck im Dokument
              </span>
            </div>
            <select
              value={criteriaRowNr}
              onChange={(e) => setCriteriaRowNr(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {criteriaRows.map((row) => (
                <option key={row.id} value={row.nr}>
                  Nr. {row.nr}: {row.bauteil} ({row.betrachteteStoffe})
                </option>
              ))}
            </select>
          </div>

          {/* Environmental Parameters: VOC, Test Date & SVHC */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* VOC Content */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  Ermittelter VOC-Gehalt
                </label>
                <span className="text-[10px] text-slate-400 font-mono">
                  {getQuoteForField('vocContent')?.pageOrSection || 'Abschnitt 9/15'}
                </span>
              </div>
              <input
                type="text"
                value={vocContent}
                onChange={(e) => setVocContent(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="z.B. < 1 g/l oder 28 g/l..."
              />
              {getQuoteForField('vocContent')?.quote && (
                <div className="flex items-start space-x-1.5 text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-200">
                  <Quote className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-800 text-[10px]">Belegfundstelle:</strong>{' '}
                    <span>„{getQuoteForField('vocContent')?.quote}“</span>
                  </div>
                </div>
              )}
            </div>

            {/* VOC Test Report Date */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center space-x-1">
                  <Calendar className="w-3.5 h-3.5 text-emerald-700 inline" />
                  <span>Prüfdatum (VOC)</span>
                </label>
                <span className="text-[10px] text-slate-400 font-mono">
                  {getQuoteForField('vocTestDate')?.pageOrSection || 'Laborbericht'}
                </span>
              </div>
              <input
                type="text"
                value={vocTestDate}
                onChange={(e) => setVocTestDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="z.B. 15.05.2023 oder 2023..."
              />

              {/* Live Institute Age Check Indicator */}
              <div className="pt-0.5">
                {testAgeEval.status === 'pass' ? (
                  <span className="inline-flex items-center space-x-1 text-[10px] font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-300">
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>Gültig (&le; 5 Jahre, DGNB/AgBB)</span>
                  </span>
                ) : testAgeEval.status === 'warning' ? (
                  <span className="inline-flex items-center space-x-1 text-[10px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md border border-amber-300">
                    <AlertCircle className="w-3 h-3 text-amber-600" />
                    <span>&gt; 5 Jahre (Rezeptur-Bestätigung nötig)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1 text-[10px] font-bold text-rose-800 bg-rose-100/80 px-2 py-0.5 rounded-md border border-rose-300">
                    <AlertCircle className="w-3 h-3 text-rose-600" />
                    <span>&gt; 10 Jahre / Abgelaufen</span>
                  </span>
                )}
              </div>

              {getQuoteForField('vocTestDate')?.quote && (
                <div className="flex items-start space-x-1.5 text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-200">
                  <Quote className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-800 text-[10px]">Belegfundstelle:</strong>{' '}
                    <span>„{getQuoteForField('vocTestDate')?.quote}“</span>
                  </div>
                </div>
              )}
            </div>

            {/* SVHC Status */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  REACH SVHC Status (≤ 0,1 % w/w)
                </label>
                <span className="text-[10px] text-slate-400 font-mono">
                  {getQuoteForField('svhcStatus')?.pageOrSection || 'Abschnitt 3/15'}
                </span>
              </div>
              <input
                type="text"
                value={svhcStatus}
                onChange={(e) => setSvhcStatus(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="z.B. Keine SVHC > 0,1 % w/w enthalten..."
              />
              {getQuoteForField('svhcStatus')?.quote && (
                <div className="flex items-start space-x-1.5 text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-200">
                  <Quote className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-800 text-[10px]">Belegfundstelle:</strong>{' '}
                    <span>„{getQuoteForField('svhcStatus')?.quote}“</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Certificates & Labels */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                Erkannte Umweltzeichen & Prüfzertifikate
              </label>
              <span className="text-[10px] text-slate-500">
                z. B. Blauer Engel, EMICODE EC1 PLUS, AgBB, GISCODE
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {certificates.map((cert, index) => (
                <span
                  key={index}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 bg-white rounded-lg border border-slate-300 text-xs text-slate-800 font-medium shadow-2xs"
                >
                  <span>{cert}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCertificate(index)}
                    className="text-slate-400 hover:text-rose-600 ml-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {certificates.length === 0 && (
                <span className="text-slate-400 text-xs italic">
                  Keine Umweltzeichen im Dokument explizit genannt.
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <input
                type="text"
                value={certificateInput}
                onChange={(e) => setCertificateInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCertificate();
                  }
                }}
                placeholder="Weiteres Zertifikat ergänzen (z.B. EMICODE EC1 PLUS)..."
                className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={handleAddCertificate}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold"
              >
                Hinzufügen
              </button>
            </div>
          </div>

          {/* Bauteilekatalog Checkbox */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-start space-x-3">
            <input
              id="modal-bauteilkatalog-cb"
              type="checkbox"
              checked={hasBauteilekatalog}
              onChange={(e) => setHasBauteilekatalog(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
            />
            <div>
              <label
                htmlFor="modal-bauteilkatalog-cb"
                className="font-bold text-slate-900 cursor-pointer text-xs"
              >
                Materialökologischer Bauteilekatalog & Bauüberwachungsnachweis vorhanden
              </label>
              <p className="text-slate-500 text-[11px] mt-0.5">
                Für Qualitätsstufe 3 und 4 ist laut DGNB- und BNB-Regelwerk zwingend ein Bauteilekatalog nebst baustellenbezogenem Nachweis vorgeschrieben (K.O.-Kriterium).
              </p>
            </div>
          </div>

          {/* Extracted text snippet */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                Relevante Textpassagen für das Prüfgutachten (Dokumentation)
              </label>
              <span className="text-[10px] text-slate-400">Wird in das Prüfformular übernommen</span>
            </div>
            <textarea
              rows={4}
              value={summarySnippet}
              onChange={(e) => setSummarySnippet(e.target.value)}
              className="w-full p-2.5 font-mono text-[11px] bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
              placeholder="Wortlaut aus dem Dokument..."
            />
          </div>
        </div>

        {/* Modal Footer / Actions */}
        <div className="bg-slate-100 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-slate-300 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Abbrechen / Manuell erfassen
          </button>

          <button
            type="button"
            onClick={handleApply}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center space-x-2 shadow-xs transition-all cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Werte bestätigen & ins Formular übernehmen</span>
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useRef } from 'react';
import { CriteriaRow, ExtractedDocumentData, ProductEvaluationResult, SustainabilityStandard } from '../types/dgnb';
import { safeFetchJson } from '../utils/safeFetch';
import { ConfirmExtractedDataModal } from './ConfirmExtractedDataModal';
import {
  FileText,
  Sparkles,
  ArrowRight,
  CheckSquare,
  Square,
  UploadCloud,
  FileCheck2,
  Trash2,
  AlertCircle,
  ShieldCheck,
  Check,
  Zap,
  Info,
} from 'lucide-react';

interface Step2ProductUploadProps {
  standards: SustainabilityStandard[];
  onAnalysisComplete: (result: ProductEvaluationResult) => void;
  projectName: string;
  userEmail: string;
}

export const Step2ProductUpload: React.FC<Step2ProductUploadProps> = ({
  standards,
  onAnalysisComplete,
  projectName,
  userEmail,
}) => {
  // Form state - starts clean without pre-filled mock/demo data
  const [productName, setProductName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [selectedRowNr, setSelectedRowNr] = useState('1');
  const [hasBauteilekatalog, setHasBauteilekatalog] = useState(true);

  // Selective Standards Toggle (DGNB, QNG, BNB active by default)
  const [selectedStandards, setSelectedStandards] = useState<string[]>(['DGNB', 'QNG', 'BNB']);

  const [sdbText, setSdbText] = useState('');
  const [testReportText, setTestReportText] = useState('');

  // Uploaded PDF files tracking
  const [sdbFile, setSdbFile] = useState<{ name: string; size: number } | null>(null);
  const [testReportFile, setTestReportFile] = useState<{ name: string; size: number } | null>(null);

  // Loading states
  const [isScanningSdb, setIsScanningSdb] = useState(false);
  const [isScanningTestReport, setIsScanningTestReport] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmationNotice, setConfirmationNotice] = useState<string | null>(null);

  // Modal review state for AI extraction
  const [pendingExtraction, setPendingExtraction] = useState<ExtractedDocumentData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Hidden file inputs
  const sdbInputRef = useRef<HTMLInputElement>(null);
  const testReportInputRef = useRef<HTMLInputElement>(null);

  // Drag states
  const [isDraggingSdb, setIsDraggingSdb] = useState(false);
  const [isDraggingReport, setIsDraggingReport] = useState(false);

  const toggleStandard = (code: string) => {
    setSelectedStandards((prev) => {
      if (prev.includes(code)) {
        if (prev.length === 1) return prev; // Keep at least one standard active
        return prev.filter((c) => c !== code);
      } else {
        return [...prev, code];
      }
    });
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const handleDocumentScan = async (file: File, documentType: 'sdb' | 'pruefbericht') => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setErrorMessage('Bitte laden Sie eine gültige PDF-Datei hoch.');
      return;
    }

    if (file.size > 35 * 1024 * 1024) {
      setErrorMessage('Die Datei ist zu groß (maximal 35 MB zulässig).');
      return;
    }

    if (documentType === 'sdb') {
      setIsScanningSdb(true);
      setSdbFile({ name: file.name, size: file.size });
    } else {
      setIsScanningTestReport(true);
      setTestReportFile({ name: file.name, size: file.size });
    }
    setErrorMessage(null);

    try {
      const base64Data = await readFileAsBase64(file);

      const res = await safeFetchJson<{
        success: boolean;
        extracted?: ExtractedDocumentData;
        message?: string;
      }>('/api/documents/parse-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfBase64: base64Data,
          documentType,
          filename: file.name,
        }),
      });

      if (!res.ok || !res.data || !res.data.success || !res.data.extracted) {
        throw new Error(res.error || res.data?.message || 'Fehler beim KI-Scan des Dokuments.');
      }

      // Open interactive review modal so the user confirms or adjusts extracted values
      setPendingExtraction(res.data.extracted);
      setIsModalOpen(true);
    } catch (err: any) {
      setErrorMessage('Fehler bei der Dokumentenanalyse: ' + (err.message || String(err)));
    } finally {
      setIsScanningSdb(false);
      setIsScanningTestReport(false);
    }
  };

  const handleConfirmExtraction = (confirmed: {
    productName: string;
    manufacturer: string;
    criteriaRowNr: string;
    vocContent: string;
    svhcStatus: string;
    certificates: string[];
    hasBauteilekatalog: boolean;
    summarySnippet: string;
    documentType: 'sdb' | 'pruefbericht' | 'allgemein';
  }) => {
    // Populate form fields with user-confirmed values
    if (confirmed.productName) setProductName(confirmed.productName);
    if (confirmed.manufacturer) setManufacturer(confirmed.manufacturer);
    if (confirmed.criteriaRowNr) setSelectedRowNr(confirmed.criteriaRowNr);
    setHasBauteilekatalog(confirmed.hasBauteilekatalog);

    if (confirmed.documentType === 'sdb') {
      const formattedSdb = [
        `PRODUKT: ${confirmed.productName} (${confirmed.manufacturer})`,
        `VOC-GEHALT: ${confirmed.vocContent}`,
        `REACH SVHC: ${confirmed.svhcStatus}`,
        confirmed.certificates.length > 0 ? `ZERTIFIKATE: ${confirmed.certificates.join(', ')}` : '',
        '',
        `AUSZUG SICHERHEITSDATENBLATT:`,
        confirmed.summarySnippet,
      ]
        .filter(Boolean)
        .join('\n');
      setSdbText(formattedSdb);
    } else {
      const formattedReport = [
        `PRÜFBERICHT / ZERTIFIKATE:`,
        confirmed.certificates.length > 0 ? `NACHGEWIESENE ZEICHEN: ${confirmed.certificates.join(' · ')}` : '',
        `VOC-MESSUNG: ${confirmed.vocContent}`,
        `SCHADSTOFF-BEWERTUNG: ${confirmed.svhcStatus}`,
        '',
        `PRÜFSTELLEN-AUSZUG:`,
        confirmed.summarySnippet,
      ]
        .filter(Boolean)
        .join('\n');
      setTestReportText(formattedReport);
    }

    setConfirmationNotice(
      `Relevante Daten aus "${pendingExtraction?.filename || 'PDF'}" wurden von Ihnen erfolgreich geprüft und übernommen.`
    );
    setIsModalOpen(false);
    setPendingExtraction(null);
  };

  const handleRunEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!productName.trim()) {
      setErrorMessage('Bitte geben Sie einen Produktnamen ein oder laden Sie ein Sicherheitsdatenblatt hoch.');
      return;
    }

    if (!sdbText.trim() && !testReportText.trim()) {
      setErrorMessage('Bitte laden Sie mindestens ein Sicherheitsdatenblatt oder einen Prüfbericht hoch.');
      return;
    }

    if (selectedStandards.length === 0) {
      setErrorMessage('Bitte wählen Sie mindestens ein Nachhaltigkeitssystem für die Prüfung aus.');
      return;
    }

    setIsEvaluating(true);
    setErrorMessage(null);

    const activeStandardsPayload = standards
      .filter((s) => selectedStandards.includes(s.code))
      .map((s) => ({
        code: s.code,
        name: s.name,
        institute: s.institute,
        ratingSystemType: s.ratingSystemType,
        criteriaRows: s.criteriaRows,
      }));

    try {
      const res = await safeFetchJson<{
        success: boolean;
        message?: string;
        result: ProductEvaluationResult;
      }>('/api/standards/analyze-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName,
          manufacturer,
          criteriaRowNr: selectedRowNr,
          sdbText,
          testReportText,
          hasBauteilekatalog,
          projectTitle: projectName,
          userEmail: userEmail || 'auditor@bau-qm.org',
          selectedStandardCodes: selectedStandards,
          standards: activeStandardsPayload,
        }),
      });

      if (!res.ok || !res.data || !res.data.success) {
        throw new Error(res.error || res.data?.message || 'Analysefehler bei der Konformitätsprüfung');
      }

      onAnalysisComplete(res.data.result);
    } catch (err: any) {
      setErrorMessage('Fehler bei der Konformitätsprüfung: ' + (err.message || String(err)));
    } finally {
      setIsEvaluating(false);
    }
  };

  const primaryStandard = standards[0] || { criteriaRows: [] };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <h1 className="text-xl font-bold text-slate-900">
          Schritt 2: Produktdaten & KI-Dokumenten-Upload
        </h1>
        <p className="text-xs text-slate-500 mt-1 max-w-3xl">
          Laden Sie Sicherheitsdatenblätter (SDB) und Labor-Prüfberichte als PDF hoch. Die KI extrahiert die relevanten baustoffökologischen Parameter (VOC, SVHC, Zertifikate), die Sie vor der Übernahme in einem Prüfdialog kontrollieren und freigeben.
        </p>
      </div>

      {/* Selective Standards Filter Box */}
      <div className="bg-white rounded-2xl border border-emerald-200 p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Zu prüfende Nachhaltigkeits-Standards (Gezielte Auswahl):
            </span>
          </div>
          <span className="text-[11px] text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full font-semibold border border-emerald-200">
            {selectedStandards.length} von {standards.length} Standards aktiv
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {standards.map((std) => {
            const isChecked = selectedStandards.includes(std.code);
            return (
              <button
                key={std.id}
                type="button"
                onClick={() => toggleStandard(std.code)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start space-x-3 ${
                  isChecked
                    ? 'bg-emerald-50/70 border-emerald-400 text-slate-900 ring-1 ring-emerald-400'
                    : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {isChecked ? (
                    <CheckSquare className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">{std.name}</div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">{std.institute}</div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    {std.criteriaRows.length} Kriterien hinterlegt
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Error & Success Messages */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {confirmationNotice && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{confirmationNotice}</span>
          </div>
          <button
            onClick={() => setConfirmationNotice(null)}
            className="text-xs text-emerald-700 hover:text-emerald-900 font-bold ml-3"
          >
            Ausblenden
          </button>
        </div>
      )}

      {/* DEDICATED PDF UPLOAD SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Upload Zone 1: SDB */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingSdb(true);
          }}
          onDragLeave={() => setIsDraggingSdb(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingSdb(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleDocumentScan(file, 'sdb');
          }}
          className={`rounded-2xl border-2 border-dashed p-6 transition-all text-center flex flex-col items-center justify-center min-h-[200px] ${
            isDraggingSdb
              ? 'border-emerald-500 bg-emerald-50/50 scale-[1.01]'
              : sdbFile
              ? 'border-emerald-300 bg-emerald-50/30'
              : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50/50'
          }`}
        >
          <input
            ref={sdbInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleDocumentScan(file, 'sdb');
            }}
          />

          <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-700 mb-3">
            <UploadCloud className="w-6 h-6" />
          </div>

          <h3 className="text-sm font-bold text-slate-900">
            1. Sicherheitsdatenblatt (SDB) hochladen
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-xs">
            PDF hier ablegen oder durchsuchen. Relevante Abschnitte (3: Inhaltsstoffe, 9: Physik, 15: REACH/VOC) werden per KI ausgelesen.
          </p>

          {isScanningSdb ? (
            <div className="mt-4 flex items-center space-x-2 text-xs text-emerald-700 font-semibold bg-emerald-100/70 px-4 py-2 rounded-xl animate-pulse">
              <Sparkles className="w-4 h-4 animate-spin" />
              <span>SDB wird per KI analysiert...</span>
            </div>
          ) : sdbFile ? (
            <div className="mt-4 flex items-center space-x-3 bg-white border border-emerald-200 px-3 py-2 rounded-xl text-xs text-slate-800 shadow-2xs">
              <FileCheck2 className="w-4 h-4 text-emerald-600" />
              <span className="font-mono font-medium truncate max-w-[200px]">{sdbFile.name}</span>
              <span className="text-slate-400 text-[10px]">({(sdbFile.size / 1024 / 1024).toFixed(1)} MB)</span>
              <button
                type="button"
                onClick={() => sdbInputRef.current?.click()}
                className="text-[11px] text-emerald-700 hover:underline font-semibold ml-1 cursor-pointer"
              >
                Ersetzen
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => sdbInputRef.current?.click()}
              className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
            >
              SDB-PDF auswählen
            </button>
          )}
        </div>

        {/* Upload Zone 2: Prüfbericht / Zertifikat */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingReport(true);
          }}
          onDragLeave={() => setIsDraggingReport(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingReport(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleDocumentScan(file, 'pruefbericht');
          }}
          className={`rounded-2xl border-2 border-dashed p-6 transition-all text-center flex flex-col items-center justify-center min-h-[200px] ${
            isDraggingReport
              ? 'border-emerald-500 bg-emerald-50/50 scale-[1.01]'
              : testReportFile
              ? 'border-emerald-300 bg-emerald-50/30'
              : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50/50'
          }`}
        >
          <input
            ref={testReportInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleDocumentScan(file, 'pruefbericht');
            }}
          />

          <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-700 mb-3">
            <UploadCloud className="w-6 h-6" />
          </div>

          <h3 className="text-sm font-bold text-slate-900">
            2. Prüfbericht / Zertifikat hochladen
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-xs">
            Laborbericht oder Umweltzeichen-Zertifikat (Blauer Engel, EMICODE EC1 PLUS, AgBB, FSC/PEFC, Natureplus) als PDF hochladen.
          </p>

          {isScanningTestReport ? (
            <div className="mt-4 flex items-center space-x-2 text-xs text-emerald-700 font-semibold bg-emerald-100/70 px-4 py-2 rounded-xl animate-pulse">
              <Sparkles className="w-4 h-4 animate-spin" />
              <span>Prüfbericht wird per KI analysiert...</span>
            </div>
          ) : testReportFile ? (
            <div className="mt-4 flex items-center space-x-3 bg-white border border-emerald-200 px-3 py-2 rounded-xl text-xs text-slate-800 shadow-2xs">
              <FileCheck2 className="w-4 h-4 text-emerald-600" />
              <span className="font-mono font-medium truncate max-w-[200px]">{testReportFile.name}</span>
              <span className="text-slate-400 text-[10px]">({(testReportFile.size / 1024 / 1024).toFixed(1)} MB)</span>
              <button
                type="button"
                onClick={() => testReportInputRef.current?.click()}
                className="text-[11px] text-emerald-700 hover:underline font-semibold ml-1 cursor-pointer"
              >
                Ersetzen
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => testReportInputRef.current?.click()}
              className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
            >
              Prüfbericht-PDF auswählen
            </button>
          )}
        </div>
      </div>

      {/* Main Submission Form */}
      <form onSubmit={handleRunEvaluation} className="space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Stammdaten des zu bewertenden Bauprodukts:
            </span>
            <span className="text-[11px] text-slate-400">
              Automatisch aus PDF befüllt oder manuell eingebbar
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Produktname *
              </label>
              <input
                type="text"
                required
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="z. B. Öko-Innenfarbe Matt"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Hersteller / Lieferant *
              </label>
              <input
                type="text"
                required
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="z. B. Baustoff-Hersteller GmbH"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Primäre Bauteilgruppe (DGNB ENV1.2)
              </label>
              <select
                value={selectedRowNr}
                onChange={(e) => setSelectedRowNr(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {primaryStandard.criteriaRows.map((row) => (
                  <option key={row.id} value={row.nr}>
                    Zeile {row.nr}: {row.bauteil}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Bauteilekatalog Requirement Box */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-start space-x-3">
            <input
              id="bauteilekatalog-checkbox"
              type="checkbox"
              checked={hasBauteilekatalog}
              onChange={(e) => setHasBauteilekatalog(e.target.checked)}
              className="mt-1 w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
            />
            <div className="text-xs">
              <label
                htmlFor="bauteilekatalog-checkbox"
                className="font-bold text-slate-900 cursor-pointer"
              >
                Materialökologischer Bauteilekatalog & Bauüberwachungsnachweis vorhanden
              </label>
              <p className="text-slate-500 mt-0.5 leading-relaxed">
                <strong>DGNB & BNB Nachweis-Regelung:</strong> Für höchste Qualitätsstufen (z.B. DGNB QS 3/4 bzw. BNB Stufe 4/5) ist laut Regelwerken ein materialökologischer Bauteilekatalog nebst baustellenbezogener Dokumentation zwingend erforderlich. Fehlt dieser Nachweis, greift das K.O.-Prinzip.
              </p>
            </div>
          </div>
        </div>

        {/* Text areas for SDB and Test Report */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">1. Sicherheitsdatenblatt (SDB) Daten</span>
              <span className="text-[11px] text-slate-400">Abschnitt 3, 9 & 15 (VOC / SVHC)</span>
            </div>
            <textarea
              rows={8}
              value={sdbText}
              onChange={(e) => setSdbText(e.target.value)}
              placeholder="Wird automatisch nach PDF-Upload und Bestätigung befüllt oder kann hier manuell eingetragen werden..."
              className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">2. Labor-Prüfbericht / Zertifikate</span>
              <span className="text-[11px] text-slate-400">Blauer Engel, EMICODE EC1 PLUS, AgBB</span>
            </div>
            <textarea
              rows={8}
              value={testReportText}
              onChange={(e) => setTestReportText(e.target.value)}
              placeholder="Wird automatisch nach PDF-Upload und Bestätigung befüllt oder kann hier manuell eingetragen werden..."
              className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Submit */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-xs text-slate-500">
            Prüfung erfolgt exklusiv gegen: <strong>{selectedStandards.join(', ')}</strong> (K.O.-Schwachstellenprinzip)
          </span>
          <button
            type="submit"
            disabled={isEvaluating || selectedStandards.length === 0}
            className="py-3 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center space-x-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
          >
            {isEvaluating ? (
              <span>Konformitätsprüfung läuft...</span>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Ausgewählte Standards jetzt prüfen ({selectedStandards.length})</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>

      {/* Confirmation Modal for AI Extracted Data */}
      <ConfirmExtractedDataModal
        isOpen={isModalOpen}
        data={pendingExtraction}
        criteriaRows={primaryStandard.criteriaRows}
        onConfirm={handleConfirmExtraction}
        onCancel={() => {
          setIsModalOpen(false);
          setPendingExtraction(null);
        }}
      />
    </div>
  );
};

import React, { useState } from 'react';
import { CriteriaRow, SustainabilityStandard } from '../types/dgnb';
import { safeFetchJson } from '../utils/safeFetch';
import { ReviewCriteriaModal } from './ReviewCriteriaModal';
import {
  CheckCircle2,
  Lock,
  Unlock,
  ArrowRight,
  Search,
  UploadCloud,
  FileCheck2,
  Layers,
  Sparkles,
  BookOpen,
} from 'lucide-react';

interface Step1MatrixProps {
  standards: SustainabilityStandard[];
  setStandards: React.Dispatch<React.SetStateAction<SustainabilityStandard[]>>;
  activeStandardCode: string;
  setActiveStandardCode: (code: string) => void;
  isConfirmed: boolean;
  onConfirmMatrix: () => void;
  onUnlockMatrix: () => void;
  onProceedToStep2: () => void;
  userEmail: string;
}

export const Step1Matrix: React.FC<Step1MatrixProps> = ({
  standards,
  setStandards,
  activeStandardCode,
  setActiveStandardCode,
  isConfirmed,
  onConfirmMatrix,
  onUnlockMatrix,
  onProceedToStep2,
  userEmail,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  // Modal state for reviewed criteria from scanned PDF
  const [pendingScanResult, setPendingScanResult] = useState<{
    isOpen: boolean;
    standardName: string;
    institute: string;
    version: string;
    rows: CriteriaRow[];
  } | null>(null);

  const currentStandard =
    standards.find((s) => s.code === activeStandardCode) || standards[0];

  const filteredRows = currentStandard.criteriaRows.filter(
    (row) =>
      row.bauteil.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.betrachteteStoffe.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.nr.includes(searchTerm) ||
      (row.kategorie && row.kategorie.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadMessage(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;
        const res = await safeFetchJson<{
          success: boolean;
          matrix?: CriteriaRow[];
          standardName?: string;
          institute?: string;
          version?: string;
          message?: string;
        }>('/api/standards/parse-guideline-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pdfBase64: base64,
            filename: file.name,
          }),
        });

        if (res.ok && res.data?.success && Array.isArray(res.data.matrix) && res.data.matrix.length > 0) {
          // Open interactive review modal so user can inspect and edit before importing
          setPendingScanResult({
            isOpen: true,
            standardName: res.data.standardName || file.name.replace(/\.[^/.]+$/, ''),
            institute: res.data.institute || 'Unabhängiges Institut / Prüfstelle',
            version: res.data.version || new Date().getFullYear().toString(),
            rows: res.data.matrix,
          });
          setUploadMessage(`Erfolgreich gescannt: ${res.data.matrix.length} Kriterienzeilen gefunden. Bitte bestätigen Sie die Angaben.`);
        } else {
          setUploadMessage(
            res.error || res.data?.message || 'Es konnten keine Kriterien aus dem Dokument extrahiert werden.'
          );
        }
      } catch (err: any) {
        setUploadMessage('Fehler beim Einlesen des Dokuments: ' + (err.message || String(err)));
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmImport = (standardData: {
    name: string;
    institute: string;
    version: string;
    rows: CriteriaRow[];
  }) => {
    const code = `CUSTOM_${Date.now().toString().slice(-4)}`;
    const newStandard: SustainabilityStandard = {
      id: `std-${Date.now()}`,
      code,
      name: standardData.name,
      institute: standardData.institute,
      version: standardData.version,
      shortDescription: `Aus Leitfaden-PDF eingepflegt (${standardData.rows.length} Kriterien).`,
      ratingSystemType: 'CUSTOM',
      isCustom: true,
      criteriaRows: standardData.rows.map((r, i) => ({
        ...r,
        standardCode: code,
        id: r.id || `${code}-${i + 1}`,
      })),
    };

    setStandards((prev) => [...prev, newStandard]);
    setActiveStandardCode(code);
    setUploadMessage(`Neuer Standard "${standardData.name}" mit ${standardData.rows.length} Kriterienzeilen erfolgreich in das QM-Tool eingepflegt.`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Action Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-1">
            <FileCheck2 className="w-4 h-4" />
            <span>Verbindliche Prüfgrundlagen & Kriterienkataloge</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            Schritt 1: Bewertungsmatrizen Nachhaltigkeit
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Verwalten Sie alle Richtlinien (DGNB, QNG, BNB sowie weitere Institute per PDF-Scan).
            Nach Ihrer verbindlichen Bestätigung sind die Grundlagen für die Produktprüfung fixiert.
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          {!isConfirmed ? (
            <button
              onClick={onConfirmMatrix}
              className="py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center space-x-2 shadow-xs transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Kriterienmatrizen verbindlich fixieren</span>
            </button>
          ) : (
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                <span>Matrizen fixiert</span>
              </span>
              <button
                onClick={onUnlockMatrix}
                className="py-1.5 px-3 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                title="Matrizen zur Bearbeitung wieder freigeben"
              >
                <Unlock className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onProceedToStep2}
                className="py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-xs cursor-pointer"
              >
                <span>Weiter zu Schritt 2</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Standards Tab Bar & PDF Scanner Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Active Standard Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-1">
              Prüfsystem:
            </span>
            {standards.map((std) => {
              const isActive = std.code === activeStandardCode;
              return (
                <button
                  key={std.id}
                  onClick={() => setActiveStandardCode(std.code)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{std.name}</span>
                  {std.isCustom && (
                    <span className="text-[10px] px-1 py-0.2 bg-emerald-500 text-white rounded font-mono">
                      Custom
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Upload additional PDF guideline */}
          <div className="flex items-center space-x-3 shrink-0">
            <label className="cursor-pointer inline-flex items-center space-x-2 py-2 px-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 transition-colors">
              <UploadCloud className="w-4 h-4 text-emerald-600" />
              <span>{isUploading ? 'Dokument wird gescannt...' : 'Weiteren Instituts-Leitfaden scannen (PDF)'}</span>
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                disabled={isUploading || isConfirmed}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Selected Standard Description Banner */}
        <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div>
            <span className="font-bold text-slate-900">{currentStandard.name}</span>
            <span className="text-slate-500"> · Herausgeber: {currentStandard.institute}</span>
            <p className="text-slate-600 mt-0.5">{currentStandard.shortDescription}</p>
          </div>
          <span className="text-slate-500 font-mono text-[11px] shrink-0">
            {currentStandard.criteriaRows.length} Kriterienzeilen hinterlegt
          </span>
        </div>
      </div>

      {uploadMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{uploadMessage}</span>
        </div>
      )}

      {/* Filter / Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`In "${currentStandard.name}" suchen (z.B. Farben, Klebstoffe)...`}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <span className="text-xs text-slate-400">
          {filteredRows.length} von {currentStandard.criteriaRows.length} Zeilen
        </span>
      </div>

      {/* Criteria Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white border-b border-slate-700">
                <th className="py-3 px-3 w-16 font-mono font-bold text-center">Zeile</th>
                <th className="py-3 px-4 w-60 font-bold">Bauteil / Produktgruppe</th>
                <th className="py-3 px-4 w-48 font-bold">Betrachtete Stoffe & Norm</th>
                <th className="py-3 px-3 font-semibold bg-slate-800/80">Stufe 1 (Basis)</th>
                <th className="py-3 px-3 font-semibold bg-slate-800/80">Stufe 2 (Standard)</th>
                <th className="py-3 px-3 font-semibold bg-slate-800/80">Stufe 3 (Hoch)</th>
                <th className="py-3 px-3 font-semibold bg-emerald-950/80 text-emerald-300">
                  Stufe 4 (Ziel / Exzellenz)
                </th>
                <th className="py-3 px-4 w-40 font-semibold">Nachweisführung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-3 text-center font-mono font-bold text-slate-800 bg-slate-50/50">
                    {row.nr}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    <div>{row.bauteil}</div>
                    {row.anwendungsbereich && (
                      <div className="text-[11px] font-normal text-slate-500 mt-0.5">
                        {row.anwendungsbereich}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-700 text-[11px] leading-relaxed">
                    <div>{row.betrachteteStoffe}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{row.bezugsnorm}</div>
                  </td>
                  <td className="py-3 px-3 text-slate-600 text-[11px] bg-slate-50/30">{row.qs1}</td>
                  <td className="py-3 px-3 text-slate-600 text-[11px] bg-slate-50/30">{row.qs2}</td>
                  <td className="py-3 px-3 text-slate-700 text-[11px] bg-slate-50/30 font-medium">
                    {row.qs3}
                  </td>
                  <td className="py-3 px-3 text-emerald-900 text-[11px] bg-emerald-50/40 font-semibold">
                    {row.qs4}
                  </td>
                  <td className="py-3 px-4 text-[11px] text-slate-500">{row.artDokumentation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Modal for Scanned PDF */}
      {pendingScanResult && (
        <ReviewCriteriaModal
          isOpen={pendingScanResult.isOpen}
          onClose={() => setPendingScanResult(null)}
          detectedStandardName={pendingScanResult.standardName}
          detectedInstitute={pendingScanResult.institute}
          detectedVersion={pendingScanResult.version}
          criteriaRows={pendingScanResult.rows}
          onConfirmImport={handleConfirmImport}
        />
      )}
    </div>
  );
};

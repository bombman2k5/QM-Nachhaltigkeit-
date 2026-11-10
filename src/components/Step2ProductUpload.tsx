import React, { useState } from 'react';
import { CriteriaRow, ProductEvaluationResult, SustainabilityStandard } from '../types/dgnb';
import { SAMPLE_PRODUCTS } from '../data/sampleProducts';
import {
  FileText,
  Sparkles,
  Layers,
  ArrowRight,
  CheckSquare,
  Square,
  AlertTriangle,
  Zap,
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
  const [productName, setProductName] = useState('Caparol Sylitol Bio-Innenfarbe');
  const [manufacturer, setManufacturer] = useState('Caparol Farben Lacke Bautenschutz GmbH');
  const [selectedRowNr, setSelectedRowNr] = useState('1');
  const [hasBauteilekatalog, setHasBauteilekatalog] = useState(true);

  // SELECTIVE STANDARDS TOGGLE (Default: DGNB active, user can pick QNG, BNB, etc.)
  const [selectedStandards, setSelectedStandards] = useState<string[]>(['DGNB', 'QNG', 'BNB']);

  const initialSample = SAMPLE_PRODUCTS[0];
  const [sdbText, setSdbText] = useState(initialSample.sdbSnippet);
  const [testReportText, setTestReportText] = useState(initialSample.testReportSnippet);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const toggleStandard = (code: string) => {
    setSelectedStandards((prev) => {
      if (prev.includes(code)) {
        if (prev.length === 1) {
          // Keep at least one standard active
          return prev;
        }
        return prev.filter((c) => c !== code);
      } else {
        return [...prev, code];
      }
    });
  };

  const handleSelectSample = (sampleId: string) => {
    const sample = SAMPLE_PRODUCTS.find((s) => s.id === sampleId);
    if (!sample) return;
    setProductName(sample.name);
    setManufacturer(sample.manufacturer);
    setSelectedRowNr(sample.criteriaNr);
    setHasBauteilekatalog(sample.hasBauteilekatalog);
    setSdbText(sample.sdbSnippet);
    setTestReportText(sample.testReportSnippet);
    setErrorMessage(null);
  };

  const handleRunEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStandards.length === 0) {
      setErrorMessage('Bitte wählen Sie mindestens eine Prüfgrundlage aus.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    // Filter standards to ONLY send requested standards to server (Traffic & Token Saver)
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
      const res = await fetch('/api/standards/analyze-product', {
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
          userEmail,
          selectedStandardCodes: selectedStandards,
          standards: activeStandardsPayload,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Analysefehler');
      }

      onAnalysisComplete(data.result);
    } catch (err: any) {
      setErrorMessage('Fehler bei der Analyse: ' + (err.message || String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <h1 className="text-xl font-bold text-slate-900">
          Schritt 2: Produktdaten & Selektive Prüfgrundlagen-Auswahl
        </h1>
        <p className="text-xs text-slate-500 mt-1 max-w-3xl">
          Wählen Sie gezielt aus, gegen welche Nachhaltigkeitssysteme das Produkt geprüft werden soll
          (z.B. nur DGNB, DGNB + BNB, oder alle). Es werden nur die ausgewählten Richtlinien analysiert.
        </p>
      </div>

      {/* Selective Standards Filter Box (Traffic & Token Saver) */}
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

      {/* Preset Samples */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Reale Musterprodukte für den Testlauf:
          </span>
          <span className="text-[11px] text-slate-500">Klick füllt alle SDB-Felder automatisch aus</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {SAMPLE_PRODUCTS.map((sample) => (
            <button
              key={sample.id}
              type="button"
              onClick={() => handleSelectSample(sample.id)}
              className="text-left p-3 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 transition-all cursor-pointer shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 truncate">{sample.name}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 shrink-0 ml-1">
                  QS {sample.expectedLevel}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 truncate mt-0.5">{sample.manufacturer}</div>
              <div className="text-[10px] text-slate-400 mt-1">
                {sample.hasBauteilekatalog ? 'Mit Bauteilkatalog' : 'Ohne Katalog'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          {errorMessage}
        </div>
      )}

      {/* Main Submission Form */}
      <form onSubmit={handleRunEvaluation} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Produktname
            </label>
            <input
              type="text"
              required
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Hersteller / Lieferant
            </label>
            <input
              type="text"
              required
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Primäre Bauteilgruppe (Referenzzeile)
            </label>
            <select
              value={selectedRowNr}
              onChange={(e) => setSelectedRowNr(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {standards[0].criteriaRows.map((row) => (
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
              <strong>DGNB & BNB Nachweis-Regelung:</strong> Für höchste Qualitätsstufen (z.B. DGNB QS 3/4 bzw. BNB Stufe 4/5) ist laut Regelwerken ein materialökologischer Bauteilekatalog nebst baustellenbezogener Dokumentation erforderlich. Fehlt dieser Nachweis, greift das K.O.-Prinzip.
            </p>
          </div>
        </div>

        {/* Text areas for SDB and Test Report */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">1. Sicherheitsdatenblatt (SDB)</span>
              <span className="text-[11px] text-slate-400">Abschnitt 3 (Inhaltsstoffe), 9 & 15 (VOC / SVHC)</span>
            </div>
            <textarea
              rows={9}
              required
              value={sdbText}
              onChange={(e) => setSdbText(e.target.value)}
              placeholder="SDB-Text hier einfügen..."
              className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">2. Labor-Prüfbericht / Zertifikate</span>
              <span className="text-[11px] text-slate-400">Blauer Engel, EMICODE EC1 PLUS, AgBB, FSC/PEFC</span>
            </div>
            <textarea
              rows={9}
              required
              value={testReportText}
              onChange={(e) => setTestReportText(e.target.value)}
              placeholder="Prüfbericht-Text hier einfügen..."
              className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Submit */}
        <div className="pt-2 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Prüfung erfolgt exklusiv gegen: <strong>{selectedStandards.join(', ')}</strong>
          </span>
          <button
            type="submit"
            disabled={isLoading || selectedStandards.length === 0}
            className="py-3 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center space-x-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <span>Multi-Standard Prüfung läuft...</span>
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
    </div>
  );
};

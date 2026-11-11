import React from 'react';
import { ProductEvaluationResult } from '../types/dgnb';
import {
  Printer,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  User,
  Building,
  FileCheck,
  Check,
  AlertTriangle,
} from 'lucide-react';

interface Step4CustomerDocumentProps {
  result: ProductEvaluationResult;
  onRestartNewCheck: () => void;
  projectName: string;
}

export const Step4CustomerDocument: React.FC<Step4CustomerDocumentProps> = ({
  result,
  onRestartNewCheck,
  projectName,
}) => {
  const handlePrint = () => {
    window.print();
  };

  const standardKeys = result.selectedStandardCodes || Object.keys(result.standardsEvaluations);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Controls (Hidden when printing) */}
      <div className="print:hidden bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center space-x-2 text-xs text-slate-600">
          <FileCheck className="w-4 h-4 text-emerald-600" />
          <span>Offizieller Konformitätsnachweis druckbereit ({standardKeys.length} Standards)</span>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handlePrint}
            className="py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-xs cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Dokument drucken / als PDF speichern</span>
          </button>
          <button
            onClick={onRestartNewCheck}
            className="py-2 px-3 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold flex items-center space-x-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Neue Prüfung</span>
          </button>
        </div>
      </div>

      {/* The Printable Certificate Document */}
      <div className="bg-white p-8 sm:p-12 rounded-2xl border border-slate-300 shadow-lg print:border-none print:shadow-none print:p-0">
        {/* Document Header */}
        <div className="border-b-2 border-slate-900 pb-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-widest text-emerald-800">
                QM-Tool Nachhaltigkeit · Baustoff-Konformitätsgutachten
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1">
                {result.customerReport?.title || 'KONFORMITÄTSNACHWEIS NACHHALTIGKEIT'}
              </h1>
              <p className="text-xs text-slate-600 font-medium">
                Schadstoff- und Emissionsbewertung nach anerkannten Zertifizierungsgrundlagen
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center text-white ml-auto">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <div className="text-[10px] font-mono text-slate-400 mt-1">QM-SUSTAIN-CERT</div>
            </div>
          </div>

          {/* Audit Metadata Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-4 border-t border-slate-200 text-xs text-slate-600">
            <div>
              <span className="block text-[10px] uppercase font-bold text-slate-400">Prüfbericht-Nr.</span>
              <span className="font-mono font-bold text-slate-900">{result.auditMetadata.auditId}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-slate-400">Datum</span>
              <span className="font-medium text-slate-800">{result.auditMetadata.auditDate}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-slate-400">Prüfender Auditor</span>
              <span className="font-mono text-slate-800 text-[11px] truncate block">
                {result.auditMetadata.auditorEmail}
              </span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-slate-400">Projekt</span>
              <span className="font-medium text-slate-900 truncate block">
                {projectName || result.auditMetadata.projectName}
              </span>
            </div>
          </div>
        </div>

        {/* Product & Outcome Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Geprüftes Bauprodukt
            </span>
            <div className="text-xl font-bold text-slate-900">{result.productName}</div>
            <div className="text-xs text-slate-600">
              Hersteller: <strong>{result.manufacturer}</strong> · Kategorie: <strong>{result.productType}</strong>
            </div>
          </div>

          <div className="text-left sm:text-right shrink-0">
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 block mb-1">
              Geprüfte Standards
            </span>
            <div className="flex flex-wrap gap-1.5 justify-start sm:justify-end">
              {standardKeys.map((k) => (
                <span
                  key={k}
                  className="px-2.5 py-1 rounded bg-slate-900 text-white font-mono text-xs font-bold"
                >
                  {k}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Multi-Standard Synoptic Table */}
        <div className="space-y-3 mb-8">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
            Übersicht der Einstufungen nach den gewählten Bewertungsgrundlagen
          </h2>
          <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
                <th className="py-2.5 px-3">Zertifizierungs-Standard</th>
                <th className="py-2.5 px-3">Institut / Herausgeber</th>
                <th className="py-2.5 px-3 text-center">Erreichte Stufe</th>
                <th className="py-2.5 px-3">Maßgeblicher K.O.-Grund / Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {standardKeys.map((code) => {
                const ev = result.standardsEvaluations[code];
                if (!ev) return null;
                return (
                  <tr key={code}>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      <div>{ev.standardName}</div>
                      <div className="text-[10px] font-normal text-slate-500">{ev.matchedCriteriaTitle}</div>
                    </td>
                    <td className="py-3 px-3 text-slate-600">{ev.institute}</td>
                    <td className="py-3 px-3 text-center">
                      <span className="inline-block px-2.5 py-1 rounded-md font-mono font-bold bg-slate-100 text-slate-900 border border-slate-300">
                        {ev.overallRating}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-700 text-[11px] leading-relaxed">
                      {ev.bottleneckReason || 'Höchste Konformitätsstufe erreicht.'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Executive Summary */}
        <div className="space-y-4 mb-8">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
            Gesamtbeurteilung & Schwachstellen-Analyse
          </h2>
          <p className="text-xs text-slate-700 leading-relaxed">
            {result.customerReport.executiveSummary}
          </p>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="text-xs font-bold text-slate-800">Synoptisches Gutachten:</div>
            <p className="text-xs text-slate-700 leading-relaxed">
              {result.synopticSummary?.overallRecommendation}
            </p>
            {result.customerReport?.conclusion && (
              <p className="text-xs font-semibold text-slate-900 pt-1">
                {result.customerReport.conclusion}
              </p>
            )}
          </div>

          {result.isProvisional && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Vorläufiges Prüfergebnis:</strong> Einzelne Parameter oder Nachweise erfordern noch eine manuelle Kontrolle am Originaldokument (siehe Markierung „Prüfung erforderlich“ in der Detailtabelle).
              </div>
            </div>
          )}

          {result.assumptions && result.assumptions.length > 0 && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs space-y-1">
              <div className="font-bold text-slate-900">Dokumentierte Prüfannahmen:</div>
              <ul className="list-disc list-inside text-[11px] space-y-0.5">
                {result.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Detailed Parameter lists per standard */}
        <div className="space-y-6 mb-8">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
            Nachweisführung & Messwerte je Einzelstandard
          </h2>
          {standardKeys.map((code) => {
            const ev = result.standardsEvaluations[code];
            if (!ev) return null;
            return (
              <div key={code} className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                  <span>{ev.standardName} (Ergebnis: {ev.overallRating})</span>
                  <span className="text-slate-400 font-mono text-[11px]">{ev.standardCode}</span>
                </div>
                <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700 border-b border-slate-200 font-semibold">
                      <th className="py-2 px-3">Parameter</th>
                      <th className="py-2 px-3">Ermittelter Messwert &amp; Quelle</th>
                      <th className="py-2 px-3">Zielanforderung</th>
                      <th className="py-2 px-3 text-center">Stufe</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ev.parameters.map((p, idx) => (
                      <tr key={idx} className={p.isBottleneck ? 'bg-amber-50/50' : ''}>
                        <td className="py-2 px-3 font-semibold text-slate-900">{p.parameterName}</td>
                        <td className="py-2 px-3 font-mono">
                          <div>{p.productValue}</div>
                          {p.evidence && p.evidence.source !== 'missing' && (
                            <div className="text-[10px] font-sans text-slate-500 mt-0.5">
                              {p.evidence.verification === 'verified'
                                ? `PDF verifiziert${p.evidence.page ? ` (S. ${p.evidence.page})` : ''}`
                                : p.evidence.verification === 'partial'
                                ? `Teilweise belegt${p.evidence.page ? ` (S. ${p.evidence.page})` : ''}`
                                : p.evidence.verification === 'manual'
                                ? 'Manuell bestätigt'
                                : 'Manuell zu prüfen'}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">{p.requiredForQS4}</td>
                        <td className="py-2 px-3 text-center font-bold font-mono">Stufe {p.achievedLevel}</td>
                        <td className="py-2 px-3">
                          {p.status === 'fail' || p.achievedLevel === 1 ? (
                            <span className="text-[11px] font-bold text-rose-700">Nicht belegt / K.O.</span>
                          ) : p.needsManualReview ? (
                            <span className="text-[11px] font-bold text-amber-700">Prüfung erforderlich</span>
                          ) : p.isBottleneck || p.status === 'warning' ? (
                            <span className="text-[11px] font-bold text-amber-700">Begrenzend (Stufe {p.achievedLevel})</span>
                          ) : (
                            <span className="text-[11px] text-emerald-700">Erfüllt</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>

        {/* Signatures & Legal Disclaimer */}
        <div className="pt-6 border-t-2 border-slate-200 grid grid-cols-2 gap-8 text-[11px] text-slate-500">
          <div>
            <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-8">
              Prüfender QM-Auditor (Konto)
            </div>
            <div className="border-t border-slate-300 pt-1 font-mono text-slate-800">
              {result.auditMetadata.auditorEmail}
            </div>
            <div className="text-[10px] text-slate-400">Verifiziert via QM-Tool Nachhaltigkeit</div>
          </div>

          <div>
            <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-8">
              Gültigkeit & Verbindlichkeit
            </div>
            <div className="border-t border-slate-300 pt-1 text-slate-600 leading-normal">
              {result.customerReport.legalMandatoryNotice}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

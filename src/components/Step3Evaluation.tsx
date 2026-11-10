import React, { useState } from 'react';
import { ProductEvaluationResult } from '../types/dgnb';
import {
  Award,
  AlertOctagon,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Building,
  Check,
  XCircle,
  HelpCircle,
} from 'lucide-react';

interface Step3EvaluationProps {
  result: ProductEvaluationResult;
  onProceedToStep4: () => void;
  onBackToStep2: () => void;
}

export const Step3Evaluation: React.FC<Step3EvaluationProps> = ({
  result,
  onProceedToStep4,
  onBackToStep2,
}) => {
  const [activeTabStandard, setActiveTabStandard] = useState<string>(() => {
    return result.selectedStandardCodes[0] || 'DGNB';
  });

  const standardKeys = result.selectedStandardCodes || Object.keys(result.standardsEvaluations);

  const getBadgeStyle = (rating: string) => {
    if (rating.includes('4') || rating.includes('Exzellent') || rating.includes('Erfüllt')) {
      return 'bg-emerald-600 text-white border-emerald-700';
    }
    if (rating.includes('3') || rating.includes('Hoch')) {
      return 'bg-blue-600 text-white border-blue-700';
    }
    if (rating.includes('2') || rating.includes('Standard')) {
      return 'bg-amber-500 text-white border-amber-600';
    }
    return 'bg-slate-700 text-white border-slate-800';
  };

  const currentEval = result.standardsEvaluations[activeTabStandard] || Object.values(result.standardsEvaluations)[0];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Product Summary Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-200">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              QM-Tool Nachhaltigkeit · Multi-Standard Auswertung
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{result.productName}</h1>
            <p className="text-xs text-slate-500">
              Hersteller: <strong className="text-slate-700">{result.manufacturer}</strong> · Geprüft gegen{' '}
              <strong className="text-slate-700">{standardKeys.length} ausgewählte Prüfgrundlagen</strong>
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <button
              onClick={onBackToStep2}
              className="py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center space-x-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Parameter anpassen</span>
            </button>
            <button
              onClick={onProceedToStep4}
              className="py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center space-x-2 shadow-xs cursor-pointer"
            >
              <span>Kundennachweis erstellen</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Synoptic Summary Strip across selected standards */}
        <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800 shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">Synoptische Gesamt-Einordnung:</div>
              <div className="text-xs text-slate-600 mt-0.5">
                {result.synopticSummary?.overallRecommendation ||
                  'Produkt erzielt in den ausgewählten Standards solide Konformitätsergebnisse.'}
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-500 font-mono shrink-0">
            Audit-ID: {result.auditMetadata.auditId}
          </div>
        </div>
      </div>

      {/* Standards Tiles Grid (Only the ones selected by the user!) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Einordnung je ausgewählter Bewertungsgrundlage:
          </h2>
          <span className="text-[11px] text-slate-400">Klick öffnet die Detail-Parameter</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {standardKeys.map((stdCode) => {
            const ev = result.standardsEvaluations[stdCode];
            if (!ev) return null;
            const isSelected = activeTabStandard === stdCode;

            return (
              <button
                key={stdCode}
                type="button"
                onClick={() => setActiveTabStandard(stdCode)}
                className={`text-left p-5 rounded-2xl border transition-all cursor-pointer relative ${
                  isSelected
                    ? 'bg-white border-emerald-600 ring-2 ring-emerald-500 shadow-md'
                    : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                      {ev.standardCode}
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 leading-snug">{ev.standardName}</h3>
                    <div className="text-[11px] text-slate-500 mt-0.5">{ev.institute}</div>
                  </div>

                  <div
                    className={`px-3 py-1.5 rounded-xl text-center font-bold font-mono text-xs shadow-2xs border shrink-0 ${getBadgeStyle(
                      ev.overallRating
                    )}`}
                  >
                    {ev.overallRating}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <span className="text-slate-600 font-medium truncate max-w-[190px]">
                    {ev.isCompliant ? (
                      <span className="text-emerald-700 flex items-center space-x-1">
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span>Konform</span>
                      </span>
                    ) : (
                      <span className="text-amber-700 flex items-center space-x-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>K.O.-Begrenzung</span>
                      </span>
                    )}
                  </span>
                  <span className="text-slate-400 font-mono">
                    {ev.parameters.length} Parameter
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detailed Analysis of the Active Standard */}
      {currentEval && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs space-y-6 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                Prüfbericht für {currentEval.standardName}
              </div>
              <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                Erreichte Einstufung: <span className="font-mono text-emerald-800">{currentEval.overallRating}</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Zugeordnetes Bauteil: <strong>{currentEval.matchedCriteriaTitle}</strong> (Kriterium {currentEval.matchedCriteriaRowNr})
              </p>
            </div>
            <div className="text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
              Bewertungsverfahren: <strong>Schwachstellen- & K.O.-Prinzip</strong>
            </div>
          </div>

          {/* Bottleneck and Reasoning */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-800">
                <AlertOctagon className="w-4 h-4 text-amber-600" />
                <span>K.O.-Engpass / Begrenzender Faktor:</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed font-medium">
                {currentEval.bottleneckReason || 'Kein Engpass – Höchste Qualitätsstufe erreicht.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 space-y-1.5">
              <div className="flex items-center space-x-2 text-xs font-bold text-blue-900">
                <Lightbulb className="w-4 h-4 text-blue-600" />
                <span>Verständliche Begründung & Einordnung:</span>
              </div>
              <p className="text-xs text-blue-950 leading-relaxed">
                {currentEval.userExplanation}
              </p>
            </div>
          </div>

          {/* Parameter Table for this standard */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800">
                Geprüfte Parameter gegen Anforderungen von {currentEval.standardCode}
              </span>
              <span className="text-slate-400 font-mono text-[11px]">
                {currentEval.parameters.length} Kriterien
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-white border-b border-slate-200 text-slate-700 font-semibold">
                    <th className="py-2.5 px-4">Parameter / Schadstoff</th>
                    <th className="py-2.5 px-4">Ermittelter Wert (SDB / Labor)</th>
                    <th className="py-2.5 px-4">Anforderung Höchststufe</th>
                    <th className="py-2.5 px-4 text-center">Isolierte Einstufung</th>
                    <th className="py-2.5 px-4">Erläuterung & Auswirkung</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentEval.parameters.map((param, idx) => (
                    <tr
                      key={idx}
                      className={`hover:bg-slate-50/50 transition-colors ${
                        param.isBottleneck ? 'bg-amber-50/40' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <div className="flex items-center space-x-2">
                          {param.isBottleneck && (
                            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Engpass-Parameter"></span>
                          )}
                          <span>{param.parameterName}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-slate-800">
                        {param.productValue}
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                        {param.requiredForQS4}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-md text-xs font-bold font-mono ${
                            param.achievedLevel === 4
                              ? 'bg-emerald-100 text-emerald-800'
                              : param.achievedLevel === 3
                              ? 'bg-blue-100 text-blue-800'
                              : param.achievedLevel === 2
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-200 text-slate-800'
                          }`}
                        >
                          Stufe {param.achievedLevel}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 text-[11px] leading-relaxed">
                        {param.explanation}
                        {param.isBottleneck && (
                          <span className="block font-semibold text-amber-800 mt-0.5">
                            → K.O.-Begrenzung für {currentEval.standardCode}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recommendation */}
          <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl text-xs space-y-1">
            <span className="font-bold text-emerald-950">
              Konkrete Optimierungsempfehlung für {currentEval.standardName}:
            </span>
            <p className="text-emerald-900 leading-relaxed">{currentEval.recommendation}</p>
          </div>
        </div>
      )}
    </div>
  );
};

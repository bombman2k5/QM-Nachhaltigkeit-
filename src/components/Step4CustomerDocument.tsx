import React from 'react';
import { ProductEvaluationResult } from '../types/dgnb';
import { KAUBIT_LETTERHEAD } from '../data/kaubitLetterhead';
import {
  Printer,
  RotateCcw,
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  FileText,
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
  const dgnbEval = result.standardsEvaluations['DGNB'] || result.standardsEvaluations[standardKeys[0]];
  const overallLevel = dgnbEval?.overallLevelNum ?? 1;
  const bottleneckParam = dgnbEval?.parameters.find((p) => p.isBottleneck);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Top Action Bar (Hidden when printing) */}
      <div className="print:hidden bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center space-x-2 text-xs text-slate-600">
          <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            Offizieller KAUBIT-Kundennachweis mit integriertem Briefbogen ({standardKeys.length}{' '}
            {standardKeys.length === 1 ? 'Standard' : 'Standards'})
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={KAUBIT_LETTERHEAD.header.templatePdfPath}
            target="_blank"
            rel="noopener noreferrer"
            className="py-2 px-3 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold flex items-center space-x-1.5 whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5 text-[#0066b3]" />
            <span>Original-Briefbogen (PDF)</span>
          </a>
          <button
            type="button"
            onClick={handlePrint}
            className="py-2 px-3.5 bg-[#0066b3] hover:bg-[#005291] text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-xs cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>Zertifikat drucken / PDF</span>
          </button>
          <button
            type="button"
            onClick={onRestartNewCheck}
            className="py-2 px-3 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold flex items-center space-x-1 cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Neue Prüfung</span>
          </button>
        </div>
      </div>

      {/* The Printable KAUBIT Certificate Sheet (A4 Proportions) */}
      <article
        aria-label="KAUBIT Konformitätszertifikat und Kundennachweis"
        className="bg-white px-8 py-8 sm:px-12 sm:py-10 rounded-2xl border border-slate-300 shadow-lg print:border-none print:shadow-none print:p-0 flex flex-col justify-between min-h-[1080px]"
      >
        {/* =====================================================================
            EXTRAHIERTE KAUBIT KOPFZEILE (aus Vorlage_wpz_neu_9a344953.pdf)
           ===================================================================== */}
        <header
          data-testid="kaubit-certificate-header"
          className="pb-6 mb-6 select-text"
        >
          {/* Centered KAUBIT® Logo Mark */}
          <div className="flex justify-center">
            <img
              src={KAUBIT_LETTERHEAD.header.logoAssetPath}
              alt="KAUBIT Aktiengesellschaft Logo"
              className="h-20 sm:h-24 w-auto object-contain"
            />
          </div>

          {/* Horizontal Teal Rule with Centered "Systemabdichtungsbaustoffe" */}
          <div className="flex items-center w-full mt-1">
            <div className="flex-1 h-[2px] bg-[#00b5a5]" />
            <span className="px-3 text-xs sm:text-[13px] font-medium tracking-wide text-[#0066b3] whitespace-nowrap">
              {KAUBIT_LETTERHEAD.header.tagline}
            </span>
            <div className="flex-1 h-[2px] bg-[#00b5a5]" />
          </div>

          {/* Centered Company Postal Line */}
          <div className="text-center mt-1.5 text-xs sm:text-sm font-bold tracking-tight text-[#0066b3]">
            {KAUBIT_LETTERHEAD.header.postalHeaderLine}
          </div>
        </header>

        {/* =====================================================================
            ZERTIFIKATS-HAUPTTEIL (KUNDENNACHWEIS SCHRITT 4)
           ===================================================================== */}
        <div className="flex-1 space-y-6">
          {/* Certificate Title & Audit Metadata Bar */}
          <div className="border-y-2 border-[#0066b3] py-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#00b5a5]">
                  Werksprüfzeugnis &amp; Nachhaltigkeits-Zertifikat · DGNB ENV1.2 / QNG / BNB
                </div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                  {result.customerReport?.title || 'KONFORMITÄTSNACHWEIS NACHHALTIGKEIT'}
                </h1>
              </div>
              <div className="text-left sm:text-right shrink-0">
                <span className="inline-flex items-center px-3 py-1 rounded-md text-xs font-extrabold bg-[#0066b3] text-white font-mono">
                  Qualitätsstufe {overallLevel} / 4
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-3 border-t border-slate-200 text-xs text-slate-600">
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400">
                  Prüfbericht-Nr.
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {result.auditMetadata.auditId}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400">
                  Prüfdatum
                </span>
                <span className="font-medium text-slate-800">{result.auditMetadata.auditDate}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400">
                  Prüfender QM-Auditor
                </span>
                <span className="font-mono text-slate-800 text-[11px] truncate block">
                  {result.auditMetadata.auditorEmail}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400">
                  Bauvorhaben / Projekt
                </span>
                <span className="font-medium text-slate-900 truncate block">
                  {projectName || result.auditMetadata.projectName}
                </span>
              </div>
            </div>
          </div>

          {/* 4-Point Structured Core Outcome Box (as mandated by DGNB evaluation rules) */}
          <section
            aria-label="Strukturierte Kernbewertung"
            className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#0066b3]">
                Zusammenfassung der Produktprüfung (Strenges K.O.-Schwachstellenprinzip)
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {standardKeys.map((k) => (
                  <span
                    key={k}
                    className="px-2 py-0.5 rounded bg-[#0066b3] text-white font-mono text-[11px] font-bold"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* 1. Welches Produkt wurde geprüft? */}
              <div className="bg-white p-3.5 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  1. Geprüftes Bauprodukt
                </span>
                <div className="text-sm font-bold text-slate-900 mt-0.5">{result.productName}</div>
                <div className="text-[11px] text-slate-600 mt-0.5">
                  Hersteller: <strong>{result.manufacturer}</strong> · Produktgruppe:{' '}
                  <strong>{result.productType}</strong>
                </div>
              </div>

              {/* 2. Welche Qualitätsstufe (1-4) wurde erreicht? */}
              <div className="bg-white p-3.5 rounded-lg border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    2. Erreichte Qualitätsstufe (Skala 1–4)
                  </span>
                  <div className="text-sm font-extrabold text-slate-900 mt-0.5">
                    Qualitätsstufe {overallLevel} von 4{' '}
                    {overallLevel === 4
                      ? '(Höchster Standard)'
                      : overallLevel === 3
                      ? '(Gehobener Standard)'
                      : overallLevel === 2
                      ? '(Basis-Standard)'
                      : '(Mindeststandard / K.O.)'}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    Bauteilekatalog-Nachweis:{' '}
                    <strong>
                      {result.hasBauteilekatalog ? 'Vorhanden (Stufe 3/4 zulässig)' : 'Fehlt (max. Stufe 2)'}
                    </strong>
                  </div>
                </div>
                {overallLevel >= 3 ? (
                  <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0" />
                ) : (
                  <ShieldAlert className="w-7 h-7 text-amber-600 shrink-0" />
                )}
              </div>

              {/* 3. Welcher konkrete Parameter hat eine eventuell höhere Stufe verhindert? */}
              <div className="bg-white p-3.5 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  3. Maßgeblicher Begrenzungs- / K.O.-Parameter
                </span>
                <div className="text-xs font-semibold text-slate-900 mt-1 leading-relaxed">
                  {overallLevel === 4
                    ? 'Kein begrenzender Parameter – sämtliche Einzelanforderungen für Qualitätsstufe 4 wurden erfüllt.'
                    : !result.hasBauteilekatalog && overallLevel === 2
                    ? 'Formale Nachweisführung: Fehlender materialökologischer Bauteilekatalog (zwingend für Stufe 3 und 4).'
                    : bottleneckParam
                    ? `${bottleneckParam.parameterName} (Messwert: ${bottleneckParam.productValue} → begrenzt auf Stufe ${bottleneckParam.achievedLevel})`
                    : dgnbEval?.bottleneckReason ||
                      result.synopticSummary?.criticalStandard ||
                      'Siehe Einzelparameter-Auswertung.'}
                </div>
              </div>

              {/* 4. Wie lautet die einfache, nachvollziehbare Begründung für den Anwender? */}
              <div className="bg-white p-3.5 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  4. Verständliche Begründung für den Anwender
                </span>
                <div className="text-xs text-slate-700 mt-1 leading-relaxed">
                  {dgnbEval?.userExplanation || result.customerReport.executiveSummary}
                </div>
              </div>
            </div>
          </section>

          {/* Multi-Standard Synoptic Table */}
          <div className="space-y-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
              Übersicht der Einstufungen nach den gewählten Bewertungsgrundlagen
            </h2>
            <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
                  <th className="py-2 px-3">Zertifizierungs-Standard</th>
                  <th className="py-2 px-3">Institut / Herausgeber</th>
                  <th className="py-2 px-3 text-center">Erreichte Stufe</th>
                  <th className="py-2 px-3">Maßgeblicher K.O.-Grund / Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {standardKeys.map((code) => {
                  const ev = result.standardsEvaluations[code];
                  if (!ev) return null;
                  return (
                    <tr key={code}>
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        <div>{ev.standardName}</div>
                        <div className="text-[10px] font-normal text-slate-500">
                          {ev.matchedCriteriaTitle}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{ev.institute}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-block px-2.5 py-1 rounded-md font-mono font-bold bg-slate-100 text-slate-900 border border-slate-300">
                          {ev.overallRating}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 text-[11px] leading-relaxed">
                        {ev.bottleneckReason || 'Höchste Konformitätsstufe erreicht.'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Executive Summary & Synoptic Assessment */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
              Gesamtbeurteilung &amp; Schwachstellen-Analyse
            </h2>
            <p className="text-xs text-slate-700 leading-relaxed">
              {result.customerReport.executiveSummary}
            </p>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
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
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Vorläufiges Prüfergebnis:</strong> Einzelne Parameter oder Nachweise
                  erfordern noch eine manuelle Kontrolle am Originaldokument (siehe Markierung
                  „Prüfung erforderlich“ in der Detailtabelle).
                </div>
              </div>
            )}

            {result.assumptions && result.assumptions.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs space-y-1">
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
          <div className="space-y-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
              Nachweisführung &amp; Messwerte je Einzelstandard
            </h2>
            {standardKeys.map((code) => {
              const ev = result.standardsEvaluations[code];
              if (!ev) return null;
              return (
                <div key={code} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span>
                      {ev.standardName} (Ergebnis: {ev.overallRating})
                    </span>
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
                          <td className="py-2 px-3 font-semibold text-slate-900">
                            {p.parameterName}
                          </td>
                          <td className="py-2 px-3 font-mono">
                            <div>{p.productValue}</div>
                            {p.evidence && p.evidence.source !== 'missing' && (
                              <div className="text-[10px] font-sans text-slate-500 mt-0.5">
                                {p.evidence.verification === 'verified'
                                  ? `PDF verifiziert${
                                      p.evidence.page ? ` (S. ${p.evidence.page})` : ''
                                    }`
                                  : p.evidence.verification === 'partial'
                                  ? `Teilweise belegt${
                                      p.evidence.page ? ` (S. ${p.evidence.page})` : ''
                                    }`
                                  : p.evidence.verification === 'manual'
                                  ? 'Manuell bestätigt'
                                  : 'Manuell zu prüfen'}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">
                            {p.requiredForQS4}
                          </td>
                          <td className="py-2 px-3 text-center font-bold font-mono">
                            Stufe {p.achievedLevel}
                          </td>
                          <td className="py-2 px-3">
                            {p.status === 'fail' || p.achievedLevel === 1 ? (
                              <span className="text-[11px] font-bold text-rose-700">
                                Nicht belegt / K.O.
                              </span>
                            ) : p.needsManualReview ? (
                              <span className="text-[11px] font-bold text-amber-700">
                                Prüfung erforderlich
                              </span>
                            ) : p.isBottleneck || p.status === 'warning' ? (
                              <span className="text-[11px] font-bold text-amber-700">
                                Begrenzend (Stufe {p.achievedLevel})
                              </span>
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
          <div className="pt-5 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-8 text-[11px] text-slate-500">
            <div>
              <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-6">
                Prüfender QM-Auditor (Freigabe)
              </div>
              <div className="border-t border-slate-300 pt-1 font-mono text-slate-800">
                {result.auditMetadata.auditorEmail}
              </div>
              <div className="text-[10px] text-slate-400">
                KAUBIT Aktiengesellschaft · Qualitätsmanagement Nachhaltigkeit
              </div>
            </div>

            <div>
              <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-6">
                Gültigkeit &amp; Verbindlichkeit
              </div>
              <div className="border-t border-slate-300 pt-1 text-slate-600 leading-normal">
                {result.customerReport.legalMandatoryNotice}
              </div>
            </div>
          </div>
        </div>

        {/* =====================================================================
            EXTRAHIERTE KAUBIT FUSSZEILE (aus Vorlage_wpz_neu_9a344953.pdf)
           ===================================================================== */}
        <footer
          data-testid="kaubit-certificate-footer"
          className="mt-10 pt-4 border-t border-slate-200 text-[#0066b3] select-text"
        >
          {/* 4-Column Business & Bank Details matching Vorlage_wpz_neu_9a344953.pdf */}
          <div className="grid grid-cols-1 sm:grid-cols-[1.15fr_1.15fr_1.65fr_2.25fr] gap-y-4 sm:gap-x-3 text-[9.5px] leading-[1.42]">
            {/* Column 1: Company Address & Contact */}
            <div className="whitespace-nowrap">
              <div className="font-bold">{KAUBIT_LETTERHEAD.footer.companyColumn.companyName}</div>
              <div>{KAUBIT_LETTERHEAD.footer.companyColumn.street}</div>
              <div>{KAUBIT_LETTERHEAD.footer.companyColumn.city}</div>
              <div>{KAUBIT_LETTERHEAD.footer.companyColumn.phone}</div>
              <div>{KAUBIT_LETTERHEAD.footer.companyColumn.fax}</div>
              <div>{KAUBIT_LETTERHEAD.footer.companyColumn.website}</div>
              <div>{KAUBIT_LETTERHEAD.footer.companyColumn.email}</div>
            </div>

            {/* Column 2: Registered Office, Commercial Register & Tax IDs */}
            <div className="whitespace-nowrap">
              <div className="font-bold">
                {KAUBIT_LETTERHEAD.footer.registryColumn.registeredOffice}
              </div>
              <div>{KAUBIT_LETTERHEAD.footer.registryColumn.registerLabel}</div>
              <div>{KAUBIT_LETTERHEAD.footer.registryColumn.registerCourt}</div>
              <div>{KAUBIT_LETTERHEAD.footer.registryColumn.registerNumber}</div>
              <div>{KAUBIT_LETTERHEAD.footer.registryColumn.vatId}</div>
              <div>{KAUBIT_LETTERHEAD.footer.registryColumn.taxNumber}</div>
            </div>

            {/* Column 3: Bank Names (bold) */}
            <div className="whitespace-nowrap font-bold">
              {KAUBIT_LETTERHEAD.footer.bankAccounts.map((bank) => (
                <div key={bank.iban}>{bank.bankName}</div>
              ))}
            </div>

            {/* Column 4: Aligned BIC & IBAN */}
            <div className="whitespace-nowrap">
              {KAUBIT_LETTERHEAD.footer.bankAccounts.map((bank) => (
                <div
                  key={bank.iban}
                  className="grid grid-cols-[118px_1fr] gap-x-2 items-baseline"
                >
                  <span>BIC: {bank.bic}</span>
                  <span>IBAN: {bank.iban}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Centered Executive Board & Supervisory Board Line */}
          <div className="mt-3 pt-1.5 text-center text-[10.5px] font-medium tracking-tight text-[#0066b3]">
            {KAUBIT_LETTERHEAD.footer.boardLine}
          </div>
        </footer>
      </article>
    </div>
  );
};

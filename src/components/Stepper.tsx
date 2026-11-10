import React from 'react';
import { TableProperties, Upload, Award, FileText, Check } from 'lucide-react';

interface StepperProps {
  currentStep: number;
  onStepClick: (step: number) => void;
  isMatrixConfirmed: boolean;
  hasEvaluationResult: boolean;
}

export const Stepper: React.FC<StepperProps> = ({
  currentStep,
  onStepClick,
  isMatrixConfirmed,
  hasEvaluationResult,
}) => {
  const steps = [
    {
      id: 1,
      title: 'Schritt 1: Bewertungsmatrizen',
      desc: 'DGNB, QNG, BNB & PDF-Scan',
      icon: TableProperties,
      enabled: true,
      completed: isMatrixConfirmed,
    },
    {
      id: 2,
      title: 'Schritt 2: Produktprüfung',
      desc: 'SDB- & Prüfbericht-Upload',
      icon: Upload,
      enabled: true, // Always accessible directly from step 1
      completed: hasEvaluationResult,
    },
    {
      id: 3,
      title: 'Schritt 3: Multi-Auswertung',
      desc: 'K.O.-Synopse & System-Kacheln',
      icon: Award,
      enabled: hasEvaluationResult,
      completed: currentStep === 4,
    },
    {
      id: 4,
      title: 'Schritt 4: Kundennachweis',
      desc: 'Konsolidiertes Prüfzertifikat',
      icon: FileText,
      enabled: hasEvaluationResult,
      completed: false,
    },
  ];

  return (
    <div className="bg-white border-b border-slate-200 py-3 px-4 sm:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {steps.map((step) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isCompleted = step.completed && !isActive;

            return (
              <button
                key={step.id}
                onClick={() => step.enabled && onStepClick(step.id)}
                disabled={!step.enabled}
                className={`text-left p-2.5 rounded-xl border transition-all flex items-center space-x-3 cursor-pointer ${
                  isActive
                    ? 'bg-emerald-50/70 border-emerald-500 shadow-xs ring-1 ring-emerald-500/20'
                    : isCompleted
                    ? 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    : step.enabled
                    ? 'bg-white border-slate-200 hover:border-slate-300'
                    : 'bg-slate-50/50 border-slate-200/60 opacity-50 cursor-not-allowed'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                    isActive
                      ? 'bg-emerald-600 text-white'
                      : isCompleted
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>

                <div className="min-w-0">
                  <div
                    className={`text-xs font-bold truncate ${
                      isActive ? 'text-emerald-900' : 'text-slate-800'
                    }`}
                  >
                    {step.title}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{step.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

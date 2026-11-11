import React from 'react';
import { ShieldCheck, Building2, ArrowRight, LogOut, User as UserIcon } from 'lucide-react';

interface NavbarProps {
  activeStep: number;
  onStepChange: (step: number) => void;
  projectName: string;
  setProjectName: (name: string) => void;
  hasEvaluationResult: boolean;
  userEmail?: string;
  onSignOut?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeStep,
  onStepChange,
  projectName,
  setProjectName,
  hasEvaluationResult,
  userEmail,
  onSignOut,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-6">
          {/* Brand Zone */}
          <div
            onClick={() => onStepChange(1)}
            className="flex items-center space-x-3 shrink-0 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-base font-bold text-slate-900 tracking-tight whitespace-nowrap">
                QM-Tool Nachhaltigkeit
              </div>
              <div className="text-[11px] text-slate-500 whitespace-nowrap">
                Multi-Standard Konformitätsprüfung · DGNB · QNG · BNB
              </div>
            </div>
          </div>

          {/* Clean Stepper Navigation Links */}
          <nav className="hidden md:flex items-center space-x-5 text-xs font-semibold text-slate-600">
            <button
              onClick={() => onStepChange(1)}
              className={`transition-colors whitespace-nowrap cursor-pointer ${
                activeStep === 1
                  ? 'text-emerald-700 font-bold border-b-2 border-emerald-600 pb-0.5'
                  : 'hover:text-slate-900'
              }`}
            >
              1. Bewertungsmatrizen
            </button>
            <span className="text-slate-300">/</span>
            <button
              onClick={() => onStepChange(2)}
              className={`transition-colors whitespace-nowrap cursor-pointer ${
                activeStep === 2
                  ? 'text-emerald-700 font-bold border-b-2 border-emerald-600 pb-0.5'
                  : 'hover:text-slate-900'
              }`}
            >
              2. Produktprüfung & PDF-Upload
            </button>
            <span className="text-slate-300">/</span>
            <button
              onClick={() => hasEvaluationResult && onStepChange(3)}
              disabled={!hasEvaluationResult}
              className={`transition-colors whitespace-nowrap ${
                activeStep === 3
                  ? 'text-emerald-700 font-bold border-b-2 border-emerald-600 pb-0.5'
                  : hasEvaluationResult
                  ? 'hover:text-slate-900 cursor-pointer'
                  : 'text-slate-400 cursor-not-allowed'
              }`}
            >
              3. Multi-Auswertung
            </button>
            <span className="text-slate-300">/</span>
            <button
              onClick={() => hasEvaluationResult && onStepChange(4)}
              disabled={!hasEvaluationResult}
              className={`transition-colors whitespace-nowrap ${
                activeStep === 4
                  ? 'text-emerald-700 font-bold border-b-2 border-emerald-600 pb-0.5'
                  : hasEvaluationResult
                  ? 'hover:text-slate-900 cursor-pointer'
                  : 'text-slate-400 cursor-not-allowed'
              }`}
            >
              4. Kundennachweis
            </button>
          </nav>

          {/* Project & Quick Action Zone */}
          <div className="flex items-center space-x-3 shrink-0">
            {/* Project Name editable */}
            <div className="hidden sm:flex items-center space-x-1.5 text-xs text-slate-700 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Projektname eingeben..."
                className="bg-transparent border-none text-slate-900 font-medium focus:outline-none w-32 md:w-44 truncate text-xs"
                title="Klicken zum Bearbeiten der Projektbezeichnung"
              />
            </div>

            {/* Quick jump to step 2 if on step 1 */}
            {activeStep === 1 && (
              <button
                onClick={() => onStepChange(2)}
                className="hidden lg:flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
              >
                <span>Zur Produktprüfung</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {/* User Profile Badge & Sign-Out Button */}
            {userEmail && (
              <div className="flex items-center space-x-2 border-l border-slate-200 pl-3">
                <div className="hidden xl:flex items-center space-x-1.5 text-[11px] font-medium text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                  <UserIcon className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span className="truncate max-w-[140px] font-mono">{userEmail}</span>
                </div>
                {onSignOut && (
                  <button
                    onClick={onSignOut}
                    className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg transition-colors cursor-pointer flex items-center space-x-1 text-xs"
                    title="Abmelden & Tresor sperren"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="hidden sm:inline text-[11px] font-medium">Abmelden</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

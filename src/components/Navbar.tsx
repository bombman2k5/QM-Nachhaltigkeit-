import React from 'react';
import { ShieldCheck, LogOut, Lock, Building2 } from 'lucide-react';
import { AuthState } from '../types/dgnb';

interface NavbarProps {
  auth: AuthState;
  onLogout: () => void;
  isMatrixConfirmed: boolean;
  activeStep: number;
  onStepChange: (step: number) => void;
  projectName: string;
  setProjectName: (name: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  auth,
  onLogout,
  isMatrixConfirmed,
  activeStep,
  onStepChange,
  projectName,
  setProjectName,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-8">
          {/* Brand Zone */}
          <div className="flex items-center space-x-3 shrink-0">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold shadow-xs">
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

          {/* Navigation Links (only if authenticated and unlocked) */}
          {auth.isAuthenticated && auth.isVaultUnlocked && (
            <nav className="hidden md:flex items-center space-x-6 text-xs font-semibold text-slate-600">
              <button
                onClick={() => onStepChange(1)}
                className={`transition-colors whitespace-nowrap ${
                  activeStep === 1 ? 'text-emerald-700 font-bold' : 'hover:text-slate-900'
                }`}
              >
                1. Bewertungsmatrizen
              </button>
              <span className="text-slate-300">/</span>
              <button
                onClick={() => isMatrixConfirmed && onStepChange(2)}
                disabled={!isMatrixConfirmed}
                className={`transition-colors whitespace-nowrap ${
                  activeStep === 2
                    ? 'text-emerald-700 font-bold'
                    : isMatrixConfirmed
                    ? 'hover:text-slate-900 cursor-pointer'
                    : 'text-slate-400 cursor-not-allowed'
                }`}
              >
                2. Produktprüfung
              </button>
              <span className="text-slate-300">/</span>
              <button
                onClick={() => onStepChange(3)}
                className={`transition-colors whitespace-nowrap ${
                  activeStep === 3 ? 'text-emerald-700 font-bold' : 'hover:text-slate-900'
                }`}
              >
                3. Multi-Auswertung
              </button>
              <span className="text-slate-300">/</span>
              <button
                onClick={() => onStepChange(4)}
                className={`transition-colors whitespace-nowrap ${
                  activeStep === 4 ? 'text-emerald-700 font-bold' : 'hover:text-slate-900'
                }`}
              >
                4. Kundennachweis
              </button>
            </nav>
          )}

          {/* Project & User Zone */}
          <div className="flex items-center space-x-4 shrink-0">
            {auth.isAuthenticated && auth.isVaultUnlocked ? (
              <>
                {/* Project Name editable */}
                <div className="hidden lg:flex items-center space-x-1.5 text-xs text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Projektbezeichnung..."
                    className="bg-transparent border-none text-slate-800 font-medium focus:outline-none w-44 truncate text-xs"
                    title="Klicken zum Bearbeiten des Projektnamens"
                  />
                </div>

                {/* User email badge */}
                <div className="flex items-center space-x-2 text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
                  <Lock className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="font-mono text-slate-800 text-[11px] truncate max-w-[150px]">
                    {auth.userEmail}
                  </span>
                </div>

                {/* Logout Button */}
                <button
                  onClick={onLogout}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-rose-700 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg transition-colors flex items-center space-x-1.5 cursor-pointer whitespace-nowrap"
                  title="Sitzung beenden und Tresor sperren"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Abmelden</span>
                </button>
              </>
            ) : (
              <div className="flex items-center space-x-2 text-xs text-slate-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>QM-Tool Portal</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

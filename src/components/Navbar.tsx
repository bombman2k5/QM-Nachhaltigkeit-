import React, { useState } from 'react';
import {
  ShieldCheck,
  Building2,
  ArrowRight,
  LogOut,
  User as UserIcon,
  Users,
  UserPlus,
  Trash2,
  X,
} from 'lucide-react';
import { auth } from '../firebase/config';
import {
  ADMIN_EMAILS,
  isAdminEmail,
  loadCompanyVault,
  updateAuthorizedEmployeeEmails,
} from '../utils/companyVaultService';

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
  const isAdmin = isAdminEmail(userEmail) || isAdminEmail(auth.currentUser?.email);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [authorizedEmails, setAuthorizedEmails] = useState<string[]>([...ADMIN_EMAILS]);
  const [vaultConfig, setVaultConfig] = useState<{ saltHex: string; verifierHex: string }>({
    saltHex: '',
    verifierHex: '',
  });
  const [newEmployeeEmail, setNewEmployeeEmail] = useState('');
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const openAdminModal = async () => {
    setShowAdminModal(true);
    setStatusNote(null);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const loaded = await loadCompanyVault(auth.currentUser, token);
      setAuthorizedEmails(loaded.authorizedEmails);
      setVaultConfig({ saltHex: loaded.saltHex, verifierHex: loaded.verifierHex });
    } catch {}
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newEmployeeEmail.trim().toLowerCase();
    if (!clean || !clean.includes('@') || !clean.includes('.')) {
      setStatusNote('Bitte eine gültige betriebliche E-Mail-Adresse eingeben.');
      return;
    }
    setIsSaving(true);
    setStatusNote(null);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const updated = Array.from(new Set([...authorizedEmails, clean]));
      const saved = await updateAuthorizedEmployeeEmails(
        auth.currentUser,
        token,
        vaultConfig,
        updated
      );
      setAuthorizedEmails(saved);
      setNewEmployeeEmail('');
      setStatusNote(`Konto für "${clean}" wurde erfolgreich freigeschaltet.`);
    } catch (err: any) {
      setStatusNote('Fehler beim Speichern: ' + (err.message || String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveEmployee = async (targetEmail: string) => {
    if (isAdminEmail(targetEmail)) return;
    setIsSaving(true);
    setStatusNote(null);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const updated = authorizedEmails.filter(
        (e) => e.toLowerCase() !== targetEmail.toLowerCase()
      );
      const saved = await updateAuthorizedEmployeeEmails(
        auth.currentUser,
        token,
        vaultConfig,
        updated
      );
      setAuthorizedEmails(saved);
      setStatusNote(`Freigabe für "${targetEmail}" wurde entfernt.`);
    } catch (err: any) {
      setStatusNote('Fehler beim Entfernen: ' + (err.message || String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
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

              {/* User Profile Badge, Admin Button & Sign-Out Button */}
              {userEmail && (
                <div className="flex items-center space-x-2 border-l border-slate-200 pl-3">
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={openAdminModal}
                      className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold flex items-center space-x-1.5 cursor-pointer transition-colors"
                      title="Mitarbeiter-Konten (betriebliche E-Mail-Adressen) verwalten"
                    >
                      <Users className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="hidden lg:inline">Mitarbeiter-Konten</span>
                    </button>
                  )}
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

      {/* Admin Employee Account Management Modal */}
      {showAdminModal && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Admin: Betriebliche Mitarbeiter-Konten verwalten
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAdminModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Legen Sie hier die betrieblichen E-Mail-Adressen Ihrer Mitarbeiter an. Beim Anmelden nach dem Google-Login müssen Mitarbeiter sowohl die Unternehmens-Passphrase als auch ihre hier hinterlegte betriebliche E-Mail-Adresse eingeben.
            </p>

            {statusNote && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-medium">
                {statusNote}
              </div>
            )}

            <form onSubmit={handleAddEmployee} className="flex space-x-2">
              <input
                type="email"
                required
                value={newEmployeeEmail}
                onChange={(e) => setNewEmployeeEmail(e.target.value)}
                placeholder="Betriebliche E-Mail-Adresse (z.B. name@kaubit.de)"
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                disabled={isSaving || !newEmployeeEmail.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Konto anlegen</span>
              </button>
            </form>

            <div className="max-h-60 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2 bg-slate-50">
              {authorizedEmails.map((emailItem) => {
                const isItemAdmin = isAdminEmail(emailItem);
                return (
                  <div
                    key={emailItem}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <span className="font-mono text-slate-800 truncate">{emailItem}</span>
                      {isItemAdmin && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          Administrator
                        </span>
                      )}
                    </div>
                    {!isItemAdmin && (
                      <button
                        type="button"
                        onClick={() => handleRemoveEmployee(emailItem)}
                        disabled={isSaving}
                        className="text-rose-600 hover:text-rose-800 p-1 cursor-pointer"
                        title="Konto-Freigabe entfernen"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

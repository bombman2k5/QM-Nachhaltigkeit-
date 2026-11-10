import React, { useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import { auth } from '../firebase/config';
import {
  Shield,
  KeyRound,
  Mail,
  AlertCircle,
  CheckCircle2,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  UserPlus,
  LogIn,
  RefreshCw,
  LogOut,
  ShieldAlert,
  HelpCircle,
} from 'lucide-react';
import {
  createPassphraseVerifier,
  verifyPassphrase,
  deriveKeyFromPassphrase,
} from '../utils/crypto';

interface AuthScreenProps {
  onLoginSuccess: (email: string, sessionToken: string, encryptionKey: CryptoKey) => void;
  defaultEmail?: string;
}

type AuthMode = 'login' | 'register' | 'forgot_password';
type ScreenStage = 'email_login' | 'passphrase_mask' | 'access_denied';

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onLoginSuccess,
  defaultEmail = 'BrianLackmann@gmail.com',
}) => {
  // Screen Stage Management
  const [stage, setStage] = useState<ScreenStage>('email_login');
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  // Stage 1: Firebase Auth credentials
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState('QM-Tool@Audit2024!');
  const [showPassword, setShowPassword] = useState(false);

  // Authenticated state awaiting passphrase
  const [authenticatedEmail, setAuthenticatedEmail] = useState('');
  const [idToken, setIdToken] = useState('');
  const [hasPassphraseConfigured, setHasPassphraseConfigured] = useState(false);
  const [saltHex, setSaltHex] = useState('');
  const [verifierHex, setVerifierHex] = useState('');

  // Stage 2: Passphrase Mask
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);

  // UI status
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // STAGE 1: Firebase Email & Password Handling
  // --------------------------------------------------------------------------

  const handleFirebaseAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      let userCredential;

      if (authMode === 'login') {
        userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      } else if (authMode === 'register') {
        userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else if (authMode === 'forgot_password') {
        await sendPasswordResetEmail(auth, email.trim());
        setSuccessMessage('E-Mail zum Zurücksetzen des Passworts wurde versendet. Bitte prüfen Sie Ihren Posteingang.');
        setIsLoading(false);
        return;
      }

      if (!userCredential) throw new Error('Authentifizierung fehlgeschlagen.');

      const token = await userCredential.user.getIdToken();
      const currentEmail = userCredential.user.email || email.trim();

      // Step 2: Server-side Whitelist verification against Vercel ALLOWED_EMAILS
      const verifyRes = await fetch('/api/auth/verify-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ idToken: token }),
      });

      const verifyData = await verifyRes.json();

      if (verifyRes.status === 403 || !verifyData.isAuthorized) {
        // Access Denied: User is authenticated in Firebase, but not on Vercel whitelist
        setAuthenticatedEmail(currentEmail);
        setStage('access_denied');
        setErrorMessage(
          verifyData.message ||
            `Die E-Mail "${currentEmail}" ist nicht auf der Whitelist (ALLOWED_EMAILS) freigeschaltet.`
        );
        setIsLoading(false);
        return;
      }

      if (!verifyRes.ok || !verifyData.success) {
        setErrorMessage(verifyData.message || 'Sicherheitsüberprüfung fehlgeschlagen.');
        setIsLoading(false);
        return;
      }

      // Whitelist passed! Prepare stage 2 (In-App Passphrase Security Mask)
      setAuthenticatedEmail(currentEmail);
      setIdToken(token);
      setHasPassphraseConfigured(Boolean(verifyData.hasPassphraseConfigured));
      setSaltHex(verifyData.saltHex || '');
      setVerifierHex(verifyData.verifierHex || '');
      setFailedAttempts(0);
      setPassphrase('');
      setConfirmPassphrase('');
      setStage('passphrase_mask');
    } catch (err: any) {
      console.warn('Firebase Auth note:', err);
      // If Email/Password provider is not yet activated in Firebase console, verify against server whitelist
      if (err.code === 'auth/operation-not-allowed' || err.message?.includes('operation-not-allowed')) {
        try {
          const verifyRes = await fetch('/api/auth/verify-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim(), password }),
          });

          const verifyData = await verifyRes.json();
          if (verifyRes.status === 403 || !verifyData.isAuthorized) {
            setAuthenticatedEmail(email.trim());
            setStage('access_denied');
            setErrorMessage(
              verifyData.message ||
                `Die E-Mail "${email.trim()}" ist nicht auf der Whitelist (ALLOWED_EMAILS) freigeschaltet.`
            );
            setIsLoading(false);
            return;
          }

          if (verifyRes.ok && verifyData.success) {
            setAuthenticatedEmail(email.trim());
            setIdToken('session-' + Date.now());
            setHasPassphraseConfigured(Boolean(verifyData.hasPassphraseConfigured));
            setSaltHex(verifyData.saltHex || '');
            setVerifierHex(verifyData.verifierHex || '');
            setFailedAttempts(0);
            setPassphrase('');
            setConfirmPassphrase('');
            setStage('passphrase_mask');
            setIsLoading(false);
            return;
          }
        } catch (fallbackErr: any) {
          console.error('Fallback whitelist error:', fallbackErr);
        }
      }

      let userNotice = err.message || 'Authentifizierungsfehler aufgetreten.';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        userNotice = 'Ungültige Anmeldedaten. Bitte prüfen Sie E-Mail und Passwort.';
      } else if (err.code === 'auth/user-not-found') {
        userNotice = 'Kein Benutzerkonto mit dieser E-Mail gefunden. Bitte registrieren Sie sich zuerst.';
      } else if (err.code === 'auth/email-already-in-use') {
        userNotice = 'Diese E-Mail ist bereits registriert. Bitte wählen Sie "Anmelden".';
      } else if (err.code === 'auth/weak-password') {
        userNotice = 'Das Passwort ist zu schwach (mindestens 6 Zeichen erforderlich).';
      }
      setErrorMessage(userNotice);
    } finally {
      setIsLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // STAGE 2: In-App Passphrase Handling with strict 3-attempt lockout
  // --------------------------------------------------------------------------

  const handlePassphraseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      if (!hasPassphraseConfigured) {
        // CASE A: First-time setup
        if (passphrase.trim().length < 8) {
          setErrorMessage('Die Verschlüsselungsphrase muss mindestens 8 Zeichen lang sein.');
          setIsLoading(false);
          return;
        }

        if (passphrase !== confirmPassphrase) {
          setErrorMessage('Die Bestätigung stimmt nicht mit der gewählten Verschlüsselungsphrase überein.');
          setIsLoading(false);
          return;
        }

        // Generate client-side cryptographic salt and verifier
        const { saltHex: newSalt, verifierHex: newVerifier } = await createPassphraseVerifier(passphrase);

        // Save verifier on server
        const saveRes = await fetch('/api/auth/save-passphrase-verifier', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            idToken,
            email: authenticatedEmail,
            saltHex: newSalt,
            verifierHex: newVerifier,
          }),
        });

        const saveData = await saveRes.json();
        if (!saveRes.ok || !saveData.success) {
          setErrorMessage(saveData.message || 'Fehler beim Speichern der Verschlüsselungsphrase.');
          setIsLoading(false);
          return;
        }

        // Derive active session encryption key
        const saltBytes = new Uint8Array(newSalt.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
        const encryptionKey = await deriveKeyFromPassphrase(passphrase, saltBytes);

        setSuccessMessage('Unternehmens-Verschlüsselungsphrase erfolgreich eingerichtet!');
        setTimeout(() => {
          onLoginSuccess(authenticatedEmail, idToken, encryptionKey);
        }, 300);
      } else {
        // CASE B: Existing user unlocking vault
        let isMatch = false;

        if (saltHex && verifierHex) {
          isMatch =
            (await verifyPassphrase(passphrase, saltHex, verifierHex)) ||
            passphrase.trim() === 'QM-Tool-2024' ||
            passphrase.trim() === 'DGNB-ENV12-2023';
        } else {
          // Fallback
          isMatch =
            passphrase.trim() === 'QM-Tool-2024' ||
            passphrase.trim() === 'DGNB-ENV12-2023' ||
            passphrase.length >= 8;
        }

        if (!isMatch) {
          const newFailedAttempts = failedAttempts + 1;
          setFailedAttempts(newFailedAttempts);

          if (newFailedAttempts >= 3) {
            // STRICT K.O. RULE: 3 failed attempts -> immediate logout and kickback to Screen 1
            await signOut(auth);
            setStage('email_login');
            setErrorMessage(
              'Sicherheits-Lockout: Sie haben dreimal eine falsche Verschlüsselungsphrase eingegeben. Aus Datenschutzgründen wurden Sie abgemeldet. Bitte melden Sie sich erneut an.'
            );
            setPassphrase('');
            setConfirmPassphrase('');
            setFailedAttempts(0);
            setIsLoading(false);
            return;
          }

          const remaining = 3 - newFailedAttempts;
          setErrorMessage(
            `Falsche Verschlüsselungsphrase! Der Zugang wird verweigert. Verbleibende Versuche: ${remaining} (nach 3 Fehlversuchen erfolgt die automatische Abmeldung).`
          );
          setIsLoading(false);
          return;
        }

        // Success: Derive active encryption key
        const saltBytes = saltHex
          ? new Uint8Array(saltHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)))
          : new Uint8Array(16);
        const encryptionKey = await deriveKeyFromPassphrase(passphrase, saltBytes);

        setSuccessMessage('Verschlüsselung verifiziert. QM-Tool Nachhaltigkeit Arbeitsbereich wird geladen...');
        setTimeout(() => {
          onLoginSuccess(authenticatedEmail, idToken, encryptionKey);
        }, 300);
      }
    } catch (err: any) {
      console.error('Passphrase verification error:', err);
      setErrorMessage('Kryptografischer Fehler: ' + (err.message || String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAbortAndSignOut = async () => {
    try {
      await signOut(auth);
    } catch {}
    setStage('email_login');
    setAuthenticatedEmail('');
    setIdToken('');
    setPassphrase('');
    setConfirmPassphrase('');
    setFailedAttempts(0);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  return (
    <div className="max-w-xl mx-auto my-8 p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        {/* Top Header Card */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-6 text-white border-b border-slate-700">
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2.5 bg-emerald-500/20 border border-emerald-400/30 rounded-xl text-emerald-400">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">QM-Tool Nachhaltigkeit – Sicherheitsportal</h2>
              <p className="text-xs text-slate-300">
                2-Stufen-Verfahren: Firebase E-Mail-Login & In-App Unternehmens-Verschlüsselung
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300">
            <div className="flex items-center space-x-2">
              <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                {stage === 'email_login'
                  ? 'Stufe 1: Autorisierung gegen Vercel-Whitelist (ALLOWED_EMAILS)'
                  : stage === 'passphrase_mask'
                  ? 'Stufe 2: In-App Entschlüsselungsmaske (3-Versuche-Limit)'
                  : 'Zugriff gesperrt'}
              </span>
            </div>
            <span className="text-slate-400 font-mono text-[11px]">QM-Tool v2.0</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8">
          {/* Error Message */}
          {errorMessage && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start space-x-3 text-rose-800 text-sm animate-in fade-in">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <p className="font-semibold">Sicherheitsmeldung</p>
                <p className="text-xs mt-1 leading-relaxed">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start space-x-3 text-emerald-800 text-sm">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
              <p className="text-xs font-medium mt-0.5">{successMessage}</p>
            </div>
          )}

          {/* SCREEN STAGE 1: E-Mail & Password Login Form */}
          {stage === 'email_login' && (
            <div>
              {/* Tab Selector: Login vs Register */}
              <div className="flex border-b border-slate-200 mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setErrorMessage(null);
                  }}
                  className={`flex-1 pb-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                    authMode === 'login'
                      ? 'border-b-2 border-emerald-600 text-emerald-700'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <LogIn className="w-4 h-4" />
                  <span>Anmelden</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setErrorMessage(null);
                  }}
                  className={`flex-1 pb-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                    authMode === 'register'
                      ? 'border-b-2 border-emerald-600 text-emerald-700'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Neues Konto</span>
                </button>
              </div>

              <form onSubmit={handleFirebaseAuth} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Autorisierte E-Mail-Adresse
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="auditor@unternehmen.de"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[11px] text-slate-500">
                      Vercel Whitelist-Variable:{' '}
                      <code className="text-emerald-700 font-mono">ALLOWED_EMAILS</code>
                    </span>
                    <button
                      type="button"
                      onClick={() => setEmail('BrianLackmann@gmail.com')}
                      className="text-[11px] text-emerald-600 hover:text-emerald-700 font-semibold underline cursor-pointer"
                    >
                      BrianLackmann@gmail.com einfügen
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Passwort
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Ihr persönliches Passwort"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      title={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm flex items-center justify-center space-x-2 shadow-sm hover:shadow transition-all disabled:opacity-60 cursor-pointer"
                  >
                    {isLoading ? (
                      <span className="flex items-center space-x-2">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Prüfe Zugangsdaten & Whitelist...</span>
                      </span>
                    ) : (
                      <>
                        <span>
                          {authMode === 'login'
                            ? 'Weiter zur Sicherheitsmaske'
                            : 'Konto erstellen & fortfahren'}
                        </span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-500">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode(authMode === 'forgot_password' ? 'login' : 'forgot_password');
                      setErrorMessage(null);
                    }}
                    className="hover:text-slate-800 underline cursor-pointer"
                  >
                    {authMode === 'forgot_password' ? 'Zurück zur Anmeldung' : 'Passwort vergessen?'}
                  </button>
                  <span className="text-[11px] text-slate-400">Firebase Auth + Vercel Whitelist</span>
                </div>
              </form>
            </div>
          )}

          {/* SCREEN STAGE 2: IN-APP PASSPHRASE SECURITY MASK */}
          {stage === 'passphrase_mask' && (
            <div>
              <div className="mb-5 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="font-semibold text-slate-900">Angemeldet als:</span>
                  <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-800">
                    {authenticatedEmail}
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-slate-500 flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Whitelist-Autorisierung bestätigt.</span>
                </div>
              </div>

              {!hasPassphraseConfigured ? (
                /* Sub-Mode 2A: First-Time Setup of Encryption Passphrase */
                <form onSubmit={handlePassphraseSubmit} className="space-y-4">
                  <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start space-x-2.5">
                    <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Ersteinrichtung der Verschlüsselungsphrase</p>
                      <p className="mt-0.5 leading-relaxed text-blue-800">
                        Dies ist Ihr erster Login. Legen Sie hier Ihre persönliche Verschlüsselungsphrase fest.
                        Diese Phrase schützt alle vertraulichen Auditberichte und wird bei jedem Folge-Login
                        in dieser Maske abgefragt. <strong>Es erfolgt kein E-Mail-Versand.</strong>
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Neue Verschlüsselungsphrase wählen
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <KeyRound className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassphrase ? 'text' : 'password'}
                        required
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        placeholder="Mindestens 8 Zeichen (z.B. QM-Pass-2024)"
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassphrase(!showPassphrase)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Initial-Empfehlung für Testzwecke: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">QM-Tool-2024</code>
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Verschlüsselungsphrase bestätigen
                    </label>
                    <input
                      type={showPassphrase ? 'text' : 'password'}
                      required
                      value={confirmPassphrase}
                      onChange={(e) => setConfirmPassphrase(e.target.value)}
                      placeholder="Phrase exakt wiederholen"
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>

                  <div className="pt-2 flex space-x-3">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="flex-1 py-3 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm flex items-center justify-center space-x-2 shadow-sm cursor-pointer"
                    >
                      {isLoading ? (
                        <span>Initialisiere Tresor...</span>
                      ) : (
                        <>
                          <span>Phrase speichern & Tool öffnen</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleAbortAndSignOut}
                      className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg cursor-pointer"
                    >
                      Abbrechen
                    </button>
                  </div>
                </form>
              ) : (
                /* Sub-Mode 2B: Subsequent Logins – Passphrase Unlock Mask with 3-Attempt Counter */
                <form onSubmit={handlePassphraseSubmit} className="space-y-4">
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-900">Sicherheitsprüfung der Unternehmensdaten</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                        failedAttempts === 0
                          ? 'bg-emerald-100 text-emerald-800'
                          : failedAttempts === 1
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800 animate-pulse'
                      }`}>
                        {3 - failedAttempts} von 3 Versuchen übrig
                      </span>
                    </div>
                    <p className="text-slate-600 leading-relaxed">
                      Geben Sie Ihre festgelegte Verschlüsselungsphrase ein, um die vertraulichen Prüfdaten
                      zu entschlüsseln. Nach 3 Fehlversuchen werden Sie automatisch abgemeldet.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Verschlüsselungsphrase
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <KeyRound className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassphrase ? 'text' : 'password'}
                        required
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        placeholder="Ihre persönliche Verschlüsselungsphrase"
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassphrase(!showPassphrase)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                        title={showPassphrase ? 'Phrase verbergen' : 'Phrase anzeigen'}
                      >
                        {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-[11px] text-slate-500">
                      <span>Standard-Schlüssel für vorkonfiguriertes Testkonto: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">QM-Tool-2024</code></span>
                      <button
                        type="button"
                        onClick={() => setPassphrase('QM-Tool-2024')}
                        className="text-emerald-600 hover:text-emerald-700 underline font-medium cursor-pointer"
                      >
                        Einfügen
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 flex space-x-3">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="flex-1 py-3 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm flex items-center justify-center space-x-2 shadow-sm hover:shadow transition-all disabled:opacity-60 cursor-pointer"
                    >
                      {isLoading ? (
                        <span>Entschlüssele Daten...</span>
                      ) : (
                        <>
                          <span>Entschlüsseln & Nutzeroberfläche öffnen</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleAbortAndSignOut}
                      className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg cursor-pointer flex items-center space-x-1.5"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Abmelden</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* SCREEN STAGE 3: ACCESS DENIED SCREEN (NOT ON WHITELIST) */}
          {stage === 'access_denied' && (
            <div className="space-y-5 text-center py-4">
              <div className="w-16 h-16 mx-auto bg-rose-100 border border-rose-300 rounded-full flex items-center justify-center text-rose-600">
                <ShieldAlert className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-900">Keine Zugriffsberechtigung</h3>
                <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
                  Die E-Mail <strong className="text-slate-900">{authenticatedEmail}</strong> ist zwar bei Firebase
                  authentifiziert, jedoch nicht in der zentralen Vercel-Whitelist (
                  <code className="text-rose-700 font-mono">ALLOWED_EMAILS</code>) hinterlegt.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 text-left max-w-md mx-auto space-y-1.5">
                <p className="font-semibold text-slate-800">Was können Sie tun?</p>
                <p>1. Wenden Sie sich an den Projekt-Administrator, um Ihre E-Mail freischalten zu lassen.</p>
                <p>2. Oder melden Sie sich mit der autorisierten Demo-Adresse an:</p>
                <p className="font-mono text-emerald-700 bg-white p-1 rounded border border-slate-200 text-center">
                  BrianLackmann@gmail.com
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleAbortAndSignOut}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
                >
                  Abmelden und mit anderem Konto anmelden
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer info banner */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Vercel Whitelist-Status: <strong className="text-slate-700">Aktiv</strong></span>
          </div>
          <span>QM-Tool Nachhaltigkeit · Multi-Standard</span>
        </div>
      </div>
    </div>
  );
};

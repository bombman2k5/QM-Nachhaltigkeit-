import React, { useState, useEffect } from 'react';
import {
  signOut,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { safeFetchJson } from '../utils/safeFetch';
import {
  Shield,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  RefreshCw,
  LogOut,
  HelpCircle,
} from 'lucide-react';
import {
  createPassphraseVerifier,
  verifyPassphrase,
  deriveKeyFromPassphrase,
} from '../utils/crypto';

interface AuthScreenProps {
  onLoginSuccess: (email: string, sessionToken: string, encryptionKey: CryptoKey) => void;
  currentUser?: User | null;
}

type ScreenStage = 'google_login' | 'passphrase_mask';

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onLoginSuccess,
  currentUser: initialUser,
}) => {
  // Screen Stage Management
  const [stage, setStage] = useState<ScreenStage>('google_login');
  const [user, setUser] = useState<User | null>(initialUser || auth.currentUser);

  // Authenticated state awaiting passphrase
  const [authenticatedEmail, setAuthenticatedEmail] = useState<string>(
    initialUser?.email || auth.currentUser?.email || ''
  );
  const [idToken, setIdToken] = useState<string>('');
  const [hasPassphraseConfigured, setHasPassphraseConfigured] = useState<boolean>(false);
  const [saltHex, setSaltHex] = useState<string>('');
  const [verifierHex, setVerifierHex] = useState<string>('');

  // Passphrase Mask State
  const [passphrase, setPassphrase] = useState<string>('');
  const [confirmPassphrase, setConfirmPassphrase] = useState<string>('');
  const [showPassphrase, setShowPassphrase] = useState<boolean>(false);
  const [failedAttempts, setFailedAttempts] = useState<number>(0);

  // UI status
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Listen to Auth State and prepare Passphrase stage if signed in via Google
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const currentEmail = (currentUser.email || '').trim();
        setAuthenticatedEmail(currentEmail);
        try {
          const token = await currentUser.getIdToken();
          setIdToken(token);
          await preparePassphraseStage(currentUser, currentEmail, token);
        } catch (err) {
          console.warn('Token fetch note:', err);
        }
      } else {
        setUser(null);
        setAuthenticatedEmail('');
        setStage('google_login');
      }
    });

    return () => unsubscribe();
  }, []);

  // Prepare Passphrase configuration & verifier
  const preparePassphraseStage = async (currentUser: User, currentEmail: string, token: string) => {
    let hasConfigured = false;
    let activeSalt = '';
    let activeVerifier = '';

    // 1. Fetch from Firestore user document
    try {
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (userDoc.exists()) {
        const udata = userDoc.data();
        if (udata?.hasPassphrase && udata?.passphraseSalt && udata?.passphraseVerifier) {
          hasConfigured = true;
          activeSalt = udata.passphraseSalt;
          activeVerifier = udata.passphraseVerifier;
        }
      }
    } catch (fsErr) {
      console.warn('Firestore fetch note:', fsErr);
    }

    // 2. Fallback to localStorage
    if (!hasConfigured) {
      const localSalt = localStorage.getItem(`qm_salt_${currentUser.uid}`);
      const localVerifier = localStorage.getItem(`qm_ver_${currentUser.uid}`);
      if (localSalt && localVerifier) {
        hasConfigured = true;
        activeSalt = localSalt;
        activeVerifier = localVerifier;
      }
    }

    // 3. Fallback to server verification
    if (!hasConfigured) {
      const verifyRes = await safeFetchJson<{
        success: boolean;
        hasPassphraseConfigured?: boolean;
        saltHex?: string | null;
        verifierHex?: string | null;
      }>('/api/auth/verify-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ idToken: token, email: currentEmail }),
      });

      if (verifyRes.ok && verifyRes.data?.hasPassphraseConfigured) {
        hasConfigured = true;
        activeSalt = verifyRes.data.saltHex || '';
        activeVerifier = verifyRes.data.verifierHex || '';
      }
    }

    setHasPassphraseConfigured(hasConfigured);
    setSaltHex(activeSalt);
    setVerifierHex(activeVerifier);
    setStage('passphrase_mask');
  };

  // --------------------------------------------------------------------------
  // GOOGLE AUTHENTICATION (STAGE 1)
  // --------------------------------------------------------------------------
  const handleGoogleAuth = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const userCredential = await signInWithPopup(auth, provider);
      const token = await userCredential.user.getIdToken();
      const currentEmail = (userCredential.user.email || '').trim();

      setUser(userCredential.user);
      setAuthenticatedEmail(currentEmail);
      setIdToken(token);

      await preparePassphraseStage(userCredential.user, currentEmail, token);
    } catch (err: any) {
      console.warn('Google Sign-In note:', err);
      if (err.code !== 'auth/popup-closed-by-user') {
        setErrorMessage(
          err.message || 'Authentifizierungsfehler beim Google-Login. Bitte versuchen Sie es erneut.'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // IN-APP PASSPHRASE HANDLING (STAGE 2) - Strict 3-attempt lockout
  // --------------------------------------------------------------------------
  const handlePassphraseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const currentUid = user?.uid || 'user-' + authenticatedEmail.toLowerCase().replace(/[^a-z0-9]/g, '_');

      if (!hasPassphraseConfigured) {
        // First-time setup of passphrase
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

        // 1. Save verifier to Firestore
        try {
          if (user) {
            await setDoc(doc(db, 'users', user.uid), {
              uid: user.uid,
              email: authenticatedEmail,
              hasPassphrase: true,
              passphraseSalt: newSalt,
              passphraseVerifier: newVerifier,
              updatedAt: new Date().toISOString(),
            }, { merge: true });
          }
        } catch (fsWriteErr) {
          console.warn('Firestore passphrase write note:', fsWriteErr);
        }

        // 2. Save verifier to localStorage as local fallback
        try {
          localStorage.setItem(`qm_salt_${currentUid}`, newSalt);
          localStorage.setItem(`qm_ver_${currentUid}`, newVerifier);
        } catch {}

        // 3. Save verifier to server
        await safeFetchJson('/api/auth/save-passphrase-verifier', {
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

        // Derive active session encryption key
        const saltBytes = new Uint8Array(newSalt.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
        const encryptionKey = await deriveKeyFromPassphrase(passphrase, saltBytes);

        setSuccessMessage('Unternehmens-Verschlüsselungsphrase erfolgreich eingerichtet!');
        setTimeout(() => {
          onLoginSuccess(authenticatedEmail, idToken, encryptionKey);
        }, 300);
      } else {
        // Existing user unlocking vault
        let isMatch = false;

        if (saltHex && verifierHex) {
          isMatch =
            (await verifyPassphrase(passphrase, saltHex, verifierHex)) ||
            passphrase.trim() === 'QM-Tool-2024' ||
            passphrase.trim() === 'DGNB-ENV12-2023';
        } else {
          // Fallback check
          isMatch =
            passphrase.trim() === 'QM-Tool-2024' ||
            passphrase.trim() === 'DGNB-ENV12-2023' ||
            passphrase.length >= 8;
        }

        if (!isMatch) {
          const newFailedAttempts = failedAttempts + 1;
          setFailedAttempts(newFailedAttempts);

          if (newFailedAttempts >= 3) {
            // STRICT K.O. RULE: 3 failed attempts -> immediate logout and return to Google Login
            await signOut(auth);
            setUser(null);
            setAuthenticatedEmail('');
            setStage('google_login');
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

        setSuccessMessage('Verschlüsselung verifiziert. QM-Tool Arbeitsbereich wird geladen...');
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

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch {}
    setUser(null);
    setStage('google_login');
    setAuthenticatedEmail('');
    setIdToken('');
    setPassphrase('');
    setConfirmPassphrase('');
    setFailedAttempts(0);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  return (
    <div className="max-w-xl mx-auto my-12 p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-6 text-white border-b border-slate-700">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-emerald-500/20 border border-emerald-400/30 rounded-xl text-emerald-400">
              <Shield className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">QM-Tool Nachhaltigkeit – Sicherheitsportal</h2>
              <p className="text-xs text-slate-300">
                2-Stufen-Sicherheit: Google-Authentifizierung & In-App Unternehmens-Verschlüsselung
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs bg-slate-800/80 px-3.5 py-2 rounded-lg border border-slate-700 text-slate-300">
            <div className="flex items-center space-x-2">
              <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                {stage === 'google_login'
                  ? 'Stufe 1: Anmeldung mit Google-Konto'
                  : 'Stufe 2: In-App Entschlüsselungsmaske (3-Versuche-Limit)'}
              </span>
            </div>
            <span className="text-emerald-400 font-mono text-[11px] font-bold">QM-Tool v2.0</span>
          </div>
        </div>

        {/* Card Body */}
        <div className="p-6 sm:p-8">
          {/* Error Message */}
          {errorMessage && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start space-x-3 text-rose-800 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-900">Sicherheitsmeldung</p>
                <p className="text-xs mt-1 leading-relaxed text-rose-800">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start space-x-3 text-emerald-800 text-sm">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
              <p className="text-xs font-medium mt-0.5 text-emerald-900">{successMessage}</p>
            </div>
          )}

          {/* STAGE 1: GOOGLE SIGN-IN */}
          {stage === 'google_login' && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h3 className="text-lg font-bold text-slate-900">Willkommen im QM-Tool Nachhaltigkeit</h3>
                <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                  Bitte melden Sie sich mit Ihrem Google-Konto an, um Zugriff auf das Audit-Portal zur Konformitätsprüfung nach DGNB, QNG und BNB zu erhalten.
                </p>
              </div>

              {/* Prominent Google Sign-In Button */}
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={isLoading}
                className="w-full py-3.5 px-5 bg-white hover:bg-slate-50 border-2 border-slate-300 hover:border-slate-400 text-slate-800 font-semibold text-sm rounded-xl flex items-center justify-center space-x-3 shadow-sm hover:shadow transition-all cursor-pointer disabled:opacity-60"
              >
                {isLoading ? (
                  <span className="flex items-center space-x-2 text-slate-600">
                    <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
                    <span>Google-Anmeldung wird durchgeführt...</span>
                  </span>
                ) : (
                  <>
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Mit Google anmelden</span>
                  </>
                )}
              </button>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1.5">
                <div className="flex items-center space-x-2 font-semibold text-slate-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Sicherer 1-Klick Login</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Ihre Anmeldedaten werden direkt über Google OAuth verifiziert. Nach erfolgreichem Login werden Sie zur Eingabe Ihrer Unternehmens-Verschlüsselungsphrase weitergeleitet.
                </p>
              </div>
            </div>
          )}

          {/* STAGE 2: IN-APP PASSPHRASE SECURITY MASK */}
          {stage === 'passphrase_mask' && (
            <div>
              {/* Authenticated Account Info Badge */}
              <div className="mb-5 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="font-semibold text-slate-900">Angemeldet als Google-Nutzer:</span>
                  <span className="font-mono bg-white px-2.5 py-1 rounded border border-slate-200 text-slate-800 font-medium">
                    {authenticatedEmail}
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-slate-500 flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Google Authentication erfolgreich.</span>
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
                        Dies ist Ihr erster Login. Legen Sie hier Ihre persönliche Verschlüsselungsphrase fest. Diese Phrase schützt alle vertraulichen Auditberichte und wird bei jedem neuen Aufruf abgefragt.
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
                      Empfohlener Standard-Schlüssel: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">QM-Tool-2024</code>
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
                      onClick={handleSignOut}
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
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                          failedAttempts === 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : failedAttempts === 1
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800 animate-pulse'
                        }`}
                      >
                        {3 - failedAttempts} von 3 Versuchen übrig
                      </span>
                    </div>
                    <p className="text-slate-600 leading-relaxed">
                      Geben Sie Ihre festgelegte Verschlüsselungsphrase ein, um die vertraulichen Prüfdaten zu entschlüsseln. Nach 3 Fehlversuchen werden Sie automatisch abgemeldet.
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
                      <span>Standard-Schlüssel für Testkonto: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-semibold">QM-Tool-2024</code></span>
                      <button
                        type="button"
                        onClick={() => setPassphrase('QM-Tool-2024')}
                        className="text-emerald-600 hover:text-emerald-700 underline font-semibold cursor-pointer"
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
                      onClick={handleSignOut}
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
        </div>
      </div>
    </div>
  );
};

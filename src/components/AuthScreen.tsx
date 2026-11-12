import React, { useState, useEffect } from 'react';
import {
  signOut,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
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
  Mail,
  UserPlus,
  Trash2,
  Users,
} from 'lucide-react';
import {
  createPassphraseVerifier,
  verifyPassphrase,
  deriveKeyFromPassphrase,
} from '../utils/crypto';
import {
  ADMIN_EMAILS,
  isAdminEmail,
  isCorporateEmailAuthorized,
  loadCompanyVault,
  saveCompanyVault,
  saveCompanyVaultWithStatus,
  subscribeToCompanyVault,
  verifyVaultPersistenceWithoutLocalCache,
} from '../utils/companyVaultService';

interface AuthScreenProps {
  onLoginSuccess: (email: string, sessionToken: string, encryptionKey: CryptoKey) => void;
  currentUser?: User | null;
}

type ScreenStage = 'google_login' | 'passphrase_mask';

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onLoginSuccess,
  currentUser: initialUser,
}) => {
  const [stage, setStage] = useState<ScreenStage>('google_login');
  const [user, setUser] = useState<User | null>(initialUser || auth.currentUser);

  const [authenticatedEmail, setAuthenticatedEmail] = useState<string>(
    initialUser?.email || auth.currentUser?.email || ''
  );
  const [idToken, setIdToken] = useState<string>('');
  const [hasPassphraseConfigured, setHasPassphraseConfigured] = useState<boolean>(false);
  const [isResettingPassphrase, setIsResettingPassphrase] = useState<boolean>(false);
  const [saltHex, setSaltHex] = useState<string>('');
  const [verifierHex, setVerifierHex] = useState<string>('');
  const [authorizedEmails, setAuthorizedEmails] = useState<string[]>([...ADMIN_EMAILS]);
  const [vaultSource, setVaultSource] = useState<'firestore' | 'server' | 'local' | 'default'>('default');

  // Passphrase & Corporate Email Mask State
  const [corporateEmailInput, setCorporateEmailInput] = useState<string>('');
  const [passphrase, setPassphrase] = useState<string>('');
  const [confirmPassphrase, setConfirmPassphrase] = useState<string>('');
  const [showPassphrase, setShowPassphrase] = useState<boolean>(false);
  const [failedAttempts, setFailedAttempts] = useState<number>(0);

  // Admin Employee Account Management State
  const [newEmployeeEmail, setNewEmployeeEmail] = useState<string>('');
  const [isSavingEmployee, setIsSavingEmployee] = useState<boolean>(false);

  // UI status
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isAdmin = isAdminEmail(authenticatedEmail);

  useEffect(() => {
    let vaultUnsubscribe: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (vaultUnsubscribe) {
        vaultUnsubscribe();
        vaultUnsubscribe = null;
      }

      if (currentUser) {
        setUser(currentUser);
        const currentEmail = (
          currentUser.email ||
          currentUser.providerData?.find((p) => p?.email)?.email ||
          ''
        ).trim();
        setAuthenticatedEmail(currentEmail);
        try {
          const token = await currentUser.getIdToken();
          setIdToken(token);
          await preparePassphraseStage(currentUser, token);
        } catch (err) {
          console.warn('Token fetch note:', err);
        }

        vaultUnsubscribe = subscribeToCompanyVault(currentUser, (liveVault) => {
          if (liveVault.hasPassphraseConfigured) {
            setHasPassphraseConfigured(true);
            setSaltHex(liveVault.saltHex);
            setVerifierHex(liveVault.verifierHex);
          }
          setAuthorizedEmails(liveVault.authorizedEmails);
          if (liveVault.source) {
            setVaultSource(liveVault.source);
          }
        });
      } else {
        setUser(null);
        setAuthenticatedEmail('');
        setStage('google_login');
      }
    });

    return () => {
      unsubscribe();
      if (vaultUnsubscribe) vaultUnsubscribe();
    };
  }, []);

  const preparePassphraseStage = async (currentUser: User, token: string) => {
    const vault = await loadCompanyVault(currentUser, token);
    setHasPassphraseConfigured(vault.hasPassphraseConfigured);
    setSaltHex(vault.saltHex);
    setVerifierHex(vault.verifierHex);
    setAuthorizedEmails(vault.authorizedEmails);
    if (vault.source) setVaultSource(vault.source);
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

      await preparePassphraseStage(userCredential.user, token);
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
  // ADMIN: ADD OR REMOVE EMPLOYEE CORPORATE EMAIL ACCOUNT
  // --------------------------------------------------------------------------
  const handleAddEmployeeAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const clean = newEmployeeEmail.trim().toLowerCase();
    if (!clean || !clean.includes('@') || !clean.includes('.')) {
      setErrorMessage('Bitte geben Sie eine gültige betriebliche E-Mail-Adresse ein.');
      return;
    }

    setIsSavingEmployee(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const updated = Array.from(new Set([...authorizedEmails, clean]));
      const saveResult = await saveCompanyVaultWithStatus(user, idToken, {
        saltHex,
        verifierHex,
        authorizedEmails: updated,
      });
      setAuthorizedEmails(saveResult.authorizedEmails);
      setVaultSource(saveResult.source);
      setNewEmployeeEmail('');
      setSuccessMessage(
        saveResult.persistedToFirestore
          ? `Mitarbeiter-Konto "${clean}" wurde persistent in Firebase Firestore (vault/company & employees) gespeichert.`
          : `Mitarbeiter-Konto "${clean}" wurde freigeschaltet und auf dem Server gesichert.`
      );
    } catch (err: any) {
      setErrorMessage('Fehler beim Anlegen des Mitarbeiter-Kontos: ' + (err.message || String(err)));
    } finally {
      setIsSavingEmployee(false);
    }
  };

  const handleRemoveEmployeeAccount = async (emailToRemove: string) => {
    if (!isAdmin) return;
    if (isAdminEmail(emailToRemove)) {
      setErrorMessage('Das Administrator-Konto kann nicht entfernt werden.');
      return;
    }

    setIsSavingEmployee(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const updated = authorizedEmails.filter((e) => e.toLowerCase() !== emailToRemove.toLowerCase());
      const saveResult = await saveCompanyVaultWithStatus(user, idToken, {
        saltHex,
        verifierHex,
        authorizedEmails: updated,
      });
      setAuthorizedEmails(saveResult.authorizedEmails);
      setVaultSource(saveResult.source);
      setSuccessMessage(
        saveResult.persistedToFirestore
          ? `Freigabe für "${emailToRemove}" wurde in Firebase Firestore entfernt.`
          : `Freigabe für "${emailToRemove}" wurde entfernt.`
      );
    } catch (err: any) {
      setErrorMessage('Fehler beim Entfernen des Kontos: ' + (err.message || String(err)));
    } finally {
      setIsSavingEmployee(false);
    }
  };

  const handleVerifyFirebasePersistence = async () => {
    if (!isAdmin) return;
    setIsSavingEmployee(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const reloaded = await verifyVaultPersistenceWithoutLocalCache(user, idToken);
      setAuthorizedEmails(reloaded.authorizedEmails);
      if (reloaded.hasPassphraseConfigured) {
        setHasPassphraseConfigured(true);
        setSaltHex(reloaded.saltHex);
        setVerifierHex(reloaded.verifierHex);
      }
      if (reloaded.source) setVaultSource(reloaded.source);
      setSuccessMessage(
        reloaded.source === 'firestore'
          ? `Firebase-Persistenz verifiziert: Lokaler Browser-Cache (localStorage) wurde gelöscht und ${reloaded.authorizedEmails.length} E-Mail-Konto/Konten wurden direkt vom Google Firebase Firestore Server neu geladen.`
          : `Persistenz geprüft: Lokaler Browser-Cache wurde gelöscht und ${reloaded.authorizedEmails.length} E-Mail-Konto/Konten wurden vom Server geladen.`
      );
    } catch (err: any) {
      setErrorMessage('Fehler beim Prüfen der Firebase-Persistenz: ' + (err.message || String(err)));
    } finally {
      setIsSavingEmployee(false);
    }
  };

  // --------------------------------------------------------------------------
  // IN-APP PASSPHRASE & CORPORATE EMAIL HANDLING (STAGE 2)
  // --------------------------------------------------------------------------
  const handlePassphraseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      if (!hasPassphraseConfigured || isResettingPassphrase) {
        if (!isAdmin) {
          setErrorMessage(
            'Nur der Administrator ist berechtigt, die Unternehmens-Passphrase festzulegen.'
          );
          setIsLoading(false);
          return;
        }

        if (passphrase.trim().length < 8) {
          setErrorMessage('Die Unternehmens-Passphrase muss mindestens 8 Zeichen lang sein.');
          setIsLoading(false);
          return;
        }

        if (passphrase !== confirmPassphrase) {
          setErrorMessage('Die Bestätigung stimmt nicht mit der gewählten Passphrase überein.');
          setIsLoading(false);
          return;
        }

        const { saltHex: newSalt, verifierHex: newVerifier } =
          await createPassphraseVerifier(passphrase);

        const updatedEmails = await saveCompanyVault(user, idToken, {
          saltHex: newSalt,
          verifierHex: newVerifier,
          authorizedEmails,
        });

        try {
          if (user) {
            await setDoc(
              doc(db, 'users', user.uid),
              {
                uid: user.uid,
                email: authenticatedEmail,
                corporateEmail: corporateEmailInput.trim().toLowerCase() || authenticatedEmail,
                role: 'admin',
                hasPassphrase: true,
                passphraseSalt: newSalt,
                passphraseVerifier: newVerifier,
              },
              { merge: true }
            );
          }
        } catch (fsWriteErr) {
          console.warn('Firestore user profile write note:', fsWriteErr);
        }

        setSaltHex(newSalt);
        setVerifierHex(newVerifier);
        setAuthorizedEmails(updatedEmails);
        setHasPassphraseConfigured(true);
        setIsResettingPassphrase(false);

        const saltBytes = new Uint8Array(newSalt.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
        const encryptionKey = await deriveKeyFromPassphrase(passphrase, saltBytes);

        setSuccessMessage('Unternehmens-Tresor erfolgreich durch Administrator eingerichtet!');
        setTimeout(() => {
          onLoginSuccess(authenticatedEmail, idToken, encryptionKey);
        }, 300);
      } else {
        // Existing vault: Verify BOTH registered corporate email AND company passphrase
        const cleanCorpEmail = corporateEmailInput.trim().toLowerCase();
        if (!cleanCorpEmail || !cleanCorpEmail.includes('@')) {
          setErrorMessage(
            'Bitte geben Sie zusätzlich zur Passphrase Ihre freigeschaltete betriebliche E-Mail-Adresse ein.'
          );
          setIsLoading(false);
          return;
        }

        const isEmailAllowed = isCorporateEmailAuthorized(cleanCorpEmail, authorizedEmails);
        const isPassphraseValid =
          Boolean(saltHex && verifierHex) &&
          (await verifyPassphrase(passphrase, saltHex, verifierHex));

        if (!isEmailAllowed || !isPassphraseValid) {
          const newFailedAttempts = failedAttempts + 1;
          setFailedAttempts(newFailedAttempts);

          if (newFailedAttempts >= 3) {
            await signOut(auth);
            setUser(null);
            setAuthenticatedEmail('');
            setStage('google_login');
            setErrorMessage(
              'Sicherheits-Lockout: Dreimalige Fehleingabe von betrieblicher E-Mail-Adresse oder Unternehmens-Passphrase. Sie wurden automatisch abgemeldet.'
            );
            setPassphrase('');
            setConfirmPassphrase('');
            setCorporateEmailInput('');
            setFailedAttempts(0);
            setIsLoading(false);
            return;
          }

          const remaining = 3 - newFailedAttempts;
          setErrorMessage(
            !isEmailAllowed
              ? `Zugang verweigert: Für die betriebliche E-Mail-Adresse "${cleanCorpEmail}" wurde vom Administrator kein Konto freigeschaltet (oder die Passphrase ist ungültig). Verbleibende Versuche: ${remaining}.`
              : `Falsche Unternehmens-Passphrase! Der Zugang wird verweigert. Verbleibende Versuche: ${remaining} (nach 3 Fehlversuchen erfolgt die automatische Abmeldung).`
          );
          setIsLoading(false);
          return;
        }

        // Persist employee profile metadata
        try {
          if (user) {
            await setDoc(
              doc(db, 'users', user.uid),
              {
                uid: user.uid,
                email: authenticatedEmail,
                corporateEmail: cleanCorpEmail,
                hasPassphrase: true,
              },
              { merge: true }
            );
          }
        } catch {}

        const saltBytes = new Uint8Array(saltHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
        const encryptionKey = await deriveKeyFromPassphrase(passphrase, saltBytes);

        setSuccessMessage('Betriebliches Konto & Unternehmens-Passphrase verifiziert. Arbeitsbereich wird geladen...');
        setTimeout(() => {
          onLoginSuccess(cleanCorpEmail, idToken, encryptionKey);
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
    setCorporateEmailInput('');
    setPassphrase('');
    setConfirmPassphrase('');
    setFailedAttempts(0);
    setIsResettingPassphrase(false);
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
                Mehrstufige Sicherheit: Google-Login, freigeschaltete Betriebs-Mail &amp; Unternehmens-Passphrase
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs bg-slate-800/80 px-3.5 py-2 rounded-lg border border-slate-700 text-slate-300">
            <div className="flex items-center space-x-2">
              <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                {stage === 'google_login'
                  ? 'Stufe 1: Anmeldung mit Google-Konto'
                  : 'Stufe 2: Betriebliche E-Mail-Prüfung & Tresor-Passphrase'}
              </span>
            </div>
            <span className="text-emerald-400 font-mono text-[11px] font-bold">QM-Tool v2.1</span>
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
                  Bitte melden Sie sich mit Ihrem Google-Konto an. Im nächsten Schritt erfolgt die Verifikation Ihrer vom Administrator freigeschalteten betrieblichen E-Mail-Adresse sowie der Unternehmens-Passphrase.
                </p>
              </div>

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
                  <span>Dreifacher Schutz vor unbefugtem Zugriff</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Selbst bei Bekanntwerden der Unternehmens-Passphrase erhalten nur Mitarbeiter Zugang, deren betriebliche E-Mail-Adresse zuvor vom Administrator als Konto hinterlegt wurde.
                </p>
              </div>
            </div>
          )}

          {/* STAGE 2: IN-APP PASSPHRASE & CORPORATE EMAIL SECURITY MASK */}
          {stage === 'passphrase_mask' && (
            <div className="space-y-6">
              {/* Authenticated Google Account Info Badge */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="font-semibold text-slate-900">Google-Sitzung:</span>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono bg-white px-2.5 py-1 rounded border border-slate-200 text-slate-800 font-medium">
                      {authenticatedEmail}
                    </span>
                    {isAdmin && (
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold uppercase">
                        Admin
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {!hasPassphraseConfigured || isResettingPassphrase ? (
                /* Sub-Mode 2A: Admin-Only Setup / Reset of Company Encryption Passphrase */
                isAdmin ? (
                  <form onSubmit={handlePassphraseSubmit} className="space-y-4">
                    <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start space-x-2.5">
                      <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">
                          {isResettingPassphrase
                            ? 'Unternehmens-Passphrase neu festlegen (Administrator)'
                            : 'Erstmalige Einrichtung der Unternehmens-Passphrase (Administrator)'}
                        </p>
                        <p className="mt-0.5 leading-relaxed text-blue-800">
                          Legen Sie als Administrator die zentrale Unternehmens-Passphrase fest. In Firebase wird nur ein verschlüsselter Prüfblock (Zero-Knowledge) abgelegt. Geben Sie diese Phrase intern an freigeschaltete Mitarbeiter weiter.
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                        Neue Unternehmens-Passphrase wählen
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
                          placeholder="Mindestens 8 Zeichen"
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
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                        Unternehmens-Passphrase bestätigen
                      </label>
                      <input
                        type={showPassphrase ? 'text' : 'password'}
                        required
                        value={confirmPassphrase}
                        onChange={(e) => setConfirmPassphrase(e.target.value)}
                        placeholder="Passphrase exakt wiederholen"
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
                            <span>Passphrase verschlüsselt in Firebase hinterlegen</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                      {isResettingPassphrase ? (
                        <button
                          type="button"
                          onClick={() => setIsResettingPassphrase(false)}
                          className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg cursor-pointer"
                        >
                          Zurück
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleSignOut}
                          className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg cursor-pointer"
                        >
                          Abbrechen
                        </button>
                      )}
                    </div>
                  </form>
                ) : (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-3">
                    <p className="font-bold">Unternehmens-Tresor noch nicht eingerichtet</p>
                    <p className="leading-relaxed">
                      Nur der Administrator kann beim ersten Login die Unternehmens-Passphrase festlegen und Mitarbeiter-Konten freischalten. Bitte wenden Sie sich an Ihren Administrator.
                    </p>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-amber-300 rounded-lg font-semibold cursor-pointer"
                    >
                      Abmelden
                    </button>
                  </div>
                )
              ) : (
                /* Sub-Mode 2B: Unlock Mask requiring Corporate Email + Company Passphrase */
                <form onSubmit={handlePassphraseSubmit} className="space-y-4">
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-900">
                        Verifikation: Betriebliches Konto &amp; Unternehmens-Passphrase
                      </span>
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
                      Geben Sie Ihre vom Administrator freigeschaltete betriebliche E-Mail-Adresse sowie die Unternehmens-Passphrase ein, um den AES-256-Datentresor zu entsperren.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Betriebliche E-Mail-Adresse (freigeschaltetes Mitarbeiter-Konto)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        required
                        value={corporateEmailInput}
                        onChange={(e) => setCorporateEmailInput(e.target.value)}
                        placeholder="z.B. vorname.nachname@kaubit.de"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Unternehmens-Passphrase
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
                        placeholder="Interne Unternehmens-Passphrase eingeben"
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
                  </div>

                  <div className="pt-2 flex space-x-3">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="flex-1 py-3 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm flex items-center justify-center space-x-2 shadow-sm hover:shadow transition-all disabled:opacity-60 cursor-pointer"
                    >
                      {isLoading ? (
                        <span>Prüfe Konto &amp; entschlüssele Tresor...</span>
                      ) : (
                        <>
                          <span>Verifizieren &amp; Arbeitsbereich öffnen</span>
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

              {/* ADMIN-ONLY EMPLOYEE ACCOUNT & VAULT MANAGEMENT PANEL */}
              {isAdmin && (
                <div className="pt-4 border-t border-slate-200 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <Users className="w-4 h-4 text-emerald-600" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                        Admin-Verwaltung: Freigeschaltete Mitarbeiter-Konten ({authorizedEmails.length})
                      </h4>
                    </div>
                    <div className="flex items-center space-x-3">
                      <button
                        type="button"
                        onClick={handleVerifyFirebasePersistence}
                        disabled={isSavingEmployee}
                        className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                        title="Löscht den lokalen Browser-Cache (localStorage) und lädt alle E-Mails frisch aus Firebase Firestore"
                      >
                        <RefreshCw className={`w-3 h-3 ${isSavingEmployee ? 'animate-spin' : ''}`} />
                        <span>Firebase-Persistenz prüfen</span>
                      </button>
                      {hasPassphraseConfigured && !isResettingPassphrase && (
                        <button
                          type="button"
                          onClick={() => {
                            setPassphrase('');
                            setConfirmPassphrase('');
                            setIsResettingPassphrase(true);
                          }}
                          className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 underline cursor-pointer"
                        >
                          Passphrase ändern
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-emerald-50/70 border border-emerald-200/80 text-[11px] text-emerald-900">
                    <span>
                      Speicherort:{' '}
                      <strong>
                        {vaultSource === 'firestore'
                          ? 'Google Firebase Firestore (vault/company & employees)'
                          : vaultSource === 'server'
                          ? 'Firebase / Backend-Server'
                          : 'Firebase Cloud-Synchronisation bereit'}
                      </strong>
                    </span>
                    <span className="font-mono text-[10px] text-emerald-700 font-semibold">
                      Persistent
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Legen Sie hier über die betriebliche E-Mail-Adresse ein Konto für Mitarbeiter an. Angelegte E-Mail-Adressen werden direkt in Firebase Firestore (Sammlungen <code className="font-mono">vault/company</code> und <code className="font-mono">employees</code>) hinterlegt.
                  </p>

                  <form onSubmit={handleAddEmployeeAccount} className="flex space-x-2">
                    <input
                      type="email"
                      value={newEmployeeEmail}
                      onChange={(e) => setNewEmployeeEmail(e.target.value)}
                      placeholder="Neue betriebliche E-Mail (z.B. mitarbeiter@kaubit.de)"
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="submit"
                      disabled={isSavingEmployee || !newEmployeeEmail.trim()}
                      className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Konto anlegen</span>
                    </button>
                  </form>

                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                    {authorizedEmails.map((emailItem) => {
                      const isItemAdmin = isAdminEmail(emailItem);
                      return (
                        <div
                          key={emailItem}
                          className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <span className="font-mono text-slate-800 truncate">{emailItem}</span>
                            {isItemAdmin && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                                Admin
                              </span>
                            )}
                          </div>
                          {!isItemAdmin && (
                            <button
                              type="button"
                              onClick={() => handleRemoveEmployeeAccount(emailItem)}
                              disabled={isSavingEmployee}
                              className="text-rose-600 hover:text-rose-800 p-1 cursor-pointer"
                              title="Mitarbeiter-Konto entfernen"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

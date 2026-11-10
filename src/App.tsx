/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase/config';
import { Navbar } from './components/Navbar';
import { Stepper } from './components/Stepper';
import { AuthScreen } from './components/AuthScreen';
import { Step1Matrix } from './components/Step1Matrix';
import { Step2ProductUpload } from './components/Step2ProductUpload';
import { Step3Evaluation } from './components/Step3Evaluation';
import { Step4CustomerDocument } from './components/Step4CustomerDocument';
import { INITIAL_SUSTAINABILITY_STANDARDS } from './data/standardsCatalogs';
import { AuthState, ProductEvaluationResult, SustainabilityStandard } from './types/dgnb';

export default function App() {
  const [authStatus, setAuthStatus] = useState<AuthState>({
    isAuthenticated: false,
    isVaultUnlocked: false,
    userEmail: '',
    hasPassphraseConfigured: false,
  });

  const [activeEncryptionKey, setActiveEncryptionKey] = useState<CryptoKey | null>(null);

  const [currentStep, setCurrentStep] = useState<number>(() => {
    return 1;
  });

  // Multiple sustainability standards list (DGNB, QNG, BNB, plus custom uploads)
  const [standards, setStandards] = useState<SustainabilityStandard[]>(INITIAL_SUSTAINABILITY_STANDARDS);
  const [activeStandardCode, setActiveStandardCode] = useState<string>('DGNB');

  const [isMatrixConfirmed, setIsMatrixConfirmed] = useState<boolean>(() => {
    return localStorage.getItem('sustainability_matrix_confirmed') === 'true';
  });

  const [projectName, setProjectName] = useState<string>('Neubau Büro- & Geschäftshaus Campus Nord');
  const [evaluationResult, setEvaluationResult] = useState<ProductEvaluationResult | null>(null);

  // Sync auth state listener with Firebase
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser || !firebaseUser.email) {
        setAuthStatus({
          isAuthenticated: false,
          isVaultUnlocked: false,
          userEmail: '',
          hasPassphraseConfigured: false,
        });
        setActiveEncryptionKey(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLoginSuccess = (
    email: string,
    sessionToken: string,
    encryptionKey: CryptoKey
  ) => {
    setAuthStatus({
      isAuthenticated: true,
      isVaultUnlocked: true,
      userEmail: email,
      sessionToken,
      hasPassphraseConfigured: true,
    });
    setActiveEncryptionKey(encryptionKey);
    setCurrentStep(1);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Logout error:', err);
    }
    setAuthStatus({
      isAuthenticated: false,
      isVaultUnlocked: false,
      userEmail: '',
      hasPassphraseConfigured: false,
    });
    setActiveEncryptionKey(null);
    setCurrentStep(1);
    setEvaluationResult(null);
  };

  const handleConfirmMatrix = () => {
    setIsMatrixConfirmed(true);
    localStorage.setItem('sustainability_matrix_confirmed', 'true');
  };

  const handleUnlockMatrix = () => {
    setIsMatrixConfirmed(false);
    localStorage.setItem('sustainability_matrix_confirmed', 'false');
  };

  const handleAnalysisComplete = (result: ProductEvaluationResult) => {
    setEvaluationResult(result);
    setCurrentStep(3);
  };

  const handleRestartNewCheck = () => {
    setEvaluationResult(null);
    setCurrentStep(2);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans antialiased text-slate-900">
      {/* Top Navigation */}
      <Navbar
        auth={authStatus}
        onLogout={handleLogout}
        isMatrixConfirmed={isMatrixConfirmed}
        activeStep={currentStep}
        onStepChange={setCurrentStep}
        projectName={projectName}
        setProjectName={setProjectName}
      />

      {/* Main Content Area: If not fully authenticated & vault unlocked -> show AuthScreen */}
      {!authStatus.isAuthenticated || !authStatus.isVaultUnlocked ? (
        <main className="flex-1 flex items-center justify-center p-4">
          <AuthScreen onLoginSuccess={handleLoginSuccess} />
        </main>
      ) : (
        <>
          {/* Workflow Stepper */}
          <Stepper
            currentStep={currentStep}
            onStepClick={setCurrentStep}
            isLoggedIn={authStatus.isVaultUnlocked}
            isMatrixConfirmed={isMatrixConfirmed}
            hasEvaluationResult={Boolean(evaluationResult)}
          />

          {/* Steps */}
          <main className="flex-1 pb-16">
            {currentStep === 1 ? (
              <Step1Matrix
                standards={standards}
                setStandards={setStandards}
                activeStandardCode={activeStandardCode}
                setActiveStandardCode={setActiveStandardCode}
                isConfirmed={isMatrixConfirmed}
                onConfirmMatrix={handleConfirmMatrix}
                onUnlockMatrix={handleUnlockMatrix}
                onProceedToStep2={() => setCurrentStep(2)}
                userEmail={authStatus.userEmail}
              />
            ) : currentStep === 2 ? (
              <Step2ProductUpload
                standards={standards}
                onAnalysisComplete={handleAnalysisComplete}
                projectName={projectName}
                userEmail={authStatus.userEmail}
              />
            ) : currentStep === 3 && evaluationResult ? (
              <Step3Evaluation
                result={evaluationResult}
                onProceedToStep4={() => setCurrentStep(4)}
                onBackToStep2={() => setCurrentStep(2)}
              />
            ) : currentStep === 4 && evaluationResult ? (
              <Step4CustomerDocument
                result={evaluationResult}
                onRestartNewCheck={handleRestartNewCheck}
                projectName={projectName}
              />
            ) : (
              <div className="max-w-xl mx-auto my-12 text-center p-8 bg-white rounded-xl shadow-xs border border-slate-200">
                <p className="text-sm text-slate-600 mb-4">
                  Für diesen Schritt liegt noch kein Prüfergebnis vor. Bitte führen Sie zuerst die Produktprüfung durch.
                </p>
                <button
                  onClick={() => setCurrentStep(isMatrixConfirmed ? 2 : 1)}
                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg cursor-pointer"
                >
                  Zu Schritt {isMatrixConfirmed ? '2 (Produktprüfung)' : '1 (Bewertungsmatrizen)'}
                </button>
              </div>
            )}
          </main>
        </>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500 print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>
            QM-Tool Nachhaltigkeit © {new Date().getFullYear()} – Multi-Standard Baustoff-Konformität (DGNB, QNG, BNB & Instituts-Leitfäden)
          </p>
          <div className="flex items-center space-x-3 text-[11px] text-slate-400">
            <span>Selektive Auswertung</span>
            <span>·</span>
            <span>K.O.-Schwachstellenprinzip</span>
            <span>·</span>
            <span>KI-Dokumentenscan</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

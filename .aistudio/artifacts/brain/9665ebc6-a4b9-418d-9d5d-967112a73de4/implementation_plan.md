# Google Authentication & Passphrase Vault Protection

Implementation plan to protect the **QM-Tool Nachhaltigkeit** application behind a Google Sign-In authentication gate (Firebase Auth) followed by an in-app Passphrase security mask with a strict 3-attempt lockout.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were confirmed based on your requirements and preferences:

- **Confirmed Decision 1**: Prominent Google Sign-In card with clean QM-Tool Nachhaltigkeit branding. Email/password forms and `ALLOWED_EMAILS` whitelist checks are removed.
- **Confirmed Decision 2**: Persistent Google Auth session across browser visits, with Passphrase entry requested upon new sessions to safeguard building audit data.
- **Confirmed Decision 3**: Strict 3-attempt limit on the Passphrase mask—3 failed attempts automatically sign out the Google account and return to the login screen.

---

## 1. Overview & Core Concept

The application will be protected by a 2-stage security system before allowing access to any DGNB/QNG/BNB sustainability evaluation features:

1. **Stage 1 – Google OAuth Authentication**:
   Users click "Mit Google anmelden" to authenticate via Firebase Auth (`signInWithPopup` with `GoogleAuthProvider`).
2. **Stage 2 – In-App Passphrase Security Mask**:
   After Google authentication, users enter their enterprise passphrase (or set one on first login) with client-side verification and a strict 3-attempt counter. Once unlocked, the user is admitted to the workspace.

---

## 2. User Experience & Visual Design

### Key User Flows

```
[Unauthenticated User] ──> [Google Sign-In Screen]
                                    │
                         Google Auth Success
                                    ▼
                      [Passphrase Security Mask]
                                    │
                       Passphrase Verified (<=3 Tries)
                                    ▼
                    [QM-Tool Sustainability Workspace]
```

### Visual Identity & Components

- **Auth Screen (`src/components/AuthScreen.tsx`)**:
  - **Header**: Emerald/Slate gradient card with security shield badge and "QM-Tool Nachhaltigkeit – Sicherheitsportal".
  - **Google Login Card**: Single prominent button with Google logo, clear title, and security explanation.
  - **Passphrase Mask Card**:
    - Displays connected Google email (e.g. `user.email`).
    - Attempt counter (`3 von 3 Versuchen übrig`) with color feedback (emerald → amber → rose).
    - Includes helper hint for initial test passphrase (`QM-Tool-2024`).
    - "Abmelden" button to switch Google accounts at any time.

- **Workspace Integration (`src/App.tsx` & `src/components/Navbar.tsx`)**:
  - `App.tsx` checks auth state: if not logged in or passphrase not unlocked, renders `AuthScreen`.
  - Once both stages pass, renders the main 4-step workflow (Matrix, Upload, Evaluation, Customer Document).
  - Navbar displays active user email and a "Sicherheits-Logout" button.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Direct Google Authentication without Whitelist**:
  - *Chosen Approach*: Any authenticated Google account can log in and manage their local/Firestore passphrase vault.
  - *Why*: Removes maintenance of hardcoded or env-based email lists, relying on Google Auth identity and Passphrase encryption.
- **Decision 2: Runtime Passphrase State**:
  - *Chosen Approach*: Google Auth state is saved via Firebase Auth listener (`onAuthStateChanged`), while Passphrase unlock state (`isUnlocked`) resets when the session starts or tab reloads.
  - *Why*: Ensures sensitive audit workspace is locked if an unattended device is reloaded, satisfying data security requirements.

---

## 4. Technical Architecture & Data Strategy

### System Component Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                       Firebase Auth                          │
│               (auth.currentUser / GoogleAuthProvider)        │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                     AuthScreen Component                     │
│  Stage 1: Google Login  ───>  Stage 2: Passphrase Mask        │
│  (signInWithPopup)            (PBKDF2 Verifier in Firestore) │
└──────────────────────────────┬───────────────────────────────┘
                               │ (Unlock Event)
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                    Main App Workspace                        │
│   Navbar (User Profile + Logout)                             │
│   Step 1: Sustainability Matrix                              │
│   Step 2: PDF Document Scan                                  │
│   Step 3: Audit Evaluation                                   │
│   Step 4: Customer Summary                                   │
└──────────────────────────────────────────────────────────────┘
```

### Data & Cryptographic Handling

- **Firebase SDK**: Standard `auth` instance from `src/firebase/config.ts`.
- **Passphrase Verifier**: Uses `createPassphraseVerifier` and `verifyPassphrase` in `src/utils/crypto.ts` storing salt and verifier in `users/{uid}` Firestore document and local storage fallback.

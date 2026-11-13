# Project: QM-Nachhaltigkeit (Production Rollout & Hardening)

## Architecture
Hybrid single-page React 19 application backed by an Express 4 Node.js server with dual deployment modes: standalone production Node server (`node dist-server/server.js`) or serverless function (`api/index.ts`).
- **Frontend (`src/`)**: React 19, TypeScript, Tailwind CSS v4, Lucide icons, Vite 5.
- **Backend (`server.ts`)**: Express 4, Google GenAI SDK (`@google/genai`, Gemini 2.5 Flash), `unpdf` textlayer parser, in-memory crypto (PBKDF2, AES-256-GCM).
- **Security & Data Layer**: Firebase Auth & Cloud Firestore (`firestore.rules`), client-side AES-GCM company vault.

## Code Layout
- `server.ts`: Express backend, API endpoints, auth middleware, document parsing, evaluation engine, production server listener.
- `firestore.rules`: Security rules for Firestore `/audits` and `/vault`.
- `.env.example`: Reference configuration for environment variables.
- `src/types/dgnb.ts`: Core data structures, evidence types, evaluation models.
- `src/components/Step2ProductUpload.tsx`: Product document upload UI (SDB, TM, Prüfbericht), scanning states, drag-and-drop.
- `src/components/ConfirmExtractedDataModal.tsx`: Review and confirmation modal for extracted parameters and quotes.
- `src/components/Step3Evaluation.tsx`: Evaluation results table, criteria levels (QS 1–4), evidence citations.
- `src/components/Step4CustomerDocument.tsx`: Official customer audit certificate (Gutachten / Nachweisdokument).
- `src/utils/pdfText.ts`: Deterministic PDF text layer extraction, page extraction, excerpt generator.
- `src/utils/quoteVerification.ts`: Strict quote matching and verification against PDF text layers.
- `src/utils/dgnbEvaluation.ts`: Deterministic DGNB/QNG/BNB evaluation logic and Schwachstellen-Prinzip.
- `src/utils/dgnbEvaluation.test.ts`: Automated unit test suite.
- `tests/e2e/`: Opaque-box E2E test suite (created by E2E Testing Track).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Auth Session Verification Hardening | Deny unauthorized Google accounts (403); protect corporate email list, salt, verifier | M1 | Survey (Explorer 2) |
| F2 | Endpoint Access Control (`requireAuth`) | Verify employee/admin authorization on all AI and evaluation endpoints | M1 | Survey (Explorer 2) |
| F3 | Production Mode Auth Bypass Guard | Prevent `ALLOW_UNAUTHENTICATED_API` from being active when `NODE_ENV === 'production'` | M1 | Survey (Explorer 2) |
| F4 | Dynamic Email Whitelist Configuration | Read `ALLOWED_EMAILS` and `ADMIN_EMAILS` from environment variables with fallback | M1 | Survey (Explorer 1, 2) |
| F5 | Firestore Tenant Isolation Rules | Restrict `/audits` reads so users only read their own audits (or admin reads all); restrict `/vault` | M1 | Survey (Explorer 2) |
| F6 | Auditor Identity Integrity | Stamp `auditorEmail` from verified token email instead of untrusted client payload | M1 | Survey (Explorer 2) |
| F7 | Error Response Sanitization | Suppress internal stack traces/errors in production API responses; return clean error codes | M1 | Survey (Explorer 2) |
| F8 | Network & Header Hardening | Add security headers (disable `x-powered-by`, nosniff, frameguard), add rate limiting | M1 | Survey (Explorer 2) |
| F9 | Process Lifecycle Traps | Add `SIGTERM` and `SIGINT` graceful shutdown handlers in `server.ts` | M1 | Survey (Explorer 1) |
| F10 | Environment Variable Alignment | Synchronize `.env.example` with actual variables used in code (`PORT`, `NODE_ENV`, etc.) | M1 | Survey (Explorer 1) |
| F11 | Server PDF Magic Byte Validation | Verify `%PDF-` (`0x25 0x50 0x44 0x46 0x2D`) on decoded base64; reject non-PDF with 400 | M2 | Survey (Explorer 2, 3) |
| F12 | Payload & Buffer Size Enforcement | Enforce max binary buffer size on server; lower Express body limit from 60MB to safe limit | M2 | Survey (Explorer 2, 3) |
| F13 | Prompt Injection Sanitization | Sanitize `filename` (basename, strip special characters) and validate `documentType` enum | M2 | Survey (Explorer 2) |
| F14 | Frontend File Validation Fix | Fix boolean operator bug (`!name.endsWith('.pdf') && type !== 'application/pdf'`) in upload UI | M2 | Survey (Explorer 3) |
| F15 | Fault-Tolerant Document Error Handling | Gracefully reject corrupted/empty/unsupported files with clean 400 response without server crash | M2 | Survey (Explorer 2, 3) |
| F16 | TM Data Types & Model Extension | Extend `ExtractedDocumentData`, `ParameterEvidence`, and `SampleProduct` to support `'tm'` | M3 | Survey (Explorer 2, 3) |
| F17 | 3-Column Document Upload UI | Expand `Step2ProductUpload.tsx` to 3 upload zones (SDB, TM, Prüfbericht) with identical UX | M3 | Survey (Explorer 3) |
| F18 | TM Extraction Review & Confirmation | Support `documentType === 'tm'` in `ConfirmExtractedDataModal.tsx` with proper badges | M3 | Survey (Explorer 3) |
| F19 | TM Document Parsing in Backend | Support `documentType: 'tm'` in `/api/documents/parse-pdf` | M3 | Survey (Explorer 3) |
| F20 | Evaluation Engine TM Proof Integration | Accept `tmText` in `/api/standards/analyze-product`, merge texts, assign `source: 'tm'` | M3 | Survey (Explorer 3) |
| F21 | DGNB Matrix TM Proof Recognition | Recognize TM as sufficient proof criterion according to matrix rows (`"TM und/oder SDB"`) | M3 | Survey (Explorer 3) |
| F22 | TM Evidence in Evaluation & Reporting | Display TM verification pills and update Gutachten disclaimer in Steps 3 and 4 | M3 | Survey (Explorer 3) |
| F23 | E2E Testing Suite (Tiers 1–4) | Requirement-driven opaque-box test suite verifying all features and acceptance criteria | M4 | Dual Track Requirement |
| F24 | Rollout Build & Production Validation | Pass 100% of unit & E2E tests, clean `npm run build`, verified production server launch | M4 | Survey (Explorer 1) |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Security & Endpoint Hardening | F1, F2, F3, F4, F5, F6, F7, F8, F9, F10 | none | DONE |
| M2 | Document Processing & Validation Hardening | F11, F12, F13, F14, F15 | none | DONE |
| M3 | Technical Data Sheet (TM) Integration | F16, F17, F18, F19, F20, F21, F22 | M2 | DONE |
| M4 | Final Milestone: E2E Test Pass & Rollout Verification | F23, F24 | M1, M2, M3, TEST_READY | DONE |

## Interface Contracts

### Server Auth & Middleware ↔ Clients
- `POST /api/auth/verify-session`:
  - Request: `{ idToken?: string }` + `Authorization: Bearer <idToken>`
  - Success Response (200): `{ success: true, isAuthorized: true, isAdmin: boolean, email: string, userId: string, hasPassphraseConfigured: boolean, saltHex: string|null, verifierHex: string|null, authorizedEmails: string[], message: string }`
  - Unauthorized (401/403): `{ success: false, isAuthorized: false, message: string }` — sensitive fields (`saltHex`, `verifierHex`, `authorizedEmails`) MUST NOT be present.
- `requireAuth` Middleware:
  - Validates Firebase ID token and ensures user email is present in authorized emails or admin set. Unauthorized users receive `403 Forbidden` (`{ success: false, code: 'FORBIDDEN', message: string }`).

### Document Processing API ↔ Frontend
- `POST /api/documents/parse-pdf`:
  - Request: `{ pdfBase64: string, filename?: string, documentType?: 'sdb' | 'pruefbericht' | 'tm' | 'allgemein' }`
  - Validation: Decoded base64 must begin with `%PDF-` (`0x25 0x50 0x44 0x46 0x2D`) and decoded binary length <= 20MB.
  - Success (200): `{ success: true, data: ExtractedDocumentData }`
  - Validation Error (400): `{ success: false, code: 'INVALID_PDF' | 'PAYLOAD_TOO_LARGE' | 'EMPTY_FILE', message: string }`

### Standards Analysis API ↔ Frontend
- `POST /api/standards/analyze-product`:
  - Request: `{ sdbText?: string, tmText?: string, testReportText?: string, parameters?: Partial<SampleProduct>, targetStandards?: string[], hasBauteilekatalog?: boolean, projectTitle?: string, userEmail?: string }`
  - Analysis Engine: Merges `[sdbText, tmText, testReportText]`, extracts parameters, stamps `auditorEmail` from verified token, attributes `source: 'tm'` when evidenced from TM.
  - Response (200): `{ success: true, evaluation: DgnbEvaluationResult, auditMetadata: AuditMetadata }`

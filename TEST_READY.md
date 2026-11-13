# E2E Test Suite Ready

## Test Runner
- Command: `npm run test:e2e` (or `npx tsx tests/e2e/runner.ts`)
- Expected: All 117 tests pass across all tiers (Tiers 1–5B) with exit code 0 in ~7.5s
- Prerequisites: None (fully self-contained, offline-compatible, supports both Windows Named Pipes IPC and cross-platform TCP loopback via `E2E_USE_TCP=1`)

## Coverage Summary
| Tier | Count | Description |
|------|------:|-------------|
| 1. Feature Coverage | 29 | Comprehensive baseline verification of features F1–F24 across R1, R2, R3, R4 |
| 2. Boundary & Corner | 28 | Adversarial inputs, `%PDF-` magic byte corruption, oversized payloads, non-PDF payloads, JWT edge cases |
| 3. Cross-Feature | 10 | Pairwise combinatorial interactions: Auth + Docs, TM + SDB Matrix, Rate Limiting + Document Ingestion |
| 4. Real-World Application | 5 | End-to-end audit scenarios: Caparol Sylitol, PCI Apogel, StoColor, Caparol Muresko via TM, Production Server Lifecycle |
| 5A. Adversarial Backend Security | 27 | White-box backend security: IP spoofing headers, Unicode BOM, non-ASCII filenames, crypto parameters, and error sanitization |
| 5B. Adversarial DGNB & TM Proof Engine | 18 | White-box DGNB/QNG/BNB evaluation logic, triad collision resolution, quote verification, and date boundary rules |
| **Total** | **117** | **Full 5-Tier Adversarial & Opaque-Box E2E Coverage** |

## Feature Checklist
| Feature ID | Feature Name | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5A | Tier 5B |
|:----------:|:-------------|:------:|:------:|:------:|:------:|:-------:|:-------:|
| **F1** | Passphrase & PBKDF2 Vault Crypto | TC-T1-R1-01 | TC-T2-R1-01 | TC-T3-01 | Scenario 1–4 | TC-T5-VAULT-01..04 | - |
| **F2** | Google OAuth & Session Verification | TC-T1-R1-08..10 | TC-T2-R1-03 | TC-T3-01 | Scenario 5 | TC-T5-AUTH-01..07 | - |
| **F3** | Company Vault Service & Role Separation | TC-T1-R1-02 | TC-T2-R1-02 | TC-T3-01 | Scenario 1–4 | TC-T5-VAULT-02..03 | - |
| **F4** | Corporate Email Domain Validation | TC-T1-R1-03 | TC-T2-R1-02 | TC-T3-01 | Scenario 1–4 | TC-T5-VAULT-04 | - |
| **F5** | Replay Prevention & State Integrity | TC-T1-R1-07 | TC-T2-R1-04 | TC-T3-01 | Scenario 1–4 | TC-T5-AUTH-07 | - |
| **F6** | Rate Limiting & DoS Protection | TC-T1-R1-04 | TC-T2-R1-05 | TC-T3-06 | Scenario 1–4 | TC-T5-RATE-01..03 | - |
| **F7** | Vault Secret Scrubbing & Privacy | TC-T1-R1-05 | TC-T2-R1-06 | TC-T3-01 | Scenario 5 | TC-T5-ERR-01..02 | - |
| **F8** | Production Security Headers (Helmet, CSP) | TC-T1-R1-06 | TC-T2-R1-07 | TC-T3-01 | Scenario 5 | TC-T5-DOC-01 | - |
| **F9** | Standalone Production Listener & Named Pipes | TC-T1-R1-06 | TC-T2-R1-07 | TC-T3-01 | Scenario 5 | TC-T5-PROD-01..02 | - |
| **F10** | Production Lockout of Unauthenticated API | TC-T1-R1-06 | TC-T2-R1-07 | TC-T3-01 | Scenario 5 | TC-T5-PROD-01 | - |
| **F11** | PDF Magic Byte Validation (`%PDF-`) | TC-T1-R2-03..05 | TC-T2-R2-01..06 | TC-T3-02..05 | Scenario 1–4 | TC-T5-DOC-01..09 | - |
| **F12** | Payload & Buffer Limit Protection (20MB) | TC-T1-R2-07 | TC-T2-R2-09 | TC-T3-05 | Scenario 1–4 | TC-T5-DOC-02, 09 | - |
| **F13** | Input Sanitization & Document Type Safety | TC-T1-R2-06 | TC-T2-R2-07 | TC-T3-02..05 | Scenario 1–4 | TC-T5-DOC-03, 04, 07 | - |
| **F14** | Resilient JSON Response Handling | TC-T1-R2-03..05 | TC-T2-R2-01..06 | TC-T3-02..05 | Scenario 1–4 | TC-T5-ERR-02 | - |
| **F15** | Robust Test Report Date Parsing | TC-T1-R2-02 | TC-T2-R2-08 | TC-T3-04 | Scenario 2 | - | TC-T5-DATE-01..04 |
| **F16** | Negation-Aware SVHC Evaluator | TC-T1-R2-01 | TC-T2-R2-08 | TC-T3-03 | Scenario 1, 3 | - | TC-T5-TRIAD-02 |
| **F17** | VOC Extraction & EU Decopaint Guard | TC-T1-R2-01 | TC-T2-R2-08 | TC-T3-02 | Scenario 1, 4 | - | TC-T5-TRIAD-01, 03 |
| **F18** | Bauteilekatalog K.O. Engine Enforcement | TC-T1-R2-01 | TC-T2-R2-08 | TC-T3-03 | Scenario 2 | - | TC-T5-KO-01..03 |
| **F19** | Multi-Norm Catalog Integrity (DGNB/QNG/BNB) | TC-T1-R4-01 | TC-T2-R4-01 | TC-T3-02..05 | Scenario 1–4 | - | TC-T5-KO-02..03 |
| **F20** | Deterministic Textlayer Extraction & Quotes | TC-T1-R2-01..02 | TC-T2-R2-07..08 | TC-T3-02..05 | Scenario 1–4 | - | TC-T5-QUOTE-01..04 |
| **F21** | Technical Data Sheet (TM) Extraction | TC-T1-R3-01 | TC-T2-R3-01 | TC-T3-02..03 | Scenario 4 | - | TC-T5-TM-01..04 |
| **F22** | DGNB Matrix Technical Data Sheet Proof Rules | TC-T1-R3-02 | TC-T2-R3-02 | TC-T3-02..03 | Scenario 4 | - | TC-T5-TM-01..04 |
| **F23** | Multi-Source Parameter Evidence Attribution | TC-T1-R3-03 | TC-T2-R3-03 | TC-T3-02..03 | Scenario 4 | - | TC-T5-TRIAD-01..03 |
| **F24** | Production Build & Full Stack E2E Validation | TC-T1-R4-02 | TC-T2-R4-02 | TC-T3-01..10 | Scenario 1–5 | TC-T5-PROD-01..02 | TC-T5-KO-02 |

## Verification Status
- Static Analysis (`npm run lint`): 0 errors (Exit Code 0)
- Production Build (`npm run build`): Clean compilation of frontend and server bundle (Exit Code 0)
- Unit Tests (`npm test`): 29/29 passed (Exit Code 0)
- E2E Test Suite (`npm run test:e2e`): 117/117 passed across all 5 Tiers in ~7.5s (Exit Code 0)
- Forensic Integrity Audit: **CLEAN** (0 violations, genuine logic, zero facades)
- Verification Panel: **PASS** (Reviewer 1 APPROVE, Reviewer 2 APPROVE, Challenger 1 APPROVE, Challenger 2 APPROVE, Auditor CLEAN)

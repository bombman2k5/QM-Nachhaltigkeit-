# E2E Test Infrastructure: QM-Nachhaltigkeit

## 1. Test Philosophy & Architecture
- **Opaque-Box Requirement-Driven Testing**: Derived strictly from `ORIGINAL_REQUEST.md` and user-facing API and schema contracts.
- **Independence & Isolation**: Completely independent of internal application implementation details, mocks, or facades. Real HTTP wire protocols over Express, binary PDF payloads, and full multi-step audit verification.
- **Zero Additional Dependencies**: Utilizes Node.js native test runner (`node:test` + `node:assert/strict`) via `tsx` (`^4.21.0`), delivering sub-second execution speeds matching existing repository conventions.
- **Cross-Platform Compatibility**: Full support for Windows Named Pipes (`\\\\.\\pipe\\qm-e2e-...`) and POSIX Domain Sockets / TCP to avoid Windows firewall and loopback permission issues (`EACCES -4092`).
- **Methodology**: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Testing across 4 distinct tiers.

---

## 2. Feature Inventory & Mapping

| # | Feature | Scope / Method | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Cross) | Tier 4 (Real-World) |
|---|---------|----------------|:-----------------:|:-----------------:|:--------------:|:-------------------:|
| F1 | Auth Session Verification Hardening | Session verify admin/employee/unauth | 3 (TC-T1-R1-08..10) | 2 (TC-T2-R1-01..03) | ✓ (TC-T3-01) | ✓ (Scenario 1) |
| F2 | Endpoint Access Control (`requireAuth`) | 401 gate on protected endpoints | 3 (TC-T1-R1-02..05) | 1 (TC-T2-R1-04) | ✓ (TC-T3-01) | ✓ (Scenario 5) |
| F3 | Production Mode Auth Bypass Guard | Lockout ALLOW_UNAUTHENTICATED_API | 1 (TC-T1-R1-07) | 1 (TC-T2-R1-04) | - | ✓ (Scenario 5) |
| F4 | Dynamic Email Whitelist Configuration | Whitelist validation & case tolerance | 1 (TC-T1-R1-08) | 1 (TC-T2-R1-03) | - | - |
| F5 | Firestore Tenant Isolation Rules | Firestore security rules (static/audit) | - [Rules Layer] | - [Rules Layer] | - [Rules Layer] | - [Rules Layer] |
| F6 | Auditor Identity Integrity | Server token stamping (anti-spoofing) | 1 (TC-T1-R3-06) | 1 (TC-T2-R1-05) | ✓ (TC-T3-10) | ✓ (Scenario 1) |
| F7 | Error Response Sanitization | Suppression of stack traces & paths | 1 (TC-T1-R1-01) | 1 (TC-T2-R1-06) | - | ✓ (Scenario 5) |
| F8 | Network & Header Hardening | nosniff, frameguard, rate limiting | 2 (TC-T1-R1-01, 06) | 1 (TC-T2-R1-07) | ✓ (TC-T3-07) | ✓ (Scenario 5) |
| F9 | Process Lifecycle Traps (SIGTERM/SIGINT) | Graceful shutdown handler | - | - | - | ✓ (Scenario 5) |
| F10 | Environment Variable Alignment | Defaults handling on empty env | 1 (TC-T1-R4-02) | 1 (TC-T2-R4-05) | - | ✓ (Scenario 5) |
| F11 | Server PDF Magic Byte Validation | Rejection of non-PDFs with 400 | 2 (TC-T1-R2-03, 04) | 3 (TC-T2-R2-01, 02, 05) | - | - |
| F12 | Payload & Buffer Size Enforcement | 20MB buffer limit (PAYLOAD_TOO_LARGE) | 1 (TC-T1-R2-07) | 1 (TC-T2-R2-09) | - | - |
| F13 | Prompt Injection Sanitization | Filename & docType sanitization | 1 (TC-T1-R2-06) | 2 (TC-T2-R2-07, TC-T2-R3-01) | - | - |
| F14 | Frontend File Validation Robustness | UI upload validation (build/lint) | - [UI Component] | - [UI Component] | - [UI Component] | - [UI Component] |
| F15 | Fault-Tolerant Document Parsing | Scanned & empty PDF tolerance | 2 (TC-T1-R2-01, 05) | 3 (TC-T2-R2-03, 04, 08) | - | - |
| F16 | TM Data Types & Model Schema | Support documentType: 'tm' | 1 (TC-T1-R3-01) | 1 (TC-T2-R3-06) | ✓ (TC-T3-08) | ✓ (Scenario 1) |
| F17 | 3-Column Document Upload Structure | UI 3-column layout (build/lint) | - [UI Component] | - [UI Component] | - [UI Component] | - [UI Component] |
| F18 | TM Review & Confirmation Handling | Review modal badges (build/lint) | - [UI Component] | - [UI Component] | - [UI Component] | - [UI Component] |
| F19 | TM Document Parsing Backend Endpoint | parse-pdf with documentType: 'tm' | 1 (TC-T1-R3-01) | 1 (TC-T2-R2-08) | - | - |
| F20 | Evaluation Engine TM Proof Integration | tmText parsing without structuredInput | 2 (TC-T1-R3-02, 04) | 1 (TC-T2-R3-04) | ✓ (TC-T3-02, 03) | ✓ (Scenario 4) |
| F21 | DGNB Matrix TM Proof Recognition | Recognition in Rows 4, 5, 8 | 2 (TC-T1-R3-02, 03) | 2 (TC-T2-R3-02, 03) | ✓ (TC-T3-04, 05) | ✓ (Scenario 1, 4) |
| F22 | TM Evidence in Evaluation & Reporting | Certificate & quote attribution | 1 (TC-T1-R3-06) | 1 (TC-T2-R3-05) | ✓ (TC-T3-10) | ✓ (Scenario 1) |
| F23 | Comprehensive Multi-Tier E2E Execution | Exit code 0 across Tiers 1-4 | ✓ | ✓ | ✓ | ✓ |
| F24 | Rollout Build & Production Server Readiness | Production bundle compilation & launch | 1 (TC-T1-R4-01) | 1 (TC-T2-R4-06) | ✓ (TC-T3-09) | ✓ (Scenario 5) |
| **TOTALS** | **24 Features (19 Backend, 4 UI/Rules, 1 Meta)** | | **28 Tests** | **28 Tests** | **10 Tests** | **5 Scenarios** |

---

## 3. Test Harness Architecture (`tests/e2e/harness/`)

The test harness is modular and provides complete encapsulation of server lifecycle, HTTP communication, authentications, synthetic document generation, and assertions:

1. **`serverStarter.ts`**:
   - **Dual-Mode Lifecycle Management**:
     - *In-Process Mode* (Tiers 1–3): Sets `VERCEL=1` and `NODE_ENV=test`, imports `server.ts` Express application, and binds `app.listen()` directly to a Windows Named Pipe (`\\\\.\\pipe\\qm-e2e-...`) or TCP port. Provides instant boot (<50ms) and clean teardown (`server.close()`).
     - *Child Process Mode* (Tier 4 & Process Lifecycle): Spawns independent Node process (`dist-server/server.js` or `tsx server.ts`) with custom environment flags, probes readiness, tests OS signals (`SIGTERM`/`SIGINT`), and performs clean process tree termination (`taskkill /pid /T /F` on Windows).
   - **Readiness Probing**: Polls `GET /api/auth/status` until HTTP 200 is confirmed before test dispatch.

2. **`httpClient.ts`**:
   - High-performance, zero-dependency HTTP client wrapping Node's native `http` module.
   - Transparently handles both standard TCP URLs (`http://localhost:port/...`) and Windows Named Pipes (`socketPath: pipePath`).
   - Supports GET, POST, PUT, DELETE with automated JSON serialization/deserialization, raw buffer transmission, custom headers, and timeout safeguards.

3. **`authHelpers.ts`**:
   - Deterministic offline token generators for:
     - Admin identity (`brian.lackmann@kaubit.de`)
     - Employee identity (`auditor@bau-qm.org`)
     - Unauthorized external Google account (`unauthorized@gmail.com`)
     - Malformed and non-bearer tokens (e.g. `Basic ...`, whitespace, garbage strings)
   - Operates 100% hermetically without requiring external network access to Google JWKS servers.

4. **`pdfGenerator.ts`**:
   - Pure-buffer, in-memory PDF 1.4 binary generator (~40 lines of Node.js Buffer logic, no external npm packages).
   - Capable of generating:
     - Minimal valid SDB PDFs with text layer
     - Minimal valid TM (Technisches Merkblatt) PDFs with GISCODE and VOC claims
     - Minimal valid Prüfberichte with DIN EN 16516 test dates
     - Scanned PDFs (empty text layer)
     - Corrupted stream PDFs and invalid xref tables
     - Header magic byte edge cases (non-PDF, HTML, truncated `%PD`)
     - Oversized binary buffers (>20MB) and zero-byte files

5. **`assertions.ts`**:
   - Assertion helpers validating:
     - Security headers (`x-powered-by` absence, `x-content-type-options: nosniff`, `x-frame-options: SAMEORIGIN|DENY`)
     - Sanitized error responses (no stack traces, no internal filesystem paths leaked)
     - DGNB evaluation result schemas and achieved quality levels (QS 1–4)
     - TM parameter evidence attribution (`source: 'tm'`)

6. **`index.ts`**:
   - Central re-export of all harness utilities for seamless imports in test files.

---

## 4. Test Tier Taxonomy & Coverage Requirements

### Tier 1: Feature Coverage (`tests/e2e/tier1_feature_coverage.test.ts`)
- **Objective**: Verify the fundamental happy path and functional requirements for every feature area.
- **Requirement Areas**:
  - **R1: Security & Auth Hardening**: Session verification for admin/employee, rejection of unauthorized Google accounts (403), `requireAuth` protection, production mode bypass lockout, security headers.
  - **R2: Document Processing Hardening**: Valid minimal PDF parsing for SDB, TM, and Prüfbericht; magic byte validation rejecting text and HTML masquerading as PDF; zero-byte rejection.
  - **R3: TM Integration & DGNB Recognition**: Support for `documentType: 'tm'`; evaluation of TM-permissive DGNB rows (e.g. Row 4 Tapetenkleber, Row 8 Verlegewerkstoffe); evidence attribution `source: 'tm'`; multi-standard evaluation (DGNB, QNG, BNB).
  - **R4: Rollout Readiness**: Process configuration checks, clean defaults handling, and standard evaluation endpoints.
- **Coverage Minimum**: ≥5 test cases per requirement area (≥20 test cases total).

### Tier 2: Boundary & Corner Cases (`tests/e2e/tier2_boundary_corner.test.ts`)
- **Objective**: Subject the system to adversarial inputs, limits, malformed payloads, and injection attempts.
- **Test Scenarios**:
  - Non-PDF files with `%PDF-` located away from byte offset 0.
  - Binary buffers exceeding the 20MB server limit (`PAYLOAD_TOO_LARGE`).
  - HTTP request bodies exceeding Express payload threshold (413).
  - Corrupted xref tables, truncated stream objects, and password-protected PDFs.
  - Filename directory traversal (`../../../../etc/passwd\0`) and script injection tags.
  - Dynamic whitelist casing and whitespace resilience.
  - Malformed JWT tokens, expired timestamps, and unsupported auth schemes.
  - Error response sanitization under production mode (verifying zero stack trace leakage).
- **Coverage Minimum**: ≥5 test cases per requirement area (≥20 test cases total).

### Tier 3: Cross-Feature Interactions (`tests/e2e/tier3_cross_feature.test.ts`)
- **Objective**: Verify pairwise combinations of features operating concurrently.
- **Test Combinations**:
  - *Auth + Document Parsing*: Auth gate executes before expensive base64 decoding and PDF parsing.
  - *TM + SDB Document Merging*: Triad of SDB + TM + Prüfbericht merged into a unified parameter assessment.
  - *Regulatory Limits vs. TM Measured Values*: Decopaint threshold in SDB overridden by lower measured VOC in TM.
  - *Conflicting Parameters*: SDB SVHC disclosures demoting an otherwise compliant TM claim.
  - *Rate Limiting + Multi-document requests*: Burst submissions trigger HTTP 429 without server memory leaks.
- **Coverage Minimum**: ≥10 test cases total.

### Tier 4: Real-World Scenarios (`tests/e2e/tier4_real_world.test.ts`)
- **Objective**: Execute end-to-end audit lifecycles modeling genuine German building products and production server deployment.
- **Scenarios**:
  1. **Parquet Adhesive Audit (*Bona Quantum T*)**: SDB + TM uploaded, GISCODE RS10 and EMICODE EC1 PLUS confirmed from TM, DGNB Matrix Row 8 evaluated, QS 4 achieved, official audit certificate generated.
  2. **Interior Wall Paint Demotion (*StoColor Sil In*)**: SDB + TM uploaded, chemical parameters satisfy QS 4, but missing *Bauteilekatalog* activates Schwachstellen-Prinzip demoting overall rating to QS 2.
  3. **Joint Sealant with Expired Report (*SikaHyflex-250*)**: SDB + Prüfbericht uploaded with test date older than 10 years; AgBB test report validity failure triggers demotion to QS 1.
  4. **Exterior Façade Paint via TM Alone (*Caparol Muresko*)**: TM uploaded alone for DGNB Row 5; matrix recognizes TM proof and awards compliant QS 3.
  5. **Production Build & Server Launch**: Execution of project build, spawning production server bundle (`dist-server/server.js`), verifying health endpoint, and executing graceful `SIGTERM` shutdown.
- **Coverage Minimum**: 5 comprehensive scenarios.

---

## 5. Execution Guide

### Running the Entire E2E Test Suite
```bash
# Via npm script
npm run test:e2e

# Or directly on Windows cmd.exe / PowerShell
npx.cmd tsx tests/e2e/runner.ts
```

### Running Individual Tiers
```bash
# Tier 1: Feature Coverage
npx.cmd tsx --test tests/e2e/tier1_feature_coverage.test.ts

# Tier 2: Boundary & Corner Cases
npx.cmd tsx --test tests/e2e/tier2_boundary_corner.test.ts

# Tier 3: Cross-Feature Interactions
npx.cmd tsx --test tests/e2e/tier3_cross_feature.test.ts

# Tier 4: Real-World Scenarios
npx.cmd tsx --test tests/e2e/tier4_real_world.test.ts
```

### Environment Configuration Flags
- `DEBUG_E2E=1`: Enables verbose HTTP request/response logging in test runner.
- `E2E_USE_TCP=1`: Forces the test harness to bind to TCP loopback (`127.0.0.1`) instead of Windows Named Pipes.

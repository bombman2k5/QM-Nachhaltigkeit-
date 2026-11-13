import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startInProcessServer,
  InProcessServerInstance,
  createValidSdbPdf,
  createCorruptedMagicBytesPdf,
  createTruncatedHeaderPdf,
  createHtmlMasqueradingAsPdf,
  createZeroBytePdf,
  createOversizedPdf,
} from '../e2e/harness';

/**
 * Challenger 2 Empirical Stress Test Suite: Milestone 2
 * Focus: Frontend File Validation (F14) & Client Error Recovery (F15)
 */
describe('Adversarial Stress Test Suite: Milestone 2 Frontend Validation & Error Recovery', () => {

  // ==========================================================================
  // Suite 1: Exhaustive Truth-Table Validation of Boolean File Check Logic (F14)
  // ==========================================================================
  describe('Suite 1: Boolean Logic Truth Table for File Type & Extension Validation', () => {

    /**
     * Exact boolean validator function as implemented in:
     * - `src/components/Step2ProductUpload.tsx:219`
     * - `src/components/Step1Matrix.tsx:72`
     */
    function validateFileBoolean(fileName: string, fileType?: string | null): { isValid: boolean; rejectedByCondition: boolean } {
      const file = {
        name: fileName,
        type: fileType as any,
      };

      // F14 Condition:
      // if (!file.name.toLowerCase().endsWith('.pdf') || (Boolean(file.type) && file.type !== 'application/pdf'))
      const rejected = !file.name.toLowerCase().endsWith('.pdf') || (Boolean(file.type) && file.type !== 'application/pdf');

      return {
        isValid: !rejected,
        rejectedByCondition: rejected,
      };
    }

    // ------------------------------------------------------------------------
    // Group 1.1: Valid Combinations (Must be ACCEPTED)
    // ------------------------------------------------------------------------
    describe('Group 1.1: Valid PDF Combinations (Must be ACCEPTED)', () => {
      const validCases: Array<{ name: string; type?: string; desc: string }> = [
        { name: 'document.pdf', type: 'application/pdf', desc: 'Standard lowercase .pdf with application/pdf' },
        { name: 'DOCUMENT.PDF', type: 'application/pdf', desc: 'Uppercase .PDF with application/pdf' },
        { name: 'Document.Pdf', type: 'application/pdf', desc: 'Mixed case .Pdf with application/pdf' },
        { name: 'doc.name.with.dots.pdf', type: 'application/pdf', desc: 'Multiple dots in filename with application/pdf' },
        { name: 'SDB_Kaubit_2026.pdf', type: 'application/pdf', desc: 'Underscores and digits with application/pdf' },
        { name: 'Prüfbericht-Ökologie.pdf', type: 'application/pdf', desc: 'German umlauts in filename with application/pdf' },
        { name: 'document.pdf', type: '', desc: 'Lowercase .pdf with empty MIME string "" (browser fallback)' },
        { name: 'DOCUMENT.PDF', type: '', desc: 'Uppercase .PDF with empty MIME string ""' },
        { name: 'Document.Pdf', type: '', desc: 'Mixed case .Pdf with empty MIME string ""' },
        { name: 'document.pdf', type: undefined, desc: 'Lowercase .pdf with undefined MIME' },
        { name: 'DOCUMENT.PDF', type: undefined, desc: 'Uppercase .PDF with undefined MIME' },
        { name: 'Document.Pdf', type: undefined, desc: 'Mixed case .Pdf with undefined MIME' },
      ];

      for (const tc of validCases) {
        test(`VALID: ${tc.desc} -> Accepted`, () => {
          const res = validateFileBoolean(tc.name, tc.type);
          assert.equal(
            res.isValid,
            true,
            `Expected ${tc.name} (type: ${tc.type}) to be ACCEPTED, but was REJECTED by boolean condition`
          );
          assert.equal(res.rejectedByCondition, false);
        });
      }
    });

    // ------------------------------------------------------------------------
    // Group 1.2: Rejection Combinations (Must be REJECTED)
    // ------------------------------------------------------------------------
    describe('Group 1.2: Rejection & Spoofed Combinations (Must be REJECTED)', () => {
      const rejectionCases: Array<{ name: string; type?: string; desc: string; reason: string }> = [
        // Spoofed MIME attacks (executable/script with PDF mime)
        {
          name: 'payload.exe',
          type: 'application/pdf',
          desc: 'Executable .exe with spoofed application/pdf MIME',
          reason: 'Extension does not end with .pdf',
        },
        {
          name: 'script.sh',
          type: 'application/pdf',
          desc: 'Shell script .sh with spoofed application/pdf MIME',
          reason: 'Extension does not end with .pdf',
        },
        {
          name: 'script.bat',
          type: 'application/pdf',
          desc: 'Batch file .bat with spoofed application/pdf MIME',
          reason: 'Extension does not end with .pdf',
        },
        {
          name: 'exploit.vbs',
          type: 'application/pdf',
          desc: 'VBScript .vbs with spoofed application/pdf MIME',
          reason: 'Extension does not end with .pdf',
        },
        {
          name: 'malware.dll',
          type: 'application/pdf',
          desc: 'Dynamic library .dll with spoofed application/pdf MIME',
          reason: 'Extension does not end with .pdf',
        },
        // Common office & text documents
        {
          name: 'document.docx',
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          desc: 'Word document .docx with OpenXML MIME',
          reason: 'Extension does not end with .pdf',
        },
        {
          name: 'spreadsheet.xlsx',
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          desc: 'Excel spreadsheet .xlsx with OpenXML MIME',
          reason: 'Extension does not end with .pdf',
        },
        {
          name: 'notes.txt',
          type: 'text/plain',
          desc: 'Plain text file .txt with text/plain MIME',
          reason: 'Extension does not end with .pdf',
        },
        {
          name: 'image.png',
          type: 'image/png',
          desc: 'PNG image with image/png MIME',
          reason: 'Extension does not end with .pdf',
        },
        {
          name: 'vector.svg',
          type: 'image/svg+xml',
          desc: 'SVG vector with image/svg+xml MIME',
          reason: 'Extension does not end with .pdf',
        },
        {
          name: 'index.html',
          type: 'text/html',
          desc: 'HTML page with text/html MIME',
          reason: 'Extension does not end with .pdf',
        },
        // Double extension attacks
        {
          name: 'document.pdf.exe',
          type: 'application/octet-stream',
          desc: 'Double extension document.pdf.exe with application/octet-stream',
          reason: 'Filename ends with .exe, not .pdf',
        },
        {
          name: 'invoice.pdf.exe',
          type: 'application/pdf',
          desc: 'Double extension invoice.pdf.exe with spoofed application/pdf MIME',
          reason: 'Filename ends with .exe, not .pdf',
        },
        {
          name: 'guide.pdf.js',
          type: 'application/javascript',
          desc: 'Double extension guide.pdf.js with JS MIME',
          reason: 'Filename ends with .js, not .pdf',
        },
        {
          name: 'guide.pdf.bat',
          type: '',
          desc: 'Double extension guide.pdf.bat with empty MIME',
          reason: 'Filename ends with .bat, not .pdf',
        },
        // Valid extension but conflicting/tampered MIME
        {
          name: 'document.pdf',
          type: 'application/octet-stream',
          desc: 'Valid .pdf extension but octet-stream MIME',
          reason: 'file.type is present and !== application/pdf',
        },
        {
          name: 'document.pdf',
          type: 'application/x-dosexec',
          desc: 'Valid .pdf extension but DOS executable MIME',
          reason: 'file.type is present and !== application/pdf',
        },
        {
          name: 'document.pdf',
          type: 'text/plain',
          desc: 'Valid .pdf extension but text/plain MIME',
          reason: 'file.type is present and !== application/pdf',
        },
        {
          name: 'document.pdf',
          type: 'image/jpeg',
          desc: 'Valid .pdf extension but image/jpeg MIME',
          reason: 'file.type is present and !== application/pdf',
        },
        // Corner cases & anomalies
        {
          name: 'noextension',
          type: 'application/pdf',
          desc: 'File without extension but application/pdf MIME',
          reason: 'Does not end with .pdf',
        },
        {
          name: 'document.pdf.',
          type: 'application/pdf',
          desc: 'Trailing period document.pdf.',
          reason: 'Does not end with .pdf',
        },
        {
          name: 'document.pdf ',
          type: 'application/pdf',
          desc: 'Trailing whitespace document.pdf ',
          reason: 'Does not end with .pdf',
        },
        {
          name: '.pdf',
          type: 'application/octet-stream',
          desc: 'Hidden file .pdf with non-PDF MIME',
          reason: 'Type mismatch',
        },
      ];

      for (const tc of rejectionCases) {
        test(`REJECT: ${tc.desc} -> Rejected (${tc.reason})`, () => {
          const res = validateFileBoolean(tc.name, tc.type);
          assert.equal(
            res.isValid,
            false,
            `Expected ${tc.name} (type: ${tc.type}) to be REJECTED, but was incorrectly ACCEPTED!`
          );
          assert.equal(res.rejectedByCondition, true);
        });
      }
    });

    // ------------------------------------------------------------------------
    // Group 1.3: Truth Table Exhaustive Cartesian Product
    // ------------------------------------------------------------------------
    test('Group 1.3: Exhaustive 2x3 Truth Table Matrix verification', () => {
      // Dimensions:
      // Dimension A: endsWith('.pdf') -> [true, false]
      // Dimension B: MIME status -> ['application/pdf', 'other/mime', 'empty/undefined']
      // Expected outcomes:
      // [true, 'application/pdf'] -> ACCEPT (isValid: true)
      // [true, 'other/mime']      -> REJECT (isValid: false)
      // [true, 'empty/undefined'] -> ACCEPT (isValid: true)
      // [false, 'application/pdf'] -> REJECT (isValid: false)
      // [false, 'other/mime']      -> REJECT (isValid: false)
      // [false, 'empty/undefined'] -> REJECT (isValid: false)

      const names = {
        trueEnds: 'safe_document.pdf',
        falseEnds: 'dangerous_payload.exe',
      };

      const mimes = {
        pdfMime: 'application/pdf',
        otherMime: 'text/html',
        emptyMime: '',
        undefinedMime: undefined,
      };

      // Cell 1: [trueEnds, pdfMime]
      assert.equal(validateFileBoolean(names.trueEnds, mimes.pdfMime).isValid, true);
      // Cell 2: [trueEnds, otherMime]
      assert.equal(validateFileBoolean(names.trueEnds, mimes.otherMime).isValid, false);
      // Cell 3: [trueEnds, emptyMime]
      assert.equal(validateFileBoolean(names.trueEnds, mimes.emptyMime).isValid, true);
      // Cell 4: [trueEnds, undefinedMime]
      assert.equal(validateFileBoolean(names.trueEnds, mimes.undefinedMime).isValid, true);

      // Cell 5: [falseEnds, pdfMime] (MIME spoofing attack)
      assert.equal(validateFileBoolean(names.falseEnds, mimes.pdfMime).isValid, false);
      // Cell 6: [falseEnds, otherMime]
      assert.equal(validateFileBoolean(names.falseEnds, mimes.otherMime).isValid, false);
      // Cell 7: [falseEnds, emptyMime]
      assert.equal(validateFileBoolean(names.falseEnds, mimes.emptyMime).isValid, false);
      // Cell 8: [falseEnds, undefinedMime]
      assert.equal(validateFileBoolean(names.falseEnds, mimes.undefinedMime).isValid, false);
    });
  });

  // ==========================================================================
  // Suite 2: File Size Boundary (20MB) Stress Testing
  // ==========================================================================
  describe('Suite 2: File Size Boundary Enforcement (20MB & Vercel Limits)', () => {

    /**
     * File size evaluation function simulating:
     * - `src/components/Step2ProductUpload.tsx:224-236`
     * - `src/components/Step1Matrix.tsx:78-91`
     */
    function evaluateFileSize(fileSize: number, hostname: string): { isTooLarge: boolean; errorMessage: string | null } {
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
      const maxBytes = isLocalhost ? 20 * 1024 * 1024 : 3.2 * 1024 * 1024;

      if (fileSize > maxBytes) {
        const msg = isLocalhost
          ? 'Die Datei ist zu groß (maximal 20 MB zulässig).'
          : `Die PDF-Datei (${(fileSize / (1024 * 1024)).toFixed(1)} MB) überschreitet das Vercel-Serverless-Limit von ca. 3,2 MB. Bitte komprimieren Sie das PDF oder extrahieren Sie die relevanten Seiten.`;
        return { isTooLarge: true, errorMessage: msg };
      }
      return { isTooLarge: false, errorMessage: null };
    }

    test('SIZE-01: Exactly 20 MB (20,971,520 bytes) on localhost is ACCEPTED (boundary <= 20MB)', () => {
      const exact20Mb = 20 * 1024 * 1024; // 20,971,520
      const res = evaluateFileSize(exact20Mb, 'localhost');
      assert.equal(res.isTooLarge, false);
      assert.equal(res.errorMessage, null);
    });

    test('SIZE-02: Exactly 20 MB minus 1 byte (20,971,519 bytes) on localhost is ACCEPTED', () => {
      const justUnder20Mb = 20 * 1024 * 1024 - 1;
      const res = evaluateFileSize(justUnder20Mb, 'localhost');
      assert.equal(res.isTooLarge, false);
      assert.equal(res.errorMessage, null);
    });

    test('SIZE-03: 20 MB plus 1 byte (20,971,521 bytes) on localhost is REJECTED (boundary > 20MB)', () => {
      const justOver20Mb = 20 * 1024 * 1024 + 1;
      const res = evaluateFileSize(justOver20Mb, 'localhost');
      assert.equal(res.isTooLarge, true);
      assert.ok(res.errorMessage?.includes('maximal 20 MB zulässig'));
    });

    test('SIZE-04: 21 MB (22,020,096 bytes) on localhost is REJECTED', () => {
      const size21Mb = 21 * 1024 * 1024;
      const res = evaluateFileSize(size21Mb, 'localhost');
      assert.equal(res.isTooLarge, true);
      assert.ok(res.errorMessage?.includes('maximal 20 MB zulässig'));
    });

    test('SIZE-05: Legacy 35 MB limit (36,700,160 bytes) is strictly REJECTED under new 20MB ceiling', () => {
      const oldLimit = 35 * 1024 * 1024;
      const res = evaluateFileSize(oldLimit, 'localhost');
      assert.equal(res.isTooLarge, true);
      assert.ok(res.errorMessage?.includes('maximal 20 MB zulässig'));
    });

    test('SIZE-06: 127.0.0.1 hostname enforces the identical 20 MB ceiling as localhost', () => {
      const exact20Mb = 20 * 1024 * 1024;
      const over20Mb = 20 * 1024 * 1024 + 1;

      assert.equal(evaluateFileSize(exact20Mb, '127.0.0.1').isTooLarge, false);
      assert.equal(evaluateFileSize(over20Mb, '127.0.0.1').isTooLarge, true);
    });

    test('SIZE-07: Non-localhost (production/Vercel) enforces 3.2 MB ceiling (~3,355,443 bytes)', () => {
      const vercelMax = 3.2 * 1024 * 1024; // 3,355,443.2
      const safeVercelSize = 3.1 * 1024 * 1024;
      const overVercelSize = 3.5 * 1024 * 1024;
      const localhost20MbSize = 10 * 1024 * 1024; // 10 MB: ok on localhost, but fails on Vercel

      const safeRes = evaluateFileSize(safeVercelSize, 'qm-nachhaltigkeit.vercel.app');
      assert.equal(safeRes.isTooLarge, false);

      const overRes = evaluateFileSize(overVercelSize, 'qm-nachhaltigkeit.vercel.app');
      assert.equal(overRes.isTooLarge, true);
      assert.ok(overRes.errorMessage?.includes('Vercel-Serverless-Limit'));

      const tenMbRes = evaluateFileSize(localhost20MbSize, 'qm-nachhaltigkeit.vercel.app');
      assert.equal(tenMbRes.isTooLarge, true);
      assert.ok(tenMbRes.errorMessage?.includes('Vercel-Serverless-Limit'));
    });
  });

  // ==========================================================================
  // Suite 3: Client Error Recovery & Component State Invariants (F15)
  // ==========================================================================
  describe('Suite 3: Client State Invariants on Fatal Errors (F15)', () => {

    /**
     * Simulation of Step2ProductUpload component state transitions:
     * Mirrors `handleDocumentScan` in `src/components/Step2ProductUpload.tsx:217-338`.
     */
    interface ComponentState {
      sdbFile: { name: string; size: number } | null;
      testReportFile: { name: string; size: number } | null;
      isScanningSdb: boolean;
      isScanningTestReport: boolean;
      isModalOpen: boolean;
      pendingExtraction: any | null;
      errorMessage: string | null;
      sdbInputValue: string;
      testReportInputValue: string;
    }

    async function simulateHandleDocumentScan(
      state: ComponentState,
      file: { name: string; size: number },
      documentType: 'sdb' | 'pruefbericht',
      mockApiResponse: {
        ok: boolean;
        status: number;
        data?: { success: boolean; extracted?: any; code?: string; message?: string };
        error?: string;
      } | 'throw_network_error'
    ): Promise<ComponentState> {
      const nextState: ComponentState = { ...state };

      if (documentType === 'sdb') {
        nextState.isScanningSdb = true;
      } else {
        nextState.isScanningTestReport = true;
      }
      nextState.errorMessage = null;

      try {
        if (mockApiResponse === 'throw_network_error') {
          throw new Error('Failed to fetch (Network connection lost)');
        }

        const res = mockApiResponse;

        if (res.ok && res.data?.success && res.data.extracted) {
          if (documentType === 'sdb') {
            nextState.sdbFile = { name: file.name, size: file.size };
          } else {
            nextState.testReportFile = { name: file.name, size: file.size };
          }
          nextState.pendingExtraction = res.data.extracted;
          nextState.isModalOpen = true;
        } else {
          const statusCode = res.status;
          const errCode = res.data?.code;
          const errMsg =
            res.data?.message ||
            res.error ||
            'Die Datei konnte nicht verarbeitet werden.';

          // F15: Fatal validation/format/size/auth error -> reject file and rollback UI state
          const isFatalError =
            statusCode === 400 ||
            statusCode === 413 ||
            statusCode === 401 ||
            statusCode === 403 ||
            ['INVALID_PDF', 'PAYLOAD_TOO_LARGE', 'EMPTY_FILE', 'INVALID_DOCUMENT_TYPE'].includes(errCode || '');

          if (isFatalError) {
            nextState.errorMessage = errMsg;
            if (documentType === 'sdb') {
              nextState.sdbFile = null;
              nextState.sdbInputValue = '';
            } else {
              nextState.testReportFile = null;
              nextState.testReportInputValue = '';
            }
          } else {
            // AI unavailable or transient service degradation (502 / 503) -> allow manual parameter entry
            if (documentType === 'sdb') {
              nextState.sdbFile = { name: file.name, size: file.size };
            } else {
              nextState.testReportFile = { name: file.name, size: file.size };
            }
            nextState.errorMessage = errMsg;
            const manualFallback = {
              documentType,
              filename: file.name,
              productName: file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' '),
              manufacturer: '',
              suggestedCriteriaNr: '2',
              vocContent: '',
              vocTestDate: '',
              svhcStatus: '',
              certificates: [],
              hasBauteilekatalog: true,
              summarySnippet: '',
              fieldQuotes: [],
              warnings: [errMsg],
            };
            nextState.pendingExtraction = manualFallback;
            nextState.isModalOpen = true;
          }
        }
      } catch (err: any) {
        const errMsg =
          'Fehler beim Scannen des PDFs: ' +
          (err?.message || 'Bitte prüfen Sie die Datei.');
        nextState.errorMessage = errMsg;
        if (documentType === 'sdb') {
          nextState.sdbFile = null;
          nextState.sdbInputValue = '';
        } else {
          nextState.testReportFile = null;
          nextState.testReportInputValue = '';
        }
      } finally {
        nextState.isScanningSdb = false;
        nextState.isScanningTestReport = false;
      }

      return nextState;
    }

    const initialCleanState: ComponentState = {
      sdbFile: null,
      testReportFile: null,
      isScanningSdb: false,
      isScanningTestReport: false,
      isModalOpen: false,
      pendingExtraction: null,
      errorMessage: null,
      sdbInputValue: 'C:\\fakepath\\uploaded.pdf',
      testReportInputValue: '',
    };

    const fatalScenarios = [
      {
        name: 'HTTP 400 + code: INVALID_PDF',
        response: {
          ok: false,
          status: 400,
          data: { success: false, code: 'INVALID_PDF', message: 'Die hochgeladene Datei ist kein gültiges PDF-Dokument (%PDF- Signatur fehlt).' },
        },
      },
      {
        name: 'HTTP 400 + code: EMPTY_FILE',
        response: {
          ok: false,
          status: 400,
          data: { success: false, code: 'EMPTY_FILE', message: 'Die hochgeladene Datei ist leer.' },
        },
      },
      {
        name: 'HTTP 400 + code: PAYLOAD_TOO_LARGE',
        response: {
          ok: false,
          status: 400,
          data: { success: false, code: 'PAYLOAD_TOO_LARGE', message: 'Das PDF überschreitet das Limit von 20 MB.' },
        },
      },
      {
        name: 'HTTP 413 (Express Payload Too Large)',
        response: {
          ok: false,
          status: 413,
          data: { success: false, code: 'PAYLOAD_TOO_LARGE', message: 'Payload Too Large' },
        },
      },
      {
        name: 'HTTP 400 + code: INVALID_DOCUMENT_TYPE',
        response: {
          ok: false,
          status: 400,
          data: { success: false, code: 'INVALID_DOCUMENT_TYPE', message: 'Ungültiger Dokumententyp angegeben.' },
        },
      },
      {
        name: 'HTTP 401 Unauthorized Session',
        response: {
          ok: false,
          status: 401,
          data: { success: false, code: 'UNAUTHORIZED', message: 'Sitzung abgelaufen.' },
        },
      },
      {
        name: 'HTTP 403 Forbidden Access',
        response: {
          ok: false,
          status: 403,
          data: { success: false, code: 'FORBIDDEN', message: 'Zugriff verweigert.' },
        },
      },
    ];

    for (const sc of fatalScenarios) {
      test(`RECOVERY-FATAL: ${sc.name} -> cleans state, NO green checkmark, NO modal`, async () => {
        const state = await simulateHandleDocumentScan(
          initialCleanState,
          { name: 'bad_file.pdf', size: 1024 },
          'sdb',
          sc.response
        );

        // Invariant 1: sdbFile is strictly null (NOT preserved)
        assert.equal(
          state.sdbFile,
          null,
          `sdbFile MUST be null after fatal error (${sc.name}), but found: ${JSON.stringify(state.sdbFile)}`
        );

        // Invariant 2: ConfirmExtractedDataModal is strictly closed
        assert.equal(
          state.isModalOpen,
          false,
          `ConfirmExtractedDataModal MUST NOT be open after fatal error (${sc.name})`
        );

        // Invariant 3: pendingExtraction is null (no false manual fallback)
        assert.equal(
          state.pendingExtraction,
          null,
          `pendingExtraction MUST be null after fatal error (${sc.name})`
        );

        // Invariant 4: Input value cleared (prevents file re-selection lock)
        assert.equal(
          state.sdbInputValue,
          '',
          `Input element value MUST be reset to empty string after fatal error`
        );

        // Invariant 5: Error message is populated
        assert.ok(
          state.errorMessage && state.errorMessage.length > 0,
          `Error message should be set for the user`
        );

        // Invariant 6: Scanning indicator is reset
        assert.equal(state.isScanningSdb, false);
      });
    }

    test('RECOVERY-FATAL: Network / JSON parse error -> catches exception, cleans state, NO modal', async () => {
      const state = await simulateHandleDocumentScan(
        initialCleanState,
        { name: 'network_break.pdf', size: 1024 },
        'sdb',
        'throw_network_error'
      );

      assert.equal(state.sdbFile, null);
      assert.equal(state.isModalOpen, false);
      assert.equal(state.pendingExtraction, null);
      assert.equal(state.sdbInputValue, '');
      assert.ok(state.errorMessage?.includes('Fehler beim Scannen des PDFs'));
      assert.equal(state.isScanningSdb, false);
    });

    test('CONTRAST: Transient AI failure (HTTP 502 / 503) -> preserves file & opens modal for manual fallback', async () => {
      const aiFailureResponse = {
        ok: false,
        status: 502,
        data: {
          success: false,
          code: 'AI_FAILED',
          message: 'KI-Analyse derzeit nicht verfügbar. Bitte tragen Sie die Parameter manuell ein.',
        },
      };

      const state = await simulateHandleDocumentScan(
        initialCleanState,
        { name: 'valid_content_ai_down.pdf', size: 50000 },
        'sdb',
        aiFailureResponse
      );

      // AI failure DOES preserve the file so the user can audit manually
      assert.notEqual(state.sdbFile, null);
      assert.equal(state.sdbFile?.name, 'valid_content_ai_down.pdf');

      // AI failure DOES open ConfirmExtractedDataModal with manual fallback
      assert.equal(state.isModalOpen, true);
      assert.notEqual(state.pendingExtraction, null);
      assert.equal(state.pendingExtraction?.productName, 'valid content ai down');
    });

    test('CONTRAST: Successful parse (HTTP 200) -> preserves file, opens modal, no error', async () => {
      const successResponse = {
        ok: true,
        status: 200,
        data: {
          success: true,
          extracted: {
            documentType: 'sdb',
            filename: 'Kaubit_SDB.pdf',
            productName: 'Kaubit SK',
            manufacturer: 'Kaubit AG',
            suggestedCriteriaNr: '2',
            vocContent: '< 1 g/l',
            vocTestDate: '',
            svhcStatus: 'keine SVHC',
            certificates: [],
            hasBauteilekatalog: true,
            summarySnippet: 'OK',
            fieldQuotes: [],
            warnings: [],
          },
        },
      };

      const state = await simulateHandleDocumentScan(
        initialCleanState,
        { name: 'Kaubit_SDB.pdf', size: 50000 },
        'sdb',
        successResponse
      );

      assert.notEqual(state.sdbFile, null);
      assert.equal(state.sdbFile?.name, 'Kaubit_SDB.pdf');
      assert.equal(state.isModalOpen, true);
      assert.equal(state.pendingExtraction?.productName, 'Kaubit SK');
      assert.equal(state.errorMessage, null);
    });
  });

  // ==========================================================================
  // Suite 4: End-to-End Server Boundary & Protocol Adherence (F11, F12, F15)
  // ==========================================================================
  describe('Suite 4: Server Endpoint Protocol Verification (parse-pdf & parse-guideline-pdf)', () => {
    let serverInstance: InProcessServerInstance;

    before(async () => {
      serverInstance = await startInProcessServer({
        envOverrides: {
          ALLOW_UNAUTHENTICATED_API: 'true',
          NODE_ENV: 'test',
        },
      });
    });

    after(async () => {
      await serverInstance?.stop();
    });

    test('ENDPOINT-01: /api/documents/parse-pdf rejects corrupted magic bytes with HTTP 400 INVALID_PDF', async () => {
      const corrupted = createCorruptedMagicBytesPdf();
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: corrupted.base64,
        filename: 'corrupted_magic.pdf',
        documentType: 'sdb',
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'INVALID_PDF');
      assert.ok(res.body.message?.includes('%PDF-'));
    });

    test('ENDPOINT-02: /api/documents/parse-pdf rejects HTML masquerading as PDF with HTTP 400 INVALID_PDF', async () => {
      const htmlTrick = createHtmlMasqueradingAsPdf();
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: htmlTrick.base64,
        filename: 'fake_html.pdf',
        documentType: 'sdb',
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'INVALID_PDF');
    });

    test('ENDPOINT-03: /api/documents/parse-pdf rejects zero-byte payload with HTTP 400 EMPTY_FILE', async () => {
      const zeroByte = createZeroBytePdf();
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: zeroByte.base64,
        filename: 'empty.pdf',
        documentType: 'sdb',
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'EMPTY_FILE');
    });

    test('ENDPOINT-04: /api/documents/parse-pdf rejects >20MB binary buffer with HTTP 400 PAYLOAD_TOO_LARGE', async () => {
      const oversized = createOversizedPdf(21); // 21 MB
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: oversized.base64,
        filename: 'too_large.pdf',
        documentType: 'sdb',
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'PAYLOAD_TOO_LARGE');
    });

    test('ENDPOINT-05: /api/standards/parse-guideline-pdf rejects corrupted magic bytes with HTTP 400 INVALID_PDF', async () => {
      const truncated = createTruncatedHeaderPdf();
      const res = await serverInstance.client.post('/api/standards/parse-guideline-pdf', {
        pdfBase64: truncated.base64,
        filename: 'guideline_bad.pdf',
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'INVALID_PDF');
    });

    test('ENDPOINT-06: /api/standards/parse-guideline-pdf rejects zero-byte payload with HTTP 400 EMPTY_FILE', async () => {
      const res = await serverInstance.client.post('/api/standards/parse-guideline-pdf', {
        pdfBase64: '',
        filename: 'empty_guideline.pdf',
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'EMPTY_FILE');
    });

    test('ENDPOINT-07: /api/standards/parse-guideline-pdf rejects >20MB payload with HTTP 400 PAYLOAD_TOO_LARGE', async () => {
      const oversized = createOversizedPdf(21);
      const res = await serverInstance.client.post('/api/standards/parse-guideline-pdf', {
        pdfBase64: oversized.base64,
        filename: 'oversized_guideline.pdf',
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'PAYLOAD_TOO_LARGE');
    });
  });
});

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startInProcessServer,
  InProcessServerInstance,
  createValidSdbPdf,
  createValidTmPdf,
  getAdminToken,
  getEmployeeToken,
  getUnauthorizedToken,
  getAuthHeaders,
  ADMIN_EMAIL,
  EMPLOYEE_EMAIL,
  assertSecurityHeaders,
  assertSanitizedError,
} from './harness';

describe('Tier 5: Adversarial Backend Security & Endpoint Invariants', () => {
  let serverInstance: InProcessServerInstance;

  before(async () => {
    serverInstance = await startInProcessServer({
      envOverrides: {
        ALLOW_UNAUTHENTICATED_API: 'false',
        NODE_ENV: 'test',
      },
    });
  });

  after(async () => {
    await serverInstance?.stop();
  });

  // ==========================================================================
  // Area 1: Auth & Session Verification Invariants
  // ==========================================================================
  describe('Area 1: Auth & Session Invariants', () => {
    test('TC-T5-AUTH-01: Hermetic test token (test-jwt:...) is strictly rejected when NODE_ENV is production', async () => {
      process.env.NODE_ENV = 'production';
      try {
        const adminToken = getAdminToken();
        const res = await serverInstance.client.post(
          '/api/auth/verify-session',
          {},
          getAuthHeaders(adminToken)
        );
        // In production, hermetic test tokens must NEVER be accepted
        assert.equal(res.status, 401, 'Expected 401 Unauthorized for test-jwt in production mode');
        assert.equal(res.body.success, false);
        assert.equal(res.body.isAuthorized, false);
      } finally {
        process.env.NODE_ENV = 'test';
      }
    });

    test('TC-T5-AUTH-02: Empty Bearer header ("Bearer ") is rejected with HTTP 401', async () => {
      const res = await serverInstance.client.post(
        '/api/auth/verify-session',
        {},
        { Authorization: 'Bearer ' }
      );
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.isAuthorized, false);
    });

    test('TC-T5-AUTH-03: Valid Bearer header takes precedence over malformed body idToken', async () => {
      const adminToken = getAdminToken();
      const res = await serverInstance.client.post(
        '/api/auth/verify-session',
        { idToken: 'invalid-malicious-body-token' },
        getAuthHeaders(adminToken)
      );
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.isAuthorized, true);
      assert.equal(res.body.email, ADMIN_EMAIL);
    });

    test('TC-T5-AUTH-04: Non-string types in body idToken (number, object, boolean) rejected with HTTP 401', async () => {
      const invalidTypes = [12345, true, { malicious: 'token' }, ['array', 'token']];
      for (const val of invalidTypes) {
        const res = await serverInstance.client.post('/api/auth/verify-session', {
          idToken: val,
        });
        assert.equal(res.status, 401, `Failed to reject invalid idToken type ${typeof val}`);
        assert.equal(res.body.success, false);
      }
    });

    test('TC-T5-AUTH-05: Missing email claim in test token returns HTTP 401 without server crash', async () => {
      // test-jwt without email: "test-jwt::uid-without-email"
      const res = await serverInstance.client.post(
        '/api/auth/verify-session',
        {},
        { Authorization: 'Bearer test-jwt::uid-without-email' }
      );
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    test('TC-T5-AUTH-06: Endpoint status code consistency: manage-employees without auth returns 401 Unauthorized', async () => {
      const res = await serverInstance.client.post('/api/auth/manage-employees', {
        authorizedEmails: ['test@example.com'],
      });
      // Unauthenticated request returns 401 Unauthorized
      assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
      assert.equal(res.body.success, false);
    });

    test('TC-T5-AUTH-07: Duplicate or array Authorization header handling in requireAuth', async () => {
      // Test sending duplicate Authorization headers
      const res = await serverInstance.client.request({
        path: '/api/standards/analyze-product',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: 'Bearer token1, Bearer token2',
        },
        body: { productName: 'Duplicate Header Test' },
      });
      // Should be rejected safely without crashing the server process
      assert.ok(res.status === 401 || res.status === 403 || res.status === 400);
      assert.equal(res.body.success, false);
    });
  });

  // ==========================================================================
  // Area 2: In-Memory Crypto and PBKDF2 Salt/Verifier Invariants
  // ==========================================================================
  describe('Area 2: In-Memory Crypto & PBKDF2 Vault Invariants', () => {
    test('TC-T5-VAULT-01: save-passphrase-verifier rejects null, empty or missing saltHex/verifierHex', async () => {
      const adminToken = getAdminToken();
      const testCases = [
        { saltHex: '', verifierHex: 'abcdef1234567890' },
        { saltHex: 'abcdef1234567890', verifierHex: '' },
        { saltHex: null, verifierHex: 'abcdef1234567890' },
        { verifierHex: 'abcdef1234567890' },
        {},
      ];

      for (const tc of testCases) {
        const res = await serverInstance.client.post(
          '/api/auth/save-passphrase-verifier',
          tc,
          getAuthHeaders(adminToken)
        );
        assert.equal(res.status, 400, `Expected 400 for payload ${JSON.stringify(tc)}`);
        assert.equal(res.body.success, false);
      }
    });

    test('TC-T5-VAULT-02: Non-admin employee is forbidden from saving passphrase or managing vault', async () => {
      const empToken = getEmployeeToken();
      const res = await serverInstance.client.post(
        '/api/auth/save-passphrase-verifier',
        { saltHex: '1234567890abcdef', verifierHex: '1234567890abcdef1234567890abcdef' },
        getAuthHeaders(empToken)
      );
      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    });

    test('TC-T5-VAULT-03: Vault state update with valid hex preserves authorized employee list', async () => {
      const adminToken = getAdminToken();
      const validSalt = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
      const validVerifier = 'fedcba98765432100123456789abcdef0123456789abcdef0123456789abcdef';
      const customEmployees = ['auditor@bau-qm.org', 'brian.lackmann@kaubit.de'];

      const res = await serverInstance.client.post(
        '/api/auth/save-passphrase-verifier',
        {
          saltHex: validSalt,
          verifierHex: validVerifier,
          authorizedEmails: customEmployees,
        },
        getAuthHeaders(adminToken)
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.authorizedEmails));
      assert.ok(res.body.authorizedEmails.includes('auditor@bau-qm.org'));

      // Verify that subsequent verify-session returns the configured vault state
      const verifyRes = await serverInstance.client.post(
        '/api/auth/verify-session',
        {},
        getAuthHeaders(adminToken)
      );
      assert.equal(verifyRes.status, 200);
      assert.equal(verifyRes.body.hasPassphraseConfigured, true);
      assert.equal(verifyRes.body.saltHex, validSalt);
      assert.equal(verifyRes.body.verifierHex, validVerifier);
    });

    test('TC-T5-VAULT-04: Non-email junk strings in authorizedEmails are filtered out by email validation', async () => {
      const adminToken = getAdminToken();
      const validSalt = 'b1b2c3d4e5f60718293a4b5c6d7e8f90';
      const validVerifier = 'aedcba98765432100123456789abcdef0123456789abcdef0123456789abcdef';
      // Pass non-email string like 'not_an_email_string'
      const res = await serverInstance.client.post(
        '/api/auth/save-passphrase-verifier',
        {
          saltHex: validSalt,
          verifierHex: validVerifier,
          authorizedEmails: ['not_an_email_string', 'another-invalid-entry'],
        },
        getAuthHeaders(adminToken)
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      // Hardened behavior: non-email strings are rejected/filtered out from memory vault
      assert.ok(!res.body.authorizedEmails.includes('not_an_email_string'));
    });
  });

  // ==========================================================================
  // Area 3: Document Upload / parse-pdf Invariants
  // ==========================================================================
  describe('Area 3: Document Upload & PDF Parsing Adversarial Invariants', () => {
    before(() => {
      process.env.ALLOW_UNAUTHENTICATED_API = 'true';
      process.env.NODE_ENV = 'test';
    });

    test('TC-T5-DOC-01: UTF-8 BOM (0xEF, 0xBB, 0xBF) before %PDF- is safely rejected with HTTP 400 INVALID_PDF', async () => {
      // Construct a PDF payload prefixed with a UTF-8 BOM
      const bomPdfBuffer = Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'),
      ]);
      const base64Bom = bomPdfBuffer.toString('base64');

      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: base64Bom,
        filename: 'bom_prefixed.pdf',
        documentType: 'sdb',
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'INVALID_PDF');
    });

    test('TC-T5-DOC-02: Minimal 5-byte PDF (%PDF-) with no objects handled safely without crash', async () => {
      // Exact 5 bytes matching %PDF- magic bytes
      const minimalPdfBase64 = Buffer.from('%PDF-').toString('base64');

      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: minimalPdfBase64,
        filename: 'minimal_5byte.pdf',
        documentType: 'sdb',
      });

      // Magic bytes pass, but unpdf parser finds no textlayer -> handled cleanly
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.extracted.hasTextLayer, false);
    });

    test('TC-T5-DOC-03: German umlauts and non-ASCII characters in filename sanitized deterministically', async () => {
      const tm = createValidTmPdf();
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: tm.base64,
        filename: 'Prüfbericht_Ökologie_Müller_2024.pdf',
        documentType: 'tm',
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      // Sanitizer replaces non [a-zA-Z0-9._-] with underscore
      assert.ok(res.body.extracted.filename.endsWith('.pdf'));
      assert.ok(!res.body.extracted.filename.includes('ü'));
      assert.ok(!res.body.extracted.filename.includes('Ö'));
      assert.ok(res.body.extracted.filename.includes('Pr_fbericht'));
    });

    test('TC-T5-DOC-04: Non-Latin / Unicode-only filename falls back safely without breaking', async () => {
      const tm = createValidTmPdf();
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: tm.base64,
        filename: '🌟✨_тест_文档.pdf',
        documentType: 'tm',
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(typeof res.body.extracted.filename === 'string');
      assert.ok(res.body.extracted.filename.length > 0);
    });

    test('TC-T5-DOC-05: Non-standard PDF version %PDF-2.0 is accepted by magic byte validator', async () => {
      const pdf20Buffer = Buffer.from(
        '%PDF-2.0\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF'
      );
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: pdf20Buffer.toString('base64'),
        filename: 'pdf20_test.pdf',
        documentType: 'sdb',
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
    });

    test('TC-T5-DOC-06: Corrupted trailer without startxref handled safely without 500 error', async () => {
      const corruptedTrailerBuffer = Buffer.from(
        '%PDF-1.5\n1 0 obj\n<< /Length 10 >>\nstream\nHelloWorld\nendstream\nendobj\ncorrupted_data_without_trailer\n'
      );
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: corruptedTrailerBuffer.toString('base64'),
        filename: 'corrupted_trailer.pdf',
        documentType: 'sdb',
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.extracted.hasTextLayer, false);
    });

    test('TC-T5-DOC-07: Windows drive letter and backslash traversal in filename sanitized safely', async () => {
      const tm = createValidTmPdf();
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: tm.base64,
        filename: 'C:\\Windows\\System32\\drivers\\etc\\hosts.pdf',
        documentType: 'tm',
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(!res.body.extracted.filename.includes('C:'));
      assert.ok(!res.body.extracted.filename.includes('\\'));
      assert.equal(res.body.extracted.filename, 'hosts.pdf');
    });

    test('TC-T5-DOC-08: Corrupted base64 characters (!@#$%) rejected with HTTP 400 INVALID_PDF', async () => {
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: '!!!NOT_BASE_64_AT_ALL!@#$%^&*()===',
        filename: 'illegal_chars.pdf',
        documentType: 'sdb',
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'INVALID_PDF');
    });

    test('TC-T5-DOC-09: Unpadded base64 string handled safely without unhandled rejection', async () => {
      // Base64 of %PDF- without '=' padding
      const unpadded = Buffer.from('%PDF-1.4\n').toString('base64').replace(/=+$/, '');
      const res = await serverInstance.client.post('/api/documents/parse-pdf', {
        pdfBase64: unpadded,
        filename: 'unpadded.pdf',
        documentType: 'sdb',
      });

      // Valid magic bytes pass, handled without server crash
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
    });
  });

  // ==========================================================================
  // Area 4: Rate Limiting & DoS Invariants
  // ==========================================================================
  describe('Area 4: Rate Limiting & DoS Protection', () => {
    before(() => {
      process.env.ALLOW_UNAUTHENTICATED_API = 'true';
      process.env.NODE_ENV = 'test';
    });

    test('TC-T5-RATE-01: Rate limiter IP spoofing via X-Forwarded-For tampering demonstrates bucket separation', async () => {
      // Send 5 requests with different client-spoofed X-Forwarded-For headers
      const results: number[] = [];
      for (let i = 1; i <= 5; i++) {
        const res = await serverInstance.client.post(
          '/api/standards/analyze-product',
          { productName: `Spoof Test ${i}` },
          { 'X-Forwarded-For': `198.51.100.${i}` }
        );
        assert.equal(res.status, 200);
        // Each spoofed IP gets its own bucket count = 1, so remaining is (max - 1)
        const remaining = parseInt(res.headers['x-ratelimit-remaining'] as string, 10);
        results.push(remaining);
      }

      // Every distinct IP should have seen remaining = 59 (max 60 - 1)
      for (const rem of results) {
        assert.equal(rem, 59, 'Spoofed IP created independent rate limit bucket');
      }
    });

    test('TC-T5-RATE-02: Excessively long X-Forwarded-For header handled safely without crash', async () => {
      const longIp = '192.168.1.1, ' + '10.0.0.1, '.repeat(500) + '127.0.0.1';
      const res = await serverInstance.client.post(
        '/api/standards/analyze-product',
        { productName: 'Long Header Test' },
        { 'X-Forwarded-For': longIp }
      );
      assert.equal(res.status, 200);
      assert.ok(res.headers['x-ratelimit-remaining'] !== undefined);
    });

    test('TC-T5-RATE-03: Rate limiter enforces HTTP 429 when max limit is exceeded by single IP', async () => {
      // Endpoint /api/standards/analyze-product has limit = 60
      // Send requests with a dedicated IP until limit is exceeded
      const testIp = '198.51.100.99';
      let triggered429 = false;
      let retryAfter: string | undefined;

      // Make 62 requests from testIp
      for (let i = 1; i <= 62; i++) {
        const res = await serverInstance.client.post(
          '/api/standards/analyze-product',
          { productName: `Rate Exceeded Probe ${i}` },
          { 'X-Forwarded-For': testIp }
        );

        if (res.status === 429) {
          triggered429 = true;
          assert.equal(res.body.code, 'RATE_LIMIT_EXCEEDED');
          assert.ok(res.body.message.includes('Zu viele'));
          retryAfter = res.headers['retry-after'] as string;
          break;
        }
      }

      assert.equal(triggered429, true, 'Rate limiter failed to trigger HTTP 429 after 60 requests');
      assert.ok(retryAfter !== undefined && parseInt(retryAfter, 10) > 0, 'Missing or invalid Retry-After header');
    });
  });

  // ==========================================================================
  // Area 5: Production Mode Lock & Environment Invariants
  // ==========================================================================
  describe('Area 5: Production Mode Lock & Environment Invariants', () => {
    test('TC-T5-PROD-01: ALLOW_UNAUTHENTICATED_API strictly ignored in production on all endpoints', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_UNAUTHENTICATED_API = 'true';

      try {
        const endpoints = [
          { path: '/api/documents/parse-pdf', body: { pdfBase64: 'dGVzdA==' } },
          { path: '/api/standards/parse-guideline-pdf', body: {} },
          { path: '/api/standards/analyze-product', body: { productName: 'Prod Test' } },
        ];

        for (const ep of endpoints) {
          const res = await serverInstance.client.post(ep.path, ep.body);
          assert.equal(res.status, 401, `Endpoint ${ep.path} allowed bypass in production!`);
          assert.equal(res.body.success, false);
          assert.equal(res.body.code, 'UNAUTHORIZED');
        }
      } finally {
        process.env.NODE_ENV = 'test';
        process.env.ALLOW_UNAUTHENTICATED_API = 'true';
      }
    });

    test('TC-T5-PROD-02: Mixed-case NODE_ENV=Production is case-insensitively treated as production', async () => {
      // In Node.js, environment variables on Windows can sometimes be case-insensitive.
      // Standardized to process.env.NODE_ENV?.toLowerCase() === 'production'.
      process.env.NODE_ENV = 'Production';
      process.env.ALLOW_UNAUTHENTICATED_API = 'true';

      try {
        const res = await serverInstance.client.post('/api/standards/analyze-product', {
          productName: 'Case Sensitivity Probe',
        });
        // Hardened behavior: case-insensitive check strictly treats "Production" as production mode (401)
        assert.equal(res.status, 401, `Expected 401 under NODE_ENV=Production, got ${res.status}`);
      } finally {
        process.env.NODE_ENV = 'test';
        process.env.ALLOW_UNAUTHENTICATED_API = 'true';
      }
    });
  });

  // ==========================================================================
  // Area 6: Error Sanitization & Leakage Invariants
  // ==========================================================================
  describe('Area 6: Error Sanitization Invariants', () => {
    test('TC-T5-ERR-01: Production error handler suppresses stack traces on 500 error', async () => {
      process.env.NODE_ENV = 'production';
      try {
        // Trigger server error by passing malformed token in verify-session
        const res = await serverInstance.client.post('/api/auth/verify-session', {
          idToken: 'malformed.token.triggering.parser',
        });
        assert.ok(res.status >= 400);
        assertSanitizedError(res.body);
        assert.strictEqual(
          res.body.stack,
          undefined,
          'Stack trace must NEVER be present in production error response'
        );
      } finally {
        process.env.NODE_ENV = 'test';
      }
    });

    test('TC-T5-ERR-02: Malformed JSON syntax error handled with clean 400 BAD_REQUEST and no stack trace', async () => {
      process.env.NODE_ENV = 'production';
      try {
        const res = await serverInstance.client.request({
          path: '/api/standards/analyze-product',
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{"invalid_json": unquoted_value}',
        });

        assert.equal(res.status, 400);
        assert.equal(res.body.success, false);
        assert.equal(res.body.code, 'BAD_REQUEST');
        assert.strictEqual(res.body.stack, undefined);
      } finally {
        process.env.NODE_ENV = 'test';
      }
    });
  });
});

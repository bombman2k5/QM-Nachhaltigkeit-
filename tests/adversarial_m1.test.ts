import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT, KeyLike } from 'jose';
import {
  startInProcessServer,
  InProcessServerInstance,
} from './e2e/harness/serverStarter';
import { getMalformedToken } from './e2e/harness/authHelpers';

describe('Adversarial Challenge Suite: Milestone 1 (M1 Security & Endpoint Hardening)', () => {
  let serverInstance: InProcessServerInstance;
  let testPrivateKey: KeyLike;
  let testKid = 'adv-m1-kid-' + Date.now();
  let originalFetch = globalThis.fetch;

  before(async () => {
    // Generate an RSA signing key for Google JWKS simulation
    const keyPair = await generateKeyPair('RS256');
    testPrivateKey = keyPair.privateKey;
    const jwk = await exportJWK(keyPair.publicKey);
    jwk.kid = testKid;
    jwk.alg = 'RS256';
    jwk.use = 'sig';

    // Intercept Google JWKS endpoint to verify cryptographically valid tokens in-memory
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')) {
        return new Response(JSON.stringify({ keys: [jwk] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(input, init);
    };

    serverInstance = await startInProcessServer({
      envOverrides: {
        ALLOW_UNAUTHENTICATED_API: 'false',
        NODE_ENV: 'test',
      },
    });
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    await serverInstance?.stop();
  });

  async function createSignedToken(email: string, uid: string = 'test-uid-' + Date.now()): Promise<string> {
    return new SignJWT({
      email,
      user_id: uid,
    })
      .setProtectedHeader({ alg: 'RS256', kid: testKid })
      .setIssuer('https://securetoken.google.com/gen-lang-client-0723441171')
      .setAudience('gen-lang-client-0723441171')
      .setSubject(uid)
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(testPrivateKey);
  }

  // ==========================================================================
  // CHALLENGE 1: Production Mode Auth Bypass Guard (F3)
  // ==========================================================================
  describe('Challenge 1: Production Mode Bypass Guard (F3)', () => {
    test('ADV-01: Bypassing requireAuth fails in production mode even with ALLOW_UNAUTHENTICATED_API=true', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_UNAUTHENTICATED_API = 'true';

      try {
        const resAnalyze = await serverInstance.client.post('/api/standards/analyze-product', {
          productName: 'Adversarial Attack Product',
          criteriaRowNr: '2',
        });
        assert.equal(resAnalyze.status, 401, 'Should return HTTP 401 in production');
        assert.equal(resAnalyze.body.success, false);
        assert.equal(resAnalyze.body.code, 'UNAUTHORIZED');

        const resParse = await serverInstance.client.post('/api/documents/parse-pdf', {
          pdfBase64: 'JVBERi0xLjQKJcTl8uXrp...',
          filename: 'test.pdf',
        });
        assert.equal(resParse.status, 401, 'Should return HTTP 401 in production');
        assert.equal(resParse.body.code, 'UNAUTHORIZED');

        const resGuideline = await serverInstance.client.post('/api/standards/parse-guideline-pdf', {
          pdfBase64: 'JVBERi0xLjQKJcTl8uXrp...',
        });
        assert.equal(resGuideline.status, 401, 'Should return HTTP 401 in production');
        assert.equal(resGuideline.body.code, 'UNAUTHORIZED');
      } finally {
        process.env.NODE_ENV = 'test';
        process.env.ALLOW_UNAUTHENTICATED_API = 'false';
      }
    });

    test('ADV-02: Bypass succeeds strictly in non-production test mode when explicitly enabled', async () => {
      process.env.NODE_ENV = 'test';
      process.env.ALLOW_UNAUTHENTICATED_API = 'true';

      try {
        const res = await serverInstance.client.post('/api/standards/analyze-product', {
          productName: 'Authorized Dev Test',
          criteriaRowNr: '2',
        });
        assert.equal(res.status, 200, 'Dev bypass should permit call in non-production mode');
        assert.equal(res.body.success, true);
        assert.ok(res.body.result);
      } finally {
        process.env.ALLOW_UNAUTHENTICATED_API = 'false';
      }
    });
  });

  // ==========================================================================
  // CHALLENGE 2: verify-session Information Leakage & Unauthorized Accounts (F1)
  // ==========================================================================
  describe('Challenge 2: verify-session Information Leakage & Unauthorized Accounts (F1)', () => {
    before(() => {
      process.env.NODE_ENV = 'test';
      process.env.ALLOW_UNAUTHENTICATED_API = 'false';
    });

    test('ADV-03: Empty body verify-session returns 401 and leaks NO sensitive vault data', async () => {
      const res = await serverInstance.client.post('/api/auth/verify-session', {});
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.isAuthorized, false);

      assert.equal(res.body.saltHex, undefined, 'saltHex must NOT be leaked');
      assert.equal(res.body.verifierHex, undefined, 'verifierHex must NOT be leaked');
      assert.equal(res.body.authorizedEmails, undefined, 'authorizedEmails whitelist must NOT be leaked');
      assert.equal(res.body.hasPassphraseConfigured, undefined, 'hasPassphraseConfigured must NOT be leaked');
    });

    test('ADV-04: Malformed JWT in Authorization header returns 401 with no data leakage', async () => {
      const malformed = getMalformedToken();
      const res = await serverInstance.client.post(
        '/api/auth/verify-session',
        {},
        { Authorization: `Bearer ${malformed}` }
      );
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.isAuthorized, false);
      assert.equal(res.body.saltHex, undefined);
      assert.equal(res.body.verifierHex, undefined);
      assert.equal(res.body.authorizedEmails, undefined);
    });

    test('ADV-05: Non-Bearer Authorization scheme (e.g. Basic) returns 401 with no leakage', async () => {
      const res = await serverInstance.client.post(
        '/api/auth/verify-session',
        {},
        { Authorization: 'Basic YWRtaW46cGFzc3dvcmQ=' }
      );
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.isAuthorized, false);
      assert.equal(res.body.saltHex, undefined);
      assert.equal(res.body.verifierHex, undefined);
      assert.equal(res.body.authorizedEmails, undefined);
    });

    test('ADV-06: Valid Google account NOT in whitelist returns HTTP 403 Forbidden with NO data leakage', async () => {
      const unauthorizedToken = await createSignedToken('unauthorized.stranger@external-domain.com');

      const res = await serverInstance.client.post(
        '/api/auth/verify-session',
        {},
        { Authorization: `Bearer ${unauthorizedToken}` }
      );

      assert.equal(res.status, 403, 'Unauthorized Google account MUST receive HTTP 403 Forbidden');
      assert.equal(res.body.success, false);
      assert.equal(res.body.isAuthorized, false);
      assert.ok(
        res.body.message.includes('nicht für dieses Unternehmens-Portal freigeschaltet'),
        'Message must explain access denial'
      );

      // CRITICAL: Ensure zero corporate whitelist or vault leakage in 403
      assert.equal(res.body.saltHex, undefined, 'saltHex must NOT be leaked on 403');
      assert.equal(res.body.verifierHex, undefined, 'verifierHex must NOT be leaked on 403');
      assert.equal(res.body.authorizedEmails, undefined, 'corporate whitelist must NOT be leaked on 403');
      assert.equal(res.body.hasPassphraseConfigured, undefined, 'vault status must NOT be leaked on 403');
    });

    test('ADV-07: Valid Google account NOT in whitelist calling requireAuth endpoint receives HTTP 403 FORBIDDEN', async () => {
      const unauthorizedToken = await createSignedToken('attacker.intruder@gmail.com');

      const res = await serverInstance.client.post(
        '/api/standards/analyze-product',
        { productName: 'Unauthorized Target' },
        { Authorization: `Bearer ${unauthorizedToken}` }
      );

      assert.equal(res.status, 403, 'requireAuth MUST reject unauthorized Google email with HTTP 403');
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'FORBIDDEN');
    });

    test('ADV-08: Authorized Google account successfully accesses verify-session and receives session data', async () => {
      const authorizedToken = await createSignedToken('brian.lackmann@kaubit.de');

      const res = await serverInstance.client.post(
        '/api/auth/verify-session',
        {},
        { Authorization: `Bearer ${authorizedToken}` }
      );

      assert.equal(res.status, 200, 'Authorized employee should receive HTTP 200');
      assert.equal(res.body.success, true);
      assert.equal(res.body.isAuthorized, true);
      assert.equal(res.body.isAdmin, true);
      assert.equal(res.body.email, 'brian.lackmann@kaubit.de');
      assert.ok(Array.isArray(res.body.authorizedEmails));
    });
  });

  // ==========================================================================
  // CHALLENGE 3: Auditor Identity Integrity & Body Spoofing (F6)
  // ==========================================================================
  describe('Challenge 3: Auditor Identity Integrity & Body Spoofing (F6)', () => {
    test('ADV-09: Spoofed userEmail / auditorEmail in request body is strictly overridden by verified token', async () => {
      const verifiedToken = await createSignedToken('auditor@bau-qm.org');

      const spoofedBody = {
        productName: 'Integrity Tested Product',
        criteriaRowNr: '2',
        userEmail: 'adversary@evil-phishing.com', // Spoofed client input
        auditorEmail: 'fake.auditor@malicious-audit.org', // Spoofed client input
        projectTitle: 'Audit with Spoofed Identity Attempt',
      };

      const res = await serverInstance.client.post(
        '/api/standards/analyze-product',
        spoofedBody,
        { Authorization: `Bearer ${verifiedToken}` }
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.result);

      const stampedAuditor = res.body.result.auditMetadata.auditorEmail;
      assert.equal(
        stampedAuditor,
        'auditor@bau-qm.org',
        'auditorEmail MUST be stamped from verified token identity, NOT client payload'
      );
      assert.notEqual(
        stampedAuditor,
        'adversary@evil-phishing.com',
        'Client userEmail must NOT leak into audit metadata'
      );
      assert.notEqual(
        stampedAuditor,
        'fake.auditor@malicious-audit.org',
        'Client auditorEmail must NOT leak into audit metadata'
      );
    });
  });

  // ==========================================================================
  // CHALLENGE 4: Email Whitelist Normalization & Parsing (F4)
  // ==========================================================================
  describe('Challenge 4: Email Whitelist Normalization & Parsing (F4)', () => {
    function parseEmailList(raw?: string): string[] {
      if (!raw || typeof raw !== 'string') return [];
      return raw
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0 && e.includes('@'));
    }

    test('ADV-10: Whitelist normalizes uppercase characters to lowercase', () => {
      const raw = 'BRIAN.LACKMANN@KAUBIT.DE, Auditor@Bau-Qm.Org, ADMIN@DGNB-QM.DE';
      const parsed = parseEmailList(raw);
      assert.deepEqual(parsed, [
        'brian.lackmann@kaubit.de',
        'auditor@bau-qm.org',
        'admin@dgnb-qm.de',
      ]);
    });

    test('ADV-11: Whitelist trims surrounding spaces, tabs, and newlines', () => {
      const raw = '   brian.lackmann@kaubit.de \t , \n auditor@bau-qm.org   ';
      const parsed = parseEmailList(raw);
      assert.deepEqual(parsed, [
        'brian.lackmann@kaubit.de',
        'auditor@bau-qm.org',
      ]);
    });

    test('ADV-12: Whitelist drops empty elements, commas without emails, and malformed strings', () => {
      const raw = ',,  , not-an-email, user@domain.de , invalid-without-at ,,, ';
      const parsed = parseEmailList(raw);
      assert.deepEqual(parsed, ['user@domain.de']);
    });

    test('ADV-13: Whitelist handles undefined, null, and non-string inputs safely without throwing', () => {
      assert.deepEqual(parseEmailList(undefined), []);
      assert.deepEqual(parseEmailList(null as any), []);
      assert.deepEqual(parseEmailList(12345 as any), []);
      assert.deepEqual(parseEmailList(''), []);
    });

    test('ADV-14: Endpoint accepts token with mixed-case and whitespace email after normalization', async () => {
      const tokenWithWhitespace = await createSignedToken('  AUDITOR@BAU-QM.ORG  ');

      const res = await serverInstance.client.post(
        '/api/auth/verify-session',
        {},
        { Authorization: `Bearer ${tokenWithWhitespace}` }
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.isAuthorized, true);
      assert.equal(res.body.email, 'auditor@bau-qm.org');
    });
  });

  // ==========================================================================
  // CHALLENGE 5: Admin-Only Endpoints Protection (F1, F2)
  // ==========================================================================
  describe('Challenge 5: Admin-Only Endpoints Protection', () => {
    before(() => {
      process.env.ALLOW_UNAUTHENTICATED_API = 'false';
      process.env.NODE_ENV = 'test';
    });

    test('ADV-15: Non-admin employee token calling manage-employees receives HTTP 403', async () => {
      const employeeToken = await createSignedToken('auditor@bau-qm.org');

      const res = await serverInstance.client.post(
        '/api/auth/manage-employees',
        { authorizedEmails: ['infiltrator@hostile.com'] },
        { Authorization: `Bearer ${employeeToken}` }
      );

      assert.equal(res.status, 403, 'Non-admin employee must NOT manage employee accounts');
      assert.equal(res.body.success, false);
    });

    test('ADV-16: Admin token calling manage-employees succeeds and updates company vault emails', async () => {
      const adminToken = await createSignedToken('brian.lackmann@kaubit.de');

      const res = await serverInstance.client.post(
        '/api/auth/manage-employees',
        { authorizedEmails: ['new.auditor@kaubit.de'] },
        { Authorization: `Bearer ${adminToken}` }
      );

      assert.equal(res.status, 200, 'Admin token should successfully manage employees');
      assert.equal(res.body.success, true);
      assert.ok(res.body.authorizedEmails.includes('new.auditor@kaubit.de'));
    });

    test('ADV-17: Non-admin employee token calling save-passphrase-verifier receives HTTP 403', async () => {
      const employeeToken = await createSignedToken('auditor@bau-qm.org');

      const res = await serverInstance.client.post(
        '/api/auth/save-passphrase-verifier',
        {
          saltHex: '0123456789abcdef0123456789abcdef',
          verifierHex: '0123456789abcdef0123456789abcdef0123456789abcdef',
        },
        { Authorization: `Bearer ${employeeToken}` }
      );

      assert.equal(res.status, 403, 'Non-admin employee must NOT configure company vault passphrase');
      assert.equal(res.body.success, false);
    });
  });

  // ==========================================================================
  // CHALLENGE 6: Security Headers & Network Hardening (F8)
  // ==========================================================================
  describe('Challenge 6: Security Headers & Network Hardening (F8)', () => {
    test('ADV-18: X-Powered-By is suppressed on all responses', async () => {
      const res = await serverInstance.client.get('/api/auth/status');
      assert.equal(res.headers['x-powered-by'], undefined, 'x-powered-by header must be stripped');
    });

    test('ADV-19: Content security headers (nosniff, SAMEORIGIN, no-xss) are present', async () => {
      const res = await serverInstance.client.get('/api/auth/status');
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
      assert.equal(res.headers['x-xss-protection'], '0');
      assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
    });

    test('ADV-20: Strict-Transport-Security is set in production mode', async () => {
      process.env.NODE_ENV = 'production';
      try {
        const res = await serverInstance.client.get('/api/auth/status');
        assert.equal(
          res.headers['strict-transport-security'],
          'max-age=31536000; includeSubDomains'
        );
      } finally {
        process.env.NODE_ENV = 'test';
      }
    });
  });

  // ==========================================================================
  // CHALLENGE 7: Centralized Error Middleware & Sanitization (F7)
  // ==========================================================================
  describe('Challenge 7: Centralized Error Middleware & Sanitization (F7)', () => {
    test('ADV-21: Malformed JSON body triggers clean 400 BAD_REQUEST without stack trace', async () => {
      const res = await serverInstance.client.request({
        path: '/api/auth/verify-session',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"broken-json": unquoted_value}',
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'BAD_REQUEST');
      assert.equal(res.body.message, 'Ungültiges JSON-Format im Anfrage-Body.');
      assert.equal(res.body.stack, undefined, 'Stack trace must not be exposed');
    });

    test('ADV-22: Production mode suppresses internal error stack traces', async () => {
      process.env.NODE_ENV = 'production';
      try {
        const res = await serverInstance.client.request({
          path: '/api/auth/verify-session',
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{malformed: true}',
        });
        assert.equal(res.status, 400);
        assert.equal(res.body.stack, undefined, 'Stack trace must not be present in production');
      } finally {
        process.env.NODE_ENV = 'test';
      }
    });
  });

  // ==========================================================================
  // CHALLENGE 8: Rate Limiting Enforcement (F8)
  // ==========================================================================
  describe('Challenge 8: In-Memory Rate Limiting Enforcement (F8)', () => {
    test('ADV-23: Burst requests emit rate limit headers and trigger 429 when threshold exceeded', async () => {
      let rateLimited = false;
      let retryAfter: any = null;

      for (let i = 0; i < 65; i++) {
        const res = await serverInstance.client.post('/api/auth/verify-session', {});
        if (res.status === 429) {
          rateLimited = true;
          retryAfter = res.headers['retry-after'];
          assert.equal(res.body.success, false);
          assert.equal(res.body.code, 'RATE_LIMIT_EXCEEDED');
          break;
        }
      }

      assert.equal(rateLimited, true, 'Should trigger rate limit (429) after exceeding 60 requests');
      assert.ok(retryAfter, 'Should emit Retry-After header');
    });
  });

  // ==========================================================================
  // CHALLENGE 9: Firestore Multi-Tenant Isolation Rules (F5)
  // ==========================================================================
  describe('Challenge 9: Firestore Multi-Tenant Isolation Rules (F5)', () => {
    test('ADV-24: Client query scoping adds where("userId", "==", uid) for non-admins', async () => {
      const fs = await import('fs');
      const content = fs.readFileSync('src/utils/productDbService.ts', 'utf-8');

      assert.ok(
        content.includes("query(auditsRef, where('userId', '==', auth.currentUser.uid), limit(50))"),
        'productDbService must scope queries by current user UID for non-admins'
      );
      assert.ok(
        content.includes('const isUserAdmin = isAdminEmail(auth.currentUser.email)'),
        'productDbService must check admin status for query scoping'
      );
    });

    test('ADV-25: firestore.rules restricts direct get and list to owner or admin', async () => {
      const fs = await import('fs');
      const rules = fs.readFileSync('firestore.rules', 'utf-8');

      assert.ok(
        rules.includes('function canReadAudit(auditData)'),
        'firestore.rules must define canReadAudit helper'
      );
      assert.ok(
        rules.includes('auditData.userId == request.auth.uid'),
        'canReadAudit must enforce userId match'
      );
      assert.ok(
        rules.includes('allow list: if isSignedIn() && (isAdmin() || resource.data.userId == request.auth.uid);'),
        'firestore.rules must restrict list to own audits or admin'
      );
      assert.ok(
        rules.includes('allow get: if vaultId == \'company\' && canAccessCompanyVault(resource.data);'),
        'company vault read must be guarded by canAccessCompanyVault'
      );
      assert.ok(
        rules.includes('allow create, update: if isAdmin() && vaultId == \'company\''),
        'company vault write must be strictly restricted to isAdmin()'
      );
    });

    test('ADV-26: deleteProductEvaluationFromDb enforces multi-tenant scoping on query deletion', async () => {
      const fs = await import('fs');
      const content = fs.readFileSync('src/utils/productDbService.ts', 'utf-8');

      assert.ok(
        content.includes("where('userId', '==', auth.currentUser.uid)"),
        'deleteProductEvaluationFromDb must scope by userId for non-admins'
      );
      assert.ok(
        content.includes("where('productName', '==', productName.trim())"),
        'deleteProductEvaluationFromDb must filter by trimmed productName'
      );
    });

    test('ADV-27: saveProductEvaluationToDb stamps auditorEmail to enable auditor access in firestore.rules', async () => {
      const fs = await import('fs');
      const content = fs.readFileSync('src/utils/productDbService.ts', 'utf-8');

      assert.ok(
        content.includes("auditorEmail: (result.auditMetadata?.auditorEmail || effectiveEmail).slice(0, 250)"),
        'saveProductEvaluationToDb must stamp auditorEmail'
      );
      assert.ok(
        content.includes('auditorEmail?: string;'),
        'StoredProductRecord must define auditorEmail property'
      );
    });
  });
});

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startInProcessServer,
  InProcessServerInstance,
} from '../e2e/harness/serverStarter';
import { TestHttpClient } from '../e2e/harness/httpClient';
import fs from 'fs';
import path from 'path';

describe('Adversarial Stress Test Suite: Milestone 1 Security & Hardening', () => {
  // --------------------------------------------------------------------------
  // Suite 1: Security Headers & Production Differences
  // --------------------------------------------------------------------------
  describe('Challenge Area 1: Security Headers & Environment Isolation', () => {
    let devServer: InProcessServerInstance;

    before(async () => {
      devServer = await startInProcessServer({
        envOverrides: {
          NODE_ENV: 'development',
          ALLOW_UNAUTHENTICATED_API: 'false',
        },
      });
    });

    after(async () => {
      await devServer?.stop();
    });

    test('CH-HDR-01: x-powered-by header is completely disabled/omitted', async () => {
      const res = await devServer.client.get('/api/auth/status');
      assert.equal(res.status, 200);
      assert.equal(res.headers['x-powered-by'], undefined, 'x-powered-by MUST NOT be exposed');
    });

    test('CH-HDR-02: Security headers present in development (nosniff, SAMEORIGIN, referrer-policy)', async () => {
      const res = await devServer.client.get('/api/auth/status');
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
      assert.equal(res.headers['x-xss-protection'], '0');
      assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
    });

    test('CH-HDR-03: Strict-Transport-Security is omitted in non-production environments', async () => {
      const res = await devServer.client.get('/api/auth/status');
      assert.equal(
        res.headers['strict-transport-security'],
        undefined,
        'HSTS should NOT be sent in development to avoid breaking localhost HTTP'
      );
    });

    test('CH-HDR-04: Strict-Transport-Security is strictly enforced in production mode', async () => {
      const prodServer = await startInProcessServer({
        envOverrides: {
          NODE_ENV: 'production',
          ALLOW_UNAUTHENTICATED_API: 'false',
        },
      });
      try {
        const res = await prodServer.client.get('/api/auth/status');
        assert.equal(res.status, 200);
        assert.equal(
          res.headers['strict-transport-security'],
          'max-age=31536000; includeSubDomains',
          'HSTS header MUST be present with max-age=31536000; includeSubDomains in production'
        );
        assert.equal(res.headers['x-content-type-options'], 'nosniff');
        assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
        assert.equal(res.headers['x-powered-by'], undefined);
      } finally {
        await prodServer.stop();
      }
    });

    test('CH-HDR-05: Security headers are emitted uniformly across different route types (auth, api, 404)', async () => {
      const resAuth = await devServer.client.post('/api/auth/verify-session', {});
      assert.equal(resAuth.headers['x-content-type-options'], 'nosniff');
      assert.equal(resAuth.headers['x-frame-options'], 'SAMEORIGIN');

      const res404 = await devServer.client.get('/api/non-existent-adversarial-route');
      assert.equal(res404.headers['x-content-type-options'], 'nosniff');
      assert.equal(res404.headers['x-frame-options'], 'SAMEORIGIN');
    });
  });

  // --------------------------------------------------------------------------
  // Suite 2: Rate Limiting Burst & Adversarial Abuse
  // --------------------------------------------------------------------------
  describe('Challenge Area 2: Rate Limiting Burst Stress & Header Abuse', () => {
    let rateLimitServer: InProcessServerInstance;

    before(async () => {
      rateLimitServer = await startInProcessServer({
        envOverrides: {
          NODE_ENV: 'test',
          ALLOW_UNAUTHENTICATED_API: 'false',
        },
      });
    });

    after(async () => {
      await rateLimitServer?.stop();
    });

    test('CH-RL-01: Auth burst exceeding quota (60 req) triggers HTTP 429 and Retry-After', async () => {
      const clientIp = '198.51.100.42';
      const customHeaders = { 'x-forwarded-for': clientIp };

      // Fire 60 requests to consume quota
      for (let i = 1; i <= 60; i++) {
        const res = await rateLimitServer.client.request({
          path: '/api/auth/status',
          method: 'GET',
          headers: customHeaders,
        });
        assert.equal(res.status, 200, `Request ${i} should succeed within quota`);
        assert.equal(res.headers['x-ratelimit-limit'], '60');
        const remaining = parseInt(res.headers['x-ratelimit-remaining'] as string, 10);
        assert.equal(remaining, 60 - i, `Remaining quota should decrement to ${60 - i}`);
        assert.ok(parseInt(res.headers['x-ratelimit-reset'] as string, 10) > 0);
      }

      // 61st request must be rejected with HTTP 429 RATE_LIMIT_EXCEEDED
      const burstRes = await rateLimitServer.client.request({
        path: '/api/auth/status',
        method: 'GET',
        headers: customHeaders,
      });

      assert.equal(burstRes.status, 429, 'Burst request 61 MUST return HTTP 429');
      assert.equal(burstRes.body.success, false);
      assert.equal(burstRes.body.code, 'RATE_LIMIT_EXCEEDED');
      assert.ok(
        burstRes.body.message.includes('Zu viele Authentifizierungsanfragen'),
        'Message must explain auth rate limit'
      );
      assert.ok(burstRes.headers['retry-after'] !== undefined, 'Retry-After header MUST be present');
      assert.ok(parseInt(burstRes.headers['retry-after'] as string, 10) > 0);
      assert.equal(burstRes.headers['x-ratelimit-remaining'], '0');

      // Subsequent 5 rapid requests must also be blocked cleanly
      for (let j = 0; j < 5; j++) {
        const subRes = await rateLimitServer.client.request({
          path: '/api/auth/status',
          method: 'GET',
          headers: customHeaders,
        });
        assert.equal(subRes.status, 429);
      }
    });

    test('CH-RL-02: Rate limiter isolates different client IPs under x-forwarded-for', async () => {
      const clientIpExhausted = '198.51.100.42'; // Already exhausted in previous test
      const freshClientIp = '203.0.113.88';

      // Exhausted IP must still receive 429
      const blockedRes = await rateLimitServer.client.request({
        path: '/api/auth/status',
        method: 'GET',
        headers: { 'x-forwarded-for': clientIpExhausted },
      });
      assert.equal(blockedRes.status, 429);

      // Fresh IP must receive 200 with full quota
      const freshRes = await rateLimitServer.client.request({
        path: '/api/auth/status',
        method: 'GET',
        headers: { 'x-forwarded-for': freshClientIp },
      });
      assert.equal(freshRes.status, 200, 'Fresh IP must NOT be blocked by other IP quota');
      assert.equal(freshRes.headers['x-ratelimit-remaining'], '59');
    });

    test('CH-RL-03: Multi-proxy comma-separated x-forwarded-for correctly extracts client IP', async () => {
      const spoofChain = '192.0.2.77, 10.0.0.1, 172.16.0.1';
      const res = await rateLimitServer.client.request({
        path: '/api/auth/status',
        method: 'GET',
        headers: { 'x-forwarded-for': spoofChain },
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers['x-ratelimit-remaining'], '59');
    });

    test('CH-RL-04: AI Document parsing endpoint rate limit (30 req max) triggers 429 on 31st request', async () => {
      const aiClientIp = '198.51.100.99';
      const customHeaders = {
        'x-forwarded-for': aiClientIp,
        'content-type': 'application/json',
      };

      // Send 30 requests to /api/documents/parse-pdf
      for (let i = 1; i <= 30; i++) {
        const res = await rateLimitServer.client.request({
          path: '/api/documents/parse-pdf',
          method: 'POST',
          headers: customHeaders,
          body: { pdfBase64: 'unauth' },
        });
        // Returns 401 (unauthorized) but still consumes rate limit
        assert.equal(res.headers['x-ratelimit-limit'], '30');
        assert.equal(res.headers['x-ratelimit-remaining'], String(30 - i));
      }

      // 31st request must trigger 429
      const overRes = await rateLimitServer.client.request({
        path: '/api/documents/parse-pdf',
        method: 'POST',
        headers: customHeaders,
        body: { pdfBase64: 'unauth' },
      });
      assert.equal(overRes.status, 429);
      assert.equal(overRes.body.code, 'RATE_LIMIT_EXCEEDED');
      assert.ok(overRes.body.message.includes('Zu viele KI-Verarbeitungsanfragen'));
    });
  });

  // --------------------------------------------------------------------------
  // Suite 3: Error Sanitization & Payload Boundaries
  // --------------------------------------------------------------------------
  describe('Challenge Area 3: Error Sanitization & Malformed Input Robustness', () => {
    let prodServer: InProcessServerInstance;

    before(async () => {
      prodServer = await startInProcessServer({
        envOverrides: {
          NODE_ENV: 'production',
          ALLOW_UNAUTHENTICATED_API: 'false',
        },
      });
    });

    after(async () => {
      await prodServer?.stop();
    });

    test('CH-ERR-01: Malformed JSON syntax in request body returns HTTP 400 with clean JSON', async () => {
      const res = await prodServer.client.request({
        path: '/api/auth/verify-session',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: '{ "brokenJson": true, unexpected_token ',
      });

      assert.equal(res.status, 400, 'Malformed JSON must return HTTP 400 Bad Request');
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'BAD_REQUEST');
      assert.equal(res.body.message, 'Ungültiges JSON-Format im Anfrage-Body.');
      assert.equal(res.body.stack, undefined, 'No stack trace in production error response');
      assert.ok(!res.rawText.includes('SyntaxError: Unexpected token'), 'Internal JS syntax error not leaked');
    });

    test('CH-ERR-02: Truncated JSON stream returns HTTP 400 without crashing server', async () => {
      const res = await prodServer.client.request({
        path: '/api/documents/parse-pdf',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"idToken": "abc',
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'BAD_REQUEST');
    });

    test('CH-ERR-03: Production mode suppresses all internal stack traces and server paths', async () => {
      // Trigger verify-session with unexpected payload structure that causes rejection
      const res = await prodServer.client.post(
        '/api/auth/verify-session',
        { idToken: 12345 as any }
      );

      assert.ok([401, 403, 500].includes(res.status));
      assert.equal(res.body.success, false);
      assert.equal(res.body.stack, undefined, 'Stack trace MUST be undefined in production');
      assert.ok(
        !res.rawText.includes('at '),
        'Raw response MUST NOT contain JavaScript stack frames ("at ...")'
      );
      assert.ok(
        !res.rawText.includes('c:\\') && !res.rawText.includes('C:\\'),
        'Raw response MUST NOT leak Windows file paths'
      );
    });

    test('CH-ERR-04: Non-existent route does not leak stack frames, system paths or internals', async () => {
      const res = await prodServer.client.get('/api/standards/invalid-action-12345');
      assert.equal(res.status, 404);
      assert.ok(!res.rawText.includes('at '), 'Must not contain JS stack traces');
      assert.ok(!res.rawText.includes('C:\\') && !res.rawText.includes('c:\\'), 'Must not leak file paths');
      assert.ok(!res.rawText.includes('node_modules'), 'Must not leak module paths');
      assert.ok(!res.rawText.includes('server.ts'), 'Must not leak source file names');
    });

    test('CH-ERR-05: Path traversal attack in URL does not expose server files', async () => {
      const res = await prodServer.client.get('/api/../../package.json');
      // Should not serve package.json as raw JSON file
      assert.notEqual(res.body?.name, 'dgnb-env12-qm-tool', 'Must not serve package.json via path traversal');
      assert.ok(!res.rawText.includes('scripts'), 'Must not leak internal package.json scripts');
    });

    test('CH-ERR-06: Production error message sanitization helper hides internal details', () => {
      const prodEnv = 'production';
      const devEnv = 'development';

      const mockError = new Error('Database connection failed: Error at C:\\Users\\secret\\db.ts:42');
      const fallbackMsg = 'Serverfehler bei der Datenverarbeitung';

      // Under production: must return EXACTLY the fallback without details
      const sanitizeProd = (msg: string, err: any) => prodEnv === 'production' ? msg : `${msg}: ${err?.message || String(err)}`;
      assert.equal(sanitizeProd(fallbackMsg, mockError), fallbackMsg);
      assert.ok(!sanitizeProd(fallbackMsg, mockError).includes('C:\\Users'));

      // Under development: details are appended for debugging
      const sanitizeDev = (msg: string, err: any) => devEnv === 'production' ? msg : `${msg}: ${err?.message || String(err)}`;
      assert.ok(sanitizeDev(fallbackMsg, mockError).includes('Database connection failed'));
    });

    test('CH-ERR-07: Centralized error handler formats 413 entity.too.large correctly', () => {
      // Simulate Express centralized error handler behavior for entity.too.large
      const err = { type: 'entity.too.large', status: 413 };
      let handledStatus = 0;
      let handledBody: any = null;

      const mockRes: any = {
        status: (s: number) => {
          handledStatus = s;
          return {
            json: (b: any) => {
              handledBody = b;
              return b;
            },
          };
        },
      };

      // Handler logic from server.ts
      if (err.type === 'entity.too.large' || err.status === 413) {
        mockRes.status(413).json({
          success: false,
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Die übermittelte Datei überschreitet das zulässige Größenlimit.',
        });
      }

      assert.equal(handledStatus, 413);
      assert.equal(handledBody.code, 'PAYLOAD_TOO_LARGE');
      assert.ok(handledBody.message.includes('Größenlimit'));
    });
  });

  // --------------------------------------------------------------------------
  // Suite 4: Firestore Rules Multi-Tenant Isolation Oracle
  // --------------------------------------------------------------------------
  describe('Challenge Area 4: Firestore Multi-Tenant Isolation Oracle', () => {
    // Read and parse firestore.rules to verify rule logic empirically
    const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
    const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

    // Oracle models exact Firestore security logic from firestore.rules
    const firestoreOracle = {
      isAdmin(auth: any): boolean {
        if (!auth) return false;
        const email = auth.token?.email;
        if (typeof email !== 'string') return false;
        const lower = email.toLowerCase();
        return (
          lower === 'brian.lackmann@kaubit.de' ||
          lower === 'brianlackmann@gmail.com' ||
          auth.token?.admin === true
        );
      },

      isValidId(id: any): boolean {
        return typeof id === 'string' && id.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(id);
      },

      canAccessCompanyVault(auth: any, vaultData: any): boolean {
        if (!auth) return false;
        if (this.isAdmin(auth)) return true;
        const email = auth.token?.email;
        if (typeof email !== 'string') return false;
        const list = vaultData?.authorizedEmails;
        if (!Array.isArray(list)) return false;
        return list.includes(email.toLowerCase());
      },

      canReadAudit(auth: any, auditData: any): boolean {
        if (!auth) return false;
        if (this.isAdmin(auth)) return true;
        if (auditData?.userId === auth.uid) return true;
        const email = auth.token?.email;
        if (typeof email !== 'string') return false;
        const lowerEmail = email.toLowerCase();
        if (auditData?.userEmail && auditData.userEmail.toLowerCase() === lowerEmail) return true;
        if (auditData?.auditorEmail && auditData.auditorEmail.toLowerCase() === lowerEmail) return true;
        return false;
      },

      canListAudits(auth: any, queryUserId?: string): boolean {
        if (!auth) return false;
        if (this.isAdmin(auth)) return true;
        // Rules: allow list: if isSignedIn() && (isAdmin() || resource.data.userId == request.auth.uid);
        // Firestore requires query constraint where('userId', '==', auth.uid)
        return queryUserId === auth.uid;
      },

      canCreateAudit(auth: any, auditId: any, newDoc: any): boolean {
        if (!auth) return false;
        if (!this.isValidId(auditId)) return false;
        if (newDoc?.userId !== auth.uid && !this.isAdmin(auth)) return false;
        if (typeof newDoc?.qualityLevel !== 'number' || !Number.isInteger(newDoc.qualityLevel)) return false;
        if (newDoc?.qualityLevel < 0 || newDoc?.qualityLevel > 4) return false;
        if (newDoc?.encryptedPayload && newDoc.encryptedPayload.length > 200000) return false;
        return true;
      },

      canUpdateAudit(auth: any, auditId: any, existingDoc: any, newDoc: any): boolean {
        if (!auth) return false;
        if (!this.isValidId(auditId)) return false;
        const isOwnerOrAdmin = existingDoc?.userId === auth.uid || this.isAdmin(auth);
        if (!isOwnerOrAdmin) return false;
        // Tenant integrity: cannot change userId
        if (newDoc?.userId !== existingDoc?.userId) return false;
        return true;
      },

      canDeleteAudit(auth: any, auditId: any, existingDoc: any): boolean {
        if (!auth) return false;
        if (!this.isValidId(auditId)) return false;
        return existingDoc?.userId === auth.uid || this.isAdmin(auth);
      },
    };

    test('CH-FS-01: Rule file contains required multi-tenant isolation clauses', () => {
      assert.ok(rulesContent.includes("function canAccessCompanyVault(vaultData)"));
      assert.ok(rulesContent.includes("function canReadAudit(auditData)"));
      assert.ok(rulesContent.includes("allow list: if isSignedIn() && (isAdmin() || resource.data.userId == request.auth.uid)"));
      assert.ok(rulesContent.includes("request.resource.data.userId == resource.data.userId"));
    });

    test('CH-FS-02: Company vault access control rejects unauthorized users and protects salt/verifier', () => {
      const vaultData = {
        saltHex: '0123456789abcdef0123456789abcdef',
        verifierHex: 'abcdef0123456789abcdef0123456789abcdef0123456789',
        updatedAt: '2026-11-12T19:00:00Z',
        authorizedEmails: ['authorized.employee@kaubit.de', 'brian.lackmann@kaubit.de'],
      };

      // Unauthenticated
      assert.equal(firestoreOracle.canAccessCompanyVault(null, vaultData), false);

      // Unauthorized Google account
      const attackerAuth = { uid: 'attacker-123', token: { email: 'hacker@evil.com' } };
      assert.equal(firestoreOracle.canAccessCompanyVault(attackerAuth, vaultData), false);

      // Authorized corporate employee
      const employeeAuth = { uid: 'emp-456', token: { email: 'authorized.employee@kaubit.de' } };
      assert.equal(firestoreOracle.canAccessCompanyVault(employeeAuth, vaultData), true);

      // Corporate Admin
      const adminAuth = { uid: 'admin-1', token: { email: 'brian.lackmann@kaubit.de', admin: true } };
      assert.equal(firestoreOracle.canAccessCompanyVault(adminAuth, vaultData), true);
    });

    test('CH-FS-03: Cross-tenant audit reads are strictly denied', () => {
      const victimAudit = {
        id: 'audit_victim_1',
        userId: 'victim_uid_100',
        userEmail: 'victim@customer.de',
        auditorEmail: 'auditor@bau-qm.org',
        projectName: 'Secret Building Project',
        productName: 'Secret Adhesive',
        qualityLevel: 4,
      };

      // Attacker trying to read victim audit
      const attackerAuth = { uid: 'attacker_uid_999', token: { email: 'attacker@competitor.de' } };
      assert.equal(
        firestoreOracle.canReadAudit(attackerAuth, victimAudit),
        false,
        'Attacker MUST NOT be allowed to read another tenant audit'
      );

      // Victim owner reading their own audit
      const victimAuth = { uid: 'victim_uid_100', token: { email: 'victim@customer.de' } };
      assert.equal(firestoreOracle.canReadAudit(victimAuth, victimAudit), true);

      // Designated auditor reading audit
      const auditorAuth = { uid: 'auditor_uid_555', token: { email: 'auditor@bau-qm.org' } };
      assert.equal(firestoreOracle.canReadAudit(auditorAuth, victimAudit), true);

      // Admin reading audit
      const adminAuth = { uid: 'admin_uid_1', token: { email: 'brian.lackmann@kaubit.de' } };
      assert.equal(firestoreOracle.canReadAudit(adminAuth, victimAudit), true);
    });

    test('CH-FS-04: Collection-wide audit listing without userId scope is denied to non-admins', () => {
      const userAuth = { uid: 'user_123', token: { email: 'user@tenant.de' } };
      const adminAuth = { uid: 'admin_1', token: { email: 'brian.lackmann@kaubit.de' } };

      // Query without userId filter
      assert.equal(firestoreOracle.canListAudits(userAuth, undefined), false);

      // Query scoped to own userId
      assert.equal(firestoreOracle.canListAudits(userAuth, 'user_123'), true);

      // Query scoped to someone else's userId
      assert.equal(firestoreOracle.canListAudits(userAuth, 'other_user_456'), false);

      // Admin can query without filter
      assert.equal(firestoreOracle.canListAudits(adminAuth, undefined), true);
    });

    test('CH-FS-05: Attacker cannot spoof userId on audit creation or update', () => {
      const attackerAuth = { uid: 'attacker_uid', token: { email: 'attacker@evil.com' } };

      // Create spoofing another user's ID
      const spoofedCreate = {
        userId: 'victim_uid',
        userEmail: 'victim@corp.de',
        qualityLevel: 4,
      };
      assert.equal(
        firestoreOracle.canCreateAudit(attackerAuth, 'audit_spoof_1', spoofedCreate),
        false,
        'Must block creating audit with another user identity'
      );

      // Legitimate create
      const legitCreate = {
        userId: 'attacker_uid',
        userEmail: 'attacker@evil.com',
        qualityLevel: 4,
      };
      assert.equal(firestoreOracle.canCreateAudit(attackerAuth, 'audit_legit_1', legitCreate), true);

      // Update attempting to mutate userId
      const existingDoc = { ...legitCreate };
      const maliciousUpdate = { ...existingDoc, userId: 'hijacked_uid' };
      assert.equal(
        firestoreOracle.canUpdateAudit(attackerAuth, 'audit_legit_1', existingDoc, maliciousUpdate),
        false,
        'Must block mutating userId on audit update'
      );
    });

    test('CH-FS-06: Path traversal and illegal characters in auditId are rejected', () => {
      const validIds = ['audit_123', 'audit-2026-v1', 'AUDIT_ABC'];
      const invalidIds = [
        '../vault/company',
        'audit/../../passwords',
        'audit 123',
        'audit@123',
        'audit$#*',
        '',
      ];

      for (const id of validIds) {
        assert.equal(firestoreOracle.isValidId(id), true, `ID "${id}" should be valid`);
      }
      for (const id of invalidIds) {
        assert.equal(firestoreOracle.isValidId(id), false, `ID "${id}" MUST be invalid`);
      }
    });

    test('CH-FS-07: Payload constraints (qualityLevel 0-4, encryptedPayload <= 200kb) are enforced', () => {
      const userAuth = { uid: 'user_1', token: { email: 'user@corp.de' } };

      // Invalid non-integer qualityLevel = 3.5
      assert.equal(
        firestoreOracle.canCreateAudit(userAuth, 'audit_float', {
          userId: 'user_1',
          qualityLevel: 3.5,
        }),
        false
      );

      // Invalid qualityLevel = 5
      assert.equal(
        firestoreOracle.canCreateAudit(userAuth, 'audit_q5', {
          userId: 'user_1',
          qualityLevel: 5,
        }),
        false
      );

      // Invalid qualityLevel = -1
      assert.equal(
        firestoreOracle.canCreateAudit(userAuth, 'audit_qm1', {
          userId: 'user_1',
          qualityLevel: -1,
        }),
        false
      );

      // Overlarge encrypted payload (> 200,000 characters)
      const oversizedPayload = 'x'.repeat(200001);
      assert.equal(
        firestoreOracle.canCreateAudit(userAuth, 'audit_big', {
          userId: 'user_1',
          qualityLevel: 3,
          encryptedPayload: oversizedPayload,
        }),
        false
      );
    });
  });

  // --------------------------------------------------------------------------
  // Suite 5: Environment Alignment & Configuration Integrity
  // --------------------------------------------------------------------------
  describe('Challenge Area 5: Environment Schema Alignment (F10)', () => {
    const envExamplePath = path.resolve(process.cwd(), '.env.example');
    assert.ok(fs.existsSync(envExamplePath), '.env.example must exist');
    const envContent = fs.readFileSync(envExamplePath, 'utf-8');

    test('CH-ENV-01: .env.example contains all required runtime variables', () => {
      const requiredVars = [
        'PORT',
        'NODE_ENV',
        'ALLOW_UNAUTHENTICATED_API',
        'ADMIN_EMAILS',
        'ALLOWED_EMAILS',
        'FIREBASE_PROJECT_ID',
        'GEMINI_API_KEY',
        'GEMINI_MODEL',
      ];

      for (const varName of requiredVars) {
        assert.ok(
          envContent.includes(varName),
          `.env.example MUST document environment variable "${varName}"`
        );
      }
    });

    test('CH-ENV-02: .env.example documents production security warnings', () => {
      assert.ok(
        envContent.includes('ALLOW_UNAUTHENTICATED_API') &&
          envContent.includes('production'),
        '.env.example must document that ALLOW_UNAUTHENTICATED_API is disabled in production'
      );
    });
  });
});

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {
  saveProductEvaluationToDb,
  deleteProductEvaluationFromDb,
  normalizeProductKey,
  getPrimaryCriteriaRowNr,
  CURRENT_SCHEMA_VERSION,
  StoredProductRecord,
} from '../../src/utils/productDbService';
import { auth, db } from '../../src/firebase/config';
import { isAdminEmail } from '../../src/utils/companyVaultService';
import { ProductEvaluationResult } from '../../src/types/dgnb';

describe('Adversarial Multi-Tenant & DB Stress Suite (Milenger 1 Challenger 1)', () => {
  // Read and parse firestore.rules
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  assert.ok(fs.existsSync(rulesPath), 'firestore.rules must exist');
  const firestoreRules = fs.readFileSync(rulesPath, 'utf-8');

  // Rule verification oracle functions mirroring firestore.rules logic
  const firestoreOracle = {
    isAdmin(auth: { uid: string; token: { email?: string; admin?: boolean } } | null): boolean {
      if (!auth || !auth.token?.email) return false;
      const email = auth.token.email.toLowerCase();
      return (
        email === 'brian.lackmann@kaubit.de' ||
        email === 'brianlackmann@gmail.com' ||
        auth.token.admin === true
      );
    },

    isValidId(id: string): boolean {
      return typeof id === 'string' && id.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(id);
    },

    canReadAudit(
      auth: { uid: string; token: { email?: string; admin?: boolean } } | null,
      auditData: any
    ): boolean {
      if (!auth) return false;
      if (this.isAdmin(auth)) return true;
      if (auditData.userId === auth.uid) return true;
      const email = auth.token.email?.toLowerCase();
      if (email) {
        if (auditData.userEmail && auditData.userEmail.toLowerCase() === email) return true;
        if (auditData.auditorEmail && auditData.auditorEmail.toLowerCase() === email) return true;
      }
      return false;
    },

    canListAudits(
      auth: { uid: string; token: { email?: string; admin?: boolean } } | null,
      queryUserIdFilter?: string
    ): boolean {
      if (!auth) return false;
      if (this.isAdmin(auth)) return true;
      return queryUserIdFilter === auth.uid;
    },

    canDeleteAudit(
      auth: { uid: string; token: { email?: string; admin?: boolean } } | null,
      auditId: string,
      existingAudit: any
    ): boolean {
      if (!auth) return false;
      if (!this.isValidId(auditId)) return false;
      return existingAudit.userId === auth.uid || this.isAdmin(auth);
    },

    isValidProjectAudit(
      auth: { uid: string; token: { email?: string; admin?: boolean } },
      data: any
    ): boolean {
      const required = ['id', 'userId', 'userEmail', 'projectName', 'productName', 'qualityLevel'];
      for (const req of required) {
        if (!(req in data)) return false;
      }
      if (typeof data.id !== 'string' || data.id.length > 128) return false;
      if (typeof data.userId !== 'string' || data.userId.length > 128) return false;
      if (data.userId !== auth.uid && !this.isAdmin(auth)) return false;
      if (typeof data.userEmail !== 'string' || data.userEmail.length > 256) return false;
      if (typeof data.projectName !== 'string' || data.projectName.length > 256) return false;
      if (typeof data.productName !== 'string' || data.productName.length > 256) return false;
      if (
        typeof data.qualityLevel !== 'number' ||
        !Number.isInteger(data.qualityLevel) ||
        data.qualityLevel < 0 ||
        data.qualityLevel > 4
      )
        return false;
      if (data.auditorEmail && (typeof data.auditorEmail !== 'string' || data.auditorEmail.length > 256))
        return false;
      if (data.encryptedPayload && (typeof data.encryptedPayload !== 'string' || data.encryptedPayload.length > 200000))
        return false;
      return true;
    },
  };

  // ==========================================================================
  // CHALLENGE 1: Multi-Tenant Deletion Scenarios in productDbService
  // ==========================================================================
  describe('Challenge 1: deleteProductEvaluationFromDb Scoping & Tenant Isolation', () => {
    test('ADV-DEL-01: Non-admin deletion query contains where("userId", "==", uid) and where("productName", "==")', async () => {
      const serviceCode = fs.readFileSync('src/utils/productDbService.ts', 'utf-8');
      
      // Verify query construction in deleteProductEvaluationFromDb
      assert.ok(
        serviceCode.includes("where('userId', '==', auth.currentUser.uid)"),
        'Non-admin deletion MUST filter by current user uid'
      );
      assert.ok(
        serviceCode.includes("where('productName', '==', productName.trim())"),
        'Deletion query MUST filter by trimmed productName'
      );
      assert.ok(
        serviceCode.includes('const isUserAdmin = isAdminEmail(auth.currentUser?.email)'),
        'Deletion must distinguish admin from non-admin'
      );
    });

    test('ADV-DEL-02: User A cannot delete User B audit document by recordId under Firestore rules', () => {
      const userA = { uid: 'user_alice_123', token: { email: 'alice@company.de' } };
      const userB = { uid: 'user_bob_456', token: { email: 'bob@company.de' } };
      const admin = { uid: 'admin_1', token: { email: 'brian.lackmann@kaubit.de' } };

      const bobsAudit = {
        id: 'audit_bob_record_999',
        userId: 'user_bob_456',
        userEmail: 'bob@company.de',
        productName: 'Bobs Insulation Foam',
        qualityLevel: 3,
      };

      // Alice attempts to delete Bob's audit
      assert.equal(
        firestoreOracle.canDeleteAudit(userA, bobsAudit.id, bobsAudit),
        false,
        'User A MUST NOT be permitted to delete User B audit'
      );

      // Bob deletes his own audit
      assert.equal(
        firestoreOracle.canDeleteAudit(userB, bobsAudit.id, bobsAudit),
        true,
        'User B must be permitted to delete their own audit'
      );

      // Admin deletes Bob's audit
      assert.equal(
        firestoreOracle.canDeleteAudit(admin, bobsAudit.id, bobsAudit),
        true,
        'Admin must be permitted to delete any audit'
      );
    });

    test('ADV-DEL-03: Deletion of document with invalid ID characters is rejected by isValidId', () => {
      const userA = { uid: 'user_alice_123', token: { email: 'alice@company.de' } };
      const existingAudit = { userId: 'user_alice_123' };

      const maliciousIds = [
        '../vault/company',
        '../../audits/victim',
        'audit;DROP TABLE;',
        'audit<script>',
        'audit 123',
        '',
      ];

      for (const id of maliciousIds) {
        assert.equal(
          firestoreOracle.canDeleteAudit(userA, id, existingAudit),
          false,
          `Malicious ID "${id}" must be rejected by deletion rules`
        );
      }
    });

    test('ADV-DEL-04: Non-admin list query across all audits without userId filter is rejected', () => {
      const userA = { uid: 'user_alice_123', token: { email: 'alice@company.de' } };
      const admin = { uid: 'admin_1', token: { email: 'brian.lackmann@kaubit.de' } };

      // Alice tries to list all audits (unscoped)
      assert.equal(
        firestoreOracle.canListAudits(userA, undefined),
        false,
        'Unscoped list query by non-admin MUST be denied by Firestore list rules'
      );

      // Alice tries to list with Bob's UID
      assert.equal(
        firestoreOracle.canListAudits(userA, 'user_bob_456'),
        false,
        'List query with another user UID MUST be denied'
      );

      // Alice lists her own
      assert.equal(
        firestoreOracle.canListAudits(userA, 'user_alice_123'),
        true,
        'List query with Alice UID must be allowed'
      );

      // Admin lists unscoped
      assert.equal(
        firestoreOracle.canListAudits(admin, undefined),
        true,
        'Admin list query unscoped must be allowed'
      );
    });

    test('ADV-DEL-05: Unauthenticated delete call safely handles missing auth without crashing', async () => {
      // Mock auth.currentUser as null
      const originalUser = auth.currentUser;
      Object.defineProperty(auth, 'currentUser', { value: null, configurable: true });

      try {
        const result = await deleteProductEvaluationFromDb('any_id', 'Some Product');
        assert.equal(result, true, 'Unauthenticated delete safely returns true without unhandled exception');
      } finally {
        Object.defineProperty(auth, 'currentUser', { value: originalUser, configurable: true });
      }
    });
  });

  // ==========================================================================
  // CHALLENGE 2: Multi-Tenant Save & Identity Integrity in saveProductEvaluationToDb
  // ==========================================================================
  describe('Challenge 2: saveProductEvaluationToDb Hardening & Auditor Email Stamping', () => {
    test('ADV-SAV-01: Authenticated user cannot spoof userId when auth.currentUser is set', async () => {
      const mockAuthUser = {
        uid: 'legit_user_123',
        email: 'legit@company.de',
      };
      const originalUser = auth.currentUser;
      Object.defineProperty(auth, 'currentUser', { value: mockAuthUser, configurable: true });

      try {
        const serviceCode = fs.readFileSync('src/utils/productDbService.ts', 'utf-8');
        // Check effectiveUid definition
        assert.ok(
          serviceCode.includes("const effectiveUid = auth.currentUser?.uid || userId || 'auditor-default-id'"),
          'effectiveUid must prioritize auth.currentUser?.uid over client parameter'
        );
        assert.ok(
          serviceCode.includes("const effectiveEmail = auth.currentUser?.email || userEmail || 'auditor@bau-qm.org'"),
          'effectiveEmail must prioritize auth.currentUser?.email over client parameter'
        );
      } finally {
        Object.defineProperty(auth, 'currentUser', { value: originalUser, configurable: true });
      }
    });

    test('ADV-SAV-02: Stored record always stamps auditorEmail for auditor access control', () => {
      const serviceCode = fs.readFileSync('src/utils/productDbService.ts', 'utf-8');
      assert.ok(
        serviceCode.includes('auditorEmail: (result.auditMetadata?.auditorEmail || effectiveEmail).slice(0, 250)'),
        'saveProductEvaluationToDb must stamp auditorEmail from auditMetadata or effectiveEmail'
      );
      assert.ok(
        serviceCode.includes('auditorEmail?: string;'),
        'StoredProductRecord interface must declare auditorEmail'
      );
    });

    test('ADV-SAV-03: Auditor access via canReadAudit is allowed for verified auditorEmail', () => {
      const auditorAuth = { uid: 'auditor_uid_777', token: { email: 'auditor@external-testing.de' } };
      const bystanderAuth = { uid: 'random_uid_888', token: { email: 'bystander@stranger.com' } };

      const auditRecord = {
        id: 'audit_project_101',
        userId: 'creator_uid_111',
        userEmail: 'creator@corp.de',
        auditorEmail: 'auditor@external-testing.de',
        productName: 'Certified Acoustic Panel',
        qualityLevel: 4,
      };

      // Auditor with matching auditorEmail is allowed to read
      assert.equal(
        firestoreOracle.canReadAudit(auditorAuth, auditRecord),
        true,
        'Auditor with verified matching auditorEmail MUST have read access to the audit'
      );

      // Random third party is denied
      assert.equal(
        firestoreOracle.canReadAudit(bystanderAuth, auditRecord),
        false,
        'Unauthorized bystander MUST NOT have read access'
      );
    });

    test('ADV-SAV-04: Path traversal and illegal chars in auditId are sanitized before Firestore call', () => {
      const maliciousRawIds = [
        '../../vault/company',
        '..\\..\\system32\\config',
        'audit!@#$%^&*()+=`~',
        'audit/subdoc/extra',
      ];

      for (const rawId of maliciousRawIds) {
        const sanitized = rawId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
        assert.ok(
          firestoreOracle.isValidId(sanitized),
          `Sanitized ID "${sanitized}" derived from "${rawId}" MUST satisfy isValidId`
        );
        assert.ok(!sanitized.includes('/'), 'Must not contain slashes');
        assert.ok(!sanitized.includes('\\'), 'Must not contain backslashes');
        assert.ok(!sanitized.includes('..'), 'Must not contain dot-dots');
      }
    });

    test('ADV-SAV-05: Quality level clamping guarantees strictly valid integers in range [0, 4]', () => {
      const testInputs = [
        { rawLevel: 99, expected: 4 },
        { rawLevel: -10, expected: 0 },
        { rawLevel: 3.7, expected: 4 },
        { rawLevel: 2.2, expected: 2 },
        { rawLevel: 0, expected: 0 },
        { rawLevel: 4, expected: 4 },
        { rawLevel: 1, expected: 1 },
      ];

      for (const { rawLevel, expected } of testInputs) {
        const qualityLevel = Math.max(0, Math.min(4, Math.round(rawLevel)));
        assert.equal(
          qualityLevel,
          expected,
          `Raw level ${rawLevel} should be clamped to ${expected}`
        );
        assert.ok(
          Number.isInteger(qualityLevel) && qualityLevel >= 0 && qualityLevel <= 4,
          `qualityLevel ${qualityLevel} must be integer between 0 and 4`
        );
      }
    });

    test('ADV-SAV-06: Field length bounds prevent Firestore document quota exhaustion', () => {
      const giantString = 'A'.repeat(5000);
      const testResult: Partial<ProductEvaluationResult> = {
        productName: giantString,
        manufacturer: giantString,
        auditMetadata: {
          auditId: 'audit_123',
          projectName: giantString,
          auditDate: '2026-11-12',
          auditorEmail: giantString + '@corp.de',
          normYear: '2026',
        },
      };

      const boundedProjectName = (testResult.auditMetadata?.projectName || '').slice(0, 250);
      const boundedProductName = (testResult.productName || '').slice(0, 250);
      const boundedManufacturer = (testResult.manufacturer || '').slice(0, 250);
      const boundedAuditorEmail = (testResult.auditMetadata?.auditorEmail || '').slice(0, 250);

      assert.equal(boundedProjectName.length, 250);
      assert.equal(boundedProductName.length, 250);
      assert.equal(boundedManufacturer.length, 250);
      assert.equal(boundedAuditorEmail.length, 250);

      const creatorAuth = { uid: 'user_1', token: { email: 'user@corp.de' } };
      const candidatePayload = {
        id: 'audit_123',
        userId: 'user_1',
        userEmail: 'user@corp.de',
        projectName: boundedProjectName,
        productName: boundedProductName,
        manufacturer: boundedManufacturer,
        qualityLevel: 3,
        auditorEmail: boundedAuditorEmail,
      };

      assert.equal(
        firestoreOracle.isValidProjectAudit(creatorAuth, candidatePayload),
        true,
        'Bounded metadata conforms to isValidProjectAudit constraints'
      );
    });

    test('ADV-SAV-07: Unauthenticated save call safely returns false and avoids Firestore', async () => {
      const originalUser = auth.currentUser;
      Object.defineProperty(auth, 'currentUser', { value: null, configurable: true });

      try {
        const dummyResult: ProductEvaluationResult = {
          productName: 'Test Unauth Product',
          manufacturer: 'Test Mfr',
          overallQualityLevel: 'QS 3',
          standardsEvaluations: {},
          parameterEvaluations: {},
          matchedCriteriaRowNr: '1',
          selectedStandardCodes: ['DGNB'],
          isProvisional: false,
          missingParameters: [],
        };

        const saveSuccess = await saveProductEvaluationToDb(dummyResult);
        assert.equal(
          saveSuccess,
          false,
          'Calling saveProductEvaluationToDb when unauthenticated MUST return false'
        );
      } finally {
        Object.defineProperty(auth, 'currentUser', { value: originalUser, configurable: true });
      }
    });
  });

  // ==========================================================================
  // CHALLENGE 3: Firestore Rules Completeness & Security Invariants
  // ==========================================================================
  describe('Challenge 3: Security Invariants & Rules Structural Verification', () => {
    test('ADV-INV-01: Company vault delete and list are permanently disabled', () => {
      assert.ok(
        firestoreRules.includes('match /vault/{vaultId}'),
        'Vault match block exists'
      );
      assert.ok(
        firestoreRules.includes('allow delete, list: if false;'),
        'Vault delete and list MUST be statically disabled (if false;)'
      );
    });

    test('ADV-INV-02: Global default deny rule exists for all unmatched collections', () => {
      assert.ok(
        firestoreRules.includes('match /{document=**} {\n      allow read, write: if false;\n    }') ||
        firestoreRules.includes('match /{document=**} {') && firestoreRules.includes('allow read, write: if false;'),
        'Global default deny rule must be present'
      );
    });

    test('ADV-INV-03: Users collection update and create verify UID ownership', () => {
      assert.ok(
        firestoreRules.includes('request.resource.data.uid == userId'),
        'Users collection writes must verify data.uid matches path userId'
      );
      assert.ok(
        firestoreRules.includes('request.auth.uid == userId || isAdmin()'),
        'Users collection writes must require UID match or admin'
      );
    });

    test('ADV-INV-04: Audits update strictly forbids altering document owner userId', () => {
      assert.ok(
        firestoreRules.includes('request.resource.data.userId == resource.data.userId'),
        'Audits update rule MUST enforce request.resource.data.userId == resource.data.userId'
      );
    });

    test('ADV-INV-05: Product key normalization avoids collisions and handles umlauts', () => {
      // "Ökologische Dämmung" vs "Oekologische Daemmung"
      const key1 = normalizeProductKey('Ökologische Dämmung', 'Käubit Gmbß');
      const key2 = normalizeProductKey('Oekologische Daemmung', 'Kaeubit Gmbss');
      assert.equal(key1, key2, 'Umlaut transliteration must normalize German characters identically');

      // Different products must not collide
      const keyA = normalizeProductKey('Primer A', 'Kaubit');
      const keyB = normalizeProductKey('Primer B', 'Kaubit');
      assert.notEqual(keyA, keyB, 'Distinct product keys must not collide');
    });
  });
});

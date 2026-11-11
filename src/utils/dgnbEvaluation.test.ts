import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDgnbCompliance, isEmailAllowed, evaluateTestDateAge } from './dgnbEvaluation';
import { ParameterEvaluation } from '../types/dgnb';

test('isEmailAllowed correctly matches whitelisted emails case-insensitively and recognizes brian.lackmann@kaubit.de', () => {
  const whitelist = ['auditor@partner.org'];
  // Core user Brian Lackmann at Kaubit
  assert.equal(isEmailAllowed('brian.lackmann@kaubit.de'), true);
  assert.equal(isEmailAllowed('Brian.Lackmann@Kaubit.de '), true);
  assert.equal(isEmailAllowed('brianlackmann@gmail.com'), true);
  assert.equal(isEmailAllowed('auditor@kaubit.de'), true);
  assert.equal(isEmailAllowed('colleague@kaubit.de'), true); // Company domain
  assert.equal(isEmailAllowed('auditor@partner.org', whitelist), true);
  assert.equal(isEmailAllowed('intruder@hacker.com', whitelist), false);
  assert.equal(isEmailAllowed('', whitelist), false);
});

test('DGNB Schwachstellenprinzip: lowest parameter determines overall level (K.O.-Verfahren)', () => {
  const params: ParameterEvaluation[] = [
    {
      parameterName: 'SVHC ≤ 0,1 %',
      productValue: 'Keine SVHC',
      requiredForQS4: 'SVHC ≤ 0,1 %',
      achievedLevel: 4,
      isBottleneck: false,
      status: 'pass',
      explanation: 'OK',
    },
    {
      parameterName: 'VOC-Gehalt',
      productValue: '28 g/l',
      requiredForQS4: '< 1 g/l',
      achievedLevel: 2, // K.O. Bottleneck
      isBottleneck: false,
      status: 'warning',
      explanation: 'Zu hoch für QS 3/4',
    },
    {
      parameterName: 'Umweltzeichen',
      productValue: 'Keines',
      requiredForQS4: 'DE-UZ 102',
      achievedLevel: 3,
      isBottleneck: false,
      status: 'pass',
      explanation: 'AgBB vorhanden',
    },
  ];

  const result = evaluateDgnbCompliance(params, true);
  assert.equal(result.overallLevel, 2);
  assert.equal(result.bottleneckParameter?.parameterName, 'VOC-Gehalt');
  assert.equal(result.isBauteilekatalogKO, false);
});

test('Bauteilekatalog KO: demotes QS 4 to QS 2 if Bauteilekatalog is missing', () => {
  const perfectParams: ParameterEvaluation[] = [
    {
      parameterName: 'VOC-Gehalt',
      productValue: '< 1 g/l',
      requiredForQS4: '< 1 g/l',
      achievedLevel: 4,
      isBottleneck: false,
      status: 'pass',
      explanation: 'Perfekt',
    },
    {
      parameterName: 'Umweltzeichen',
      productValue: 'Blauer Engel DE-UZ 102',
      requiredForQS4: 'DE-UZ 102',
      achievedLevel: 4,
      isBottleneck: false,
      status: 'pass',
      explanation: 'Zertifiziert',
    },
  ];

  // Without Bauteilekatalog
  const withoutCatalog = evaluateDgnbCompliance(perfectParams, false);
  assert.equal(withoutCatalog.overallLevel, 2);
  assert.equal(withoutCatalog.maxChemicalLevel, 4);
  assert.equal(withoutCatalog.isBauteilekatalogKO, true);

  // With Bauteilekatalog
  const withCatalog = evaluateDgnbCompliance(perfectParams, true);
  assert.equal(withCatalog.overallLevel, 4);
  assert.equal(withCatalog.isBauteilekatalogKO, false);
});

test('crypto: verifyPassphrase verifies QM-Tool passphrases and rejects wrong passphrases', async () => {
  const { createPassphraseVerifier, verifyPassphrase } = await import('./crypto');
  const phrase = 'QM-Tool-Pass-2024';
  const verifier = await createPassphraseVerifier(phrase);
  
  assert.ok(verifier.saltHex.length > 0);
  assert.ok(verifier.verifierHex.length > 0);

  const isMatch = await verifyPassphrase(phrase, verifier.saltHex, verifier.verifierHex);
  assert.equal(isMatch, true);

  const isWrong = await verifyPassphrase('WrongPassword123!', verifier.saltHex, verifier.verifierHex);
  assert.equal(isWrong, false);
});

test('safeFetchJson handles HTML error responses safely without throwing JSON.parse error', async () => {
  const { safeFetchJson } = await import('./safeFetch');

  // Mock global fetch returning HTML 404 response (Vercel standard behavior)
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response('<!DOCTYPE html><html><head><title>404: NOT_FOUND</title></head><body><h1>404</h1></body></html>', {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    });
  };

  try {
    const result = await safeFetchJson('/api/auth/verify-session');
    assert.equal(result.ok, false);
    assert.equal(result.isHtmlError, true);
    assert.equal(result.status, 404);
    assert.ok(result.error?.includes('Server-Endpunkt liefert HTML'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('safeFetchJson successfully parses valid JSON responses', async () => {
  const { safeFetchJson } = await import('./safeFetch');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(JSON.stringify({ success: true, isAuthorized: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const result = await safeFetchJson<{ success: boolean; isAuthorized: boolean }>('/api/auth/verify-session');
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.data?.success, true);
    assert.equal(result.data?.isAuthorized, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('evaluateTestDateAge checks test report age against DGNB/AgBB institute rules', () => {
  // Test report <= 5 years old (e.g. 2023 when current year is 2026) -> Level 4 Pass
  const fresh = evaluateTestDateAge('15.05.2023', 2026);
  assert.equal(fresh.achievedLevel, 4);
  assert.equal(fresh.status, 'pass');
  assert.equal(fresh.ageYears, 3);

  // Test report 5-10 years old (e.g. 2019 when current year is 2026) -> Level 2 Warning
  const medium = evaluateTestDateAge('10.02.2019', 2026);
  assert.equal(medium.achievedLevel, 2);
  assert.equal(medium.status, 'warning');
  assert.equal(medium.ageYears, 7);

  // Test report > 10 years old (e.g. 2012 when current year is 2026) -> Level 1 Fail / Expired KO
  const expired = evaluateTestDateAge('2012', 2026);
  assert.equal(expired.achievedLevel, 1);
  assert.equal(expired.status, 'fail');
  assert.equal(expired.ageYears, 14);

  // Missing date -> Warning Level 2
  const missing = evaluateTestDateAge('', 2026);
  assert.equal(missing.achievedLevel, 2);
  assert.equal(missing.status, 'warning');
  assert.equal(missing.ageYears, null);
});



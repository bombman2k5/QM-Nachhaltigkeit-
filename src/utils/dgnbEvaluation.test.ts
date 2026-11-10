import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDgnbCompliance, isEmailAllowed } from './dgnbEvaluation';
import { ParameterEvaluation } from '../types/dgnb';

test('isEmailAllowed correctly matches whitelisted emails case-insensitively', () => {
  const whitelist = ['brianlackmann@gmail.com', 'admin@dgnb-qm.de'];
  assert.equal(isEmailAllowed('BrianLackmann@gmail.com', whitelist), true);
  assert.equal(isEmailAllowed('brianlackmann@gmail.com ', whitelist), true);
  assert.equal(isEmailAllowed('ADMIN@DGNB-QM.DE', whitelist), true);
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

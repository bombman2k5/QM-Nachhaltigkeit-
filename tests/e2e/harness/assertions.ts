import assert from 'node:assert/strict';

export function assertSecurityHeaders(headers: Record<string, string | string[] | undefined>): void {
  // 1. x-powered-by must be suppressed
  assert.equal(
    headers['x-powered-by'],
    undefined,
    `Security header violation: 'x-powered-by' must be suppressed, found '${headers['x-powered-by']}'`
  );

  // 2. x-content-type-options must be 'nosniff'
  assert.equal(
    headers['x-content-type-options'],
    'nosniff',
    `Security header violation: 'x-content-type-options' must be 'nosniff', found '${headers['x-content-type-options']}'`
  );

  // 3. x-frame-options must be 'SAMEORIGIN' or 'DENY'
  const frameOpt = headers['x-frame-options'];
  assert.ok(
    frameOpt === 'SAMEORIGIN' || frameOpt === 'DENY',
    `Security header violation: 'x-frame-options' must be 'SAMEORIGIN' or 'DENY', found '${frameOpt}'`
  );
}

export function assertSanitizedError(body: any): void {
  assert.ok(body, 'Response body must exist');
  assert.equal(body.success, false, 'Error response must have success === false');

  const serialized = JSON.stringify(body);
  const sensitivePatterns = [
    'at Object.',
    'node_modules',
    '\\server.ts',
    '/server.ts',
    'Error:',
    'TypeError:',
    'SyntaxError:',
  ];

  for (const pattern of sensitivePatterns) {
    assert.ok(
      !serialized.includes(pattern),
      `Sanitization violation: response leaks internal trace pattern '${pattern}': ${serialized}`
    );
  }
}

export function assertDgnbEvaluationStructure(result: any): void {
  assert.ok(result, 'Evaluation result must exist');
  assert.ok(result.standardsEvaluations, 'Result must contain standardsEvaluations');
  const dgnb = result.standardsEvaluations['DGNB'];
  assert.ok(dgnb, 'Result must evaluate DGNB standard');
  assert.ok(typeof dgnb.overallLevelNum === 'number', 'overallLevelNum must be a number');
  assert.ok(dgnb.overallLevelNum >= 0 && dgnb.overallLevelNum <= 4, 'overallLevelNum must be between 0 and 4');
  assert.ok(Array.isArray(dgnb.parameters), 'parameters must be an array');
  assert.ok(result.auditMetadata, 'auditMetadata must be present');
  assert.ok(typeof result.auditMetadata.auditorEmail === 'string', 'auditMetadata.auditorEmail must be a string');
}

export function assertTmEvidenceAttribution(parameter: any): void {
  assert.ok(parameter, 'Parameter must exist');
  assert.ok(parameter.evidence, 'Parameter evidence must exist');
  assert.equal(
    parameter.evidence.source,
    'tm',
    `Evidence attribution mismatch: expected 'tm', found '${parameter.evidence.source}'`
  );
}

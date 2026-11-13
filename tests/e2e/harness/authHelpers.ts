/**
 * Deterministic Authentication & Token Generators for E2E Tests
 */

export const ADMIN_EMAIL = 'brian.lackmann@kaubit.de';
export const EMPLOYEE_EMAIL = 'auditor@bau-qm.org';
export const UNAUTHORIZED_EMAIL = 'unauthorized.external@gmail.com';

export function getAdminToken(): string {
  return `test-jwt:${ADMIN_EMAIL}:admin-uid-100`;
}

export function getEmployeeToken(): string {
  return `test-jwt:${EMPLOYEE_EMAIL}:employee-uid-200`;
}

export function getUnauthorizedToken(): string {
  return `test-jwt:${UNAUTHORIZED_EMAIL}:unauth-uid-999`;
}

export function getMalformedToken(): string {
  return 'malformed.jwt.token.not_a_valid_bearer';
}

export function getExpiredToken(): string {
  // Synthesize an expired JWT structure (base64 header . base64 payload with past exp . signature)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test-kid' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'https://securetoken.google.com/gen-lang-client-0723441171',
    aud: 'gen-lang-client-0723441171',
    sub: 'expired-uid-555',
    email: EMPLOYEE_EMAIL,
    iat: Math.floor(Date.now() / 1000) - 7200,
    exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
  })).toString('base64url');
  const signature = Buffer.from('invalid-signature-data').toString('base64url');
  return `${header}.${payload}.${signature}`;
}

export function getAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export function getNonBearerHeaders(): Record<string, string> {
  return {
    Authorization: 'Basic dXNlcjpwYXNzd29yZA==',
  };
}

export function getMalformedAuthHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getMalformedToken()}`,
  };
}

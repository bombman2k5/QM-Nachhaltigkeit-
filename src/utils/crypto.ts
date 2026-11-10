/**
 * Zero-Knowledge Client-Side Encryption Utilities using Web Crypto API.
 * Uses PBKDF2 (100,000 iterations, SHA-256) and AES-GCM (256-bit).
 */

const KNOWN_VERIFICATION_PAYLOAD = 'QM-TOOL-NACHHALTIGKEIT-VAULT-2024';
const LEGACY_VERIFICATION_PAYLOAD = 'DGNB-ENV12-VAULT-OK-2023';

function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToUint8Array(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g) || [];
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}

/**
 * Derives a 256-bit AES-GCM key from a passphrase and salt using PBKDF2.
 */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase.normalize('NFKC')),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Creates a verification token (salt + encrypted known string) for storing in user profile.
 */
export async function createPassphraseVerifier(
  passphrase: string
): Promise<{ saltHex: string; verifierHex: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKeyFromPassphrase(passphrase, salt);

  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(KNOWN_VERIFICATION_PAYLOAD)
  );

  // Pack IV + ciphertext together
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return {
    saltHex: bufferToHex(salt),
    verifierHex: bufferToHex(combined),
  };
}

/**
 * Verifies whether the entered passphrase can successfully decrypt the verifier payload.
 */
export async function verifyPassphrase(
  passphrase: string,
  saltHex: string,
  verifierHex: string
): Promise<boolean> {
  try {
    const salt = hexToUint8Array(saltHex);
    const combined = hexToUint8Array(verifierHex);
    if (combined.length < 13) return false;

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const key = await deriveKeyFromPassphrase(passphrase, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    const payloadStr = decoder.decode(decrypted);
    return payloadStr === KNOWN_VERIFICATION_PAYLOAD || payloadStr === LEGACY_VERIFICATION_PAYLOAD;
  } catch {
    // Decryption failed due to wrong passphrase (AES-GCM authentication tag mismatch)
    return false;
  }
}

/**
 * Encrypts an arbitrary object/string using the active encryption key.
 */
export async function encryptData(
  data: any,
  key: CryptoKey
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(jsonStr)
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return bufferToHex(combined);
}

/**
 * Decrypts a hex string back into its original JSON or string form.
 */
export async function decryptData<T = any>(
  hexStr: string,
  key: CryptoKey
): Promise<T | null> {
  try {
    const combined = hexToUint8Array(hexStr);
    if (combined.length < 13) return null;

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    const str = decoder.decode(decrypted);
    try {
      return JSON.parse(str);
    } catch {
      return str as unknown as T;
    }
  } catch {
    return null;
  }
}

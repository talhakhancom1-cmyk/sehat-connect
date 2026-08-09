/**
 * AES-256-GCM encryption helper for sensitive data at rest.
 * Uses FILE_DOWNLOAD_SECRET (or JWT_SECRET) as the encryption key.
 */
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Derive a 32-byte key from the env secret (hex or utf8)
function getKey() {
  const secret = process.env.EMAIL_ENCRYPTION_KEY || process.env.FILE_DOWNLOAD_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('EMAIL_ENCRYPTION_KEY (or FILE_DOWNLOAD_SECRET / JWT_SECRET) must be set');
  }
  // If it's a hex string, use it directly; otherwise hash it to get 32 bytes
  if (/^[0-9a-f]{64}$/i.test(secret)) {
    return Buffer.from(secret, 'hex');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a plaintext string.
 * Returns a single string: iv:encrypted:authTag (all hex-encoded).
 */
function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
}

/**
 * Decrypt a string produced by encrypt().
 * Returns the plaintext, or null if decryption fails.
 */
function decrypt(ciphertext) {
  if (!ciphertext || typeof ciphertext !== 'string') return null;
  // If it doesn't look encrypted (no colons), return as-is (backward compat)
  if (!ciphertext.includes(':')) return ciphertext;
  try {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) return null;
    const [ivHex, encryptedHex, authTagHex] = parts;
    const key = getKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    console.error('Decryption failed:', e.message);
    return null;
  }
}

module.exports = { encrypt, decrypt };

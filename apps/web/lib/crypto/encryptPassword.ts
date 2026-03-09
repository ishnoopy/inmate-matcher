import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is not set. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters).");
  }
  return key;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a colon-separated string: iv:authTag:ciphertext (all hex-encoded).
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    iv.toString("hex"),
    authTag.toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}

/**
 * Decrypts a value that was encrypted with `encrypt()`.
 * Throws if the ciphertext is malformed or authentication fails.
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted value format (expected iv:authTag:ciphertext).");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encryptedData = Buffer.from(encryptedHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(encryptedData).toString("utf8") + decipher.final("utf8");
}

/**
 * Returns true if the value looks like it was produced by `encrypt()`.
 * Used for backwards-compatibility with any legacy plaintext values.
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(":");
  return parts.length === 3 && parts.every((p) => /^[0-9a-f]+$/i.test(p));
}

/**
 * Decrypts the value if it is encrypted, otherwise returns it as-is.
 * Handles legacy plaintext passwords that predate encryption.
 */
export function safeDecrypt(value: string): string {
  if (!isEncrypted(value)) return value;
  return decrypt(value);
}

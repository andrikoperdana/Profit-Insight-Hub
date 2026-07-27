import crypto from "crypto";

// ---------------------------------------------------------------------------
// Field-level encryption for third-party OAuth tokens at rest (AES-256-GCM).
//
// Ciphertext format: "enc:v1:<iv b64url>:<authTag b64url>:<ciphertext b64url>"
// A value without the "enc:v1:" prefix is treated as legacy plaintext by
// decryptToken() so pre-existing rows keep working; they are transparently
// re-encrypted the next time the token pair is persisted (every refresh).
//
// Key material: XERO_TOKEN_ENC_KEY (preferred, any high-entropy string) or, as
// a fallback, SESSION_SECRET. Either way the raw secret is stretched to a
// 256-bit key via HKDF-SHA256 with a purpose-bound info string, so the same
// secret used elsewhere (e.g. HMAC state signing) never shares a key with
// this encryption. Fails closed when no secret is configured.
// ---------------------------------------------------------------------------

const PREFIX = "enc:v1:";
const HKDF_INFO = "xero-token-encryption-v1";

let cachedKey: Buffer | null = null;

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env["XERO_TOKEN_ENC_KEY"] || process.env["SESSION_SECRET"];
  if (!secret) {
    throw new Error(
      "XERO_TOKEN_ENC_KEY or SESSION_SECRET is required to encrypt Xero OAuth tokens at rest",
    );
  }
  cachedKey = Buffer.from(
    crypto.hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.alloc(0), HKDF_INFO, 32),
  );
  return cachedKey;
}

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${ct.toString("base64url")}`;
}

/**
 * Decrypt a stored token. Values without the versioned prefix are legacy
 * plaintext rows and are returned as-is (they get encrypted on next persist).
 */
export function decryptToken(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("Malformed encrypted token value");
  const [ivB64, tagB64, ctB64] = parts;
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivB64!, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64!, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64!, "base64url")), decipher.final()]).toString(
    "utf8",
  );
}

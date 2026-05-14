export const writeRoles = [
  "MANAGEMENT",
  "PROJECT_MANAGER",
  "SALES",
  "PRINCIPAL_TECHNICAL_WRITER",
  "PRINCIPAL_ADMIN_PROJECT",
] as const;

// Validate a base64-encoded PDF data URL. Returns:
//   - undefined → input is empty (treat as "clear the field"; caller stores null)
//   - string    → valid data URL
//   - throws    → invalid (caller should 400)
export const MAX_PDF_BYTES_SERVER = 4 * 1024 * 1024;

export function validatePdfDataUrl(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const raw = String(value);
  const m = /^data:application\/pdf(?:;[^,]*)?;base64,([A-Za-z0-9+/=]+)$/.exec(raw);
  if (!m) {
    const err: Error & { status?: number } = new Error(`${fieldName} must be a base64-encoded application/pdf data URL`);
    err.status = 400;
    throw err;
  }
  const b64 = m[1];
  // Decoded length = (b64.length * 3 / 4) - padding
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  const decodedSize = Math.floor((b64.length * 3) / 4) - padding;
  if (decodedSize > MAX_PDF_BYTES_SERVER) {
    const err: Error & { status?: number } = new Error(`${fieldName} exceeds 4 MB size limit`);
    err.status = 400;
    throw err;
  }
  return raw;
}

export function sanitizeFileName(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return String(value).slice(0, 255);
}

// Safely parse a YYYY-MM-DD date string from a client.
// Returns:
//   - null      → empty/missing input (treat as "clear the field")
//   - null      → input is present but malformed (caller should 400 it)
//   - Date      → valid, in-range date
// Rejects extended-year ISO strings like "+062026-05-05" or "82026-05-05" that
// JS's Date accepts but Prisma cannot serialize, causing 500s.
export function parseSafeDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const raw = String(value);
  const ymd = /^(\d{4})-\d{2}-\d{2}/.exec(raw);
  if (!ymd) return null;
  const year = Number(ymd[1]);
  if (year < 1900 || year > 9999) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

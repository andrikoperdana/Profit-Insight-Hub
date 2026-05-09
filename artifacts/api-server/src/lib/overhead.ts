/**
 * Returns the overhead loader multiplier applied to direct resource cost
 * to approximate net (fully-loaded) cost. Reads OVERHEAD_MULTIPLIER env var.
 * Default 1.8 means direct labor is multiplied by 1.8x to include indirect
 * overhead (office, tooling, management time, benefits, taxes, etc.).
 */
export function getOverheadMultiplier(): number {
  const raw = process.env.OVERHEAD_MULTIPLIER;
  if (!raw) return 1.8;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 1.8;
  return n;
}

/**
 * Minimal in-process TTL cache for read-heavy, expensive-to-compute endpoints
 * (dashboards, planning matrices). Values expire after `ttlMs`. Keys should
 * encode the request scope (role, user, filters) so different callers never
 * share an entry.
 *
 * This is intentionally simple: a single Map with lazy expiry. It is per-process
 * only — fine for a single API server instance and acceptable staleness windows.
 */
type Entry<V> = { value: V; expiresAt: number };

export class TtlCache<V> {
  private store = new Map<string, Entry<V>>();
  constructor(private ttlMs: number) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /** Drop every entry. Call after a mutation that could change cached results. */
  clear(): void {
    this.store.clear();
  }
}

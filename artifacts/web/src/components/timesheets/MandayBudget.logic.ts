export const HOURS_PER_MANDAY = 8;
const HAS_PLAN_EPS = 1e-6;

/**
 * True when counting a still-pending entry's hours would push consumed mandays
 * past the plan. Only meaningful when a positive plan exists; missing or zero
 * plans are treated as "no plan" (never an alert).
 */
export function wouldExceedPlan(
  consumedMandays: number | null | undefined,
  plannedMandays: number | null | undefined,
  pendingHours: number,
): boolean {
  if (plannedMandays == null || plannedMandays <= 0) return false;
  const after = (consumedMandays ?? 0) + pendingHours / HOURS_PER_MANDAY;
  return after > plannedMandays + HAS_PLAN_EPS;
}

export type MandayRow = {
  projectId: string;
  userId: string;
  hours: number;
  userConsumedMandays?: number | null;
  userPlannedMandays?: number | null;
  projectConsumedMandays?: number | null;
  projectPlannedMandays?: number | null;
};

/**
 * Counts how many of `entries` would push a person or the project over plan
 * when approved together. Unlike a per-row check, this accumulates the pending
 * hours by (project,user) and by project on top of the already-approved
 * baseline, so a batch that is safe individually but unsafe in aggregate is
 * still flagged. Each row carries the same approved baseline for its keys, so
 * we seed the running total once per key, then add each entry's hours.
 */
export function countCumulativeOverPlan(entries: MandayRow[]): number {
  const userRunning = new Map<string, { consumed: number; planned: number | null }>();
  const projectRunning = new Map<string, { consumed: number; planned: number | null }>();
  let count = 0;
  for (const t of entries) {
    const ukey = `${t.projectId}:${t.userId}`;
    if (!userRunning.has(ukey)) {
      userRunning.set(ukey, {
        consumed: t.userConsumedMandays ?? 0,
        planned: t.userPlannedMandays ?? null,
      });
    }
    if (!projectRunning.has(t.projectId)) {
      projectRunning.set(t.projectId, {
        consumed: t.projectConsumedMandays ?? 0,
        planned: t.projectPlannedMandays ?? null,
      });
    }
    const u = userRunning.get(ukey)!;
    const p = projectRunning.get(t.projectId)!;
    u.consumed += t.hours / HOURS_PER_MANDAY;
    p.consumed += t.hours / HOURS_PER_MANDAY;
    const overUser = u.planned != null && u.planned > 0 && u.consumed > u.planned + HAS_PLAN_EPS;
    const overProject = p.planned != null && p.planned > 0 && p.consumed > p.planned + HAS_PLAN_EPS;
    if (overUser || overProject) count += 1;
  }
  return count;
}
